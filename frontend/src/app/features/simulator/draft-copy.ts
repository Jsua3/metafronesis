/**
 * Textos en BORRADOR de la pantalla de juego (plan visual §9, decisiones marcadas «(Psicología)»: VD-19, VD-20, VD-23
 * y VD-24). Ninguno es texto validado: viven aquí, juntos, cada uno con su decisión, su responsable y dónde se usa,
 * para poder listarlos al usuario y cambiarlos en un solo sitio cuando Psicología fije la redacción definitiva.
 * Los textos YA validados (aviso de contenido, pausa, reintentos, opciones, ayuda…) no pasan por aquí: no se tocan.
 *
 * Cada borrador dice qué se espera de Psicología (`review`): `validar` (decide la redacción: tono, terminología) o
 * `conocimiento` (microtexto de funcionamiento que se les enseña, sin que lo decidan). La hoja de revisión que se les
 * entrega sale de esta lista.
 */
import { statusLabel } from '../../shared/ui/labels';

export type DraftReview = 'validar' | 'conocimiento';

export interface DraftCopyEntry {
  /**
   * Decisión del plan visual (§9) o regla de negocio que lo origina; `F6-n` / `F7-n` cuando el texto nace de una
   * tarea del plan y no de una decisión.
   */
  readonly decision: `VD-${number}` | `RN-${number}` | `ETH-${number}` | `F6-${number}` | `F7-${number}` | `F10-${number}` | `P6-${number}` | `DSL-${number}` | `R1-${number}`;
  /** Quién debe fijar la redacción definitiva. */
  readonly owner: 'Psicología';
  /** Qué se espera de Psicología; sin indicar, `validar`. */
  readonly review?: DraftReview;
  /** Dónde se usa (para revisarlo en su contexto). */
  readonly where: string;
  /** Título, si el texto lo lleva (un diálogo). */
  readonly title?: string;
  readonly text: string;
}

/** Nombre del ajuste: lo usan la fila de Ajustes y la nota de la ayuda (una sola palabra para los dos sitios). */
const SHORTCUTS_SETTING_LABEL = 'Atajos de una tecla';

