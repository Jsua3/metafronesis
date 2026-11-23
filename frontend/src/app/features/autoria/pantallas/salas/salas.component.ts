import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { GeneracionService } from '../../generacion/generacion.service';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { Escenario, Recorrido, Sala } from '../../modelo/escenario';
import { ENCUADRE_LEGIBLE, listaNumerada } from '../../modelo/textos';
import { RutasAutoria } from '../../rutas';
import { DescribirComponent } from '../describir/describir.component';
import { BarraDePasosComponent } from '../lugar/barra-de-pasos.component';
import { PintorDeVistas } from '../lugar/pintor-de-vistas.service';
import { abrirElCasoNuevo } from '../pasos-crear.component';
import { RecorridoComponent, type FilaDeRecorrido } from './recorrido.component';
import { VistaDeSalaComponent, type FichaDeSala } from './vista-de-sala.component';

/** El puntero es un ratón: con él, pasar el cursor o tabular a una sala enseña su vista previa. Con el dedo, solo el botón «Ver sala». */
function hayPunteroFino(): boolean {
  return typeof matchMedia !== 'function' || matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** «Universidad» → «la universidad»; «Hospital» → «el hospital»; «Comisaría de familia» → «la comisaría de familia». */
export function conArticulo(nombre: string): string {
  const primera = nombre.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return `${/(a|ad)$/.test(primera) ? 'la' : 'el'} ${nombre.trim().toLowerCase()}`;
}

/**
 * Paso 2 de crear un caso: las salas, como la segunda pantalla del «Nuevo proyecto» de Unity Hub. A la izquierda el nombre del
 * caso (lo primero que se escribe), las ideas para empezar y la rejilla de salas; a la derecha, el inspector con la vista
 * previa GRANDE de la sala enfocada (cursor, teclado o «Ver sala») y «Tu recorrido» ordenable. Al pie, la barra fija
 * «Atrás · Paso 2 de 2 · Crear el caso con estas salas».
 *
 * Patrón State (señales) en el contenedor: qué salas, en qué orden, qué sala se ve y si se está creando. Las piezas que pintan
 * (`app-vista-de-sala`, `app-recorrido`, `app-barra-de-pasos`) solo reciben datos y emiten intenciones. Las imágenes de las
 * salas vienen del adaptador `PintorDeVistas` (las salas por piezas se componen con el pintor del juego).
 */
@Component({
  selector: 'app-salas',
  imports: [FormsModule, RouterLink, DescribirComponent, BarraDePasosComponent, RecorridoComponent, VistaDeSalaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './salas.component.html',
  styleUrl: './salas.component.scss',
})
export class SalasComponent {
  private readonly biblioteca = inject(BibliotecaService);
  private readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly generacionSvc = inject(GeneracionService);
  private readonly pintor = inject(PintorDeVistas);
  protected readonly rutas = inject(RutasAutoria);
  protected readonly lugarId = inject(ActivatedRoute).snapshot.queryParamMap.get('lugar') ?? 'universidad';

  /** Cómo empieza la docente: describiendo el caso a la IA o eligiendo las salas ella misma (lo de siempre). */
  protected readonly forma = signal<'describe' | 'a-mano'>('a-mano');
  /** La descripción vive aquí y no en «Describe tu caso», que se destruye al pasar a «Elegir salas a mano»: así no se pierde. */
  protected readonly descripcionEscrita = signal('');
  /** La generación con IA: apagada, ni se menciona (nada de opciones que no se pueden usar); encendida, se ofrece la elección. */
  protected readonly generacion = signal<'cargando' | 'encendida' | 'apagada'>('cargando');
  protected readonly escenario = signal<Escenario | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly elegidas = signal<string[]>([]);
  protected readonly ideaElegida = signal<string | null>(null);
  protected readonly nombre = signal('');
  private nombreEditado = false;
  private formaElegida = false;
  protected readonly anuncioOrden = signal('');
  /** El caso se está creando en el servidor. */
  protected readonly creando = signal(false);
  protected readonly errorAlCrear = signal<string | null>(null);
  /** «la universidad», «el hospital»: el artículo sale del nombre (femenino si su primera palabra termina en -a o -ad). */
  protected readonly lugarConArticulo = computed(() => conArticulo(this.escenario()?.nombre ?? 'universidad'));
  /** «Salas de la universidad», «Salas del hospital» (de + el se contrae). */
  protected readonly tituloSalas = computed(() => `Salas ${this.lugarConArticulo().startsWith('el ') ? 'del' + this.lugarConArticulo().slice(2) : 'de ' + this.lugarConArticulo()}`);
  protected readonly nombrePorDefecto = computed(() => `Caso nuevo en ${this.lugarConArticulo()}`);
  protected readonly vistaId = signal<string | null>(null);
  /** La imagen de cada sala por su id (su fondo o el cuarto compuesto por piezas); falta mientras se pinta. */
  protected readonly vistas = signal<Record<string, string | null>>({});
  protected readonly resumenOrden = computed(() => listaNumerada(this.elegidas().map((id) => this.nombreSala(id))));
  protected readonly filas = computed<FilaDeRecorrido[]>(() =>
    this.elegidas().map((id) => ({ id, nombre: this.nombreSala(id), vista: this.vistas()[id] ?? null })));
  protected readonly fichaVista = computed<FichaDeSala | null>(() => {
    const s = this.escenario()?.salas.find((x) => x.id === this.vistaId());
    return s ? this.ficha(s) : null;
  });

  constructor() {
    void this.revisarGeneracion();
    this.biblioteca
      .escenario(this.lugarId)
      .then((e) => {
        this.escenario.set(e);
        if (!this.nombre()) this.nombre.set(`Caso nuevo en ${conArticulo(e.nombre)}`);
        void this.pintarSalas(e);
      })
      .catch(() => this.error.set('No se pudo abrir el lugar. Vuelve a intentarlo.'));
  }

  private async revisarGeneracion(): Promise<void> {
    try {
      const estado = await this.generacionSvc.estado();
      this.generacion.set(estado.enabled ? 'encendida' : 'apagada');
      // Con una generación a medio hacer, el aviso de retomar debe verse sin que la docente adivine la opción. Pero la
      // respuesta puede llegar tarde: si la docente ya empezó a mano (eligió forma, salas, una idea o escribió el nombre), no
      // se le cambia la pantalla bajo los dedos; «Describe tu caso» sigue a un clic y ahí ve el aviso (Codex, hallazgo 3).
      if (estado.enabled && estado.inProgress && !this.yaEmpezo()) this.forma.set('describe');
    } catch {
      // Sin saberlo, la opción queda disponible: «Describe tu caso» dice por sí misma si no se pudo comprobar.
      this.generacion.set('encendida');
    }
  }

  /** Una por una, en orden: cada miniatura aparece al estar lista (las por piezas tardan un momento en componerse). */
  private async pintarSalas(e: Escenario): Promise<void> {
    for (const s of e.salas) {
      const src = await this.pintor.vista(this.lugarId, s);
      this.vistas.update((v) => ({ ...v, [s.id]: src }));
    }
  }

  /** La docente eligió cómo empezar: desde ahí, lo que responda tarde el servidor ya no le cambia la opción. */
  protected elegirForma(forma: 'describe' | 'a-mano'): void {
    this.formaElegida = true;
    this.forma.set(forma);
  }

  /** ¿La docente ya tocó algo de esta pantalla? */
  private yaEmpezo(): boolean {
    return this.formaElegida || this.nombreEditado || this.elegidas().length > 0 || this.ideaElegida() !== null;
  }

  protected cerrarVista(): void {
    this.vistaId.set(null);
  }

  /** Cursor o teclado sobre una sala: la vista previa la sigue. Con el dedo no (un toque para marcar abriría la hoja). */
  protected alPasar(id: string): void {
    if (hayPunteroFino()) this.vistaId.set(id);
  }

  /** «Ver sala»: abre la vista previa de esa sala o, si ya era la que se veía, la cierra. Es el camino del toque y del teclado. */
  protected verSala(id: string): void {
    this.vistaId.update((actual) => (actual === id ? null : id));
  }

  protected encuadre(s: Sala): string {
    return ENCUADRE_LEGIBLE[s.encuadre];
  }

  protected nombreSala(id: string): string {
    return this.escenario()?.salas.find((s) => s.id === id)?.nombre ?? id;
  }

  protected posicion(id: string): number {
    return this.elegidas().indexOf(id) + 1;
  }

  protected seleccionar(evento: Event): void {
    (evento.target as HTMLInputElement).select();
  }

  protected usarIdea(r: Recorrido): void {
    this.elegidas.set([...r.salas]);
    this.ideaElegida.set(r.id);
    this.errorAlCrear.set(null);
    if (!this.nombreEditado) this.nombre.set(r.nombre);
  }

  protected alternar(id: string): void {
    this.elegidas.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    this.ideaElegida.set(null);
    this.errorAlCrear.set(null);
  }

  protected nombrar(valor: string): void {
    this.nombreEditado = true;
    this.nombre.set(valor);
  }

  /** Cambia una sala de lugar en el recorrido (botones y arrastre hacen lo mismo) y lo anuncia. */
  protected moverA(desde: number, hasta: number): void {
    const ids = [...this.elegidas()];
    if (desde === hasta || hasta < 0 || hasta >= ids.length || desde < 0 || desde >= ids.length) return;
    const [sala] = ids.splice(desde, 1);
    ids.splice(hasta, 0, sala);
    this.elegidas.set(ids);
    this.ideaElegida.set(null);
    this.anuncioOrden.set(`${this.nombreSala(sala)}, ahora en la posición ${hasta + 1} de ${ids.length}.`);
  }

  /** Crea el caso en el servidor con las salas elegidas, en ese orden, y abre el guion de su primera escena. */
  protected async crear(): Promise<void> {
    const e = this.escenario();
    if (!e || this.creando()) return;
    if (!this.elegidas().length) {
      this.errorAlCrear.set('Elige al menos una sala, o usa una idea para empezar.');
      return;
    }
    this.creando.set(true);
    this.errorAlCrear.set(null);
    try {
      const titulo = this.nombre().trim() || this.nombrePorDefecto();
      // La descripción del caso es la de la idea elegida o, si se eligieron las salas una por una, la del lugar.
      const idea = e.recorridosSugeridos.find((r) => r.id === this.ideaElegida());
      const id = await this.store.crearCaso(titulo, e.id, this.elegidas(), idea?.descripcion || e.descripcion);
      await abrirElCasoNuevo(this.store, this.router, id);
    } catch {
      this.errorAlCrear.set('No se pudo crear el caso. Vuelve a intentarlo en un momento.');
    } finally {
      this.creando.set(false);
    }
  }

  /** La ficha de la vista previa: nombres legibles de lo que trae la sala, sin repetir. */
  private ficha(s: Sala): FichaDeSala {
    const e = this.escenario()!;
    const nombres = (refs: string[], lista: { id: string; nombre: string }[]) =>
      [...new Set(refs.map((ref) => lista.find((x) => x.id === ref)?.nombre ?? ref))].join(', ');
    return {
      id: s.id, nombre: s.nombre, descripcion: s.descripcion, encuadre: this.encuadre(s), vista: this.vistas()[s.id] ?? null,
      personajes: nombres(s.personajes.map((p) => p.ref), e.personajes),
      muebles: nombres(s.muebles.map((m) => m.ref), e.catalogo.muebles),
      objetos: nombres(s.objetos.map((o) => o.ref), e.catalogo.objetos),
      puertas: s.puertas.map((p) => p.etiqueta).join('; '),
    };
  }
}
