/**
 * Assets y constantes del login SIEP.
 */

/** Rutas relativas al `base href` (producción y `ng serve`). */
export const LOGIN_ASSETS = {
  images: {
    // Rediseño Metafrónesis 2026-11-20: la escena real del simulador, la misma de la vista previa de la portada (WebP,
    // 581 × 415). Antes, una ilustración del consultorio vacío a 640 y 1280 px (plan visual F4-4).
    hero: 'assets/images/institution/escena-portada.webp',
  }
} as const;

export const LOGIN_REMEMBER_EMAIL_KEY = 'siep_login_email';

export interface LoginPedagogyPillar {
  key: string;
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
