/**
 * El estado de la persona usuaria, en palabras: cómo se abre o se cierra (vínculo) y cómo se calma o se tensa
 * (activación). El servidor lo lleva en pasos de −1 a +1 por eje; aquí nunca sale un número: el docente lo lee como
 * «se abre y se calma».
 */
import type { ClaseRespuesta, Respuesta } from './caso';

export const VINCULOS = ['WITHDRAWN', 'GUARDED', 'OPEN'] as const;
export const ACTIVACIONES = ['CALM', 'TENSE', 'CRISIS'] as const;

export const VINCULO_EN_PALABRAS: Record<string, string> = { WITHDRAWN: 'retraída', GUARDED: 'cautelosa', OPEN: 'abierta' };
export const ACTIVACION_EN_PALABRAS: Record<string, string> = { CALM: 'serena', TENSE: 'tensa', CRISIS: 'en crisis' };

/** Cuánto se mueve la persona con cada clase si el docente no elige otra cosa: `[vínculo, activación]`. */
export const PASO_POR_CLASE: Record<ClaseRespuesta, [number, number]> = {
  RECOMMENDED: [1, -1], ACCEPTABLE: [0, 0], RISKY: [-1, 0], CONTRAINDICATED: [-1, 1],
};

/** Se mueve un lugar en la escala sin salirse de ella. */
export const acotar = (lista: readonly string[], actual: string, paso: number): string =>
  lista[Math.max(0, Math.min(lista.length - 1, lista.indexOf(actual) + paso))];

/** El paso de un respuesta: el que declaró el docente (lo que no tocó queda igual) o, sin declaración, el de su clase. */
export function pasoDeRespuesta(respuesta: Pick<Respuesta, 'clase' | 'efectos'>): [number, number] | null {
  const declarado = respuesta.efectos.persona;
  if (declarado) return [declarado.bond ?? 0, declarado.activation ?? 0];
  return respuesta.clase ? PASO_POR_CLASE[respuesta.clase] : null;
}

/** Un paso dicho con las palabras del docente: «se abre y se calma». */
export function fraseDePaso(vinculo: number, activacion: number): string {
  const partes = [
    vinculo > 0 ? 'se abre' : vinculo < 0 ? 'se cierra' : null,
    activacion < 0 ? 'se calma' : activacion > 0 ? 'se tensa' : null,
  ].filter((p): p is string => p !== null);
  return partes.length ? partes.join(' y ') : 'se queda como estaba';
}

/** Lo que le pasa a la persona si el estudiante elige esta respuesta; `null` si aún no tiene clase. */
export function fraseDeRespuesta(respuesta: Pick<Respuesta, 'clase' | 'efectos'>): string | null {
  const paso = pasoDeRespuesta(respuesta);
  return paso ? fraseDePaso(paso[0], paso[1]) : null;
}
