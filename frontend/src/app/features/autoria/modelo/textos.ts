import type { ClaseRespuesta, IntensidadEscena } from './caso';
import type { Encuadre, Expresion } from './escenario';

/** Cómo se nombra un encuadre ante el docente (nunca la clave técnica). */
export const ENCUADRE_LEGIBLE: Record<Encuadre, string> = {
  'tres-paredes': 'Sala cerrada · 3 paredes',
  'dos-paredes-izquierda': 'Esquina · 2 paredes',
  'dos-paredes-derecha': 'Esquina · 2 paredes',
  'una-pared': 'Fondo abierto · 1 pared',
};

/** Temas de la biblioteca con su nombre para el docente. */
export const TEMAS: readonly { id: string; nombre: string }[] = [
  { id: 'orientacion', nombre: 'Orientación' },
  { id: 'bienestar', nombre: 'Bienestar' },
  { id: 'violencia-genero', nombre: 'Violencia de género' },
  { id: 'ninez-adolescencia', nombre: 'Niñez y adolescencia' },
  { id: 'plan-seguridad', nombre: 'Plan de seguridad' },
  { id: 'rutas-proteccion', nombre: 'Rutas de protección' },
];

export function nombreTema(id: string): string {
  return TEMAS.find((t) => t.id === id)?.nombre ?? id;
}

/** «1. A, 2. B, 3. C» */
export function listaNumerada(nombres: string[]): string {
  return nombres.map((n, i) => `${i + 1}. ${n}`).join(', ');
}

/** «1 línea» / «3 líneas»: el número con la palabra que le toca. */
export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Cómo se nombra cada expresión ante el docente. */
export const NOMBRE_EXPRESION: Record<Expresion, string> = {
  neutral: 'Neutral', alegre: 'Alegre', preocupada: 'Preocupada', triste: 'Triste', cautelosa: 'Cautelosa', 'en-crisis': 'En crisis',
};

/** Cómo se nombra cada clase de respuesta ante el docente (nunca la clave técnica). */
export const NOMBRE_CLASE: Record<ClaseRespuesta, string> = {
  RECOMMENDED: 'Recomendada', ACCEPTABLE: 'Aceptable', RISKY: 'Con riesgo', CONTRAINDICATED: 'Contraindicada',
};

/** Cómo se nombra la intensidad de una escena ante el docente. */
export const NOMBRE_INTENSIDAD: Record<IntensidadEscena, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta' };
