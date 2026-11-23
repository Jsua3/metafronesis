/**
 * Vistas diagonales (tres cuartos) de accessory:gafas, dibujadas a mano.
 * Aro lejano en escorzo (4 px), puente, aro cercano de 5 px y patilla hasta la oreja.
 * De espalda solo asoma la punta de la patilla delante de la oreja.
 * La cabeza girada ocupa x 17-32; la oreja cercana queda en x 29-30 (de frente)
 * y en x 18-19 (de espalda). Las vistas derechas salen del espejo.
 */

const LEGEND = { g: { literal: 'gafas' } };

export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', at: [17, 12], mode: 'paint', legend: LEGEND,
      grid: `
        .gg...ggg...
        g..ggg...ggg
        g..g.g...g..
        .gg...ggg...
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', at: [17, 13], mode: 'paint', legend: LEGEND,
      grid: `
        g
      `,
    },
  ],
};
