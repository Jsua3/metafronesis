import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { rutaArte, rutaRetrato } from '../../modelo/biblioteca.service';
import type { CasoBorrador } from '../../modelo/caso';

type Estante = 'personajes' | 'muebles' | 'objetos';

interface Pieza { id: string; nombre: string; detalle: string; arte: string; retrato: boolean }

/**
 * La pestaña «Biblioteca» del Explorador: el elenco y el catálogo que el caso copió de su lugar, con su arte en pixel art
 * a escala entera. Sirve para tener a la vista con qué se cuenta mientras se escribe (quién puede hablar, qué objetos
 * puede revisar el estudiante); colocar se hace en la sala.
 *
 * Patrón: componente de presentación. Recibe el caso; no carga nada (el catálogo ya viaja con el caso: sin API nueva).
 */
@Component({
  selector: 'app-explorador-biblioteca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="estantes" role="group" aria-label="Qué mostrar">
      @for (e of estantes; track e.id) {
        <button type="button" class="estante" [attr.aria-pressed]="estante() === e.id" (click)="estante.set(e.id)">
          {{ e.nombre }} <span class="cuenta">{{ cuenta()[e.id] }}</span>
        </button>
      }
    </div>
    @if (piezas().length) {
      <ul class="rejilla" [attr.aria-label]="nombreEstante()">
        @for (p of piezas(); track p.id) {
          <li class="bib-pieza" [attr.title]="p.nombre + (p.detalle ? ' · ' + p.detalle : '')">
            <span class="bib-pieza__marco" [class.bib-pieza__marco--retrato]="p.retrato">
              <img class="bib-pieza__arte" [src]="p.arte" alt="" loading="lazy" decoding="async" />
            </span>
            <span class="bib-pieza__nombre">{{ p.nombre }}</span>
            @if (p.detalle) { <span class="bib-pieza__detalle">{{ p.detalle }}</span> }
          </li>
        }
      </ul>
    } @else {
      <p class="vacio">Este caso no trae {{ nombreEstante().toLowerCase() }} de un lugar. Se agregan en la sala.</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.625rem; padding: 0.625rem 0.75rem 1rem; }
    .estantes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.125rem; padding: 0.1875rem; border-radius: var(--l-radio-chico, 0.5rem);
      background: var(--l-superficie-hundida); box-shadow: inset 0 0 0 1px var(--l-filo); }
    .estante {
      position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; min-block-size: 2rem; padding: 0 0.25rem;
      border: 0; border-radius: 0.375rem; background: transparent; color: var(--ds-text-2); font: inherit; font-size: var(--autoria-texto-14);
      font-weight: 600; cursor: pointer; transition: background-color var(--ds-dur-fast) var(--ds-ease-out);
    }
    .estante::after { content: ''; position: absolute; inset: -0.375rem 0; }
    .estante[aria-pressed='true'] { background: var(--l-superficie); color: var(--ds-text-1); box-shadow: 0 0 0 1px var(--l-filo-fuerte); }
    .cuenta { color: var(--ds-text-2); font-variant-numeric: tabular-nums; font-weight: 500; }
    .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .bib-pieza { display: flex; flex-direction: column; gap: 0.125rem; min-inline-size: 0; animation: entra var(--ds-dur-base) var(--ds-ease-out) both; }
    .bib-pieza__marco {
      display: grid; place-items: center; aspect-ratio: 1; border-radius: var(--l-radio-chico, 0.5rem); background-color: var(--l-superficie-hundida);
      background-image: linear-gradient(45deg, var(--l-filo) 25%, transparent 25% 75%, var(--l-filo) 75%),
        linear-gradient(45deg, var(--l-filo) 25%, transparent 25% 75%, var(--l-filo) 75%);
      background-position: 0 0, 0.25rem 0.25rem; background-size: 0.5rem 0.5rem; box-shadow: inset 0 0 0 1px var(--l-filo);
      overflow: hidden;
    }
    /* Pixel art: nítido y a escala entera (el arte del catálogo mide 32–110 px; ×1 en su caja, nunca suavizado). */
    .bib-pieza__arte { max-inline-size: 100%; max-block-size: 100%; image-rendering: pixelated; }
    .bib-pieza__marco--retrato .bib-pieza__arte { inline-size: 100%; block-size: 100%; object-fit: cover; }
    .bib-pieza__nombre { overflow: hidden; font-size: var(--autoria-texto-14); font-weight: 600; line-height: 1.125rem; text-overflow: ellipsis; white-space: nowrap; }
    .bib-pieza__detalle { overflow: hidden; color: var(--ds-text-2); font-size: var(--autoria-texto-14); line-height: 1.125rem; text-overflow: ellipsis; white-space: nowrap; }
    .vacio { margin: 0; color: var(--ds-text-2); font-size: var(--autoria-texto-14); line-height: 1.25rem; }
    @keyframes entra { from { opacity: 0; translate: 0 0.25rem; } }
    @media (prefers-reduced-motion: reduce) { .bib-pieza { animation: none; } .estante { transition: none; } }
  `,
})
export class ExploradorBibliotecaComponent {
  readonly caso = input.required<CasoBorrador>();
  protected readonly estante = signal<Estante>('personajes');
  protected readonly estantes: { id: Estante; nombre: string }[] = [
    { id: 'personajes', nombre: 'Elenco' }, { id: 'muebles', nombre: 'Muebles' }, { id: 'objetos', nombre: 'Objetos' },
  ];
  protected readonly nombreEstante = computed(() => this.estantes.find((e) => e.id === this.estante())!.nombre);
  protected readonly cuenta = computed<Record<Estante, number>>(() => {
    const c = this.caso();
    return { personajes: c.personajes?.length ?? 0, muebles: c.catalogo?.muebles.length ?? 0, objetos: c.catalogo?.objetos.length ?? 0 };
  });
  protected readonly piezas = computed<Pieza[]>(() => {
    const c = this.caso();
    switch (this.estante()) {
      case 'personajes':
        return (c.personajes ?? []).map((p) => ({ id: p.id, nombre: p.nombre, detalle: p.rol, arte: rutaRetrato(p.recipeId, 'neutral'), retrato: true }));
      case 'muebles':
        return (c.catalogo?.muebles ?? []).map((m) => ({ id: m.id, nombre: m.nombre, detalle: '', arte: rutaArte(c.lugarId, m.arte), retrato: false }));
      default:
        return (c.catalogo?.objetos ?? []).map((o) => ({ id: o.id, nombre: o.nombre, detalle: '', arte: rutaArte(c.lugarId, o.arte), retrato: false }));
    }
  });
}
