import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { UiMenu, type UiMenuItem } from '../../../shared/ui/menu/ui-menu';
import { TEXTO_ESTADO, textoDeEtapa, type AvanceEtapa } from '../modelo/progreso';
import type { Etapa } from '../modelo/pendientes';
import { RutasAutoria } from '../rutas';
import { ProgresoDelCaso } from './progreso.service';

/** La acción con que la guía encuentra cada etapa en la barra (las que ya existían; Historia y Lugar no tienen). */
const ACCION: Record<Etapa, string | null> = {
  datos: 'datos-del-caso', lugar: null, historia: null, evaluacion: 'definir-finales', enviar: 'enviar-revision',
};

// BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
/** Qué se hace en cada etapa: el bocadillo de la barra al posarse o enfocar la etapa. */
export const DESCRIPCION: Record<Etapa, string> = {
  datos: 'El nombre del caso, el contexto que lee el estudiante y lo que va a practicar.',
  lugar: 'Dónde ocurre el caso: el lugar, sus salas y cómo se conectan.',
  historia: 'Las escenas del caso: lo que se dice en cada una y las respuestas que puede elegir el estudiante.',
  evaluacion: 'Los pasos profesionales, la rúbrica y los finales con que se valora cada intento.',
  enviar: 'Revisa lo que falta y envía el caso a revisión para que se publique.',
};

/** Lo que se ve junto al nombre de la etapa: la cuenta de pendientes, el avance («3/8») o nada. */
export function cifraDeEtapa(a: AvanceEtapa): string {
  if (a.pendientes) return String(a.pendientes);
  const avance = /^(\d+) de (\d+)/.exec(a.detalle);
  return avance && a.estado === 'en-curso' ? `${avance[1]}/${avance[2]}` : '';
}

/**
 * El hilo del caso (EDITOR.md §3.1): las cinco etapas, siempre visibles y nunca obligatorias, cada una con su estado dicho
 * con FORMA (círculo vacío, medio círculo, triángulo, visto) y con TEXTO (la cifra a la vista y la frase entera para el
 * lector de pantalla y en el globo). Conserva el nombre «Secciones del caso» de la barra de antes (lo buscan las pruebas
 * y los lectores de pantalla ya lo conocen).
 *
 * Cede por ancho (§4.1): primero los nombres se quedan en su número con el estado (el nombre sigue en `aria-label` y en
 * `title`); por debajo de 64rem el hilo entero pasa a un menú «3 de 5 · Historia».
 */
