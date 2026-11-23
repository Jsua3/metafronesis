import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/**
 * Cuatro reglas para escribir buenas respuestas, a la mano junto a «Lo que puede responder el estudiante» (EDITOR.md
 * §3.4.1, investigación A.2.6, recomendación 7). Se abre en el sitio, debajo del título, y no en un diálogo: la docente
 * las lee mientras escribe, sin perder de vista sus respuestas.
 *
 * Patrón: pieza de presentación autónoma (revelado con `aria-expanded`); no conoce el caso.
 */
@Component({
  selector: 'app-guia-de-redaccion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'guia-redaccion', '(keydown.escape)': 'cerrar()' },
  template: `
    <button type="button" class="guia-redaccion__boton" [attr.aria-expanded]="abierta()" aria-controls="guia-redaccion-panel"
            (click)="abierta.set(!abierta())">
      <span class="guia-redaccion__icono" aria-hidden="true">?</span>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      ¿Cómo escribir buenas respuestas?
    </button>
    @if (abierta()) {
      <div class="guia-redaccion__panel" id="guia-redaccion-panel">
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <ol class="guia-redaccion__reglas">
          <li><strong>Todas plausibles.</strong> Ninguna debe delatarse como la buena por cómo está escrita: largo, tono y detalle parecidos.</li>
          <li><strong>Errores reales.</strong> Las respuestas con riesgo o contraindicadas son lo que de verdad haría alguien con poca experiencia.</li>
          <li><strong>Mostrar, no juzgar.</strong> «Lo que lee el estudiante después» cuenta qué pasa con la persona; no califica la elección.</li>
          <li><strong>Sin bromas.</strong> Una opción absurda no enseña nada y le quita seriedad a un caso sensible.</li>
        </ol>
      </div>
    }
  `,
  styles: `
    :host { display: contents; }
    .guia-redaccion__boton {
      display: inline-flex; align-items: center; gap: 0.5rem; min-block-size: 2.75rem; padding: 0 0.875rem 0 0.375rem; cursor: pointer;
      border: 1px solid var(--linea); border-radius: 999px; background: var(--superficie); color: var(--primario);
      font: inherit; font-size: var(--autoria-texto-14); font-weight: 700;
      transition: scale var(--ds-dur-press) var(--ds-ease-out), background-color var(--ds-dur-fade) var(--ds-ease-out);
    }
    .guia-redaccion__boton[aria-expanded='true'] { border-color: var(--primario); background: var(--primario-tinte); }
    .guia-redaccion__boton:active { scale: 0.97; }
    .guia-redaccion__icono {
      display: inline-grid; place-items: center; inline-size: 1.75rem; block-size: 1.75rem; border-radius: 50%;
      background: var(--primario-tinte); font-weight: 800;
    }
    .guia-redaccion__panel {
      flex: 1 1 100%; order: 10; padding: 0.75rem 1rem; border: 1px solid var(--linea); border-radius: var(--radio-tarjeta);
      background: var(--fondo-hundido); animation: guia-abre var(--ds-dur-fade) var(--ds-spring-soft, var(--ds-ease-out));
    }
    .guia-redaccion__reglas { margin: 0; padding-inline-start: 1.25rem; display: flex; flex-direction: column; gap: 0.375rem; line-height: 1.5rem; }
    @media (hover: hover) and (pointer: fine) { .guia-redaccion__boton:hover { border-color: var(--primario); } }
    @keyframes guia-abre { from { opacity: 0; translate: 0 -0.25rem; } }
    @media (prefers-reduced-motion: reduce) { .guia-redaccion__panel { animation: none; } .guia-redaccion__boton { transition: none; } }
  `,
})
export class GuiaDeRedaccionComponent {
  protected readonly abierta = signal(false);

  protected cerrar(): void {
    this.abierta.set(false);
  }
}
