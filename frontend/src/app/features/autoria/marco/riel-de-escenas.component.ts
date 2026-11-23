import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CasoStore } from '../estado/caso.store';
import { rutaArte } from '../modelo/biblioteca.service';
import type { Escena } from '../modelo/caso';
import { escenasAlcanzables } from '../modelo/hitos';
import { estaVacia } from '../modelo/pendientes';
import type { EstadoEtapa } from '../modelo/progreso';
import { RutasAutoria } from '../rutas';
import { injectMiniaturasDeSalas } from './estudio/miniaturas-de-salas';
import { injectLlevar } from './llevar';
import { ProgresoDelCaso } from './progreso.service';

interface FilaEscena {
  escena: Escena;
  /** Su número en el orden de la historia (el mismo del mapa, del selector y de «Escena 2 de 8»). */
  numero: number;
  estado: EstadoEtapa;
  /** «Completa», «Sin escribir» o «Le falta 2»: el estado dicho con palabras, no solo con la forma. */
  textoEstado: string;
  pendientes: number;
  inicio: boolean;
  /** Tiene partes que sugirió el asistente y que la docente aún no acepta. */
  ia: boolean;
  /** La miniatura de su sala, o `null` si la sala no tiene fondo dibujado (nunca un `src` vacío). */
  miniatura: string | null;
  /** Lo que oye el lector de pantalla: «Escena 2, Recepción: escrita, 1 por corregir». */
  etiqueta: string;
}

/**
 * Riel de escenas (EDITOR.md §3.4 y §4.1), la columna izquierda de la etapa Historia.
 *
 * Patrón: Observer con señales. Lee el avance ya calculado por `ProgresoDelCaso` (Facade del caso abierto) y la dirección;
 * no guarda estado propio salvo la última escena abierta, para que «Guion» vuelva a ella desde «Caminos».
 *
 * - Arriba, el conmutador «Guion | Caminos» (Alt+M) y la tarjeta «Siguiente paso», siempre en el mismo sitio.
 * - Las escenas en orden de historia (recorrido en anchura desde el inicio) y, al final, «Sin conexión» con las que ninguna
 *   respuesta alcanza. Cada fila: número, miniatura de la sala en pixel art, título (dos renglones; el entero en `title` y en
 *   el nombre accesible) y sus marcas con palabras: Inicio, Final, IA y el estado. Un clic abre su guion sin salir de la etapa.
 * - Alt+↓ y Alt+↑ pasan a la escena siguiente o anterior de la historia desde cualquier campo del guion (no desde una lista
 *   desplegable, donde Alt+↓ la abre).
 * - Abajo, «Agregar una escena» (en Guion; en Caminos la ofrece la cabecera del mapa, que sabe qué escena está elegida).
 *
 * Vive en la pestaña «Escenas» del Explorador del estudio (su ancho lo ajusta el divisor); por debajo de 64rem es un
 * selector «Escena 2 de 8» que cabe en un teléfono sin desbordar (§4.3).
 */
