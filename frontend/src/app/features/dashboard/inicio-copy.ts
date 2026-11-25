/**
 * Textos de Inicio del estudiante (DISENO §4.1). Van aparte para que Psicología y quien redacta los revisen sin abrir
 * la plantilla. Hablan en segunda persona, sin cifras de rendimiento y sin empujar: Inicio dice qué sigue, no cuánto falta.
 */
export const INICIO_COPY = {
  eyebrow: 'Tu entrenamiento',
  /** Cuando no hay nombre de la sesión, el título no inventa uno. */
  tituloSinNombre: 'Tu entrenamiento',
  /** El bloque de arriba: la frase sale de `loSiguiente()` (`student-guidance.util.ts`), que sabe qué toca hacer. */
  siguiente: { titulo: 'Lo siguiente' },
  paso: {
    titulo: 'Tu siguiente paso',
    continuar: 'Continuar',
    ficha: 'Empezar',
    recorrido: 'Ver mi resultado',
    retomasSinEscena: 'Retomas donde lo dejaste.',
  },
  invitaciones: {
    uno: 'Tienes 1 invitación a un grupo',
    varias: (n: number) => `Tienes ${n} invitaciones a grupos`,
    ayuda: 'Acéptala para ver los casos que tu docente te asigne en ese grupo.',
    accion: 'Ver invitaciones',
  },
  casos: { titulo: 'Tus casos', verTodos: 'Ver todos tus casos' },
  cierres: { titulo: 'Tus cierres', accion: 'Ver mi resultado' },
  error: 'No pudimos cargar tus casos.',
  cargando: 'Cargando tus casos…',
} as const;
