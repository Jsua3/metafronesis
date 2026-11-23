/**
 * Textos de Inicio del estudiante (DISENO §4.1). Van aparte para que Psicología y quien redacta los revisen sin abrir
 * la plantilla. Hablan en segunda persona, sin cifras de rendimiento y sin empujar: Inicio dice qué sigue, no cuánto falta.
 */
export const INICIO_COPY = {
  eyebrow: 'Tu entrenamiento',
  /** Cuando no hay nombre de la sesión, el título no inventa uno. */
  tituloSinNombre: 'Tu entrenamiento',
  descripcion: {
    continuar: 'Tienes un caso en curso.',
    ficha: 'Tu siguiente caso está listo.',
    espera: 'Tu siguiente caso todavía no está abierto.',
    terminado: 'Terminaste los casos asignados.',
    vacio: 'Aún no tienes casos asignados.',
  },
  sinCasos: {
    titulo: 'Aún no tienes casos asignados',
    texto: 'Cuando tu docente te asigne un caso, aparecerá aquí. Si te invitaron a un grupo, acepta la invitación primero.',
  },
  paso: {
    titulo: 'Tu siguiente paso',
    continuar: 'Continuar',
    ficha: 'Ver ficha del caso',
    recorrido: 'Ver tu recorrido',
    retomasSinEscena: 'Retomas donde lo dejaste.',
  },
  invitaciones: {
    uno: 'Tienes 1 invitación a un grupo',
    varias: (n: number) => `Tienes ${n} invitaciones a grupos`,
    ayuda: 'Acéptala para ver los casos que tu docente te asigne en ese grupo.',
    accion: 'Ver invitaciones',
  },
  casos: { titulo: 'Tus casos', verTodos: 'Ver todos tus casos' },
  cierres: { titulo: 'Tus cierres', accion: 'Ver tu recorrido' },
  error: 'No pudimos cargar tus casos.',
  cargando: 'Cargando tus casos…',
} as const;
