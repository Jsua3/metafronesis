import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import { type Comando, EstudioRanuraDirective, EstudioSeccionComponent, injectComandos } from '../../marco/estudio';
import { estadoDeCaminos, revisarCaminos } from '../../modelo/caminos';
import type { ClaveFinalPlantilla, Final } from '../../modelo/caso';
import { describirCondicion } from '../../modelo/condiciones';
import { FINALES_AUTOMATICOS, finalesDePlantilla, reglasDePlantilla } from '../../modelo/finales';
import { finalesAlcanzados } from '../../modelo/recorridos';
import { RutasAutoria } from '../../rutas';
import { PestanasEvaluacionComponent } from '../evaluacion/pestanas-evaluacion.component';
import { CondicionDelFinalComponent } from './condicion-del-final.component';
import { VistaDelFinalComponent } from './vista-del-final.component';

/**
 * Finales del caso (tablero 28; EDITOR.md §3.5), la tercera pestaña de Evaluación. Si la docente no hace nada se calculan
 * solos: cuatro finales de plantilla que dependen de los pasos que marque como decisivos y cuyo texto puede reescribir. Si
 * quiere, define los suyos con una condición en frases cada uno; gana el primero de la lista que se cumpla.
 *
 * E5 cambia la presentación, no la lógica (`modelo/finales.ts` sigue igual): los dos modos como tarjetas de opción; los
 * cuatro de plantilla en una rejilla de 2 × 2, cada uno con su «Así lo lee el estudiante»; los propios plegados en una fila
 * que dice cuándo llegan (se abren de a uno para editar, con su vista al lado); un resumen de a qué finales llegan los
 * recorridos de ahora; y el aviso de caminos con su enlace a Caminos. Así cabe en dos pantallas a 1440 × 900.
 *
 * Disposición del estudio (EDITOR-PRO.md): los finales en el lienzo; los recorridos y los pasos decisivos en el Inspector,
 * con secciones plegables; «Agregar un final» y cada final en la paleta (Ctrl+K).
 *
 * Patrón: contenedor (Facade del store) con piezas de presentación: la condición (`app-condicion-del-final`) y la vista
 * del estudiante (`app-vista-del-final`).
 */
