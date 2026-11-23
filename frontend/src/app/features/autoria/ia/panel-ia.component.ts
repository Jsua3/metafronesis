import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, output, signal, untracked, viewChild,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

import { CasoStore } from '../estado/caso.store';
import { type ContextoIa, IaService, MENSAJE_APAGADO, MENSAJE_SIN_CUPO } from './ia.service';
import { type Cambio, MENSAJE_PROPUESTA_INVALIDA, dependencias, describirCambio } from './propuestas';

interface Turno {
  quien: 'tu' | 'ia';
  texto: string;
}

/**
 * Qué pantalla y qué elemento tiene a la vista el docente (el contexto que viaja a la IA). La dirección es
 * `/portal/casos/<caso>/editor[/escena/<id> | /sala/<id> | /finales]`.
 */
export function contextoDeRuta(url: string): ContextoIa {
  const partes = url.split('?')[0].split('/').filter(Boolean);
  const i = partes.indexOf('editor');
  if (i < 0) return { pantalla: partes.at(-1) ?? 'inicio', seleccion: null };
  const [seccion, id] = partes.slice(i + 1);
  if (seccion === 'escena') return { pantalla: 'guion', seleccion: id ?? null };
  if (seccion === 'sala') return { pantalla: 'sala', seleccion: id ?? null };
  if (seccion === 'finales') return { pantalla: 'finales', seleccion: null };
  if (seccion === 'revision') return { pantalla: seccion, seleccion: null };
  return { pantalla: 'mapa', seleccion: null };
}

/**
 * Asistente de IA (tablero 29): el docente pide, la IA propone por partes y el docente marca
 * qué entra al caso. Nada se aplica sin «Aplicar lo marcado». Si el asistente está apagado o ya no tiene cupo, el panel lo dice
 * y el resto del editor sigue igual.
 */
