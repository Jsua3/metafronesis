import { AccionSesion, EstadoIntentoConvocado, EstadoSesion, TransicionSesion } from '../../core/models/sesion.model';
import { UiBadgeTone, UiButtonVariant, UiConfirmOptions, UiSegmento } from '../../shared/ui';

// BORRADOR: textos pendientes de Psicología (VD-23).
export const ESTADOS: Readonly<Record<EstadoSesion, { etiqueta: string; tono: UiBadgeTone }>> = {
  PROGRAMADA: { etiqueta: 'Programada', tono: 'info' },
  EN_CURSO: { etiqueta: 'En curso', tono: 'success' },
  PAUSADA: { etiqueta: 'Pausada', tono: 'warning' },
  FINALIZADA: { etiqueta: 'Finalizada', tono: 'neutral' },
  CANCELADA: { etiqueta: 'Cancelada', tono: 'danger' },
};

// BORRADOR: textos pendientes de Psicología (VD-23).
export const INTENTOS: Readonly<Record<EstadoIntentoConvocado, { etiqueta: string; tono: UiBadgeTone }>> = {
  SIN_EMPEZAR: { etiqueta: 'Sin empezar', tono: 'neutral' },
  JUGANDO: { etiqueta: 'Jugando', tono: 'info' },
  EN_PAUSA: { etiqueta: 'En pausa', tono: 'warning' },
  TERMINADO: { etiqueta: 'Terminado', tono: 'success' },
  INCOMPLETO: { etiqueta: 'Incompleto', tono: 'danger' },
};

export interface PresentacionTransicion {
  etiqueta: string;
  icono: string;
  variante: UiButtonVariant;
  confirmar?: Omit<UiConfirmOptions, 'origen' | 'piel'>;
}

// BORRADOR: textos pendientes de Psicología (VD-23).
export const TRANSICIONES: Readonly<Record<TransicionSesion, PresentacionTransicion>> = {
  iniciar: { etiqueta: 'Iniciar', icono: 'play_arrow', variante: 'primary' },
  reanudar: { etiqueta: 'Reanudar', icono: 'play_arrow', variante: 'primary' },
  pausar: { etiqueta: 'Pausar', icono: 'pause', variante: 'secondary' },
  finalizar: {
    etiqueta: 'Finalizar', icono: 'stop', variante: 'danger',
    confirmar: {
      title: '¿Finalizar la sesión?', confirmLabel: 'Finalizar', tone: 'danger',
      message: 'Se cierran los intentos que sigan abiertos y el caso deja de estar disponible. No se puede deshacer.',
    },
  },
  cancelar: {
    etiqueta: 'Cancelar sesión', icono: 'event_busy', variante: 'ghost',
    confirmar: {
      title: '¿Cancelar la sesión?', confirmLabel: 'Cancelar sesión', cancelLabel: 'Volver', tone: 'danger',
      message: 'Los estudiantes convocados recibirán un aviso. No se puede deshacer.',
    },
  },
};

const ORDEN: readonly TransicionSesion[] = ['iniciar', 'reanudar', 'pausar', 'finalizar', 'cancelar'];

/** Los botones de transición, en su orden, a partir de las acciones que manda el servidor. */
export function transicionesDe(acciones: readonly AccionSesion[]): TransicionSesion[] {
  return ORDEN.filter(accion => acciones.includes(accion));
}

export interface FiltroSesiones extends UiSegmento {
  estados: EstadoSesion[];
}

// BORRADOR: textos pendientes de Psicología (VD-23).
export const FILTROS: readonly FiltroSesiones[] = [
  { valor: 'proximas', etiqueta: 'Próximas', estados: ['PROGRAMADA'] },
  { valor: 'en-curso', etiqueta: 'En curso', estados: ['EN_CURSO', 'PAUSADA'] },
  { valor: 'terminadas', etiqueta: 'Terminadas', estados: ['FINALIZADA', 'CANCELADA'] },
  { valor: 'todas', etiqueta: 'Todas', estados: [] },
];

const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const HORA = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' });

export function horario(inicio: string, fin: string): string {
  return `${FECHA.format(new Date(inicio))} – ${HORA.format(new Date(fin))}`;
}

export const REFRESCO_MS = 20_000;

/** En vivo la docente ve el avance sin recargar. */
export function seRefresca(estado: EstadoSesion): boolean {
  return estado === 'EN_CURSO' || estado === 'PAUSADA';
}
