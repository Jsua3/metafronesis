/** Sesión de clase del docente (apps/sesiones): un grupo, un caso de la biblioteca y un horario. */
export type EstadoSesion = 'PROGRAMADA' | 'EN_CURSO' | 'PAUSADA' | 'FINALIZADA' | 'CANCELADA';
export type TransicionSesion = 'iniciar' | 'pausar' | 'reanudar' | 'finalizar' | 'cancelar';
/** Lo que el servidor permite en el estado actual: la pantalla no repite las reglas del estado. */
export type AccionSesion = TransicionSesion | 'editar' | 'gestionarConvocados';
export type EstadoIntentoConvocado = 'SIN_EMPEZAR' | 'JUGANDO' | 'EN_PAUSA' | 'TERMINADO' | 'INCOMPLETO';

export interface SesionResumen {
  id: number;
  estado: EstadoSesion;
  acciones: AccionSesion[];
  grupo: { id: number; nombre: string } | null;
  caso: { caseVersionId: number; titulo: string };
  inicio: string;
  fin: string;
  tiempoMaximoMin: number;
  lugar: string;
  mensaje: string;
  totalConvocados: number;
  iniciadaEn: string | null;
  finalizadaEn: string | null;
  canceladaEn: string | null;
}

export interface Convocado {
  estudianteId: number;
  nombre: string;
  email: string;
  estadoConvocatoria: 'ACTIVA' | 'RETIRADA';
  intento: EstadoIntentoConvocado;
  puedeRepetir: boolean;
}

export interface SesionDetalle extends SesionResumen {
  convocados: Convocado[];
}

export interface CasoBiblioteca {
  caseVersionId: number;
  titulo: string;
  version: string;
  autor: string;
  /** Quienes, sin ser el autor, crearon alguna versión del caso (autoría compartida); vacío o ausente si nadie más. */
  editadoPor?: string[];
  tiempoEstimadoMin: number | null;
  descripcion: string;
}

export interface SesionDatos {
  grupoId: number;
  caseVersionId: number;
  inicio: string;
  fin: string;
  tiempoMaximoMin: number;
  lugar: string;
  mensaje: string;
}
