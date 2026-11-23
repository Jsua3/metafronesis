import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { PlanoDelLugarComponent, type PuertaRota } from '../../../simulator/plano/plano-del-lugar.component';
import { dibujarPlano, normalizarLayout, puntoEnElMuro, type PlanoDelLugar, type SalaDibujada } from '../../../simulator/plano/plano';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { CasoStore } from '../../estado/caso.store';
import { EstudioHerramientaComponent, EstudioRanuraDirective } from '../../marco/estudio';
import { BibliotecaService, rutaArte } from '../../modelo/biblioteca.service';
import type { Escenario } from '../../modelo/escenario';
import { faltasPorSala } from '../../modelo/salas-a-documento';
import { RutasAutoria } from '../../rutas';

type Estado = { tipo: 'cargando' } | { tipo: 'listo'; plano: PlanoDelLugar | null } | { tipo: 'error' };

/** Medio largo y medio grosor de la muesca de una puerta (px de plano), los mismos del plano del juego. */
const PUERTA_LARGO = 40;
const PUERTA_GROSOR = 14;

/**
 * El plano del caso (P4, Tarea 11): todas las salas por piezas del caso con sus puertas, como lo dibuja el juego, pero
 * con todas a la vista y sin «estás aquí». Las puertas sin regreso (OCL-15) salen en rojo con su texto; un clic (o Enter
 * en la lista) en una sala abre su editor. El plano lo arma el servidor con lo guardado: se pide cuando no queda nada
 * por guardar.
 *
 * E4 (EDITOR.md §4.4): es la portada de la etapa «Lugar». Cada sala se pinta con su MINIATURA REAL (la misma imagen del
 * paso «Salas») y sus puertas marcadas, sobre el escenario oscuro del juego. El dibujo es propio (Adapter sobre
 * `dibujarPlano`, la geometría del plano del juego), porque el componente del juego es compartido con el minimapa y no
 * pinta imágenes; de ese componente se conserva la lista legible (los rótulos de lectura y sus botones), que es lo que
 * usa el teclado y el lector de pantalla.
 *
 * Ronda 3 (EDITOR-PRO.md): el dibujo es el lienzo del estudio, a todo el centro sobre una cuadrícula de puntos; la lista de
 * salas va en el Inspector; «Volver al mapa» es una herramienta; el nombre de cada sala se ajusta a su ancho; cargando es un
 * esqueleto con la forma del plano y el vacío, un plano dibujado con cuartos de la biblioteca y una salida.
 */
