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
        @for (a of progreso.avance(); track a.etapa) {
          <li>
            <a class="hilo__etapa ds-motion" [routerLink]="rutas.a(a.ruta)" [attr.data-estado]="a.estado"
               [attr.data-accion]="accion[a.etapa]" [attr.aria-current]="progreso.etapaActual() === a.etapa ? 'page' : null"
               [attr.title]="a.nombre + (cifraDeEtapa(a) ? ' ' + cifraDeEtapa(a) : '') + ', ' + textoDeEtapa(a)">
              <!-- El nombre se lee del texto para lectores (no de un aria-label): Axe comparaba el aria-label con el texto
                   visible pegado («Historia1») y lo daba por distinto. Empieza por el nombre visible (WCAG 2.5.3). -->
              <span class="solo-lector">{{ a.nombre + (cifraDeEtapa(a) ? ' ' + cifraDeEtapa(a) : '') + ', ' + textoDeEtapa(a) }}</span>
              <span class="hilo__marca marca-estado" [attr.data-estado]="a.estado" aria-hidden="true"></span>
              <span class="hilo__nombre" aria-hidden="true">{{ a.nombre }}</span>
              @if (cifraDeEtapa(a); as cifra) { <span class="hilo__cifra" aria-hidden="true">{{ cifra }}</span> }
            </a>
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
    .hilo__etapa {
      position: relative; display: inline-flex; align-items: center; gap: 0.375rem; min-block-size: 2.5rem;
      padding-inline: 0.75rem; border-radius: 999px; color: var(--asb-cromo-tinta); font-size: var(--autoria-texto-16);
      font-weight: 600; white-space: nowrap; text-decoration: none;
      box-shadow: inset 0 1px 0 transparent, inset 0 0 0 1px transparent;
      transition:
        background-color var(--ds-dur-fade) var(--ds-ease-out),
        box-shadow var(--ds-dur-fade) var(--ds-ease-out),
        scale var(--ds-dur-press) var(--ds-ease-out);
    }
    /* El área tocable llega a 44 px sin agrandar la cápsula (la pista la contiene). */
    .hilo__etapa::after { content: ''; position: absolute; inset: -0.125rem 0; }
    @media (hover: hover) and (pointer: fine) {
      .hilo__etapa:not([aria-current='page']):hover { background-color: var(--asb-brillo); color: var(--asb-cromo-tinta); }
    }
    .hilo__etapa:active { scale: 0.97; }
    .hilo__etapa:focus-visible { outline: 2px solid var(--ds-focus); outline-offset: 2px; }
    /* Donde estás: la cápsula elevada (forma, no solo color: se despega de la pista con su filo y su canto). */
    .hilo__etapa[aria-current='page'] {
      background-color: color-mix(in oklab, var(--asb-superficie) 88%, transparent); font-weight: 800;
      box-shadow: inset 0 1px 0 var(--asb-filo), inset 0 0 0 1px var(--asb-canto), 0 1px 3px color-mix(in oklab, var(--asb-cromo-tinta) 18%, transparent);
    }
    .hilo__numero { display: none; font-variant-numeric: tabular-nums; }
    .hilo__cifra { color: var(--asb-cromo-tinta-tenue); font-size: var(--autoria-texto-14); font-variant-numeric: tabular-nums; }
    /* Los pendientes, en una cápsula propia: «Historia 1» se leía como un solo nombre. */
    .hilo__etapa[data-estado='con-pendientes'] .hilo__cifra {
      display: inline-grid; place-items: center; min-inline-size: 1.125rem; block-size: 1.125rem; padding-inline: 0.25rem;
      border-radius: 999px; box-shadow: inset 0 0 0 1px currentColor; color: var(--ds-warning-text); font-weight: 800; line-height: 1;
    }
    .hilo__menu { display: none; }

    /* Por debajo de 120rem (medido: a 1600 px los cinco nombres se montaban 100 px sobre las herramientas) el nombre
       cede y queda el número con su estado. */
    @media (min-width: 64rem) and (max-width: 119.999rem) {
      .hilo__nombre { display: inline; }
      /* La etapa en la que estás conserva su nombre: un número solo no dice dónde estoy. */
      .hilo__etapa[aria-current='page'] .hilo__nombre { display: inline; }
      .hilo__etapa { gap: 0.25rem; padding-inline: 0.375rem; }
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
