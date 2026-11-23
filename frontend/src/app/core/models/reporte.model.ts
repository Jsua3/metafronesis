import type { ClassCounts } from './revision.model';

export interface ReporteGrupo {
  grupoId: number;
  caseVersionId: number | null;
  simulacion: ReporteSimulacionGrupo | null;
}

export interface ReporteSimulacionGrupo {
  totalIntentos: number;
  intentosCompletados: number;
  intentosEnProgreso: number;
  /** Intentos pausados (reanudables). */
  intentosEnPausa?: number;
  intentosSalidaSegura: number;
  /** Cobertura por hito del caso: sin puntaje ni promedio (modelo de métricas). */
  hitos: HitoCobertura[];
  bitacorasRegistradas: number;
  rubricasAplicadas: number;
  estudiantes: EstudianteSimulacionReporte[];
}

/** Cuántos del grupo cumplieron un hito, por categorías (celda mínima: `max(5, MIN_CELL_SIZE)`). */
export type CoberturaCategoria = 'MAYORIA' | 'MENOS_DE_LA_MITAD';

/**
 * Un hito declarado por el caso y su cobertura en el grupo. `cobertura` es nulo si la celda mínima lo suprime;
 * `porcentaje` solo viaja con 20 estudiantes distintos o más (0–100, entero: lo redondea el servidor).
 */
export interface HitoCobertura {
  key: string;
  label: string;
  decisive: boolean;
  cobertura: CoberturaCategoria | null;
  porcentaje?: number;
}

/** Cuántas respuestas hubo de cada clase: hechos, no una medida de nadie. El código nuevo usa `ClassCounts`. */
export type ClasesCount = ClassCounts;

export interface EstudianteSimulacionReporte {
  id: number;
  nombre: string;
  totalIntentos: number;
  intentosCompletados: number;
  intentosEnProgreso: number;
  /** Intentos pausados (reanudables). */
  intentosEnPausa?: number;
  intentosSalidaSegura: number;
  /** Claves de los hitos que cumplió en su último intento completado; nulo si ese intento no trae hitos (reporte v3). */
  hitosCumplidos: string[] | null;
  clases: ClasesCount;
  bitacorasRegistradas: number;
  rubricasAplicadas: number;
  estado: string;
}

export interface Dashboard {
  estudiantesActivos: number;
  simulacionesCompletadasHoy: number;
  simulacionesCompletadas: number;
  simulacionesEnProgreso: number;
  /** Cuántas respuestas hubo de cada clase: hechos, no una medida. */
  decisiones: ClasesCount;
  ultimosIntentos: SimulacionResumen[];
  intentosRecientes: IntentoReciente[];
}

export interface SimulacionResumen {
  id: string;
  casoTitulo: string;
  estudiante: string;
  estado: string;
}

export interface IntentoReciente {
  id: string;
  casoTitulo: string;
  estudiante: string;
  estado: string;
}

// ─── Reporte de un estudiante (F10-7†: C3, E1-10) ─────────────────────────────────────────────────────────

/** Un intento del estudiante para su docente: `ordinal` es su n.º de intento en el CASO (todas las versiones). */
export interface IntentoEstudianteReporte {
  attemptId: string;
  caseVersionId: number;
  caseTitle: string;
  status: string;
  startedAt: string | null;
  /** Tiempo con la persona jugando (E1-5). */
  activeSeconds: number;
  /** De la hora de inicio a la de cierre; `null` si el intento sigue abierto. */
  clockSeconds: number | null;
  ordinal: number;
}

/** «Mostrando `shown` de `total`»: cuántos intentos trae la respuesta de cuántos hay con ese filtro. */
export interface CoberturaReporte {
  shown: number;
  total: number;
}

export interface ReporteEstudiante {
  /** `displayName` puede faltar: según la política de identificación (decisión 21) solo viaja el alias (`ref`). */
  student: { ref: string; displayName?: string };
  attempts: IntentoEstudianteReporte[];
  coverage: CoberturaReporte;
}