@Component({
  selector: 'app-plano-caso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlanoDelLugarComponent, RouterLink, EstudioRanuraDirective, EstudioHerramientaComponent],
  templateUrl: './plano.component.html',
  styleUrl: './plano.component.scss',
})
export class PlanoCasoComponent {
  protected readonly rutas = inject(RutasAutoria);
  private readonly store = inject(CasoStore);
  private readonly api = inject(AutoriaApiService);
  private readonly catalogoPiezas = inject(CatalogoDePiezas);
  private readonly router = inject(Router);
  private readonly biblioteca = inject(BibliotecaService);
  /** El lugar del caso, para las miniaturas de las salas por piezas (su fondo no viaja con el caso). */
  private readonly escenario = signal<Escenario | null>(null);
  protected readonly PUERTA_LARGO = PUERTA_LARGO;
  /** Hay plano que dibujar: solo entonces la pantalla usa todo el ancho. */
  protected readonly conDibujo = computed(() => this.plano() !== null);
  protected readonly PUERTA_GROSOR = PUERTA_GROSOR;
  protected readonly estado = signal<Estado>({ tipo: 'cargando' });
  protected readonly plano = computed(() => { const e = this.estado(); return e.tipo === 'listo' ? e.plano : null; });
  /** Todas las salas «vistas»: así el plano escribe todos los nombres (la docente no descubre nada). */
  protected readonly todas = computed(() => new Set(this.plano()?.salas.map(s => s.clave) ?? []));
  /** La geometría del plano del juego (sin sala actual): rectángulos, puertas y la caja que los contiene. */
  protected readonly dibujo = computed(() => {
    const plano = this.plano();
    return plano ? dibujarPlano(plano, '', this.todas()) : { caja: { x: 0, y: 0, ancho: 1, alto: 1 }, salas: [] as SalaDibujada[] };
  });
  protected readonly viewBox = computed(() => { const { x, y, ancho, alto } = this.dibujo().caja; return `${x} ${y} ${ancho} ${alto}`; });
  /** Nombres de unas 32 letras a lo ancho del plano: se leen al tamaño que se muestre. */
  protected readonly letra = computed(() => Math.round(this.dibujo().caja.ancho / 32));
  /** La letra del nombre de una sala: la general, o menos si el nombre no cabe en el ancho de la sala (~0,6 em por letra). */
  protected letraDe(sala: SalaDibujada): number {
    const cabe = (sala.ancho - 64) / (Math.max((sala.titulo ?? '').length, 1) * 0.6);
    return Math.max(12, Math.round(Math.min(this.letra(), cabe)));
  }
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  protected readonly resumen = computed(() => `Plano de las salas: ${(this.plano()?.salas ?? []).map(s => s.titulo).join(', ')}.`);
  /**
   * La miniatura real de cada sala del caso: la imagen del lugar que también muestra el paso «Salas». Una sala por piezas
   * no trae su fondo en el caso; se toma de la sala del lugar con el mismo identificador.
   */
  protected readonly miniaturas = computed(() => {
    const caso = this.store.caso(), lugar = this.escenario();
    const mapa = new Map<string, string>();
    for (const sala of caso?.salas ?? []) {
      const fondo = sala.fondo || lugar?.salas.find(s => s.id === sala.id)?.fondo;
      if (fondo) mapa.set(sala.id, rutaArte(caso!.lugarId, fondo));
    }
    return mapa;
  });
  /** Las puertas sin regreso del borrador (OCL-15), en el muro y la posición de la puerta. */
  protected readonly rotas = computed<PuertaRota[]>(() => {
    const caso = this.store.caso(), reglas = this.catalogoPiezas.reglas();
    if (!caso || !reglas) return [];
    const rotas: PuertaRota[] = [];
    for (const [salaId, faltas] of faltasPorSala(caso, reglas)) {
      const sala = caso.salas.find(s => s.id === salaId);
      for (const f of faltas) {
        if (f.regla !== 'OCL-15' || f.elemento.tipo !== 'puerta') continue;
        const puerta = sala?.puertas.find(p => p.id === f.elemento.id);
        if (puerta?.muro !== undefined && puerta.pos !== undefined) rotas.push({ sala: salaId, muro: puerta.muro, pos: puerta.pos, texto: f.mensaje });
      }
    }
    return rotas;
  });
  protected readonly rotasDibujadas = computed(() => this.rotas().flatMap(r => {
    const sala = this.plano()?.salas.find(s => s.clave === r.sala);
    return sala ? [puntoEnElMuro(sala, r.muro, r.pos)] : [];
  }));
  private pedido = 0;

  constructor() {
    let id: string | null = null;
    effect(() => {
      const caso = this.store.caso();
      if (caso && caso.id !== id) { id = caso.id; void this.cargar(); }
    });
    let lugar: string | null = null;
    effect(() => {
      const lugarId = this.store.caso()?.lugarId ?? null;
      if (!lugarId || lugarId === lugar) return;
      lugar = lugarId;
      // Sin el lugar el plano se ve igual, con las salas lisas: la miniatura es un plus, nunca un error.
      try {
        this.biblioteca.escenario(lugarId).then(e => { if (lugar === lugarId) this.escenario.set(e); }, () => {});
      } catch { /* sin biblioteca (pruebas): salas lisas */ }
    });
  }

  protected recorte(clave: string): string { return `plano-recorte-${clave}`; }
  protected horizontal(muro: string): boolean { return muro === 'fondo' || muro === 'camara'; }

  protected async cargar(): Promise<void> {
    const caso = this.store.caso();
    if (!caso) return;
    const pedido = ++this.pedido;
    this.estado.set({ tipo: 'cargando' });
    try {
      // El plano sale de lo guardado: primero se espera a que no quede nada en cola.
      await this.store.sincronizado();
      const crudo = await firstValueFrom(this.api.api.casePlan(Number(caso.id)));
      if (pedido === this.pedido) this.estado.set({ tipo: 'listo', plano: normalizarLayout(crudo) });
    } catch {
      if (pedido === this.pedido) this.estado.set({ tipo: 'error' });
    }
  }

  protected abrir(salaId: string): void {
    void this.router.navigateByUrl(this.rutas.a('/editor/sala', salaId));
  }
}