@Component({
  selector: 'app-finales',
  imports: [
    RouterLink, AutoAltoDirective, PestanasEvaluacionComponent, CondicionDelFinalComponent, VistaDelFinalComponent, EstudioRanuraDirective,
    EstudioSeccionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './finales.component.html',
  styleUrl: './finales.component.scss',
})
export class FinalesComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly injector = inject(Injector);
  protected readonly anuncio = signal('');
  /** Los finales propios abiertos para editar (uno recién agregado se abre solo). */
  protected readonly abiertos = signal<ReadonlySet<string>>(new Set());

  /** Los cuatro finales de plantilla como van a quedar: el texto del modelo o el que reescribió la docente, con la condición de ahora. */
  protected readonly plantilla = computed(() => {
    const caso = this.store.caso();
    return caso ? finalesDePlantilla(caso).map((f) => ({ ...f, id: f.id as ClaveFinalPlantilla })) : [];
  });
  protected readonly reglas = computed(() => reglasDePlantilla(this.store.caso()?.hitos.filter((h) => h.decisivo) ?? []));
  protected readonly hayDecisivos = computed(() => (this.store.caso()?.hitos ?? []).some((h) => h.decisivo));
  protected readonly cuantosDecisivos = computed(() => (this.store.caso()?.hitos ?? []).filter((h) => h.decisivo).length);

  constructor() {
    // En la paleta (Ctrl+K): agregar un final (si son propios) y saltar a cualquiera de ellos.
    injectComandos((): Comando[] => {
      const caso = this.store.caso();
      if (!caso) return [];
      const propios = caso.modoFinales === 'propio';
      const finales = propios ? caso.finales : this.plantilla();
      return [
        ...(propios && !this.store.soloLectura() ? [{ id: 'finales:agregar', grupo: 'Finales', titulo: 'Agregar un final', ejecutar: () => this.agregarFinal() }] : []),
        ...finales.map((f, i) => ({
          id: `finales:ir:${f.id}`, grupo: 'Finales', titulo: f.nombre || `Final ${i + 1}`,
          ejecutar: () => document.getElementById(`final-${f.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
        })),
      ];
    });
  }
  private readonly alcanzados = computed(() => {
    const caso = this.store.caso();
    return caso ? finalesAlcanzados(caso) : { finales: {}, omitido: false };
  });

  protected readonly estadoCaminos = computed(() => {
    const caso = this.store.caso();
    return caso ? estadoDeCaminos(caso) : '';
  });
  protected readonly avisosDeCaminos = computed(() => {
    const caso = this.store.caso();
    return caso ? revisarCaminos(caso).length : 0;
  });

  /**
   * A qué finales llegan los recorridos de ahora (EDITOR.md §3.5). Se dicen los finales y no «N recorridos»: el cálculo
   * agrupa los recorridos que terminan igual, así que una cifra de recorridos engañaría.
   */
  protected readonly resumenRecorridos = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    const { finales, omitido } = this.alcanzados();
    if (omitido) return 'El caso tiene demasiados recorridos para calcular a qué finales llegan.';
    const lista = caso.modoFinales === 'propio' ? caso.finales : this.plantilla();
    const llegan = lista.filter((f) => finales[f.id]).map((f) => `«${f.nombre || 'Sin nombre'}»`);
    if (!llegan.length) return 'Con las respuestas de ahora, ningún recorrido termina todavía en uno de estos finales.';
    const otros = lista.length - llegan.length;
    const resto = otros === 0 ? '' : otros === 1 ? ' Uno no lo alcanza nadie.' : ` ${otros} no los alcanza nadie.`;
    return `Con las respuestas de ahora, los recorridos terminan en ${unir(llegan)}.${resto}`;
  });

  /** El docente pidió pasar a los finales automáticos teniendo finales propios: se pregunta antes de dejar de usarlos. */
  protected readonly confirmandoModo = signal(false);

  /**
   * Cambiar el modo. Pasar a «se calculan solos» con finales propios los quita del servidor: antes se pregunta y, mientras tanto,
   * el selector se queda donde estaba.
   */
  protected pedirModo(modo: 'automatico' | 'propio', evento: Event): void {
    const caso = this.store.caso();
    if (!caso) return;
    if (modo === 'automatico' && caso.modoFinales === 'propio' && caso.finales.length > 0) {
      const elegido = evento.target as HTMLInputElement;
      elegido.checked = false;
      const propio = elegido.closest('fieldset')?.querySelector<HTMLInputElement>('input[value="propio"]');
      if (propio) propio.checked = true;
      this.confirmandoModo.set(true);
      setTimeout(() => document.getElementById('cmt')?.focus());
      return;
    }
    this.store.fijarModoFinales(modo);
  }

  protected preguntaModo(n: number): string {
    return n === 1 ? 'Tu final propio dejará de usarse. ¿Seguir?' : `Tus ${n} finales propios dejarán de usarse. ¿Seguir?`;
  }

  protected aceptarModo(): void {
    this.confirmandoModo.set(false);
    this.store.fijarModoFinales('automatico');
    this.anuncio.set('Los finales se calculan solos.');
    this.enfocarPrimero('input[name="modo"][value="automatico"]');
  }

  protected conservarModo(): void {
    this.confirmandoModo.set(false);
    this.anuncio.set('Se conservan tus finales.');
    this.enfocarPrimero('input[name="modo"][value="propio"]');
  }

  /** Abrir o cerrar un final propio (el `details` lo hace el navegador; aquí solo se recuerda). */
  protected alPlegar(id: string, evento: Event): void {
    const abierto = (evento.target as HTMLDetailsElement).open;
    if (abierto === this.abiertos().has(id)) return;
    const siguiente = new Set(this.abiertos());
    if (abierto) siguiente.add(id);
    else siguiente.delete(id);
    this.abiertos.set(siguiente);
  }

  protected agregarFinal(): void {
    this.store.agregarFinal();
    const finales = this.store.caso()?.finales ?? [];
    const nuevo = finales.at(-1);
    if (nuevo) this.abiertos.set(new Set([...this.abiertos(), nuevo.id]));
    this.anuncio.set(`Final ${finales.length} agregado.`);
    this.enfocarPrimero(`#fn${finales.length - 1}`);
  }

  protected aceptarFinal(f: Final, i: number): void {
    this.store.aceptarIa({ finalId: f.id });
    this.anuncio.set('Final aceptado.');
    this.enfocarPrimero(`#fn${i}`);
  }

  protected borrarFinal(f: Final, i: number, como: 'borrado' | 'descartado' = 'borrado'): void {
    this.store.borrarFinal(f.id);
    this.anuncio.set(`Final ${como}.`);
    this.enfocarPrimero(`#fn${i}`, `#fn${i - 1}`, '#agregar-final');
  }

  /** Lo pulsado desaparece al borrar o aceptar: el foco va al primer selector que exista (y que se vea). */
  private enfocarPrimero(...selectores: string[]): void {
    // Después de dibujar: un final recién agregado se abre en ese mismo dibujo.
    afterNextRender(() => {
      for (const s of selectores) {
        const el = document.querySelector<HTMLElement>(s);
        if (el && !el.closest('details:not([open])')) {
          el.focus();
          return;
        }
      }
      // Si lo que sigue está plegado, el foco va a la fila de ese final (su resumen).
      const fila = document.querySelector<HTMLElement>(selectores[0])?.closest('details')?.querySelector<HTMLElement>('summary');
      fila?.focus();
    }, { injector: this.injector });
  }

  /** ¿Algún recorrido llega a este final con las respuestas de ahora? (Si hay demasiados para contarlos, no se afirma que no.) */
  protected llega(id: string): boolean {
    const { finales, omitido } = this.alcanzados();
    return omitido || !!finales[id];
  }

  protected alcance(id: string): string {
    const { finales, omitido } = this.alcanzados();
    // Corto: es una insignia por final; la frase larga («con las respuestas de ahora») la dice el resumen de arriba.
    if (omitido) return 'No se pudo comprobar';
    return finales[id] ? 'Algún recorrido llega aquí' : 'Ningún recorrido llega aquí';
  }

  /** La fila plegada de un final propio dice cuándo llega, en una frase. */
  protected cuandoLlega(f: Final): string {
    if (!f.condicion) return 'Sin condición: llega si ningún final de arriba se cumple.';
    return `Llega si el estudiante ${describirCondicion(f.condicion, this.store.caso()?.hitos ?? [])}.`;
  }

  /** ¿La docente reescribió el nombre o el texto de este final de plantilla? */
  protected editado(id: ClaveFinalPlantilla): boolean {
    const e = this.store.caso()?.textosPlantilla?.[id];
    return (!!e?.nombre?.trim() && e.nombre !== FINALES_AUTOMATICOS[id].nombre) || (!!e?.texto?.trim() && e.texto !== FINALES_AUTOMATICOS[id].texto);
  }

  protected editarPlantilla(id: ClaveFinalPlantilla, cambios: { nombre?: string; texto?: string }): void {
    this.store.editarTextoPlantilla(id, cambios);
  }

  protected restaurar(id: ClaveFinalPlantilla): void {
    this.store.restaurarTextoPlantilla(id);
    this.anuncio.set('El final volvió al texto original.');
    this.enfocarPrimero(`#pn-${id}`);
  }
}

/** «A», «A y B», «A, B y C». */
function unir(partes: string[]): string {
  return partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}
