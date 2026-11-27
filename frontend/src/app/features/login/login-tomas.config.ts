// BORRADOR: texto pendiente de Psicología.
export type PilarToma = 'simula' | 'decide' | 'evalua' | 'aprende';
export interface LoginToma {
  id: string;
  titulo: string;
  pilares: readonly PilarToma[];
  segundos: number;
  alt: string;
}
export const LOGIN_TOMAS: readonly LoginToma[] = [
  { id: 'llegada', titulo: 'Llegas a la sala de espera', pilares: ['simula'], segundos: 7, alt: 'Juego en pixel art: de noche, una psicóloga con bata camina por la sala de espera de urgencias hasta donde espera una familia.' },
  { id: 'escucha', titulo: 'Escuchas a la familia', pilares: ['simula'], segundos: 8, alt: 'La psicóloga se acerca a Gloria, que le pregunta en un cuadro de diálogo con su retrato si no habrá un sitio donde sentarse los tres.' },
  { id: 'decision', titulo: 'Decides qué hacer', pilares: ['decide'], segundos: 9, alt: 'Cuadro de diálogo con cuatro opciones sobre dónde hablar con la familia; se elige la sala de escucha y Gloria responde.' },
  { id: 'cruce', titulo: 'Pasan a la sala de escucha', pilares: ['decide'], segundos: 8.5, alt: 'La familia camina hasta la puerta, la psicóloga entra detrás y aparece la sala de escucha, iluminada con lámparas.' },
  { id: 'supervision', titulo: 'Revisas con tu profesor', pilares: ['evalua', 'aprende'], segundos: 9, alt: 'Al cerrar el caso, la revisión del profesor repasa paso a paso lo que se logró en el hospital.' },
];