export const DRAFT_COPY = {
  /**
   * Anuncio a lectores de pantalla cuando la persona cambia de estado tras una decisión (VD-23). Va en `polite`, una
   * sola vez por cambio y nunca al cargar; si cambian el vínculo y la activación, se dicen en una sola frase
   * (`personaChangeAnnouncement`). Sin cifras: dice cómo se muestra la persona, no cuánto.
   */
  personaChangeCalmer: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla: la activación de la persona baja',
    text: 'La persona se muestra más tranquila',
  },
  personaChangeTenser: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla: la activación de la persona sube',
    text: 'La persona se muestra más tensa',
  },
  personaChangeOpens: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla: el vínculo de la persona mejora',
    text: 'La persona se abre un poco más',
  },
  personaChangeCloses: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla: el vínculo de la persona empeora',
    text: 'La persona se cierra',
  },
  /**
   * Confirmación al pulsar «Iniciar nuevo intento» con uno abierto (F6-2, RN-07): dice qué se pierde. «Continuar»
   * (el intento abierto se conserva) es la acción por defecto.
   */
  newAttemptConsequence: {
    decision: 'RN-07',
    owner: 'Psicología',
    where: 'Tarjeta de reanudar: confirmación de «Iniciar nuevo intento»',
    title: '¿Empezar un intento nuevo?',
    text: 'El intento que tienes abierto se cerrará y no podrás retomarlo. Si prefieres seguir donde ibas, elige «Continuar».',
  },
  /**
   * Chip de la cabecera del panel de diálogo y subtítulo del grupo de decisiones (F6-4, VD-24). Antes decía «Decisión
   * clínica»: el vocabulario de la interfaz es educativo, no clínico.
   */
  decisionLabel: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Panel de diálogo: chip de la cabecera y subtítulo del grupo de decisiones',
    text: 'Decisión',
  },
  /** Nombre accesible de la barra de herramientas (F6-4, VD-24). Antes decía «Inventario clínico». */
  inventoryLabel: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Dock de herramientas: nombre accesible de la barra',
    text: 'Inventario',
  },
  /**
   * Lista «Ir a…» (F6-11, VD-19): título y ayuda. Llegar a personas y puertas sin mirar el lienzo ni usar el ratón.
   */
  placesDialog: {
    decision: 'VD-19',
    owner: 'Psicología',
    where: 'Lista «Ir a…»: título y ayuda',
    title: 'Ir a…',
    text: 'Elige a dónde quieres ir: caminarás hasta ahí y se te avisará al llegar.',
  },
  /** Cuando la sala no ofrece nada a lo que ir todavía (F6-11, VD-19): dice por qué en vez de quedar vacía. */
  placesEmpty: {
    decision: 'VD-19',
    owner: 'Psicología',
    where: 'Lista «Ir a…»: estado vacío',
    text: 'Todavía no hay nada a lo que ir: aquí aparecerán las personas y las puertas de la sala y lo que ya hayas examinado.',
  },
  /**
   * Persona clave de la sala (P6, tarea 4): la que el docente marca como «a quien atender». Lo dice la lista «Ir a…» junto
   * a su nombre y el rótulo sobre su cabeza se anuncia igual: el aviso no depende solo del color.
   */
  keyPerson: {
    decision: 'P6-4',
    owner: 'Psicología',
    where: 'Lista «Ir a…» de la sala: nota junto al nombre de la persona clave (lectores de pantalla)',
    text: 'persona a atender',
  },
  /** Anuncio al llegar al destino elegido en «Ir a…» (F6-11, VD-19): va seguido del nombre del lugar. */
  placesArrived: {
    decision: 'VD-19',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla al llegar con «Ir a…»',
    text: 'Llegaste a',
  },
  /** Anuncio cuando el camino hasta el destino de «Ir a…» no se pudo recorrer (F6-11, VD-19). */
  placesBlocked: {
    decision: 'VD-19',
    owner: 'Psicología',
    where: 'Anuncio a lectores de pantalla si «Ir a…» no pudo llegar',
    text: 'No se pudo llegar a',
  },
  /**
   * Nota de la pantalla de ayuda sobre los atajos de una tecla (F6-10, VD-18): FUERA del bloque validado de la ayuda,
   * que no cambia ni un byte. Dice que se pueden apagar y dónde.
   */
  shortcutsHelpNote: {
    decision: 'VD-18',
    owner: 'Psicología',
    where: 'Pantalla de ayuda: nota sobre los atajos de una tecla (fuera del bloque validado)',
    text: `Los atajos de una tecla (J, E, WASD y los números de las opciones) se pueden apagar en Ajustes, en «${SHORTCUTS_SETTING_LABEL}».`,
  },
  /** Cuando el navegador no deja registrar el consentimiento (F6-2, ETH-01): no se arranca nada y se puede reintentar. */
  consentStorageError: {
    decision: 'ETH-01',
    owner: 'Psicología',
    where: 'Aviso de contenido: error al registrar el consentimiento',
    text: 'No pudimos registrar tu consentimiento en este navegador. Revisa que no tenga bloqueado el almacenamiento e inténtalo de nuevo.',
  },
  /**
   * Cuando el servidor tiene una versión del aviso de contenido más nueva que la que el navegador mostró (S3-2b, ETH-01;
   * 409 `NOTICE_VERSION_STALE`): no se da por registrado el consentimiento a un aviso que la persona no leyó. Sale en el
   * mismo recuadro de error del aviso previo, con «Reintentar».
   */
  consentNoticeStale: {
    decision: 'ETH-01',
    owner: 'Psicología',
    where: 'Aviso de contenido: error al registrar el consentimiento cuando el aviso cambió de versión',
    text: 'Hay una versión nueva del aviso de contenido. Recarga la página para leerla y vuelve a intentarlo.',
  },

  // ── Microtextos de funcionamiento (revisión de F6): se enseñan a Psicología, no los decide ─────────────────────
  /** Lo anuncia el lector de pantalla mientras se guarda el consentimiento (F6-2). */
  consentSaving: {
    decision: 'ETH-01',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Aviso de contenido: anuncio del lector de pantalla mientras se guarda el consentimiento',
    text: 'Registrando tu consentimiento…',
  },
  /** Motivo por el que «Guardar» espera en la bitácora reflexiva: sin texto no hay nada que guardar (F6-5). */
  journalSaveReason: {
    decision: 'F6-5',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Bitácora reflexiva: motivo por el que «Guardar» espera',
    text: 'Escribe tu reflexión para guardar',
  },
  /** Nombre del ajuste que enciende o apaga J, E, WASD y los números (F6-10, WCAG 2.1.4). */
  shortcutsSettingLabel: {
    decision: 'VD-18',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ajustes del juego: nombre del ajuste que enciende o apaga J, E, WASD y los números',
    text: SHORTCUTS_SETTING_LABEL,
  },
  /** Nombre accesible del botón de la cabecera que abre la lista «Ir a…» (F6-11). */
  placesButtonLabel: {
    decision: 'VD-19',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Cabecera del juego: nombre accesible del botón que abre la lista «Ir a…»',
    text: 'Ir a… personas y puertas de la sala',
  },
  /**
   * Retroalimentación de una decisión sin clasificación conocida en la traza docente (F7-4, VD-24). Antes decía
   * «justificación clínica de la decisión»: el vocabulario de la interfaz es educativo, no clínico.
   */
  traceDecisionFallback: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Traza docente: texto de apoyo de una decisión sin clasificación',
    text: 'Revisar el contexto del escenario y la justificación de la decisión.',
  },
  /** Texto de apoyo de un paso adecuado del recorrido (F7-4, VD-24). Antes decía «recorrido clínico simulado». */
  traceAdequateStep: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Traza docente: línea de tiempo, paso adecuado',
    text: 'Paso adecuado dentro del recorrido simulado.',
  },
  /** Vacío del panel de decisiones de la traza docente (F7-4, VD-24). Antes decía «decisiones clínicas guardadas». */
  traceNoDecisions: {
    decision: 'VD-24',
    owner: 'Psicología',
    where: 'Traza docente: diálogo de retroalimentación sin decisiones registradas',
    text: 'Este intento aún no tiene decisiones guardadas.',
  },
  /**
   * Rótulo del total de la rúbrica en la traza docente (F7-4, RN-09, decisión 9 del plan): la evaluación es formativa
   * y no una nota oficial. Si el equipo decide otro rótulo, solo cambia este texto.
   */
  formativeValuationLabel: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: rúbrica, total de la evaluación',
    text: 'Valoración formativa',
  },
  /** Nombres de los cuatro niveles de la valoración formativa (F7-4, RN-09, ED-2): no son una nota. */
  levelEnInicio: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: nivel formativo de un criterio y de la evaluación',
    text: 'En inicio',
  },
  levelEnProceso: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: nivel formativo de un criterio y de la evaluación',
    text: 'En proceso',
  },
  levelLogrado: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: nivel formativo de un criterio y de la evaluación',
    text: 'Logrado',
  },
  levelDestacado: {
    decision: 'RN-09',
    owner: 'Psicología',
    where: 'Traza docente: nivel formativo de un criterio y de la evaluación',
    text: 'Destacado',
  },
  /**
   * Lo que el diálogo «Reemplazar intento» le dice al docente que pasa con el intento y su bitácora (F7b-7, E1-2, RN-07;
   * revisión de F7b). Hermana de `newAttemptConsequence`, que ve el estudiante: habla de la bitácora de la persona, así
   * que Psicología fija la redacción. El rótulo del estado es el mismo que ve la lista de intentos.
   */
  replaceAttemptConsequence: {
    decision: 'RN-07',
    owner: 'Psicología',
    where: 'Traza docente: diálogo «Reemplazar intento», consecuencia para el intento y su bitácora',
    text: `El intento se cerrará como «${statusLabel('REPLACED')}» y su bitácora quedará bloqueada; la próxima vez que la persona entre al caso empezará uno nuevo.`,
  },
  /** Ficha del caso sin objetivos ni personajes redactados todavía (F10-1): se puede comenzar igual. */
  briefPending: {
    decision: 'F10-1',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ficha del caso: cuando el caso aún no trae objetivos ni personajes',
    text: 'Tu docente aún no ha redactado los objetivos ni los personajes de este caso. Puedes comenzar de todas formas.',
  },
  /**
   * Junto al contador de «Ver pista» (F10-2, RF-18, decisión 13): pedir una pista no cuesta puntaje. Corta a propósito: va
   * en la misma línea que el botón, porque en un celular cada renglón que se le suma al panel empuja las opciones.
   */
  hintNoCostNote: {
    decision: 'F10-2',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Pistas de la escena: junto al contador de «Ver pista»',
    text: 'sin costo',
  },
  /** Título de la sección «Tus decisiones» del resultado (F10-4, RN-08): la retroalimentación pedagógica va al cierre. */
  decisionsTitle: {
    decision: 'RN-08',
    owner: 'Psicología',
    where: 'Resultado: título de la sección «Tus decisiones» (una entrada por decisión)',
    text: 'Tus decisiones',
  },
  /** Sección «Tus decisiones» sin decisiones que mostrar (F10-4): el estado vacío dice por qué. */
  decisionsEmpty: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: «Tus decisiones» cuando el intento no tiene decisiones registradas',
    text: 'Este intento no tiene decisiones registradas para revisar.',
  },
  /** Descripción del estado vacío de «Tus decisiones» (F10-4): dice qué verá la persona cuando haya decisiones. */
  decisionsEmptyHint: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: descripción bajo el estado vacío de «Tus decisiones»',
    text: 'Cuando el caso registre decisiones, aparecerán aquí con su explicación.',
  },
  /** Error al cargar «Tus decisiones» (F10-4): el resto del resultado sigue visible y el botón reintenta. */
  decisionsError: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: «Tus decisiones» cuando no se puede cargar el reporte',
    text: 'No pudimos cargar tus decisiones. Puedes intentarlo de nuevo.',
  },
  /** Una decisión sin explicación en el caso (F10-4, estado vacío por decisión): no inventa un texto. */
  decisionNoExplanation: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: decisión de «Tus decisiones» sin explicación pedagógica',
    text: 'El caso no trae una explicación para esta decisión.',
  },
  /** Rótulo del fundamento teórico de una decisión (F10-4). */
  decisionBasisLabel: {
    decision: 'F10-4',
    owner: 'Psicología',
    where: 'Resultado: fundamento teórico de cada decisión',
    text: 'Fundamento teórico',
  },
  /** Clase de una decisión al cierre, en palabras (modelo de métricas): nunca una cifra. */
  responseClassRecommended: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: etiqueta de una decisión de clase Recomendada',
    text: 'Recomendada',
  },
  /** Clase Aceptable. */
  responseClassAcceptable: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: etiqueta de una decisión de clase Aceptable',
    text: 'Aceptable',
  },
  /** Clase Con riesgo. */
  responseClassRisky: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: etiqueta de una decisión de clase Con riesgo',
    text: 'Con riesgo',
  },
  /** Clase Contraindicada. */
  responseClassContraindicated: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: etiqueta de una decisión de clase Contraindicada',
    text: 'Contraindicada',
  },
  /** Marca en palabras de un hito decisivo (nunca un número). */
  milestoneKeyMark: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: marca de un hito que decide el final',
    text: 'clave',
  },
  /** Título de los hitos cumplidos. */
  milestonesDoneTitle: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: título de los hitos cumplidos',
    text: 'Lo que hiciste',
  },
  /** Título de los hitos que faltaron. */
  milestonesMissingTitle: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: título de los hitos que faltaron',
    text: 'Lo que faltó',
  },
  /** Estado vacío de los hitos cumplidos. */
  milestonesNoneDone: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: sin ningún hito cumplido',
    text: 'En este recorrido no se cumplió ningún hito.',
  },
  /** Estado vacío de los hitos que faltaron. */
  milestonesNoneMissing: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: sin hitos pendientes',
    text: 'No faltó ningún hito.',
  },
  /** Título de la lista de razones del final. */
  endingReasonTitle: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: título de las razones del final',
    text: 'Cómo llegaste aquí',
  },
  /** Prefijo de la frase sobre la persona al cerrar; el estado lo trae el servidor. */
  endingPersonaPrefix: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: frase de la persona usuaria al cerrar (precede a su estado en palabras)',
    text: 'La persona usuaria',
  },
  /** Título de las competencias con su nivel en palabras. */
  competenciesTitle: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: título de las competencias en palabras',
    text: 'Tus competencias, en palabras',
  },
  /** Nivel de una competencia que ninguna decisión tocó. */
  competencyNoEvidence: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: competencia sin decisiones que la sustenten',
    text: 'Sin evidencia',
  },
  /** Encabezado de la lista de evidencia. */
  competencyEvidenceLead: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: encabezado de las decisiones que sustentan una competencia',
    text: 'Decisiones que lo sustentan',
  },
  /** Autoevaluación breve. */
  selfAssessTitle: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: título de la autoevaluación breve (antes de la revisión)',
    text: 'Antes de revisar tus decisiones',
  },
  /** Pregunta 1. */
  selfAssessGood: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: primera pregunta de la autoevaluación',
    text: '¿Qué salió bien?',
  },
  /** Pregunta 2. */
  selfAssessChange: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: segunda pregunta de la autoevaluación',
    text: '¿Qué cambiarías?',
  },
  /** Aviso de privacidad de la autoevaluación (local, sin persistir). */
  selfAssessLocalNote: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: aviso de que la autoevaluación no se envía',
    text: 'Lo que escribas se queda solo en este dispositivo: no se envía ni se guarda.',
  },
  /** Botón de listo. */
  selfAssessDone: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: botón que cierra la autoevaluación',
    text: 'Listo',
  },
  /** Botón de omitir. */
  selfAssessSkip: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: botón que omite la autoevaluación',
    text: 'Omitir por ahora',
  },
  /** Línea de la autoevaluación ya recogida. */
  selfAssessCollapsed: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: autoevaluación recogida',
    text: 'No se guardó nada: lo que escribiste solo vive en esta pantalla.',
  },
  /** Botón de editar. */
  selfAssessEdit: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Cierre: botón para volver a abrir la autoevaluación',
    text: 'Editar mis notas',
  },
  /** Tarjeta del panel con los últimos casos completados. */
  closingsTitle: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Panel del estudiante: título de los últimos cierres',
    text: 'Tus últimos cierres',
  },
  /** Subtítulo. */
  closingsSub: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Panel del estudiante: subtítulo de los últimos cierres',
    text: 'Los últimos casos que completaste',
  },
  /** Estado vacío. */
  closingsEmpty: {
    decision: 'VD-23',
    owner: 'Psicología',
    where: 'Panel del estudiante: sin cierres todavía',
    text: 'Aún sin cierres: aparecerán cuando completes un caso.',
  },
  /** Pista de la franja de la reacción: Enter o Espacio la saltan. */
  reactionSkipHint: {
    decision: 'DSL-1',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Franja de la reacción del personaje tras elegir',
    text: 'Enter para continuar',
  },
  /** La ficha del objetivo de la escena (4.2): su rótulo, el texto de respaldo, la lista de la sala y las marcas en palabras. */
  goalCardTitle: {
    decision: 'DSL-2',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ficha del objetivo: rótulo sobre el objetivo de la escena',
    text: 'Objetivo de la escena',
  },
  goalCardFallback: {
    decision: 'DSL-2',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ficha del objetivo: cuando la escena no trae objetivo',
    text: 'Explora la sala y conversa con las personas.',
  },
  roomListTitle: {
    decision: 'DSL-2',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ficha del objetivo abierta: título de la lista de lo que hay en la sala',
    text: 'En esta sala',
  },
  roomMarkTalked: {
    decision: 'DSL-2',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ficha del objetivo: marca de una persona con la que ya se habló',
    text: 'ya hablaste',
  },
  roomMarkReviewed: {
    decision: 'DSL-2',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ficha del objetivo: marca de un objeto ya revisado',
    text: 'ya revisaste',
  },
  roomMarkNotYet: {
    decision: 'DSL-2',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ficha del objetivo: marca de lo que aún no se ha visto',
    text: 'aún no',
  },
  hintAskLabel: {
    decision: 'DSL-2',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ficha del objetivo: botón que pide una pista',
    text: 'Pedir una pista',
  },
  /** Los dos avisos de exploración (4.3) y la ayuda que ya no nombra la lista «Qué hacer» ni el caso. */
  noticeMoreToKnow: {
    decision: 'DSL-3',
    owner: 'Psicología',
    review: 'validar',
    where: 'Conversación con decisiones: aviso único cuando aún queda algo por conocer en la sala',
    text: 'Puedes conocer más antes de responder.',
  },
  noticeNewOption: {
    decision: 'DSL-3',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso breve (anunciado) cuando explorar abre otra forma de responder',
    text: 'Ahora conoces algo más: hay otra forma de responder.',
  },
  helpFirstCardGoal: {
    decision: 'DSL-3',
    owner: 'Psicología',
    review: 'validar',
    where: 'Tarjeta de primera vez de la ayuda: dónde está el objetivo de la escena',
    text: 'Arriba está el objetivo de la escena: ábrelo para ver qué hay en la sala o pedir una pista.',
  },
  helpGoalSection: {
    decision: 'DSL-3',
    owner: 'Psicología',
    review: 'validar',
    where: 'Pantalla de ayuda, sección «Qué hacer»: dónde está la ficha del objetivo y qué ofrece',
    text: 'La ficha del objetivo, arriba a la izquierda, te recuerda qué buscar en esta sala y quién o qué ya conoces. Ábrela cuando quieras; ahí también puedes pedir una pista.',
  },
  helpCaseSection: {
    decision: 'DSL-3',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ayuda, sección «El caso»: cómo se juega una escena',
    text: 'En cada escena exploras la sala, conversas con las personas y, cuando lo decidas, respondes. Lo que descubres puede abrir otras formas de responder.',
  },
  /** Chip al que se pliega el aviso de contenido sensible a los 8 s; sigue siempre a la vista y lo despliega de nuevo. */
  sensitiveChip: {
    decision: 'DSL-4',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso de contenido sensible bajo la cabecera: chip en el que se pliega y que lo vuelve a desplegar',
    text: 'Contenido sensible',
  },
  introCase: {
    decision: 'DSL-5',
    owner: 'Psicología',
    review: 'validar',
    where: 'Tarjeta «Antes de comenzar»: nombre del caso',
    text: 'Caso: {caso}',
  },
  introScene: {
    decision: 'DSL-5',
    owner: 'Psicología',
    review: 'validar',
    where: 'Tarjeta «Antes de comenzar»: nombre de la escena',
    text: 'Escena: {escena}',
  },
  introRoom: {
    decision: 'DSL-5',
    owner: 'Psicología',
    review: 'validar',
    where: 'Tarjeta «Antes de comenzar»: sala donde empieza el estudiante',
    text: 'Empiezas en: {sala}',
  },
  introBriefNote: {
    decision: 'DSL-5',
    owner: 'Psicología',
    review: 'validar',
    where: 'Tarjeta «Antes de comenzar»: dónde se lee el contexto del caso',
    text: 'El contexto del caso está en su ficha.',
  },
  introDone: {
    decision: 'DSL-5',
    owner: 'Psicología',
    review: 'validar',
    where: 'Anuncio al continuar desde la tarjeta «Antes de comenzar»',
    text: 'Introducción completada. Comienza la escena.',
  },
  missedTitle: {
    decision: 'DSL-6',
    owner: 'Psicología',
    review: 'validar',
    where: 'Resultado, en cada decisión: título del bloque de respuestas que no llegó a ver',
    text: 'Respuestas que no llegaste a ver',
  },
  missedLead: {
    decision: 'DSL-6',
    owner: 'Psicología',
    review: 'validar',
    where: 'Resultado, en cada decisión: frase que introduce las respuestas no vistas',
    text: 'Aparecían si conocías algo más de la sala.',
  },
  missedNeeded: {
    decision: 'DSL-6',
    owner: 'Psicología',
    review: 'validar',
    where: 'Resultado, en cada respuesta no vista: rótulo de lo que faltó explorar',
    text: 'Te faltó:',
  },
  missedNoFacts: {
    decision: 'DSL-6',
    owner: 'Psicología',
    review: 'validar',
    where: 'Resultado, en una respuesta no vista sin hechos de exploración: explicación',
    text: 'Dependía de cómo iba el caso hasta ese momento.',
  },
  noStepNow: {
    decision: 'DSL-7',
    owner: 'Psicología',
    review: 'validar',
    where: 'Conversación sin opciones de decisión en esta escena: línea final',
    text: 'Por ahora no hay nada que decidir en esta conversación.',
  },
  unknownPerson: {
    decision: 'DSL-8',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Puerta bloqueada: persona que pide la puerta y que no se halla en el mundo ni en el escenario',
    text: 'alguien de la sala',
  },
  unknownThing: {
    decision: 'DSL-8',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Puerta bloqueada: objeto o herramienta que pide la puerta y que no se halla en el mundo',
    text: 'algo de la sala',
  },
  doorFallback: {
    decision: 'DSL-8',
    owner: 'Psicología',
    review: 'validar',
    where: 'Puerta bloqueada cuando el servidor no dice qué falta (reemplaza al respaldo que nombraba «Qué hacer»)',
    text: 'Antes de pasar, explora un poco más la sala.',
  },
  commentBubbleLabel: {
    decision: 'DSL-9',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Burbuja de comentario de un personaje: nombre accesible de su región',
    text: 'Comentario de {nombre}',
  },
  rehearsalBanner: {
    decision: 'DSL-10',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ensayo del borrador: franja bajo la cabecera del juego',
    text: 'Ensayo del borrador: nada de esto cuenta para estudiantes ni informes.',
  },
  rehearsalGone: {
    decision: 'DSL-10',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ensayo: aviso cuando el servidor descartó el ensayo',
    text: 'Este ensayo ya no existe: el caso cambió mientras ensayabas.',
  },
  rehearsalRestart: {
    decision: 'DSL-10',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ensayo: botón del aviso de ensayo perdido y del final del ensayo',
    text: 'Empezar de nuevo',
  },
  rehearsalBackToEditor: {
    decision: 'DSL-10',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ensayo: enlace del final y de la pausa del ensayo',
    text: 'Volver al editor',
  },
  rehearsalPanelTitle: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora del ensayo: título y botón de plegar',
    text: 'Panel de autora',
  },
  rehearsalScene: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: selector de escena',
    text: 'Escena',
  },
  rehearsalGoTo: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: botón que mueve el ensayo a la escena elegida',
    text: 'Ir a esta escena',
  },
  rehearsalExplored: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: casillas de personas y objetos de la sala',
    text: 'Lo explorado en esta sala',
  },
  rehearsalTools: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: casillas de herramientas (tiene y usó)',
    text: 'Herramientas',
  },
  rehearsalPersona: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: estado de la persona consultante',
    text: 'Persona',
  },
  rehearsalBond: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: selector del vínculo',
    text: 'Vínculo',
  },
  rehearsalActivation: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: selector de la activación',
    text: 'Activación',
  },
  rehearsalMilestones: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: casillas de hitos',
    text: 'Hitos',
  },
  rehearsalWhyHidden: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: respuestas que el estudiante no vería',
    text: 'Por qué no aparece',
  },
  rehearsalHeldByCondition: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: respuesta retenida por la condición',
    text: 'La retiene otra parte de la condición: un hito, un conteo o el estado de la persona.',
  },
  rehearsalBroken: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: respuesta con el requisito ilegible',
    text: 'El requisito guardado está roto: revísalo en el guion.',
  },
  rehearsalComments: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: comentarios de los personajes',
    text: 'Lo que dicen al acercarte',
  },
  rehearsalCommentDue: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: estado de un comentario que se diría ahora',
    text: 'Se dirá al acercarte.',
  },
  rehearsalWarnings: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: lo que el estudiante vería roto',
    text: 'Avisos del borrador',
  },
  rehearsalReload: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: relee el borrador',
    text: 'Recargar borrador',
  },
  rehearsalBackToScript: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: enlace al editor en la escena actual',
    text: 'Volver al guion de esta escena',
  },
  rehearsalBondWithdrawn: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: vínculo retraído',
    text: 'Retraída',
  },
  rehearsalBondGuarded: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: vínculo cauteloso',
    text: 'Cautelosa',
  },
  rehearsalBondOpen: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: vínculo abierto',
    text: 'Abierta',
  },
  rehearsalActivationCalm: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: activación serena',
    text: 'Serena',
  },
  rehearsalActivationTense: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: activación tensa',
    text: 'Tensa',
  },
  rehearsalActivationCrisis: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Panel de autora: activación en crisis',
    text: 'En crisis',
  },
  rehearsalMissing: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: respuesta retenida por exploración: antecede a lo que falta',
    text: 'Le falta:',
  },
  rehearsalCommentWaiting: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: comentario retenido por su condición: antecede a lo que falta',
    text: 'Todavía no: le falta',
  },
  rehearsalCommentBroken: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: comentario con la condición ilegible',
    text: 'Su condición está mal escrita: revísala en el guion.',
  },
  rehearsalCommentAbsent: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: comentario cuyo personaje no está en la sala',
    text: 'Su personaje no está visible en esta sala.',
  },
  rehearsalPath: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: escenas por las que pasó el ensayo',
    text: 'Camino recorrido',
  },
  rehearsalNoHidden: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: sin respuestas retenidas',
    text: 'Todas las respuestas se ofrecen.',
  },
  rehearsalNoComments: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: sin comentarios',
    text: 'Esta escena no tiene comentarios.',
  },
  rehearsalNoWarnings: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: sin avisos',
    text: 'Sin avisos.',
  },
  rehearsalShow: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: nombre del botón con el panel plegado',
    text: 'Mostrar el panel de autora',
  },
  rehearsalHide: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: nombre del botón con el panel abierto',
    text: 'Ocultar el panel de autora',
  },
  rehearsalAdjustFailed: {
    decision: 'DSL-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: error sin mensaje del servidor',
    text: 'No pudimos ajustar el ensayo. Inténtalo de nuevo.',
  },
  rehearsalOpenFailed: {
    decision: 'DSL-10',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ensayo: error al abrir el ensayo (con «Reintentar»)',
    text: 'No pudimos abrir el ensayo.',
  },
  rehearsalReloadFailed: {
    decision: 'DSL-10',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ensayo: error al releer el juego tras un ajuste del panel',
    text: 'No pudimos recargar el ensayo.',
  },
  rehearsalClosed: {
    decision: 'DSL-10',
    owner: 'Psicología',
    review: 'validar',
    where: 'Ensayo: aviso cuando el servidor dice que el ensayo ya se cerró (409)',
    text: 'Este ensayo ya terminó: empieza otro para seguir probando.',
  },
  rehearsalAdjusted: {
    decision: 'DSL-10',
    owner: 'Psicología',
    review: 'validar',
    where: 'Panel de autora: anuncio de un ajuste aceptado',
    text: 'Ensayo actualizado.',
  },
  /** Nota de una conducta prohibida en «Tus decisiones»: se señala con cuidado, sin cifras (RN-08, ETH). */
  decisionProhibitedNote: {
    decision: 'RN-08',
    owner: 'Psicología',
    where: 'Resultado: nota de una conducta prohibida en «Tus decisiones»',
    text: 'Alerta ética: esta respuesta puede aumentar el riesgo de revictimización.',
  },
  /** Robustez del cliente (R1): avisos cuando una acción no responde o la posición no se guarda. Sin contenido clínico. */
  actionSlow: {
    decision: 'R1-1',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso de error: una acción del juego (interacción, herramienta, puerta, conversación, pausa) no respondió a tiempo',
    text: 'La respuesta está tardando. Inténtalo de nuevo.',
  },
  decisionSlow: {
    decision: 'R1-2',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso de error: el registro de una decisión no respondió a tiempo',
    text: 'La respuesta está tardando. Vuelve a elegir la misma opción para confirmarla.',
  },
  decisionConfirming: {
    decision: 'R1-3',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso: queda una decisión sin confirmar (al elegir otra opción, al recargar o si no se pudo consultar el estado)',
    text: 'Aún estamos confirmando tu decisión anterior. Vuelve a elegirla para continuar.',
  },
  positionNotSaved: {
    decision: 'R1-4',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso de error: el guardado automático de la posición falló tras varios reintentos',
    text: 'No pudimos guardar tu posición. Revisa tu conexión: si recargas, podrías volver unos pasos atrás.',
  },
  positionNotSyncedForAction: {
    decision: 'R1-5',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso de error: una acción que pide estar cerca no pudo guardar antes la ubicación',
    text: 'No pudimos guardar tu ubicación. Revisa tu conexión y vuelve a intentarlo.',
  },
  pauseNotRegistered: {
    decision: 'R1-6',
    owner: 'Psicología',
    review: 'validar',
    where: 'Pantalla de pausa: la salida segura ya sacó a la persona del caso pero el servidor aún no registra la pausa (sin conexión)',
    text: 'Saliste del caso. Registraremos la pausa cuando vuelva la conexión.',
  },
  pauseResumeOffline: {
    decision: 'R1-7',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso de error: «Reanudar» con la pausa aún sin registrar y sin conexión',
    text: 'Todavía no hay conexión. Reanudaremos tu intento en cuanto vuelva.',
  },
  choiceNotSaved: {
    decision: 'R1-8',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso al reanudar: la última elección se envió justo antes de la salida segura y no alcanzó a guardarse',
    text: 'Tu última elección no alcanzó a guardarse. Puedes volver a elegirla.',
  },
  decisionResentOnline: {
    decision: 'R1-9',
    owner: 'Psicología',
    review: 'validar',
    where: 'Aviso breve: una elección que no salió por falta de conexión se envió sola al volver la red',
    text: 'Volvió la conexión: enviamos tu elección.',
  },
  pausePermanentFail: {
    decision: 'R1-10',
    owner: 'Psicología',
    review: 'validar',
    where: 'Pantalla de pausa: el servidor rechaza la pausa de forma permanente y se dejó de reintentar',
    text: 'No pudimos registrar tu pausa en el servidor. Tu avance sigue guardado: puedes volver al catálogo y retomar el caso más tarde.',
  },
  retryNotice: {
    decision: 'R1-11',
    owner: 'Psicología',
    review: 'validar',
    where: 'Tras una respuesta que concede otra oportunidad: aviso neutro de que el caso sigue en el mismo punto (RN-08, sin clasificar)',
    // V4: antes decía «No se avanzó el caso ni se aplicaron cambios acumulados…»: lenguaje del sistema que no se entiende.
    text: 'El caso sigue en el mismo punto. Si quieres, revisa la escena; luego vuelve a hablar con la persona para responder otra vez.',
  },
  // ── Rediseño 2026-11-21 (B4b): la ficha prepara y el umbral hace entrar (DISENO §4.3 y §4.4) ─────────────────
  /** El contrato de ficción y el método de evaluación (prebriefing INACSL): qué es esto y qué pasa con lo que decide. */
  briefFictionContract: {
    decision: 'F10-1',
    owner: 'Psicología',
    where: 'Ficha del caso: «Cómo funciona esta práctica»',
    text: 'Es una simulación con personas y datos ficticios: algunas cosas no serán del todo realistas. Tus decisiones quedan registradas para tu docente, que es quien ve tu bitácora y tu recorrido.',
  },
  /** Solo si el caso se valora con rúbrica (BK-1 `conRubrica`): formativa y sin puntaje. */
  briefFictionRubric: {
    decision: 'F10-1',
    owner: 'Psicología',
    where: 'Ficha del caso: «Cómo funciona esta práctica», cuando hay rúbrica',
    text: 'Tu docente puede valorar tu recorrido con una rúbrica de forma formativa: no hay puntaje.',
  },
  /** El caso suena (idea de Kimi-b): se dice antes de entrar, porque el umbral ya trae el botón de música. */
  briefSound: {
    decision: 'F10-1',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ficha del caso: «Cómo se juega», el sonido',
    text: 'El caso tiene música y sonidos. Puedes silenciarlos antes de entrar y en cualquier momento.',
  },
  /** El recurso de apoyo que falta (pregunta abierta a Psicología): sin inventar números de contacto. */
  supportResourcesPending: {
    decision: 'F10-1',
    owner: 'Psicología',
    where: 'Ficha del caso: «Tu seguridad», qué hacer si el caso pesa',
    text: 'Si algo del caso te pesa, pausa y habla con tu docente. Los recursos de apoyo de la universidad se agregarán aquí.',
  },
  /** La frase al lado de «Comenzar»: dice qué significa pulsarlo (ETH-01, activación explícita). */
  briefConsentLine: {
    decision: 'ETH-01',
    owner: 'Psicología',
    where: 'Ficha del caso: junto a «Comenzar» o «Continuar», mientras no haya consentimiento',
    text: 'Al pulsar {boton} confirmas que leíste el aviso de contenido.',
  },
  /** El registro del consentimiento falló en la ficha: no se entra y se puede reintentar. */
  briefConsentError: {
    decision: 'ETH-01',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ficha del caso: error al registrar el consentimiento',
    text: 'No pudimos registrar que leíste el aviso. Revisa tu conexión e inténtalo de nuevo.',
  },
  /** 409 `NOTICE_VERSION_STALE` en la ficha: el aviso que se leyó ya no es el vigente. */
  briefConsentStale: {
    decision: 'ETH-01',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Ficha del caso: el aviso cambió de versión mientras se leía',
    text: 'El aviso cambió. Recarga la página para leer la versión nueva.',
  },
  /** La línea de cuidado fija del umbral: nombra la salida mientras carga (REGLA-004). */
  umbralCareLine: {
    decision: 'F6-1',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Umbral del juego: línea fija bajo el título',
    text: 'Puedes pausar con Salida segura (Esc) en cualquier momento.',
  },
  /** El umbral tarda más de 10 s: lo que está en curso sigue y la persona decide (sin «Reintentar» a ciegas). */
  umbralSlow: {
    decision: 'F6-1',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Umbral del juego: la carga pasa de 10 s',
    text: 'Está tardando más de lo normal. Puedes seguir esperando o volver a la ficha.',
  },
  /** El umbral está listo: lo que se anuncia una vez a los lectores de pantalla. */
  umbralReady: {
    decision: 'F6-1',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Umbral del juego: anuncio al terminar de cargar',
    text: 'Listo. Pulsa Continuar para entrar.',
  },
  /**
   * El intento abierto cambió entre la decisión y el envío (otra pestaña empezó de nuevo o lo continuó): no se reemplaza
   * nada y se vuelve a preguntar con lo que hay ahora (pasada final, hallazgo crítico de Codex).
   */
  intentoCambio: {
    decision: 'VD-23',
    owner: 'Psicología',
    review: 'conocimiento',
    where: 'Juego: el intento abierto cambió en otra pestaña antes de empezar de nuevo',
    text: 'Tu intento cambió en otra pestaña. No reemplazamos nada: elige de nuevo qué hacer.',
  },
} as const satisfies Record<string, DraftCopyEntry>;

