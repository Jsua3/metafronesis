import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';

import { UiProgress } from '../../../../shared/ui/progress/ui-progress';
import { CasoStore } from '../../estado/caso.store';
import { AutoAltoDirective } from '../../marco/auto-alto.directive';
import {
  type Comando, EstudioHerramientaComponent, EstudioRanuraDirective, EstudioSeccionComponent, injectComandos,
} from '../../marco/estudio';
import { injectLlevar } from '../../marco/llevar';
import { ProgresoDelCaso } from '../../marco/progreso.service';
import type { CasoBorrador, Hito } from '../../modelo/caso';
import { conHito } from '../../modelo/efectos';
import { dondeSeCumple, hitosInalcanzables } from '../../modelo/hitos';
import { escenasEnOrden } from '../../modelo/progreso';
import { RutasAutoria } from '../../rutas';
import {
  type CambioDePaso, FilaDePasoComponent, type PasoVista, type RespuestaDelPaso, separarMarca,
} from './fila-de-paso.component';
import { PestanasEvaluacionComponent } from './pestanas-evaluacion.component';
import type { CambioDeRespuesta, EscenaElegible } from './selector-de-respuestas.component';

/** La clave de un paso nuevo: letras, números y «_» a partir del nombre, sin repetir una que ya exista. */
export function claveDePaso(nombre: string, existentes: readonly string[]): string {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '').slice(0, 48) || 'paso';
  let clave = base;
  for (let n = 2; existentes.includes(clave); n++) clave = `${base}_${n}`;
  return clave;
}

/** Los finales propios cuya condición nombra el paso (el servidor no deja quitar un hito que un final nombra). */
function finalesQueNombran(caso: CasoBorrador, clave: string): string[] {
  if (caso.modoFinales !== 'propio') return [];
  const marca = JSON.stringify({ milestone: clave }).slice(1, -1);
  return caso.finales.filter((f) => JSON.stringify(f.condicion ?? null).includes(marca)).map((f) => f.nombre);
}

/**
 * «Pasos profesionales» (EDITOR.md §3.5), la primera pestaña de Evaluación: sustituye a «Hitos del caso», que vivía bajo
 * el mapa. Responde a la pregunta de la docente («¿dónde se demuestra este paso?») con una lista inversa: cada paso con las
 * respuestas que lo cumplen. Marcar desde aquí es la MISMA operación que la casilla de la ficha de la respuesta
 * (`store.editarRespuesta` con `conHito`), así que el caso queda igual por cualquiera de los dos caminos.
 *
 * Los pasos sin respuesta van primero, en el orden en que se ven al entrar: la lista no se reordena mientras la docente
 * marca (una fila que salta bajo el puntero hace perder el sitio).
 *
 * Disposición del estudio (EDITOR-PRO.md): los pasos son filas densas de un solo panel (no tarjetas), «Agregar un paso» es
 * una herramienta de la barra, y el Inspector lleva la cobertura, los pasos sin respuesta y los que deciden el final, cada
 * uno a un clic. La paleta (Ctrl+K) salta a cualquier paso.
 *
 * Patrón: contenedor (Facade del store) con piezas de presentación (`app-fila-de-paso`, `app-selector-de-respuestas`);
 * qué está abierto se lleva como un estado único (State): un selector, una edición o una confirmación a la vez.
 */
