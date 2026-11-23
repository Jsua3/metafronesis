/**
 * Calzado: zapatos de cuero bajos. Ranuras `shoes` y `sole`. Suela fina en la
 * fila de abajo y el empeine con brillo (tono de luz) en la fila de arriba:
 * lo distingue del tenis aunque compartan color.
 */
export default {
  id: 'zapatos',
  kind: 'shoes',
  slots: ['shoes', 'sole'],
  coverage: { o: 'shoes', O: 'shoes' },
  edges: [
    { labels: ['o', 'O'], edge: 'bottom', mat: 'sole' },
    { labels: ['o', 'O'], edge: 'top', tone: 0 },
  ],
  views: {},
};
