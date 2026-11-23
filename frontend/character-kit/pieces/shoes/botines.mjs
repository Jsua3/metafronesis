/**
 * Calzado: botines con caña al tobillo. Ranuras `shoes` y `sole`. La caña son
 * las 3 últimas filas de la pierna (sobre el pantalón o sobre la piel, según
 * la parte de abajo) y la suela, la fila de abajo del pie.
 */
export default {
  id: 'botines',
  kind: 'shoes',
  slots: ['shoes', 'sole'],
  coverage: { o: 'shoes', O: 'shoes' },
  edges: [
    { labels: ['m', 'M'], edge: 'bottom', depth: 3, mat: 'shoes' },
    { labels: ['o', 'O'], edge: 'bottom', mat: 'sole' },
  ],
  views: {},
};
