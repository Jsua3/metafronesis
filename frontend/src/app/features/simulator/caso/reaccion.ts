/**
 * Pasos de la reacción del personaje tras una decisión (4.3.3, pasos 2 a 4): encuadre, gesto, cara, frase y etiqueta.
 * Cerrar el panel, la nota de supervisión y la escena de destino los hace la pantalla. Módulo puro.
 */
import type { DecisionReaction, Persona } from '../../../core/models/simulation.model';
import { definitivePortrait } from '../persona-portrait.util';
import { msDeGesto } from './gestos';
import { type Emocion, type Gesto, esEmocion, esGesto } from './vocabulario';

export type PasoReaccion =
  | { tipo: 'encuadrar'; objectKey: string; ms: number }
  | { tipo: 'gesto'; objectKey: string; gesto: Gesto; ms: number }
  | { tipo: 'cara'; emocion: Emocion; ms: 0 }
  | { tipo: 'frase'; texto: string; ms: number }
  | { tipo: 'etiqueta'; texto: string; ms: number };

type EstadoPersona = Pick<Persona, 'bond' | 'activation' | 'label'>;

export interface EntradaReaccion {
  reaction: DecisionReaction | null;
  personaAntes: EstadoPersona;
  personaDespues: EstadoPersona;
  reduceMotion: boolean;
}

export const DURACION_MAX_REACCION_MS = 3200;

const MS_ENCUADRE = 450;
const MS_ETIQUETA = 500;
const MS_FRASE_MIN = 1200;
const MS_FRASE_MAX = 2000;


/** La emoción escrita si es del vocabulario; si no, la cara que dice el estado de la persona. */
export function caraDeReaccion(emotion: string | null, persona: Pick<Persona, 'bond' | 'activation'>): Emocion {
  if (esEmocion(emotion)) return emotion;
  const definitiva = definitivePortrait(persona);
  return esEmocion(definitiva) ? definitiva : 'neutral';
}

/** 900 ms más 30 por carácter, entre 1.200 y 2.000. */
export function msDeFrase(texto: string): number {
  return Math.min(MS_FRASE_MAX, Math.max(MS_FRASE_MIN, 900 + 30 * texto.length));
}

export function pasosDeReaccion(e: EntradaReaccion): PasoReaccion[] {
  const pasos: PasoReaccion[] = [];
  const { reaction } = e;

  if (reaction) {
    const objectKey = reaction.objectKey;
    if (objectKey && !e.reduceMotion) {
      pasos.push({ tipo: 'encuadrar', objectKey, ms: MS_ENCUADRE });
      if (esGesto(reaction.gesture)) {
        pasos.push({ tipo: 'gesto', objectKey, gesto: reaction.gesture, ms: msDeGesto(reaction.gesture) });
      }
    }
    pasos.push({ tipo: 'cara', emocion: caraDeReaccion(reaction.emotion, e.personaDespues), ms: 0 });
    const texto = reaction.line.trim();
    if (texto !== '') pasos.push({ tipo: 'frase', texto, ms: msDeFrase(texto) });
  }

  if (e.personaDespues.label !== e.personaAntes.label) {
    pasos.push({ tipo: 'etiqueta', texto: e.personaDespues.label, ms: MS_ETIQUETA });
  }

  return recortar(pasos);
}

/** La suma nunca pasa del máximo: se recorta primero la frase (sin bajar de 1.200) y luego el gesto. */
function recortar(pasos: PasoReaccion[]): PasoReaccion[] {
  let exceso = pasos.reduce((s, p) => s + p.ms, 0) - DURACION_MAX_REACCION_MS;
  if (exceso <= 0) return pasos;

  const frase = pasos.find(p => p.tipo === 'frase');
  if (frase) {
    const quita = Math.min(exceso, Math.max(0, frase.ms - MS_FRASE_MIN));
    frase.ms -= quita;
    exceso -= quita;
  }
  const gesto = pasos.find(p => p.tipo === 'gesto');
  if (gesto && exceso > 0) {
    const quita = Math.min(exceso, gesto.ms);
    gesto.ms -= quita;
    if (gesto.ms === 0) pasos.splice(pasos.indexOf(gesto), 1);
  }
  return pasos;
}
