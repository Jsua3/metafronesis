/**
 * Textos de la página de cierre del caso (DISENO §4.5). Todo en segunda persona, sin cifras ni tiempos (P6). El texto
 * clínico que ya tiene dueño (la clase de una respuesta, los hitos) se lee de `DRAFT_COPY` y no se reescribe aquí; este
 * archivo solo pone los rótulos propios de la página. El reporte congelado aún no trae recursos de apoyo propios: por
 * eso el apoyo dice «tu docente» hasta que Psicología valide los de la universidad (F10-1, `DRAFT_COPY.supportResourcesPending`).
 */
export const CIERRE_COPY = {
  eyebrow: 'Cierre del caso',
  volver: 'Tus casos',
  tituloSinCargar: 'Tu recorrido por el caso',
  terminado: (fecha: string) => `Terminaste el ${fecha}.`,
  terminadoSinFecha: 'Terminaste este caso.',
  salidaSegura: (fecha: string) => `Saliste con Salida segura el ${fecha}. Tu avance está guardado.`,
  salidaSeguraSinFecha: 'Saliste con Salida segura. Tu avance está guardado.',

  // Apoyo: va primero y sin alarma; es el estándar ante un malestar inesperado.
  apoyoTitulo: 'Si algo te pesó',
  apoyoTexto: (recurso: string) => `Si algo de este caso te removió, puedes hablar con ${recurso}.`,
  apoyoRecursoPorDefecto: 'tu docente',

  objetivosTitulo: '¿Qué buscaba el caso?',
  objetivosError: 'No pudimos cargar lo que buscaba el caso.',

  recorridoTitulo: '¿Cómo fue tu recorrido?',
  finalTitulo: 'El final',
  personaTitulo: 'Tu consultante al cerrar',
  logrosTitulo: 'Lo que lograste',
  pendientesTitulo: 'Lo que quedó pendiente',
  decisionesTitulo: 'Tus decisiones, con su fundamento',
  decisionesAyuda: 'Cada decisión se explica aquí, no mientras decidías. Léela a tu ritmo.',
  elegiste: 'Elegiste:',
  competenciasTitulo: 'Tus competencias, en palabras',
  recorridoError: 'No pudimos cargar tu recorrido.',

  retroTitulo: 'Tu retroalimentación docente',
  retroError: 'No pudimos cargar la retroalimentación de tu docente.',

  siguienteTitulo: '¿Qué sigue?',
  siguienteSinRecomendaciones: 'Puedes volver a tus casos cuando quieras.',
  volverInicio: 'Volver al inicio',
  intentarDeNuevo: 'Intentar el caso de nuevo',

  /** Un intento que no es tuyo no muestra datos: solo explica y devuelve a tus casos. */
  sinPermiso: 'Este recorrido no es tuyo, así que no podemos mostrarlo.',
  noEncontrado: 'No encontramos este recorrido: puede que el enlace esté mal.',
  volverCasos: 'Volver a tus casos',
} as const;
