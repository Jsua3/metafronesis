/**
 * Lo que el juego lee del ambiente de una sala (`map.ambient`, un registro libre que guarda el servidor): la imagen de
 * fondo que el caso eligió para esa sala y el encuadre que dibuja (de él sale la zona caminable). Solo lectura y a prueba de datos raros: un valor que no es texto no es fondo ni encuadre.
 */
import { esEncuadre, zonaCaminable, type Zona } from '../autoria/modelo/geometria';

export type Json = Record<string, unknown>;

export function backgroundImage(ambient: Json | null | undefined): string {
  const v = (ambient as { backgroundImage?: unknown })?.backgroundImage;
  return typeof v === 'string' ? v : '';
}

/**
 * La zona caminable que el encuadre de la sala (`ambient.encuadre`) dibuja en el fondo, o `null` si el ambiente no trae un
 * encuadre que conozcamos (una sala vieja o del caso de siempre: se usa toda la sala).
 */
export function walkableZone(ambient: Json | null | undefined): Zona | null {
  const encuadre = (ambient as { encuadre?: unknown } | null | undefined)?.encuadre;
  return esEncuadre(encuadre) ? zonaCaminable(encuadre) : null;
}
