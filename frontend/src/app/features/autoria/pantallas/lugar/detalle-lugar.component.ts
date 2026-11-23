import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { Escenario, LugarResumen } from '../../modelo/escenario';
import { nombreTema } from '../../modelo/textos';

/**
 * El panel de detalle de la plantilla elegida (paso 1 de crear un caso), como el de «Nuevo proyecto» de Unity Hub: portada
 * grande, qué trae (salas, personajes, ideas para empezar), sus temas y las salas en miniatura. Componente presentacional:
 * recibe el lugar, su escenario (o `null` mientras llega) y las imágenes ya resueltas; no pide nada a ningún servicio.
 *
 * El contenido entra con un leve fundido y desplazamiento al cambiar de plantilla (`track` por id rehace el bloque), así el
 * cambio se nota sin saltos; con movimiento reducido, aparece sin más.
 */
@Component({
  selector: 'app-detalle-lugar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (l of [lugar()]; track l.id) {
      <div class="detalle">
        @if (portada(); as src) {
          <img class="pixel portada" [src]="src" alt="" width="960" height="528" decoding="async" />
        } @else {
          <span class="portada portada--patron" aria-hidden="true"></span>
        }
        <div class="cabeza">
          <p class="sobre">Plantilla de lugar</p>
          <h2 id="detalle-nombre">{{ l.nombre }}</h2>
          <p class="texto-secundario">{{ l.descripcion }}</p>
        </div>

        <dl class="cifras">
          <div><dt>Salas</dt><dd>{{ l.salas }}</dd></div>
          <div><dt>Personajes</dt><dd>{{ escenario() ? escenario()!.personajes.length : '…' }}</dd></div>
          <div><dt>Ideas</dt><dd>{{ escenario() ? escenario()!.recorridosSugeridos.length : '…' }}</dd></div>
        </dl>

        @if (l.temas.length) {
          <section class="bloque" aria-labelledby="detalle-temas">
            <h3 id="detalle-temas" class="seccion">Temas</h3>
            <p class="temas">@for (t of l.temas; track t) { <span class="pildora">{{ nombreTema(t) }}</span> }</p>
          </section>
        }

        <section class="bloque" aria-labelledby="detalle-salas">
          <h3 id="detalle-salas" class="seccion">Salas que trae</h3>
          @if (escenario(); as e) {
            <ul class="salas">
              @for (s of e.salas; track s.id) {
                <li>
                  @if (vistas()[s.id]; as src) {
                    <img class="pixel" [src]="src" alt="" width="960" height="528" loading="lazy" decoding="async" />
                  } @else {
                    <span class="hueco" aria-hidden="true"></span>
                  }
                  <span class="nombre-sala">{{ s.nombre }}</span>
                </li>
              }
            </ul>
          } @else if (!fallo()) {
            <!-- Esqueleto con la forma real: seis miniaturas en la misma rejilla, sin texto que salte después. -->
            <ul class="salas" aria-hidden="true">
              @for (n of esqueleto; track n) { <li><span class="hueco"></span><span class="raya"></span></li> }
            </ul>
          }
        </section>

        @if (!l.completo) {
          <p class="aviso">Este lugar llega más adelante. Mientras tanto, la universidad sirve para orientación inicial y bienestar.</p>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; min-inline-size: 0; }
    .detalle { display: flex; flex-direction: column; gap: 1rem; animation: aparecer var(--ds-dur-move) var(--ds-ease-out); }
    @keyframes aparecer { from { opacity: 0; transform: translateY(0.25rem); } }
    .portada {
      display: block; inline-size: 100%; block-size: auto; aspect-ratio: 16 / 9; object-fit: cover;
      border-radius: var(--radio-control); border: 1px solid var(--linea); background: var(--fondo-hundido);
    }
    .portada--patron, .hueco {
      background: repeating-conic-gradient(var(--fondo-hundido) 0 25%, color-mix(in oklab, var(--fondo-hundido) 80%, var(--linea)) 0 50%) 0 0 / 1rem 1rem;
    }
    .cabeza { display: flex; flex-direction: column; gap: 0.25rem; }
    .cabeza h2 { margin: 0; font-size: var(--autoria-texto-24); line-height: 2rem; }
    .cabeza p { margin: 0; font-size: var(--autoria-texto-16); line-height: 1.5rem; }
    .sobre, .seccion {
      margin: 0; font-size: var(--autoria-texto-14); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--texto-secundario);
    }
    /* Tres cifras en celdas iguales, separadas por filos de 1 px: se leen de un vistazo como en una ficha técnica. */
    .cifras {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0;
      border: 1px solid var(--linea); border-radius: var(--radio-control); overflow: hidden;
    }
    .cifras div { display: flex; flex-direction: column-reverse; gap: 0.125rem; padding: 0.5rem 0.75rem; }
    .cifras div + div { border-inline-start: 1px solid var(--linea); }
    .cifras dt { font-size: var(--autoria-texto-14); color: var(--texto-secundario); }
    .cifras dd { margin: 0; font-size: var(--autoria-texto-20); font-weight: 700; line-height: 1.75rem; font-variant-numeric: tabular-nums; }
    .bloque { display: flex; flex-direction: column; gap: 0.5rem; }
    .temas { display: flex; flex-wrap: wrap; gap: 0.375rem; margin: 0; }
    .salas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
    .salas li { display: flex; flex-direction: column; gap: 0.25rem; min-inline-size: 0; }
    .salas img, .hueco {
      display: block; inline-size: 100%; block-size: auto; aspect-ratio: 16 / 9; object-fit: cover;
      border-radius: var(--l-radio-chico, var(--radio-control)); border: 1px solid var(--linea);
    }
    .nombre-sala {
      font-size: var(--autoria-texto-14); line-height: 1.25rem; color: var(--texto-secundario);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .raya { display: block; block-size: 0.75rem; inline-size: 70%; border-radius: var(--l-pixel, 2px); background: var(--fondo-hundido); }
    .aviso { margin: 0; padding: 0.75rem; border-radius: var(--radio-control); background: var(--fondo-hundido); font-size: var(--autoria-texto-16); }
    @media (prefers-reduced-motion: reduce) { .detalle { animation: none; } }
  `,
})
export class DetalleLugarComponent {
  readonly lugar = input.required<LugarResumen>();
  readonly escenario = input<Escenario | null>(null);
  readonly fallo = input(false);
  readonly portada = input<string | null>(null);
  /** La imagen de cada sala por su id (la del fondo o la compuesta por piezas); falta mientras se pinta. */
  readonly vistas = input<Record<string, string | null>>({});
  protected readonly nombreTema = nombreTema;
  protected readonly esqueleto = [1, 2, 3, 4, 5, 6];
}
