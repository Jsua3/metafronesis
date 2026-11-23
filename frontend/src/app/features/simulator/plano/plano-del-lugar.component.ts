import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Muro, PlanoDelLugar, SalaDibujada, dibujarPlano, puntoEnElMuro, textoDeLaSala, textoDelPlano } from './plano';

/** Una puerta con algo por resolver (editor de casos): una marca roja discontinua con «×» y su texto en la lista. */
export interface PuertaRota { sala: string; muro: Muro; pos: number; texto: string }

/** Medio lado de la muesca de una puerta y su grosor, en px de plano (los de sala). */
const PUERTA_LARGO = 40;
const PUERTA_GROSOR = 14;

/**
 * Dibujo del plano del lugar (bloque M1, §5.2): cada sala es un rectángulo proporcional a su ancho con una muesca en
 * cada puerta. La actual va resaltada y con una marca «estás aquí» (forma, no solo color); las visitadas, rellenas y,
 * en el plano completo, con su nombre; las no visitadas, solo el contorno punteado. El SVG se escala solo (`viewBox`).
 *
 * - `mini`: para el minimapa. Sin nombres; la imagen lleva la alternativa en texto («Estás en: …. Puertas: …»).
 * - `completo`: para el diálogo del plano. Con nombres y una lista legible, una línea por sala, que es lo que lee el
 *   lector de pantalla con detalle.
 */