@Component({
  selector: 'app-riel-de-escenas',
  imports: [RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'riel', '(document:keydown)': 'atajo($event)' },
  template: `
    <!-- Guion | Caminos: dos destinos de la misma etapa, así que son enlaces con «página actual», no interruptores. -->
    <nav class="riel__vistas" aria-label="Vista de la historia">
      <a class="riel__vista ds-motion" data-vista="guion" [routerLink]="rutaGuion()" [attr.aria-current]="enCaminos() ? null : 'page'"
         title="Guion (Alt+M)" aria-keyshortcuts="Alt+M">
        <svg class="riel__icono" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h10M3 6h10M3 9.5h7M3 13h5" /></svg>
        <span class="riel__vista-texto">Guion</span>
      </a>
      <a class="riel__vista ds-motion" data-vista="caminos" [routerLink]="rutas.a('/editor')" [attr.aria-current]="enCaminos() ? 'page' : null"
         title="Caminos (Alt+M)" aria-keyshortcuts="Alt+M">
        <svg class="riel__icono" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 8h2.5M7 8c1.5 0 2-4 4.5-4M7 8c1.5 0 2 4 4.5 4" /><circle cx="3" cy="8" r="1.75" /><circle cx="13" cy="4" r="1.75" /><circle cx="13" cy="12" r="1.75" /></svg>
        <span class="riel__vista-texto">Caminos</span>
      </a>
    </nav>

    @if (progreso.siguiente(); as paso) {
      <section class="riel__paso" aria-labelledby="riel-paso-titulo">
        <p class="riel__eyebrow" id="riel-paso-titulo">Siguiente paso</p>
        <button type="button" class="riel__paso-boton ds-motion" data-accion="siguiente-paso" (click)="llevar(paso)">
          <span class="riel__paso-texto">{{ paso.texto }}</span><span class="riel__flecha" aria-hidden="true">→</span>
        </button>
      </section>
    }

    <nav class="riel__escenas" aria-labelledby="riel-titulo" data-accion="leer-todo-el-guion">
      <div class="riel__cabecera">
        <p class="riel__eyebrow" id="riel-titulo">Escenas</p>
        <span class="riel__cuenta">{{ escritas() }}</span>
      </div>
      <ol class="riel__lista">
        @for (f of conectadas(); track f.escena.id) {
          <li><ng-container [ngTemplateOutlet]="fila" [ngTemplateOutletContext]="{ $implicit: f }" /></li>
        }
      </ol>
      @if (sueltas().length) {
        <!-- Las que ninguna respuesta alcanza: al final, con su nombre, para que se vean como lo que son. -->
        <p class="riel__grupo" id="riel-sueltas">Sin conexión</p>
        <ol class="riel__lista" aria-labelledby="riel-sueltas">
          @for (f of sueltas(); track f.escena.id) {
            <li><ng-container [ngTemplateOutlet]="fila" [ngTemplateOutletContext]="{ $implicit: f }" /></li>
          }
        </ol>
      }
      @if (puedeAgregar()) {
        <button type="button" class="riel__agregar ds-motion" (click)="agregar()" aria-label="Agregar una escena después de la abierta">
          <span class="riel__mas" aria-hidden="true">+</span><span class="riel__agregar-texto">Agregar una escena</span>
        </button>
      }
    </nav>

    <ng-template #fila let-f>
      <a class="riel__escena ds-motion" [routerLink]="rutas.a('/editor/escena', f.escena.id)" [attr.title]="f.escena.titulo"
         [attr.aria-current]="progreso.escenaActual() === f.escena.id ? 'page' : null">
        <!-- El nombre sale de este texto para lectores y no de un aria-label (Axe lo comparaba con el número y el título
             visibles pegados y lo daba por distinto). Dice lo mismo que antes: «Escena 1, Título: estado». -->
        <span class="solo-lector">{{ f.etiqueta }}</span>
        <span class="riel__tesela" aria-hidden="true">
          @if (f.miniatura) {
            <img class="riel__miniatura" [src]="f.miniatura" alt="" width="96" height="53" decoding="async" />
          } @else {
            <span class="riel__miniatura riel__miniatura--vacia"></span>
          }
          <span class="riel__numero">{{ f.numero }}</span>
        </span>
        <span class="riel__texto" aria-hidden="true">
          <span class="riel__titulo">{{ f.escena.titulo }}</span>
          <span class="riel__marcas">
            @if (f.inicio) { <span class="riel__marca riel__marca--inicio">Inicio</span> }
            @if (f.escena.esFinal) { <span class="riel__marca">Final</span> }
            @if (f.ia) { <span class="riel__marca riel__marca--ia">IA</span> }
            <span class="riel__estado" [attr.data-estado]="f.estado">{{ f.textoEstado }}</span>
          </span>
        </span>
        <span class="marca-estado" aria-hidden="true" [attr.data-estado]="f.estado"></span>
      </a>
    </ng-template>

    <!-- Teléfono y tableta: un selector en vez de la columna (va fuera del <nav>: no se lee dos veces). -->
    <div class="riel__selector">
      <label class="riel__eyebrow" for="riel-escena">Escena</label>
      <select id="riel-escena" class="riel__select" (change)="irAEscena($any($event.target).value)">
        <option value="" [selected]="!progreso.escenaActual()">Todas las escenas y sus caminos</option>
        @for (f of filas(); track f.escena.id) {
          <option [value]="f.escena.id" [selected]="progreso.escenaActual() === f.escena.id">Escena {{ f.numero }} de {{ filas().length }} · {{ f.escena.titulo }}{{ f.pendientes ? ' · ' + f.pendientes + ' por corregir' : f.estado === 'sin-empezar' ? ' · por escribir' : '' }}</option>
        }
      </select>
    </div>
  `,
  styles: `
    :host {
      /* Vive dentro del panel Explorador del estudio, que pone la superficie y el filo. */
      display: flex; flex-direction: column; gap: 0.875rem; padding: 0.75rem 0.5rem 1rem;
    }
    .riel__eyebrow {
      margin: 0; color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase; line-height: 1.25rem;
    }

    /* Conmutador de segmentos (acabado iOS): una cápsula hundida y la vista actual como una pastilla que sobresale. */
    .riel__vistas {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0.125rem; padding: 0.1875rem;
      border-radius: 999px; background: var(--l-superficie-hundida); box-shadow: inset 0 0 0 1px var(--l-filo);
    }
    .riel__vista {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem; min-block-size: 2.75rem;
      border-radius: 999px; color: var(--ds-text-2); font-size: var(--autoria-texto-16); font-weight: 700; text-decoration: none;
      transition: background-color var(--ds-dur-fade) var(--ds-ease-out), color var(--ds-dur-fade) var(--ds-ease-out),
        scale var(--ds-dur-press) var(--ds-ease-out);
    }
    .riel__vista[aria-current='page'] {
      background: var(--l-superficie); color: var(--ds-text-1); box-shadow: 0 0 0 1px var(--l-filo-fuerte), var(--l-sombra);
    }
    @media (hover: hover) and (pointer: fine) {
      .riel__vista:not([aria-current='page']):hover { color: var(--ds-text-1); }
    }
    .riel__vista:active { scale: 0.97; }
    .riel__icono { inline-size: 1rem; block-size: 1rem; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; }
    .riel__icono circle { fill: currentColor; stroke: none; }

    .riel__paso { display: flex; flex-direction: column; gap: 0.5rem; }
    /* «Siguiente paso»: superficie tinte (C2), el único bloque del riel que pide atención; un toque lleva ahí. */
    .riel__paso-boton {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; inline-size: 100%;
      min-block-size: 2.75rem; padding: 0.75rem 0.875rem; border: 1px solid var(--l-tinte-filo); border-radius: var(--l-radio-control);
      background: var(--l-tinte); color: var(--ds-text-1); font: inherit; font-size: var(--autoria-texto-16); font-weight: 600;
      line-height: 1.375rem; text-align: start; cursor: pointer;
      transition: scale var(--ds-dur-press) var(--ds-ease-out), background-color var(--ds-dur-fade) var(--ds-ease-out);
    }
    .riel__paso-texto { min-inline-size: 0; overflow-wrap: anywhere; }
    .riel__flecha { color: var(--ds-primary); font-weight: 800; }
    @media (hover: hover) and (pointer: fine) {
      .riel__paso-boton:hover { background: color-mix(in oklab, var(--l-acento) 18%, transparent); }
    }
    .riel__paso-boton:active { scale: 0.98; }

    .riel__escenas { display: flex; flex-direction: column; gap: 0.375rem; min-block-size: 0; }
    .riel__cabecera { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; padding-inline: 0.25rem; }
    .riel__cuenta { color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-variant-numeric: tabular-nums; }
    .riel__grupo {
      margin: 0.75rem 0 0; padding: 0.5rem 0.25rem 0; border-block-start: 1px dashed var(--l-filo-fuerte);
      color: var(--ds-text-2); font-size: var(--autoria-texto-14); font-weight: 700;
    }
    .riel__lista { display: flex; flex-direction: column; gap: 0.125rem; margin: 0; padding: 0; list-style: none; }

    .riel__escena {
      display: grid; grid-template-columns: 3rem minmax(0, 1fr) auto; align-items: center; column-gap: 0.625rem;
      min-block-size: 3.5rem; padding: 0.375rem 0.5rem 0.375rem 0.375rem; border: 1px solid transparent;
      border-radius: var(--l-radio-control); color: var(--ds-text-1); text-decoration: none;
      transition: background-color var(--ds-dur-fade) var(--ds-ease-out), scale var(--ds-dur-press) var(--ds-ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      .riel__escena:hover { background: var(--l-superficie-hundida); color: var(--ds-text-1); }
    }
    .riel__escena:active { scale: 0.98; }
    .riel__escena[aria-current='page'] { background: var(--l-fila-elegida); border-color: var(--l-tinte-filo); }

    /* La tesela: la sala en pixel art con su número encima, el guiño al juego en cada fila. */
    .riel__tesela { position: relative; display: block; inline-size: 3rem; block-size: 2.25rem; }
    .riel__miniatura {
      display: block; inline-size: 100%; block-size: 100%; border-radius: 0.375rem; object-fit: cover;
      image-rendering: pixelated; box-shadow: inset 0 0 0 1px var(--l-filo-fuerte); background: var(--l-superficie-hundida);
    }
    /* Sala sin fondo dibujado (salas por piezas o sin lugar): piso de baldosas en dos tonos, sin imagen rota. */
    .riel__miniatura--vacia {
      background:
        linear-gradient(var(--l-superficie-hundida) 0 45%, transparent 45%),
        repeating-conic-gradient(var(--l-filo-fuerte) 0 25%, transparent 0 50%) 0 0 / 0.5rem 0.5rem;
    }
    .riel__numero {
      position: absolute; inset-block-end: -0.25rem; inset-inline-start: -0.25rem; display: grid; place-items: center;
      min-inline-size: 1.375rem; block-size: 1.375rem; padding-inline: 0.25rem; border-radius: 0.3125rem;
      background: var(--l-superficie); box-shadow: 0 0 0 1px var(--l-filo-fuerte); color: var(--ds-text-1);
      font-size: var(--autoria-texto-14); font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1;
    }
    .riel__escena[aria-current='page'] .riel__numero { background: var(--ds-primary); box-shadow: none; color: var(--ds-on-primary); }

    .riel__texto { display: flex; flex-direction: column; gap: 0.125rem; min-inline-size: 0; }
    .riel__titulo {
      display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2;
      font-size: var(--autoria-texto-16); font-weight: 600; line-height: 1.25rem; overflow-wrap: anywhere;
    }
    .riel__escena[aria-current='page'] .riel__titulo { font-weight: 800; }
    .riel__marcas {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.125rem 0.375rem; color: var(--ds-text-2);
      font-size: var(--autoria-texto-14); line-height: 1.125rem;
    }
    .riel__marca { padding-inline: 0.3125rem; border-radius: 0.25rem; box-shadow: inset 0 0 0 1px var(--l-filo-fuerte); font-weight: 700; }
    .riel__marca--inicio { color: var(--ds-primary); box-shadow: inset 0 0 0 1px currentColor; }
    /* «IA» con el filo discontinuo de todo lo sugerido por el asistente: la forma lo dice además del texto. */
    .riel__marca--ia { box-shadow: none; outline: 1px dashed var(--ds-text-2); outline-offset: -1px; }
    .riel__estado[data-estado='con-pendientes'] { color: var(--ds-warning-text); font-weight: 700; }

    .riel__agregar {
      display: flex; align-items: center; gap: 0.5rem; inline-size: 100%; min-block-size: 2.75rem; margin-block-start: 0.375rem;
      padding: 0 0.75rem; border: 1px dashed var(--l-filo-fuerte); border-radius: var(--l-radio-control); background: transparent;
      color: var(--ds-primary); font: inherit; font-size: var(--autoria-texto-16); font-weight: 700; cursor: pointer;
      transition: background-color var(--ds-dur-fade) var(--ds-ease-out), scale var(--ds-dur-press) var(--ds-ease-out);
    }
    .riel__mas { font-size: var(--autoria-texto-20); line-height: 1; }
    @media (hover: hover) and (pointer: fine) {
      .riel__agregar:hover { background: var(--l-tinte); border-style: solid; }
    }
    .riel__agregar:active { scale: 0.98; }

    .riel__selector { display: none; }
    .riel__select {
      inline-size: 100%; min-block-size: 2.75rem; padding-inline: 0.75rem; border: 1px solid var(--ds-border-strong);
      border-radius: var(--l-radio-control); background: var(--l-superficie); color: var(--ds-text-1); font: inherit;
      font-size: var(--autoria-texto-16);
    }

    /* Teléfono y tableta: el conmutador, «Siguiente paso» y el selector, en una franja sobre el contenido. */
    @media (max-width: 63.999rem) {
      :host { gap: 0.75rem; padding-inline: 1rem; border-inline-end: 0; border-block-end: 1px solid var(--l-filo); }
      .riel__escenas { display: none; }
      .riel__selector { display: flex; flex-direction: column; gap: 0.375rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .riel__escena, .riel__paso-boton, .riel__vista, .riel__agregar { transition: none; }
    }
    @media (forced-colors: active) {
      .riel__vista[aria-current='page'], .riel__escena[aria-current='page'] { outline: 2px solid Highlight; outline-offset: -2px; }
      .riel__marca, .riel__numero { border: 1px solid CanvasText; }
    }
  `,
})
export class RielDeEscenasComponent {
  protected readonly progreso = inject(ProgresoDelCaso);
  protected readonly rutas = inject(RutasAutoria);
  private readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  protected readonly llevar = injectLlevar();
  private readonly miniaturas = injectMiniaturasDeSalas();

