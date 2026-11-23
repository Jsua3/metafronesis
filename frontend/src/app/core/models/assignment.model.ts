/** Lo que dice el servidor de una asignación respecto de su ventana (C7): ya abierta, programada o cerrada. */
export type AssignmentState = 'OPEN' | 'SCHEDULED' | 'CLOSED';

/** A quién se asigna: un grupo hoy; un estudiante concreto después (decisión 5: el servidor responde 400 mientras tanto). */
export type AssignmentTarget = { type: 'GROUP'; groupId: number } | { type: 'STUDENT'; studentId: number };

/** `Assignment` (C7, RF-14): una versión publicada asignada con su ventana. Las fechas llevan la hora de Bogotá con su desfase. */
export interface Assignment {
  id: number;
  caseVersionId: number;
  caseTitle?: string | null;
  target: AssignmentTarget;
  state: AssignmentState;
  /** Una asignación en pausa no habilita nada (ni iniciar ni seguir) hasta que se reanuda. */
  active: boolean;
  /** Orden en la secuencia del estudiante: menor, antes (0 a 1000). */
  sortOrder: number;
  opensAt?: string;
  closesAt?: string;
}

export interface AssignmentCreate {
  caseVersionId: number;
  target: { type: 'GROUP'; groupId: number };
  /** ISO 8601; vacío o ausente = abierto desde ya. */
  opensAt?: string | null;
  /** ISO 8601; vacío o ausente = sin cierre. */
  closesAt?: string | null;
  sortOrder?: number;
}

/** Solo lo que viene se cambia; `null` borra una fecha. */
export interface AssignmentChanges {
  opensAt?: string | null;
  closesAt?: string | null;
  sortOrder?: number;
  active?: boolean;
}