@Component({
  selector: 'app-plano-del-lugar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="plano__dibujo" [attr.viewBox]="viewBox()" role="img" [attr.aria-label]="resumen()"
      preserveAspectRatio="xMidYMid meet" focusable="false">
      @for (sala of dibujo().salas; track sala.clave) {
        <g [attr.class]="'sala sala--' + sala.estado" [attr.data-sala]="sala.clave" [class.sala--elegible]="elegible()"
          (click)="elegible() && salaElegida.emit(sala.clave)">
          <rect class="sala__piso" [attr.x]="sala.x" [attr.y]="sala.y" [attr.width]="sala.ancho" [attr.height]="sala.alto"
            rx="24" vector-effect="non-scaling-stroke" />
          @for (p of sala.puertas; track $index) {
            <rect class="puerta" vector-effect="non-scaling-stroke"
              [attr.x]="horizontal(p.muro) ? p.x - PUERTA_LARGO : p.x - PUERTA_GROSOR"
              [attr.y]="horizontal(p.muro) ? p.y - PUERTA_GROSOR : p.y - PUERTA_LARGO"
              [attr.width]="horizontal(p.muro) ? 2 * PUERTA_LARGO : 2 * PUERTA_GROSOR"
              [attr.height]="horizontal(p.muro) ? 2 * PUERTA_GROSOR : 2 * PUERTA_LARGO" />
          }
          @if (sala.estado === 'actual') {
            <circle class="aqui" vector-effect="non-scaling-stroke"
              [attr.cx]="sala.x + sala.ancho / 2" [attr.cy]="modo() === 'completo' ? sala.y + 96 : sala.y + sala.alto / 2"
              [attr.r]="modo() === 'completo' ? 40 : 72" />
          }
          @if (modo() === 'completo' && sala.titulo) {
            <text class="sala__nombre" [attr.x]="sala.x + sala.ancho / 2" [attr.font-size]="letra()" text-anchor="middle">
              @for (linea of lineasDe(sala); track $index; let primera = $first; let ultima = $last) {
                <tspan [attr.x]="sala.x + sala.ancho / 2"
                  [attr.y]="primera ? yDeNombre(sala) : null" [attr.dy]="primera ? null : letra() * 1.15">{{ ultima ? linea : linea + ' ' }}</tspan>
              }
            </text>
          }
        </g>
      }
      @for (r of rotasDibujadas(); track $index) {
        <g class="rota" [attr.data-rota]="r.sala">
          <circle vector-effect="non-scaling-stroke" [attr.cx]="r.x" [attr.cy]="r.y" r="44" />
          <text [attr.x]="r.x" [attr.y]="r.y" text-anchor="middle" dominant-baseline="central" font-size="64">×</text>
        </g>
      }
    </svg>
    @if (modo() === 'completo') {
      <ul class="plano__lista">
        @for (item of lista(); track item.clave) {
          <li [attr.aria-current]="item.actual ? 'location' : null">
            @if (elegible()) {
              <button type="button" class="plano__sala" (click)="salaElegida.emit(item.clave)">{{ item.texto }}</button>
            } @else {
              {{ item.texto }}
            }
            @for (r of rotasDe(item.clave); track $index) { <span class="plano__rota">{{ r.texto }}</span> }
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    :host { display: grid; gap: var(--ds-space-3); min-width: 0; }
    .plano__dibujo { display: block; width: 100%; height: 100%; min-height: 0; }
    .sala__piso { fill: none; stroke: var(--pixel-plano-borde, var(--ds-text-3)); stroke-width: 1.5; stroke-dasharray: 5 4; }
    .sala--visitada .sala__piso { fill: var(--pixel-tecla, var(--ds-surface-2)); stroke: var(--pixel-tinta-suave, var(--ds-border-strong)); stroke-dasharray: none; }
    .sala--actual .sala__piso { fill: var(--luz, var(--ds-surface-2)); stroke: var(--pixel-contorno, var(--ds-primary)); stroke-width: 3; stroke-dasharray: none; }
    .puerta { fill: var(--pixel-penumbra, var(--ds-surface-page)); stroke: var(--pixel-tinta-suave, var(--ds-text-2)); stroke-width: 1; }
    .sala--sin-visitar .puerta { stroke: var(--ds-text-3); }
    .aqui { fill: var(--pixel-contorno, var(--ds-primary)); stroke: var(--luz, var(--ds-surface-page)); stroke-width: 2; }
    .sala__nombre { fill: var(--pixel-tinta, var(--ds-text-1)); font-family: var(--pixel-f-nombre, var(--ds-font-sans)); font-weight: 700; }
    .sala--actual .sala__nombre { fill: var(--pixel-tinta-oscura, var(--ds-primary-hover)); }
    .plano__lista {
      display: grid; gap: var(--ds-space-1); margin: 0; padding: 0; list-style: none;
      color: var(--ds-text-2); font-size: var(--ds-type-body-s-size); line-height: var(--ds-type-body-s-line);
    }
    .plano__lista li[aria-current] { color: var(--ds-text-1); font-weight: 700; }
    .sala--elegible { cursor: pointer; }
    .rota circle { fill: none; stroke: #bd2020; stroke-width: 3; stroke-dasharray: 6 4; }
    .rota text { fill: #a50000; font-weight: 700; }
    .plano__sala { display: block; width: 100%; min-height: 44px; padding: 8px 12px; text-align: left; font: inherit; color: var(--ds-text-1);
      background: var(--ds-surface-1, transparent); border: 1px solid var(--ds-border-strong, currentColor); border-radius: 8px; cursor: pointer; }
    .plano__sala:active { transform: translateY(1px); }
    .plano__rota { display: block; color: #a50000; font-weight: 600; }
  `],
})
export class PlanoDelLugarComponent {
  readonly plano = input.required<PlanoDelLugar>();
  /** Clave de la sala en la que está el estudiante. */
  readonly actual = input('');
  /** Salas visitadas en esta sesión que el servidor quizá aún no cuenta. */
  readonly visitadas = input<ReadonlySet<string>>(new Set());
  readonly modo = input<'mini' | 'completo'>('mini');
  /** Puertas con algo por resolver (solo el editor de casos): por omisión, ninguna. */
  readonly rotas = input<readonly PuertaRota[]>([]);
  /** Con `elegible`, cada sala del dibujo y de la lista se puede elegir (clic o Enter). */
  readonly elegible = input(false);
  readonly salaElegida = output<string>();

  protected readonly PUERTA_LARGO = PUERTA_LARGO;
  protected readonly PUERTA_GROSOR = PUERTA_GROSOR;

  protected readonly dibujo = computed(() => dibujarPlano(this.plano(), this.actual(), this.visitadas()));
  protected readonly viewBox = computed(() => {
    const { x, y, ancho, alto } = this.dibujo().caja;
    return `${x} ${y} ${ancho} ${alto}`;
  });
  protected readonly rotasDibujadas = computed(() => this.rotas().flatMap(r => {
    const sala = this.plano().salas.find(s => s.clave === r.sala);
    return sala ? [{ ...puntoEnElMuro(sala, r.muro, r.pos), sala: r.sala, texto: r.texto }] : [];
  }));
  protected rotasDe(clave: string): readonly PuertaRota[] { return this.rotas().filter(r => r.sala === clave); }
  // Sin sala actual (el plano del editor de casos) la imagen nombra las salas: nunca queda sin texto.
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  protected readonly resumen = computed(() => textoDeLaSala(this.plano(), this.actual())
    || `Plano de las salas: ${this.plano().salas.map(s => s.titulo).join(', ')}.`);
  protected readonly lista = computed(() => {
    const textos = textoDelPlano(this.plano(), this.actual(), this.visitadas());
    // En el editor (elegible) todas se ven: «visitada» es del juego y sobra.
    return this.plano().salas.map((sala, i) => ({ clave: sala.clave, actual: sala.clave === this.actual(),
      texto: this.elegible() ? textos[i].replace(/^(.*?), visitada\./, '$1.') : textos[i] }));
  });
  /** Tamaño de los nombres en px de plano: unas 48 letras a lo ancho del plano, se muestre al tamaño que se muestre. */
  protected readonly letra = computed(() => Math.round(this.dibujo().caja.ancho / 48));

  protected horizontal(muro: string): boolean {
    return muro === 'fondo' || muro === 'camara';
  }

  /** Parte el nombre en líneas que quepan en el 85 % del ancho de la sala (palabras enteras). */
  protected lineasDe(sala: SalaDibujada): string[] {
    const porLinea = Math.max(6, Math.floor((sala.ancho * 0.85) / (this.letra() * 0.56)));
    const lineas: string[] = [];
    for (const palabra of (sala.titulo ?? '').split(/\s+/).filter(Boolean)) {
      const ultima = lineas[lineas.length - 1];
      if (ultima !== undefined && (ultima + ' ' + palabra).length <= porLinea) lineas[lineas.length - 1] = ultima + ' ' + palabra;
      else lineas.push(palabra);
    }
    return lineas;
  }

  /** La primera línea del nombre, con el bloque centrado en la sala (bajo la marca «estás aquí»). */
  protected yDeNombre(sala: SalaDibujada): number {
    const n = this.lineasDe(sala).length;
    return Math.round(sala.y + sala.alto / 2 + this.letra() * 0.35 - ((n - 1) * this.letra() * 1.15) / 2 + 24);
  }
}