  /** La última escena cuyo guion se abrió: a ella vuelve «Guion» desde «Caminos» (y Alt+M). */
  private readonly ultimaEscena = signal<string | null>(null);

  protected readonly filas = computed<FilaEscena[]>(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const pendientes = this.progreso.porCorregir();
    const salas = new Map(caso.salas.map((s) => [s.id, s]));
    return this.progreso.escenas().map((escena, i) => {
      const n = pendientes.filter((p) => p.escenaId === escena.id).length;
      const vacia = estaVacia(escena);
      const estado: EstadoEtapa = n ? 'con-pendientes' : vacia ? 'sin-empezar' : 'lista';
      const textoEstado = n ? `Le falta ${n}` : vacia ? 'Sin escribir' : 'Completa';
      const inicio = caso.inicioId === escena.id;
      const ia = !!escena.marcaIa || escena.lineas.some((l) => l.marcaIa) || escena.respuestas.some((r) => r.marcaIa);
      const fondo = escena.salaId ? salas.get(escena.salaId)?.fondo : '';
      const partes = [vacia ? 'por escribir' : 'escrita'];
      if (inicio) partes.push('es el inicio');
      if (escena.esFinal) partes.push('es un final');
      if (ia) partes.push('con partes sugeridas por la IA');
      if (n) partes.push(n === 1 ? '1 por corregir' : `${n} por corregir`);
      return {
        escena, numero: i + 1, estado, textoEstado, pendientes: n, inicio, ia,
        miniatura: (escena.salaId && this.miniaturas().get(escena.salaId)) || (fondo ? rutaArte(caso.lugarId, fondo) || null : null),
        etiqueta: `Escena ${i + 1}, ${escena.titulo}: ${partes.join(', ')}`,
      };
    });
  });

  /** Las que se alcanzan desde el inicio, en orden de historia, y las sueltas, que van al final bajo «Sin conexión». */
  private readonly alcanzables = computed(() => {
    const caso = this.store.caso();
    return new Set(caso ? escenasAlcanzables(caso).map((e) => e.id) : []);
  });
  protected readonly conectadas = computed(() => this.filas().filter((f) => this.alcanzables().has(f.escena.id)));
  protected readonly sueltas = computed(() => this.filas().filter((f) => !this.alcanzables().has(f.escena.id)));

  /** «3 de 8 escritas». */
  protected readonly escritas = computed(() => {
    const filas = this.filas();
    return `${filas.filter((f) => !estaVacia(f.escena)).length} de ${filas.length} escritas`;
  });

  protected readonly enCaminos = computed(() => /\/editor\/?$/.test(this.progreso.direccion().split(/[?#]/)[0]));

  /** En Caminos agrega la cabecera del mapa (después de la escena elegida); aquí, en Guion, después de la abierta. */
  protected readonly puedeAgregar = computed(() => !this.enCaminos() && !this.store.soloLectura());

  /** «Guion» abre la escena en la que se estaba; si no hay, la primera de la historia. */
  protected readonly rutaGuion = computed(() => {
    const ids = new Set(this.filas().map((f) => f.escena.id));
    const id = [this.progreso.escenaActual(), this.ultimaEscena()].find((x) => !!x && ids.has(x)) ?? this.filas()[0]?.escena.id;
    return id ? this.rutas.a('/editor/escena', id) : this.rutas.a('/editor');
  });

  constructor() {
    effect(() => {
      const actual = this.progreso.escenaActual();
      if (actual) this.ultimaEscena.set(actual);
    });
  }

  protected irAEscena(id: string): void {
    void this.router.navigateByUrl(id ? this.rutas.a('/editor/escena', id) : this.rutas.a('/editor'));
  }

  /** Agrega una escena después de la abierta, en su misma sala, y abre su guion para escribirla. */
  protected agregar(): void {
    const caso = this.store.caso();
    if (!caso || this.store.soloLectura()) return;
    const despues = caso.escenas.find((e) => e.id === this.progreso.escenaActual()) ?? this.progreso.escenas().at(-1);
    const salaId = despues?.salaId ?? caso.salas[0]?.id ?? null;
    const id = this.store.agregarEscena(salaId, despues?.id);
    void this.router.navigateByUrl(this.rutas.a('/editor/escena', id));
  }

  /**
   * Alt+↓ / Alt+↑: escena siguiente o anterior en orden de historia, sin salir del guion. Alt+M: Guion ↔ Caminos.
   * Todos llevan modificador (WCAG 2.1.4). No actúan sobre una lista desplegable (Alt+↓ la abre) ni si otra pieza ya
   * atendió la tecla.
   */
  protected atajo(evento: KeyboardEvent): void {
    if (!evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.defaultPrevented) return;
    const objetivo = evento.target instanceof Element ? evento.target : null;
    if (objetivo?.closest('select, [role="combobox"], [role="listbox"], [role="menu"]')) return;

    // `code` y no `key`: en macOS Opción+M escribe «µ».
    if (evento.code === 'KeyM') {
      evento.preventDefault();
      void this.router.navigateByUrl(this.enCaminos() ? this.rutaGuion() : this.rutas.a('/editor'));
      return;
    }
    if (evento.key !== 'ArrowDown' && evento.key !== 'ArrowUp') return;
    const actual = this.progreso.escenaActual();
    if (!actual) return; // en Caminos las flechas son del mapa
    const orden = this.filas();
    const i = orden.findIndex((f) => f.escena.id === actual);
    const destino = orden[i + (evento.key === 'ArrowDown' ? 1 : -1)];
    evento.preventDefault();
    if (i >= 0 && destino) void this.router.navigateByUrl(this.rutas.a('/editor/escena', destino.escena.id));
  }
}
