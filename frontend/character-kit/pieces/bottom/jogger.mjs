/**
 * Parte de abajo: jogger del uniforme de Psicología (decisión 16). Ranura
 * `bottom`. Pierna entera en tela y puño elástico en el tobillo: las dos
 * filas de abajo de cada pierna en sombra. La cintura no se ve: la tapa el
 * bajo de la casaca.
 */
export default {
  id: 'jogger',
  kind: 'bottom',
  slots: ['bottom'],
  coverage: { P: 'bottom', l: 'bottom', m: 'bottom', L: 'bottom', M: 'bottom' },
  edges: [{ labels: ['m', 'M'], edge: 'bottom', depth: 2, tone: 2 }],
  views: {},
};