@Component({
  selector: 'app-evaluacion',
  imports: [
    UiProgress, AutoAltoDirective, PestanasEvaluacionComponent, FilaDePasoComponent, EstudioRanuraDirective, EstudioSeccionComponent,
    EstudioHerramientaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="lienzo">
        <div class="hoja hoja--ancha evaluacion">
          <div class="cabecera">
            <div class="cabecera__titulos">
              <p class="sobretitulo">Etapa 4 · Evaluación</p>
              <h1>Pasos profesionales</h1>
              <p class="bajada">Lo que el estudiante tiene que hacer en el caso. Marca qué respuestas cumplen cada paso: es lo mismo que marcarlo en la ficha de la respuesta.</p>
            </div>
            <app-pestanas-evaluacion actual="pasos" />
          </div>

          @if (agregando()) {
            <form class="nuevo" (submit)="$event.preventDefault(); agregarPaso()" aria-labelledby="nuevo-titulo">
              <p class="nuevo__titulo" id="nuevo-titulo">Paso nuevo</p>
              <label class="etiqueta" for="nuevo-nombre">Nombre del paso</label>
              <input id="nuevo-nombre" class="campo" type="text" autocomplete="off" [value]="nombreNuevo()" (input)="nombreNuevo.set($any($event.target).value)" />
              <label class="etiqueta" for="nuevo-descripcion">Qué se espera que haga el estudiante</label>
              <textarea autoAlto id="nuevo-descripcion" class="campo" rows="2" [value]="descripcionNueva()" (input)="descripcionNueva.set($any($event.target).value)"></textarea>
              @if (errorNuevo()) { <p class="error" role="alert">{{ errorNuevo() }}</p> }
              <div class="nuevo__acciones">
                <button type="submit" class="boton boton-primario">Agregar el paso</button>
                <button type="button" class="boton boton-texto" (click)="cerrarAgregar()">Cancelar</button>
              </div>
            </form>
          }

          <p role="status" class="solo-lector">{{ anuncio() }}</p>

          @if (pasos().length) {
            <div class="lista">
              @for (p of pasos(); track p.hito.clave) {
                <app-fila-de-paso [class.abierta]="abierto() === p.hito.clave || editando() === p.hito.clave || borrando() === p.hito.clave" [paso]="p" [escenas]="escenas()" [soloLectura]="store.soloLectura()"
                                  [abierto]="abierto() === p.hito.clave" [editando]="editando() === p.hito.clave"
                                  [borrando]="borrando() === p.hito.clave" [finalesQueLoNombran]="borrando() === p.hito.clave ? nombranA(caso, p.hito.clave) : []"
                                  (cambiar)="cambiar(p.hito, $event)" (marcar)="marcar(p.hito, $event)" (quitar)="quitar(p.hito, $event)"
                                  (irA)="irA($event)" (alternar)="alternar(p.hito.clave)" (pedirEdicion)="editar(p.hito.clave)"
                                  (pedirBorrado)="pedirBorrado(p.hito.clave)" (borrar)="borrar(p)" (terminar)="terminar(p.hito.clave)" />
              }
            </div>
          }
        </div>
      </div>

      <ng-template estudioRanura="herramientas">
        @if (!store.soloLectura() && !agregando()) {
          <button type="button" id="agregar-paso" estudioHerramienta="Agregar un paso" (click)="abrirAgregar()">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
          </button>
        }
      </ng-template>

      <!-- Inspector: la cobertura y, debajo, los pasos que todavía nadie cumple y los que deciden el final, cada uno a un clic. -->
      <ng-template estudioRanura="inspector">
        <app-estudio-seccion titulo="Cobertura" [resumen]="cubiertos() + ' de ' + pasos().length">
          <div class="cobertura" data-accion="hitos-del-caso">
            @if (pasos().length) {
              <p class="cobertura__texto"><strong>{{ cubiertos() }} de {{ pasos().length }} pasos</strong> tienen al menos una respuesta que los cumple.</p>
              <ui-progress class="cobertura__barra" label="Pasos con alguna respuesta" [value]="cubiertos()" [max]="pasos().length" />
            } @else {
              <p class="cobertura__texto">Este caso todavía no tiene pasos profesionales.</p>
            }
          </div>
        </app-estudio-seccion>
        @if (sinRespuesta().length) {
          <app-estudio-seccion titulo="Sin respuesta" [resumen]="sinRespuesta().length + ''">
            <ul class="saltos">
              @for (p of sinRespuesta(); track p.hito.clave) {
                <li><button type="button" class="salto" (click)="irAlPaso(p.hito.clave)"><span class="salto__marca" aria-hidden="true"></span>{{ p.hito.nombre }}</button></li>
              }
            </ul>
          </app-estudio-seccion>
        }
        <app-estudio-seccion titulo="Deciden el final" [resumen]="decisivos().length + ''">
          @if (decisivos().length) {
            <ul class="saltos">
              @for (p of decisivos(); track p.hito.clave) {
                <li><button type="button" class="salto" (click)="irAlPaso(p.hito.clave)"><span class="salto__marca salto__marca--final" aria-hidden="true"></span>{{ p.hito.nombre }}</button></li>
              }
            </ul>
          } @else {
            <p class="nota">Ningún paso decide el final. Enciende «Decide el final» en los que el estudiante tiene que dar sí o sí.</p>
          }
        </app-estudio-seccion>
      </ng-template>

    }
  `,
  styleUrl: './evaluacion.component.scss',
})
export class EvaluacionComponent {
  protected readonly store = inject(CasoStore);
  private readonly progreso = inject(ProgresoDelCaso);
  private readonly rutas = inject(RutasAutoria);
  private readonly injector = inject(Injector);
  private readonly llevar = injectLlevar();

  /** Solo una cosa abierta a la vez: el selector, la edición o la confirmación de un paso. */
  protected readonly abierto = signal<string | null>(null);
  protected readonly editando = signal<string | null>(null);
  protected readonly borrando = signal<string | null>(null);
  protected readonly agregando = signal(false);
  protected readonly nombreNuevo = signal('');
  protected readonly descripcionNueva = signal('');
  protected readonly errorNuevo = signal('');
  protected readonly anuncio = signal('');

  /** El orden con que se vio cada paso al entrar (o al releer el caso): 0 = sin respuestas, 1 = con alguna. */
  private orden = new Map<string, number>();
  private lecturaVista = -1;

  private readonly enOrden = computed(() => {
    const caso = this.store.caso();
    return caso ? escenasEnOrden(caso) : [];
  });

  /** Las escenas del caso en el orden de la historia, con el número del riel, para el selector y las fichas. */
  protected readonly escenas = computed<EscenaElegible[]>(() => this.enOrden().map((e, i) => ({
    escenaId: e.id,
    titulo: `${i + 1} · ${e.titulo}`,
    respuestas: e.respuestas.map((r) => ({ id: r.id, escenaId: e.id, texto: r.texto, clase: r.clase })),
  })));

  protected readonly pasos = computed<PasoVista[]>(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const lectura = this.store.lectura();
    if (lectura !== this.lecturaVista) {
      this.lecturaVista = lectura;
      this.orden = new Map();
    }
    const titulos = new Map(this.escenas().map((e) => [e.escenaId, e.titulo]));
    const inalcanzables = new Set(hitosInalcanzables(caso).map((h) => h.clave));
    const corregir = new Set(this.progreso.pendientes()
      .filter((p) => p.tipo === 'por-corregir' && p.codigo === 'milestone-unreachable').map((p) => p.ir.ancla));
    const vistas = caso.hitos.map((hito, i) => {
      const respuestas: RespuestaDelPaso[] = dondeSeCumple(caso, hito.clave).map((d) => ({
        escenaId: d.escenaId, respuestaId: d.respuestaId, escena: titulos.get(d.escenaId) ?? d.escenaTitulo, texto: d.respuestaTexto.trim(),
        href: this.rutas.a('/editor/escena', d.escenaId),
      }));
      // Un paso nuevo (o el primero que se ve) fija aquí su sitio; después no se mueve mientras se marca.
      if (!this.orden.has(hito.clave)) this.orden.set(hito.clave, respuestas.length ? 1 : 0);
      const { descripcion, porValidar } = separarMarca(hito.descripcion ?? '');
      return {
        vista: { hito, descripcion, porValidar, respuestas, porCorregir: inalcanzables.has(hito.clave) && corregir.has(`hito-${hito.clave}`) },
        rango: this.orden.get(hito.clave)!, i,
      };
    });
    return vistas.sort((a, b) => a.rango - b.rango || a.i - b.i).map((v) => v.vista);
  });

  protected readonly sinRespuesta = computed(() => this.pasos().filter((p) => p.respuestas.length === 0));
  protected readonly decisivos = computed(() => this.pasos().filter((p) => p.hito.decisivo));

  constructor() {
    injectComandos((): Comando[] => [
      ...(this.store.soloLectura() ? [] : [{ id: 'eval:agregar-paso', grupo: 'Pasos profesionales', titulo: 'Agregar un paso', ejecutar: () => this.abrirAgregar() }]),
      ...this.pasos().map((p) => ({
        id: `eval:paso:${p.hito.clave}`, grupo: 'Pasos profesionales', titulo: p.hito.nombre,
        detalle: p.respuestas.length ? `${p.respuestas.length} ${p.respuestas.length === 1 ? 'respuesta' : 'respuestas'}` : 'Sin respuesta',
        ejecutar: () => this.irAlPaso(p.hito.clave),
      })),
    ]);
  }

  /** Lleva a un paso de la lista (desde el Inspector o la paleta): lo desplaza a la vista y le da el foco. */
  protected irAlPaso(clave: string): void {
    this.enfocar(`hito-${clave}`);
  }

  protected readonly cubiertos = computed(() => this.pasos().filter((p) => p.respuestas.length > 0).length);

  protected readonly nombranA = finalesQueNombran;

  /** Marca o desmarca el paso en una respuesta: la misma operación que la casilla «Pasos» de la ficha. */
  protected marcar(hito: Hito, cambio: CambioDeRespuesta): void {
    const respuesta = this.store.caso()?.escenas.find((e) => e.id === cambio.escenaId)?.respuestas.find((r) => r.id === cambio.respuestaId);
    if (!respuesta) return;
    this.store.editarRespuesta(cambio.escenaId, cambio.respuestaId, { efectos: conHito(respuesta.efectos, hito.clave, cambio.cumple) });
    const texto = respuesta.texto.trim() || 'la respuesta sin escribir';
    this.anuncio.set(cambio.cumple ? `«${texto}» cumple ahora «${hito.nombre}».` : `«${texto}» ya no cumple «${hito.nombre}».`);
  }

  /** La ficha desaparece al quitarla: el foco va a «Agregar una respuesta» del mismo paso. */
  protected quitar(hito: Hito, r: RespuestaDelPaso): void {
    this.marcar(hito, { escenaId: r.escenaId, respuestaId: r.respuestaId, cumple: false });
    this.enfocar(`agregar-${hito.clave}`);
  }

  protected irA(r: RespuestaDelPaso): void {
    void this.llevar({ ruta: `/editor/escena/${r.escenaId}`, ancla: `respuesta-${r.respuestaId}` });
  }

  protected cambiar(hito: Hito, cambio: CambioDePaso): void {
    this.store.editarHito(hito.clave, cambio);
    if (cambio.decisivo !== undefined) {
      this.anuncio.set(cambio.decisivo ? `«${hito.nombre}» decide ahora el final.` : `«${hito.nombre}» ya no decide el final.`);
    }
  }

  protected alternar(clave: string): void {
    const cerrar = this.abierto() === clave;
    this.cerrarTodo();
    if (cerrar) this.enfocar(`agregar-${clave}`);
    else this.abierto.set(clave);
  }

  protected editar(clave: string): void {
    this.cerrarTodo();
    this.editando.set(clave);
    this.enfocar(`pn-${clave}`);
  }

  protected pedirBorrado(clave: string): void {
    this.cerrarTodo();
    this.borrando.set(clave);
    this.enfocar(`pb-${clave}`);
  }

  /** «Listo» o «Conservar el paso»: se cierra y el foco vuelve a la fila. */
  protected terminar(clave: string): void {
    this.cerrarTodo();
    this.enfocar(`hito-${clave}`);
  }

  /**
   * Borra el paso. Antes se le quita la marca a cada respuesta que lo cumplía (si no, quedarían marcando un paso que ya no
   * existe); todo viaja por la cola en orden, así que el servidor recibe las respuestas antes que la lista de pasos.
   */
  protected borrar(p: PasoVista): void {
    for (const r of p.respuestas) this.marcar(p.hito, { escenaId: r.escenaId, respuestaId: r.respuestaId, cumple: false });
    this.store.borrarHito(p.hito.clave);
    this.cerrarTodo();
    this.anuncio.set(`Se borró el paso «${p.hito.nombre}».`);
    this.enfocar('agregar-paso');
  }

  protected abrirAgregar(): void {
    this.cerrarTodo();
    this.nombreNuevo.set('');
    this.descripcionNueva.set('');
    this.errorNuevo.set('');
    this.agregando.set(true);
    this.enfocar('nuevo-nombre');
  }

  protected cerrarAgregar(): void {
    this.agregando.set(false);
    this.enfocar('agregar-paso');
  }

  protected agregarPaso(): void {
    const caso = this.store.caso();
    const nombre = this.nombreNuevo().trim();
    if (!caso) return;
    if (!nombre) {
      this.errorNuevo.set('Escribe el nombre del paso.');
      this.enfocar('nuevo-nombre');
      return;
    }
    const clave = claveDePaso(nombre, caso.hitos.map((h) => h.clave));
    this.store.agregarHito({ clave, nombre, descripcion: this.descripcionNueva().trim(), decisivo: false });
    this.agregando.set(false);
    this.anuncio.set(`Se agregó el paso «${nombre}». Marca qué respuestas lo cumplen.`);
    this.enfocar(`agregar-${clave}`);
  }

  private cerrarTodo(): void {
    this.abierto.set(null);
    this.editando.set(null);
    this.borrando.set(null);
    this.agregando.set(false);
  }

  /** Lo que se abre o se cierra cambia el DOM: el foco se mueve cuando ya está dibujado. */
  private enfocar(id: string): void {
    afterNextRender(() => document.getElementById(id)?.focus(), { injector: this.injector });
  }
}