@Component({
  selector: 'app-hilo-del-caso',
  imports: [RouterLink, UiMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hilo' },
  template: `
    <nav aria-label="Secciones del caso" class="hilo__nav">
      <ol class="hilo__lista">
        @for (a of progreso.avance(); track a.etapa; let i = $index) {
          <li class="hilo__paso">
            <!-- Cada etapa: su número en un círculo (con una marca de estado en la esquina), el nombre y la cifra. La
                 descripción sale en un bocadillo propio al posarse o enfocar (como las de la barra del portal), asociada con
                 aria-describedby y sin «title» nativo. Escape la cierra sin mover el puntero (WCAG 1.4.13). -->
            <a class="hilo__etapa ds-motion" [routerLink]="rutas.a(a.ruta)" [attr.data-estado]="a.estado"
               [attr.data-accion]="accion[a.etapa]" [attr.aria-current]="progreso.etapaActual() === a.etapa ? 'page' : null"
               [attr.aria-describedby]="'hilo-ayuda-' + a.etapa"
               (keydown.escape)="ocultarAyuda($event)" (mouseleave)="mostrarAyuda($event)" (blur)="mostrarAyuda($event)">
              <!-- El nombre se lee del texto para lectores (no de un aria-label): Axe comparaba el aria-label con el texto
                   visible pegado («Historia1») y lo daba por distinto. Empieza por el nombre visible (WCAG 2.5.3). -->
              <span class="solo-lector">{{ nombreAccesible(a) }}</span>
              <span class="hilo__pin" [attr.data-estado]="a.estado" aria-hidden="true">
                <span class="hilo__numero">{{ i + 1 }}</span>
                <span class="hilo__marca marca-estado" [attr.data-estado]="a.estado"></span>
              </span>
              <span class="hilo__nombre" aria-hidden="true">{{ a.nombre }}</span>
              @if (cifraDeEtapa(a); as cifra) { <span class="hilo__cifra" aria-hidden="true">{{ cifra }}</span> }
            </a>
            <span class="hilo__ayuda" [id]="'hilo-ayuda-' + a.etapa" aria-hidden="true">
              <span class="hilo__ayuda-texto">{{ descripcion[a.etapa] }}</span>
              <span class="hilo__ayuda-estado" [attr.data-estado]="a.estado">{{ estadoVisible(a) }}</span>
            </span>
          </li>
        }
      </ol>
    </nav>
    <!-- Por debajo de 64rem: un menú. Va fuera del <nav> para no duplicar sus enlaces en el árbol de accesibilidad. -->
    <ui-menu class="hilo__menu" [label]="rotuloMenu()" [items]="opciones()" align="start" (itemSelected)="ir($event)" />
  `,
  styles: `
    :host { display: flex; align-items: center; min-inline-size: 0; }
    .hilo__nav { min-inline-size: 0; }
    /* Las etapas, como un control segmentado de vidrio (/barra-de-vidrio-modular; pedido del usuario, 2026-11-22): una
       pista hundida en la barra y, en ella, cada etapa una cápsula; la etapa en la que estás es la cápsula elevada (más
       clara, con su filo de luz arriba y su canto), como el segmento elegido de iOS. Sin un segundo desenfoque: el
       vidrio es el de la barra. Cada etapa conserva su marca de estado (vacía, a medias, verde) y su cifra. */
    .hilo__lista {
      display: flex; align-items: center; gap: 0.125rem; margin: 0; padding: 0.1875rem; list-style: none;
      border-radius: 999px; background: color-mix(in oklab, var(--asb-cromo-tinta) 5%, transparent);
      box-shadow: inset 0 0 0 1px var(--asb-canto);
    }
    /* Una etapa: una cápsula de la pista con un círculo numerado delante (el «paso» de un asistente), el nombre y la
       cifra. El círculo dice el estado con tinte y con una marca en la esquina (forma, no solo color): visto si está
       lista, triángulo si tiene pendientes; vacío o a medias no llevan marca y el círculo queda neutro. */
    .hilo__paso { position: relative; }
    .hilo__etapa {
      position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-block-size: 2.75rem; min-inline-size: 2.75rem;
      padding-inline: 0.5rem 0.875rem; border-radius: 999px; color: var(--asb-cromo-tinta-tenue); font-size: var(--autoria-texto-16);
      font-weight: 600; white-space: nowrap; text-decoration: none;
      box-shadow: inset 0 1px 0 transparent, inset 0 0 0 1px transparent;
      transition:
        background-color var(--ds-dur-fade) var(--ds-ease-out),
        box-shadow var(--ds-dur-fade) var(--ds-ease-out),
        color var(--ds-dur-fade) var(--ds-ease-out),
        scale var(--ds-dur-press) var(--ds-ease-out);
    }
    /* El área tocable llega a 44 px sin agrandar la cápsula (la pista la contiene). */
    .hilo__etapa::after { content: ''; position: absolute; inset: -0.125rem 0; }
    @media (hover: hover) and (pointer: fine) {
      .hilo__etapa:not([aria-current='page']):hover { background-color: var(--asb-brillo); color: var(--asb-cromo-tinta); }
    }
    .hilo__etapa:active { scale: 0.97; }
    .hilo__etapa:focus-visible { outline: 2px solid var(--ds-focus); outline-offset: 2px; }
    /* Donde estás: la cápsula elevada (forma, no solo color: se despega de la pista con su filo y su canto) y el círculo
       en el color de marca. */
    .hilo__etapa[aria-current='page'] {
      background-color: color-mix(in oklab, var(--asb-superficie) 88%, transparent); color: var(--asb-cromo-tinta); font-weight: 700;
      box-shadow: inset 0 1px 0 var(--asb-filo), inset 0 0 0 1px var(--asb-canto), 0 1px 3px color-mix(in oklab, var(--asb-cromo-tinta) 18%, transparent);
    }

    .hilo__pin {
      position: relative; display: inline-grid; place-items: center; flex: none; inline-size: 1.625rem; block-size: 1.625rem;
      border-radius: 999px; background: color-mix(in oklab, var(--asb-cromo-tinta) 9%, transparent);
      box-shadow: inset 0 0 0 1px var(--asb-canto); color: var(--asb-cromo-tinta);
    }
    .hilo__numero { font-size: var(--autoria-texto-14); font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
    .hilo__pin[data-estado='lista'] { background: var(--ds-success-bg); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ds-success) 45%, transparent); color: var(--ds-success); }
    .hilo__etapa[aria-current='page'] .hilo__pin { background: var(--ds-primary); box-shadow: none; color: var(--ds-on-primary); }
    /* La marca de estado, chica, en la esquina de abajo del círculo, con un aro del color de la barra para despegarse. */
    .hilo__pin .hilo__marca { position: absolute; inset-block-end: -0.1875rem; inset-inline-end: -0.25rem; scale: 0.78; }
    .hilo__pin .hilo__marca[data-estado='sin-empezar'], .hilo__pin .hilo__marca[data-estado='en-curso'] { display: none; }
    .hilo__pin .hilo__marca[data-estado='lista'] { box-shadow: 0 0 0 2px var(--asb-superficie); }

    .hilo__cifra { color: var(--asb-cromo-tinta-tenue); font-size: var(--autoria-texto-14); font-variant-numeric: tabular-nums; }
    /* Los pendientes, en una pastilla propia: «Historia 1» se leía como un solo nombre. */
    .hilo__etapa[data-estado='con-pendientes'] .hilo__cifra {
      display: inline-grid; place-items: center; min-inline-size: 1.25rem; block-size: 1.25rem; padding-inline: 0.3125rem;
      border-radius: 999px; background: var(--ds-warning-bg); color: var(--ds-warning-text); font-weight: 700; line-height: 1;
    }

    /* El bocadillo de la etapa: la misma pieza que las descripciones del menú del portal (superficie, filo, sombra y
       flecha), centrado bajo la etapa; con la descripción y, debajo, el estado. */
    .hilo__ayuda {
      position: absolute; inset-block-start: calc(100% + var(--ds-space-2)); inset-inline-start: 50%; z-index: var(--ds-z-desplegable);
      display: grid; gap: var(--ds-space-1); inline-size: max-content; max-inline-size: min(17rem, calc(100vw - 2rem));
      padding: var(--ds-space-2) var(--ds-space-3); border: 1px solid var(--ds-border); border-radius: var(--ds-radius-md);
      background: var(--ds-surface-1); box-shadow: var(--ds-shadow-e2); color: var(--ds-text-1);
      font-size: var(--ds-type-body-s-size); font-weight: 400; line-height: var(--ds-type-body-s-line); text-align: start; white-space: normal;
      opacity: 0; visibility: hidden; translate: -50% calc(-1 * var(--ds-space-1));
      transition: opacity var(--ds-dur-fast) var(--ds-ease-out), translate var(--ds-dur-fast) var(--ds-ease-out), visibility 0s linear var(--ds-dur-fast);
    }
    .hilo__ayuda::before {
      content: ''; position: absolute; inset-block-end: 100%; inset-inline-start: 50%; inline-size: var(--ds-space-2); block-size: var(--ds-space-2);
      translate: -50% 50%; rotate: 45deg; background: var(--ds-surface-1);
      border-block-start: 1px solid var(--ds-border); border-inline-start: 1px solid var(--ds-border);
    }
    /* Puente invisible entre la etapa y el bocadillo: el puntero pasa al bocadillo sin que se cierre. */
    .hilo__ayuda::after { content: ''; position: absolute; inset-inline: 0; inset-block-end: 100%; block-size: calc(var(--ds-space-2) + 1px); }
    .hilo__ayuda-estado { color: var(--ds-text-2); font-weight: 600; }
    .hilo__ayuda-estado[data-estado='con-pendientes'] { color: var(--ds-warning-text); }
    .hilo__ayuda-estado[data-estado='lista'] { color: var(--ds-success); }
    .hilo__etapa:focus-visible + .hilo__ayuda { opacity: 1; visibility: visible; translate: -50% 0; transition-delay: 0s; }
    @media (hover: hover) and (pointer: fine) {
      .hilo__paso:hover .hilo__ayuda { opacity: 1; visibility: visible; translate: -50% 0; transition-delay: var(--ds-dur-slow); }
    }
    .hilo__etapa.hilo__etapa--sin-ayuda + .hilo__ayuda { opacity: 0; visibility: hidden; transition-delay: 0s; }
    @media (forced-colors: active) {
      .hilo__ayuda, .hilo__ayuda::before { border-color: CanvasText; }
      .hilo__pin { border: 1px solid CanvasText; }
    }
    .hilo__menu { display: none; }

    @media (min-width: 75rem) and (max-width: 99.999rem) {
      .hilo__etapa { gap: 0.375rem; padding-inline: 0.375rem 0.625rem; }
    }
    /* Por debajo de 75rem los nombres ceden y quedan los círculos numerados con su estado (el número siempre se ve). */
    @media (min-width: 64rem) and (max-width: 74.999rem) {
      .hilo__nombre { display: none; }
      .hilo__etapa { gap: 0.25rem; padding-inline: 0.5rem; }
    }
    @media (max-width: 63.999rem) {
      .hilo__nav { display: none; }
      .hilo__menu { display: inline-flex; }
    }
  `,
})
export class HiloDelCasoComponent {
  protected readonly progreso = inject(ProgresoDelCaso);
  protected readonly rutas = inject(RutasAutoria);
  private readonly router = inject(Router);
  protected readonly accion = ACCION;
  protected readonly textoDeEtapa = textoDeEtapa;
  protected readonly cifraDeEtapa = cifraDeEtapa;
  protected readonly descripcion = DESCRIPCION;

  /** «Historia 4, 4 por corregir»: el nombre visible (y la cifra), y el estado entero. */
  protected nombreAccesible(a: AvanceEtapa): string {
    const cifra = cifraDeEtapa(a);
    return `${a.nombre}${cifra ? ' ' + cifra : ''}, ${textoDeEtapa(a)}`;
  }

  /** El estado para el bocadillo, sin repetir el nombre de la etapa (va justo encima): «0 de 6 pasos cubiertos, 1 pendiente». */
  protected estadoVisible(a: AvanceEtapa): string {
    // «Con pendientes, 1 pendiente» lo decía dos veces: basta la cuenta.
    const texto = textoDeEtapa(a).replace(`${a.nombreLargo}, `, '').replace(/^con pendientes, /i, '');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  /** Escape cierra el bocadillo sin mover el puntero ni el foco; vuelve a salir al dejar la etapa (WCAG 1.4.13). */
  protected ocultarAyuda(evento: Event): void {
    (evento.currentTarget as HTMLElement).classList.add('hilo__etapa--sin-ayuda');
  }

  protected mostrarAyuda(evento: Event): void {
    (evento.currentTarget as HTMLElement).classList.remove('hilo__etapa--sin-ayuda');
  }

  /**
   * «3 de 5 · Historia» (o «Etapas del caso» fuera de ellas). Sin la palabra «Etapa» de §4.1: en un teléfono de 390 px
   * el menú comparte la fila con la marca, el tema y la cuenta, y con ella se cortaba.
   */
  protected readonly rotuloMenu = computed(() => {
    const avance = this.progreso.avance();
    const i = avance.findIndex((a) => a.etapa === this.progreso.etapaActual());
    return i < 0 ? 'Etapas del caso' : `${i + 1} de ${avance.length} · ${avance[i].nombre}`;
  });

  protected readonly opciones = computed<UiMenuItem[]>(() => this.progreso.avance().map((a, i) => ({
    value: a.etapa,
    label: `${i + 1} · ${a.nombre}: ${a.pendientes ? `${a.pendientes} por corregir` : a.detalle || TEXTO_ESTADO[a.estado]}`,
  })));

  protected ir(etapa: string | undefined): void {
    const destino = this.progreso.avance().find((a) => a.etapa === etapa);
    if (destino) void this.router.navigateByUrl(this.rutas.a(destino.ruta));
  }
}
