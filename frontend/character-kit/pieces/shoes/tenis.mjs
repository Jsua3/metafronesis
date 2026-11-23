/** Tenis: zapato oscuro con suela clara. Ranuras `shoes` y `sole`. */
export default {
  id: 'tenis',
  kind: 'shoes',
  coverage: { o: 'shoes', O: 'shoes' },
  /** La fila más baja de cada columna del pie es la suela. */
  edges: [{ labels: ['o', 'O'], edge: 'bottom', mat: 'sole' }],
  views: {},
};