export type DraftCopyKey = keyof typeof DRAFT_COPY;

/** Todos los borradores con su clave y qué se espera de Psicología: lo que hay que llevarles. */
export function draftCopyList(): Array<DraftCopyEntry & { key: DraftCopyKey; review: DraftReview }> {
  return (Object.keys(DRAFT_COPY) as DraftCopyKey[]).map(key => ({ key, review: 'validar' as DraftReview, ...DRAFT_COPY[key] }));
}

/**
 * El texto VALIDADO del aviso de contenido de la versión `CONTENT_NOTICE_VERSION` (ETH-01). Vive en una sola constante
 * porque se lee en dos sitios: la ficha (antes del contexto) y la red de seguridad del juego («Antes de entrar al caso»).
 * Si cambia, cambia la versión del aviso y todas las personas vuelven a aceptarlo. No es borrador: no va en `DRAFT_COPY`.
 */
export const CONTENT_NOTICE_TEXT = {
  contenido: 'Este caso presenta una situación ficticia de violencia basada en género y crisis familiar. Algunas escenas incluyen relatos y decisiones emocionalmente exigentes.',
  salida: 'Podrás pausar el caso en cualquier momento con el botón «Salida segura» (con teclado, también Esc). Tu avance se guarda y puedes retomarlo. Si prefieres no continuar ahora, vuelve al catálogo y retoma el caso cuando lo decidas.',
} as const;
