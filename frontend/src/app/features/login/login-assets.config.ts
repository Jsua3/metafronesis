/**
 * Assets y constantes del login SIEP.
 */

import type { PilarToma } from './login-tomas.config';

export const LOGIN_REMEMBER_EMAIL_KEY = 'siep_login_email';

export interface LoginPedagogyPillar {
  key: PilarToma;
  title: string;
  description: string;
}

/**
 * Lo que hace el simulador, dicho sin promesas (guía de psicología de interfaces §4: casos ficticios, sin
 * diagnósticos ni «transformar»). Rediseño 2026-11-20: antes decía «entornos reales» y «para transformar».
 */
export const LOGIN_PEDAGOGY_PILLARS: LoginPedagogyPillar[] = [
  {
    key: 'simula',
    title: 'Simula',
    description: 'Casos ficticios para practicar sin poner en riesgo a nadie.',
  },
  {
    key: 'decide',
    title: 'Decide',
    description: 'Cada elección queda registrada para revisarla con tu docente.',
  },
  {
    key: 'evalua',
    title: 'Evalúa',
    description: 'Rúbricas y retroalimentación formativa, sin diagnósticos.',
  },
  {
    key: 'aprende',
    title: 'Aprende',
    description: 'Reflexiona en tu bitácora sobre lo que hiciste y por qué.',
  }
];