@Component({
  selector: 'app-panel-ia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside aria-labelledby="iat" class="panel">
      <div class="cabeza">
        <h2 id="iat" tabindex="-1">Asistente de IA</h2>
        <button type="button" class="boton cuadrado" aria-label="Cerrar el asistente" (click)="cerrar.emit()">✕</button>
      </div>
      <p class="aviso-ia"><strong>La IA propone; tú decides.</strong> Las escenas, líneas, respuestas y finales que agregue quedan marcados hasta que los revises. Colocar y mover cosas en una sala se aplica sin marca.</p>

      @switch (ia.estado()) {
        @case ('apagado') {
          <div class="estado" role="status">
            <span class="pildora">No disponible</span>
            <p>{{ mensajeApagado }}</p>
            <button type="button" class="boton" (click)="ia.comprobar()">Volver a comprobar</button>
          </div>
        }
        @case ('sin-cupo') {
          <p class="estado" role="status">{{ mensajeSinCupo }}</p>
        }
        @case ('error') {
          <div class="estado" role="status">
            <p>No pudimos saber si el asistente está disponible. Puedes seguir editando a mano.</p>
            <button type="button" class="boton" (click)="ia.comprobar()">Volver a comprobar</button>
          </div>
        }
        @case ('listo') {
          @if (ia.restantes() !== null) {
            <p class="texto-secundario nota" role="status">Hoy te quedan {{ ia.restantes() }} {{ ia.restantes() === 1 ? 'ayuda' : 'ayudas' }}.</p>
          }
        }
      }

      <div role="log" aria-label="Conversación con el asistente" aria-live="polite" class="conversacion">
        @for (t of turnos(); track $index) {
          <p class="turno" [class.mio]="t.quien === 'tu'"><strong>{{ t.quien === 'tu' ? 'Tú:' : 'Asistente:' }}</strong> {{ t.texto }}</p>
        }
        @if (pensando()) {
          <p role="status" class="pensando">Pensando… <button type="button" class="boton boton-texto" (click)="detener()">Detener</button></p>
        }
      </div>

      @if (puedeDeshacerAplicado()) {
        <button type="button" class="boton" (click)="deshacerAplicado()">Deshacer lo aplicado</button>
      }

      @if (propuesta(); as p) {
        <section aria-labelledby="pia" class="tarjeta propuesta marca-ia">
          <h3 id="pia">Propuesta <span class="pildora">Sugerido por la IA</span></h3>
          <ul class="partes">
            @for (c of p.cambios; track $index; let i = $index) {
              <li>
                <label>
                  <input type="checkbox" [checked]="p.seleccion[i]" (change)="alternar(i)" />
                  <span>{{ descripcion(c, p.cambios) }}</span>
                </label>
              </li>
            }
          </ul>
          <div class="acciones">
            <button type="button" class="boton boton-primario" [attr.aria-disabled]="!hayMarcadas()" (click)="aplicar()">Aplicar lo marcado</button>
            <button type="button" class="boton" (click)="descartar()">Descartar</button>
          </div>
        </section>
      }

      <form (submit)="enviar($event)" class="pedir">
        <label for="iaq" class="etiqueta">Pídele algo al asistente</label>
        <textarea id="iaq" #campo rows="3" class="campo" placeholder="Por ejemplo: «Agrega una respuesta con riesgo a la primera escena»"
                  [value]="borrador()" (input)="borrador.set($any($event.target).value)"
                  (keydown.control.enter)="enviar($event)"></textarea>
        <button type="submit" class="boton boton-secundario" [attr.aria-disabled]="pensando() || !borrador().trim() || !disponible()">Enviar</button>
        <p class="texto-secundario nota">Solo se envía el contenido del caso, que es ficticio, y tu petición. Nunca datos de estudiantes.</p>
      </form>
    </aside>
  `,
  styles: `
    :host(:not([hidden])) { display: block; }
    .panel { display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--superficie); border-left: 1px solid var(--linea); min-height: 100%; box-sizing: border-box; }
    .cabeza { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    h2 { margin: 0; font-size: var(--autoria-texto-22); line-height: 30px; }
    h3 { margin: 0 0 8px; font-size: var(--autoria-texto-18); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .cuadrado { width: 48px; padding: 0; }
    .aviso-ia { margin: 0; padding: 10px 12px; border-radius: var(--radio-control); background: var(--fondo); font-size: var(--autoria-texto-16); line-height: 24px; }
    .estado { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; margin: 0; }
    .estado p { margin: 0; font-size: var(--autoria-texto-16); }
    .conversacion { display: flex; flex-direction: column; gap: 8px; max-height: 40vh; overflow: auto; }
    .turno { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .turno.mio { padding: 8px 10px; border-radius: var(--radio-control); background: var(--primario-tinte); }
    .pensando { margin: 0; display: flex; gap: 8px; align-items: center; }
    .partes { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .partes label { display: flex; gap: 10px; align-items: flex-start; font-size: var(--autoria-texto-16); line-height: 24px; cursor: pointer; }
    .partes input { width: 22px; height: 22px; margin-top: 1px; flex: none; accent-color: var(--primario); }
    .pedir { display: flex; flex-direction: column; gap: 6px; }
    .pedir .boton { align-self: flex-start; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); border: 2px solid var(--borde-control); border-radius: var(--radio-control); resize: vertical; }
    .nota { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
  `,
})
export class PanelIaComponent {
  readonly cerrar = output<void>();

  protected readonly ia = inject(IaService);
  protected readonly mensajeApagado = MENSAJE_APAGADO;
  protected readonly mensajeSinCupo = MENSAJE_SIN_CUPO;
  private readonly store = inject(CasoStore);
  /** Lo último que aplicó el asistente se puede deshacer de un paso mientras nada más cambie. */
  protected readonly puedeDeshacerAplicado = this.store.puedeDeshacerPropuesta;
  private readonly router = inject(Router);
  private readonly campo = viewChild<ElementRef<HTMLTextAreaElement>>('campo');

  protected readonly turnos = signal<Turno[]>([]);
  protected readonly borrador = signal('');
  protected readonly pensando = signal(false);
  protected readonly propuesta = signal<{ cambios: Cambio[]; seleccion: boolean[] } | null>(null);
  /** Se puede pedir algo: el asistente está encendido y queda cupo (mientras se comprueba, también). */
  protected readonly disponible = computed(() => this.ia.estado() === 'listo' || this.ia.estado() === 'cargando');
  private idVisto: string | null = null;
  private controlador: AbortController | null = null;

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  protected readonly hayMarcadas = computed(() => this.propuesta()?.seleccion.some(Boolean) ?? false);

  constructor() {
    // Con otro caso, la conversación y la propuesta de antes ya no valen, y se vuelve a preguntar si hay asistente.
    effect(() => {
      const id = this.store.caso()?.id ?? null;
      untracked(() => {
        if (id === this.idVisto) return;
        this.idVisto = id;
        this.turnos.set([]);
        this.propuesta.set(null);
        this.borrador.set('');
        if (id !== null) void this.ia.comprobar();
      });
    });
  }

  protected descripcion(c: Cambio, todos: Cambio[]): string {
    const caso = this.store.caso();
    return caso ? describirCambio(caso, c, todos, this.store.resolver(caso)) : '';
  }

  /** Marcar una parte marca la escena nueva que necesita; desmarcar una escena desmarca lo que depende de ella. */
  protected alternar(i: number): void {
    const p = this.propuesta();
    if (!p) return;
    const deps = dependencias(p.cambios);
    const seleccion = [...p.seleccion];
    seleccion[i] = !seleccion[i];
    if (seleccion[i]) {
      for (const j of deps[i]) seleccion[j] = true;
    } else {
      deps.forEach((d, k) => { if (d.includes(i)) seleccion[k] = false; });
    }
    this.propuesta.set({ ...p, seleccion });
  }

  protected async enviar(evento: Event): Promise<void> {
    evento.preventDefault();
    const peticion = this.borrador().trim();
    const caso = this.store.caso();
    if (!peticion || this.pensando() || !this.disponible()) return;
    if (!caso) {
      this.turnos.update((t) => [...t, { quien: 'tu', texto: peticion }, { quien: 'ia', texto: 'Primero abre o crea un caso; después te ayudo con él.' }]);
      this.borrador.set('');
      return;
    }
    this.turnos.update((t) => [...t, { quien: 'tu', texto: peticion }]);
    this.borrador.set('');
    this.propuesta.set(null);
    this.pensando.set(true);
    this.controlador = new AbortController();
    try {
      const r = await this.ia.proponer(caso, peticion, contextoDeRuta(this.url()), this.controlador.signal);
      this.turnos.update((t) => [...t, { quien: 'ia', texto: r.mensaje }]);
      if (r.cambios && r.cambios.length) this.propuesta.set({ cambios: r.cambios, seleccion: r.cambios.map(() => true) });
    } catch {
      this.turnos.update((t) => [...t, { quien: 'ia', texto: 'Detuviste la petición.' }]);
    } finally {
      this.pensando.set(false);
      this.controlador = null;
    }
  }

  protected detener(): void {
    this.controlador?.abort();
  }

  protected aplicar(): void {
    const p = this.propuesta();
    if (!p || !p.seleccion.some(Boolean)) return;
    try {
      this.store.aplicarPropuesta(p.cambios, p.seleccion);
      const n = p.seleccion.filter(Boolean).length;
      this.turnos.update((t) => [...t, { quien: 'ia', texto: `Agregué ${n} ${n === 1 ? 'parte' : 'partes'} al caso, marcadas «Sugerido por la IA» hasta que las aceptes.` }]);
    } catch {
      this.turnos.update((t) => [...t, { quien: 'ia', texto: MENSAJE_PROPUESTA_INVALIDA }]);
    }
    this.propuesta.set(null);
    this.campo()?.nativeElement.focus();
  }

  protected deshacerAplicado(): void {
    this.store.deshacerPropuesta();
    this.turnos.update((t) => [...t, { quien: 'ia', texto: 'Deshice lo que había aplicado. El caso quedó como estaba.' }]);
    this.campo()?.nativeElement.focus();
  }

  protected descartar(): void {
    this.propuesta.set(null);
    this.turnos.update((t) => [...t, { quien: 'ia', texto: 'Descarté la propuesta. El caso no cambió.' }]);
    this.campo()?.nativeElement.focus();
  }
}
