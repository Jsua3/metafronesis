import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * El elenco del simulador: personajes del kit, de frente, en pixel art auténtico. Cada cuadro del kit mide 48 × 72 y
 * aquí se pinta a ×2 (96 × 144): escala entera, sin suavizado. Entra por pasos ligado al scroll y, con el cursor sobre
 * el llamado que lo contiene, respira tres veces con su animación de reposo (nada se mueve en bucle infinito; con
 * movimiento reducido no se mueve). Decorativo: el texto del llamado dice lo que importa.
 */
@Component({
  selector: 'app-elenco',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @for (p of elenco; track p) {
      <span class="persona"><i class="sprite" [class]="'sprite sprite--' + p"></i></span>
    }
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      align-items: flex-end;
      gap: clamp(0.25rem, 2vw, 1.5rem);
    }

    .persona {
      position: relative;
      display: block;
      width: 96px;
      height: 144px;
    }

    /* Sombra de contacto por escalones, del tono de la superficie (no un óvalo negro difuminado). */
    .persona::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: -2px;
      width: 64px;
      height: 8px;
      translate: -50% 0;
      background: color-mix(in oklab, var(--ds-text-1) 16%, transparent);
      clip-path: polygon(12.5% 0, 87.5% 0, 87.5% 25%, 100% 25%, 100% 75%, 87.5% 75%, 87.5% 100%, 12.5% 100%, 12.5% 75%, 0 75%, 0 25%, 12.5% 25%);
    }

    .sprite {
      position: relative;
      z-index: 1;
      display: block;
      width: 96px;
      height: 144px;
      background-repeat: no-repeat;
      background-position: 0 0;
      background-size: 384px 1152px;
      image-rendering: pixelated;
    }

    .sprite--camila { background-image: url('/assets/characters/kit/camila/bata/idle.png'); }
    .sprite--docente { background-image: url('/assets/characters/kit/docente-universidad/idle.png'); }
    .sprite--enfermera { background-image: url('/assets/characters/kit/enfermera-urgencias/idle.png'); }
    .sprite--david { background-image: url('/assets/characters/kit/david/bata/idle.png'); }
    .sprite--recepcion { background-image: url('/assets/characters/kit/funcionaria-recepcion/idle.png'); }

    @media (hover: hover) and (pointer: fine) {
      :host-context(.landing-cta__inner:hover) .sprite {
        animation: respira 900ms steps(4) 3;
      }

      :host-context(.landing-cta__inner:hover) .persona:nth-child(2) .sprite { animation-delay: 120ms; }
      :host-context(.landing-cta__inner:hover) .persona:nth-child(3) .sprite { animation-delay: 240ms; }
      :host-context(.landing-cta__inner:hover) .persona:nth-child(4) .sprite { animation-delay: 60ms; }
      :host-context(.landing-cta__inner:hover) .persona:nth-child(5) .sprite { animation-delay: 180ms; }
    }

    @keyframes respira {
      from { background-position-x: 0; }
      to { background-position-x: -384px; }
    }

    @supports (animation-timeline: view()) {
      .persona {
        animation: entra steps(4) both;
        animation-timeline: view();
        animation-range: entry 10% entry 70%;
      }

      @keyframes entra {
        from { opacity: 0; translate: 0 16px; }
        to { opacity: 1; translate: 0 0; }
      }
    }

    @media (max-width: 40rem) {
      .persona:nth-child(n + 4) { display: none; }
    }

    @media (prefers-reduced-motion: reduce) {
      .persona,
      .sprite {
        animation: none;
      }
    }
  `,
})
export class ElencoComponent {
  /** Estudiantes en bata, docente, enfermería y recepción: quienes acompañan el caso. */
  protected readonly elenco = ['camila', 'docente', 'enfermera', 'david', 'recepcion'];
}
