import { reducirMovimiento } from '../guia/guia.service';

/**
 * Resortes de la IA coautora (SIEP-269): curvas `linear()` muestreadas de un resorte amortiguado (masa 1), para que el panel y
 * la conversación se muevan con rebote físico y no con una curva fija. Se generaron con un integrador de 120 Hz:
 * - suave (rigidez 170, amortiguación 17): rebote visible, para cambios grandes de posición;
 * - vivo (260, 19): rápido con un rebote corto, para lo que aparece (pregunta, burbuja, panel);
 * - firme (400, 34): sin rebote, para lo que sigue al puntero.
 * Las mismas cadenas viven en CSS como `--resorte-*` (ver los estilos del panel y de la conversación).
 */
export interface Resorte {
  easing: string;
  ms: number;
}

export const RESORTE_SUAVE: Resorte = {
  ms: 733,
  easing: 'linear(0, 0.0336, 0.1006, 0.1893, 0.2902, 0.3955, 0.5497, 0.6443, 0.7296, 0.8043, 0.8678, 0.9428, 0.9802, 1.0086, 1.0291, 1.0478, 1.0538, 1.0558, 1.0549, 1.0518, 1.0473, 1.039, 1.0331, 1.0273, 1.0219, 1.0169, 1.0105, 1.007, 1.0042, 1.0019, 0.9994, 0.9983, 0.9975, 0.9971, 0.9969, 0.9969, 0.9971, 0.9974, 0.9977, 0.998, 1)',
};

export const RESORTE_VIVO: Resorte = {
  ms: 650,
  easing: 'linear(0, 0.0181, 0.0958, 0.2108, 0.3444, 0.4825, 0.6145, 0.7336, 0.8356, 0.9187, 0.9829, 1.0296, 1.0607, 1.0787, 1.0862, 1.0859, 1.0799, 1.0704, 1.0591, 1.0471, 1.0355, 1.03, 1.0202, 1.0118, 1.0051, 1.0001, 0.9965, 0.9941, 0.9929, 0.9925, 0.9927, 0.9933, 0.9942, 0.9952, 0.9962, 0.9972, 0.9981, 0.9989, 0.9995, 0.9999, 1)',
};

export const RESORTE_FIRME: Resorte = {
  ms: 342,
  easing: 'linear(0, 0.0278, 0.0747, 0.134, 0.2006, 0.2705, 0.3409, 0.4096, 0.4753, 0.5369, 0.5939, 0.6461, 0.6933, 0.7357, 0.7734, 0.8067, 0.8359, 0.8614, 0.8836, 0.9027, 0.919, 0.933, 0.9449, 0.955, 0.9634, 0.9705, 0.9764, 0.9813, 0.9853, 0.9886, 0.9912, 0.9934, 0.9951, 0.9965, 0.9976, 0.9984, 0.9991, 0.9996, 0.9999, 1)',
};

/**
 * FLIP con resorte: el elemento ya está en su sitio nuevo y se anima desde donde estaba (`antes`) hasta ahí. Con
 * «reducir movimiento» (o sin la API de animaciones, como en las pruebas) no se anima: el cambio es inmediato.
 */
export function deslizarDesde(el: HTMLElement, antes: DOMRect, resorte: Resorte = RESORTE_SUAVE): Animation | null {
  if (reducirMovimiento() || typeof el.animate !== 'function') return null;
  const despues = el.getBoundingClientRect();
  const dx = antes.left - despues.left;
  const dy = antes.top - despues.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;
  return el.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
    { duration: resorte.ms, easing: resorte.easing },
  );
}
