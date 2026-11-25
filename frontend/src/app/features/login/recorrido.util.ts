import type { LoginRole } from './login-role.config';

/**
 * Recorrido de la ventana del acceso: explica cómo funciona el simulador. Los cuatro pasos siguen el orden de los pilares
 * de `LOGIN_PEDAGOGY_PILLARS`; la cámara y el detalle de cada paso viven en `acceso-escena.component.scss`.
 */
export const RECORRIDO_PASOS = ['simula', 'decide', 'evalua', 'aprende'] as const;
export type RecorridoPaso = (typeof RECORRIDO_PASOS)[number];

/** Lo que dice el rótulo que se posa sobre la escena en cada paso. Decorativo: lo mismo lo dice el texto del paso. */
export const RECORRIDO_ROTULOS: Record<RecorridoPaso, string> = {
  simula: 'Caso ficticio',
  decide: 'Tu decisión queda registrada',
  evalua: 'Rúbrica formativa',
  aprende: 'Tu bitácora',
};

/** Paso al que lleva elegir un perfil: lo que ese perfil viene a hacer (su bitácora, sus rúbricas, sus casos). */
export const PASO_DE_PERFIL: Record<LoginRole, RecorridoPaso> = {
  ESTUDIANTE: 'aprende',
  PROFESOR: 'evalua',
  ADMIN: 'simula',
};

/** El paso que sigue; después del último vuelve al primero. */
export function pasoSiguiente(indice: number): number {
  return (indice + 1) % RECORRIDO_PASOS.length;
}

export function indiceDePaso(paso: RecorridoPaso): number {
  return RECORRIDO_PASOS.indexOf(paso);
}
