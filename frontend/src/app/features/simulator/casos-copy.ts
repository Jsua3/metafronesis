/**
 * Textos de la biblioteca de casos del estudiante (DISENO §4.2). Todo en segunda persona; el texto largo y el lenguaje
 * legal del caso viven en la ficha, no aquí.
 */
export const CASOS_COPY = {
  eyebrow: 'Tu entrenamiento',
  titulo: 'Tus casos',
  filtroEtiqueta: 'Estado del caso',
  filtros: { todos: 'Todos', sin: 'Sin empezar', curso: 'En curso', terminados: 'Terminados' },
  /** La acción principal de cada tarjeta: «Empezar» (lleva a la ficha, donde se confirma), «Continuar» o «Ver mi resultado». */
  acciones: { empezar: 'Empezar', ficha: 'Ver ficha', continuar: 'Continuar', recorrido: 'Ver mi resultado', editor: 'Editor visual' },
  intentos: {
    resumen: (n: number) => `Tus intentos (${n})`,
    tabla: 'Tus intentos de este caso',
    reemplazado: 'Reemplazado',
    reemplazadoAyuda: 'Empezaste uno nuevo y este quedó cerrado',
  },
  // El vacío del estudiante lo escribe `guiaSinCasos` (según su grupo); este texto es solo el de reserva.
  sinCasosEstudiante: { titulo: 'Aún no tienes casos asignados', texto: 'Los casos los asigna tu docente a tu grupo. Si ya debería haber uno, avísale.' },
  sinCasosOtros: { titulo: 'Aún no hay casos publicados', texto: 'Cuando se publique un caso, aparecerá aquí.' },
  sinResultados: { titulo: 'Ningún caso en este estado', texto: 'Prueba con otro estado o vuelve a ver todos.' },
  errorCasos: 'No pudimos cargar los casos.',
  errorHistorial: 'No pudimos cargar tu historial de intentos.',
  historialSinComprobar: 'No pudimos comprobar tus intentos. Reintenta cargar el historial.',
  cargando: 'Cargando los casos…',
} as const;
