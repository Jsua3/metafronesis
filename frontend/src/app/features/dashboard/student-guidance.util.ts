import { Invitation } from '../../core/api/invitations.api';
import { plural } from '../../shared/ui/labels';
import { SiguientePaso } from './student-dashboard.util';

/**
 * Por qué una persona estudiante no ve ningún caso. La respuesta cambia lo que puede hacer: sin grupo, esperar o pedir la
 * invitación; con una invitación pendiente, aceptarla; con grupo pero sin casos, avisar a su docente.
 *
 * - `invitacion-pendiente`: hay invitaciones sin responder y todavía no es miembro de ningún grupo con casos.
 * - `sin-grupo`: no es miembro de ningún grupo y no tiene invitaciones pendientes.
 * - `grupo-sin-casos`: es miembro de al menos un grupo y el servidor dice que ningún grupo suyo tiene casos.
 * - `sin-saber`: las invitaciones no cargaron (o el servidor no informa cuántos casos tiene el grupo): se dice lo cierto
 *   sin afirmar nada de más.
 */
export type MotivoSinCasos = 'invitacion-pendiente' | 'sin-grupo' | 'grupo-sin-casos' | 'sin-saber';

/** Lo que se le dice a quien no tiene casos: título, por qué y qué hacer, más el texto del botón (siempre lleva a Grupos). */
export interface GuiaSinCasos {
  motivo: MotivoSinCasos;
  titulo: string;
  texto: string;
  accion: string;
}

const esPendiente = (invitacion: Invitation): boolean => invitacion.status === 'INVITED';
const esMiembro = (invitacion: Invitation): boolean => invitacion.status === 'ACTIVE';

/** «Paula Ríos», o nada si el servidor no la nombra: nunca un docente inventado. */
function docente(invitacion: Invitation): string {
  return invitacion.teacherName?.trim() ?? '';
}

/** ««Grupo A»», ««Grupo A» y «Grupo B»», ««A», «B» y «C»»: los nombres entre comillas latinas, en una frase. */
function nombres(lista: readonly Invitation[]): string {
  const entre = lista.map(grupo => `«${grupo.groupName}»`);
  return entre.length <= 1 ? (entre[0] ?? '') : `${entre.slice(0, -1).join(', ')} y ${entre[entre.length - 1]}`;
}

/**
 * El motivo por el que no hay casos, a partir de las invitaciones del estudiante (la API ya las da; `casesCount` es
 * lo único que se sumó). `null`: las invitaciones no se pudieron cargar.
 */
export function motivoSinCasos(invitaciones: readonly Invitation[] | null): MotivoSinCasos {
  if (invitaciones === null) return 'sin-saber';
  const miembro = invitaciones.filter(esMiembro);
  if (invitaciones.some(esPendiente) && !miembro.some(grupo => (grupo.casesCount ?? 0) > 0)) return 'invitacion-pendiente';
  if (!miembro.length) return 'sin-grupo';
  // Solo se afirma «sin casos» si el servidor lo dijo de TODOS sus grupos: un dato que falta no se toma por cero.
  return miembro.every(grupo => grupo.casesCount === 0) ? 'grupo-sin-casos' : 'sin-saber';
}

/**
 * El texto completo del vacío «sin casos». Dice qué pasa, por qué y qué puede hacer la persona; en segunda persona y sin
 * jerga. No promete nada que dependa del docente: los casos «aparecen cuando tu docente los asigna y los abre», que es
 * verdad con o sin sesiones programadas.
 */
export function guiaSinCasos(invitaciones: readonly Invitation[] | null): GuiaSinCasos {
  const motivo = motivoSinCasos(invitaciones);
  const lista = invitaciones ?? [];
  switch (motivo) {
    case 'invitacion-pendiente': {
      const pendientes = lista.filter(esPendiente);
      const una = pendientes.length === 1 ? pendientes[0] : null;
      const quien = una && docente(una) ? `${docente(una)} te invitó al grupo «${una.groupName}». ` : '';
      return {
        motivo,
        titulo: una ? 'Tienes una invitación esperando' : `Tienes ${pendientes.length} invitaciones esperando`,
        texto: `${quien}Los casos los asigna tu docente a tu grupo: acepta la invitación y los verás aquí cuando los asigne.`,
        accion: una ? 'Ver la invitación' : 'Ver las invitaciones',
      };
    }
    case 'sin-grupo':
      return {
        motivo,
        titulo: 'Todavía no estás en ningún grupo',
        texto: 'Los casos los asigna tu docente a tu grupo. Pídele que te invite con tu correo: la invitación aparecerá en Grupos y, al aceptarla, verás aquí los casos que asigne.',
        accion: 'Ir a Grupos',
      };
    case 'grupo-sin-casos': {
      const miembro = lista.filter(esMiembro);
      const uno = miembro.length === 1 ? miembro[0] : null;
      const quien = uno && docente(uno) ? `, ${docente(uno)},` : '';
      return {
        motivo,
        titulo: uno ? 'Tu grupo todavía no tiene casos' : 'Tus grupos todavía no tienen casos',
        texto: uno
          ? `«${uno.groupName}» aún no tiene casos asignados. Los asigna tu docente${quien} y aparecerán aquí cuando los abra. Si ya debería haber uno, avísale.`
          : `${miembro.length <= 3 ? nombres(miembro) : `Tus ${miembro.length} grupos`} aún no tienen casos asignados. Los asigna tu docente y aparecerán aquí cuando los abra. Si ya debería haber uno, avísale.`,
        accion: 'Ver mis grupos',
      };
    }
    case 'sin-saber':
      return {
        motivo,
        titulo: 'Aún no tienes casos asignados',
        texto: 'Los casos los asigna tu docente a tu grupo. Si ya debería haber uno, avísale; si te llegó una invitación, acéptala en Grupos.',
        accion: 'Ver mis grupos',
      };
  }
}

/** Lo que se le dice a quien acaba de aceptar una invitación (la pantalla de Grupos). */
export interface ConfirmacionIngreso {
  /** La frase que se anuncia a lectores de pantalla y encabeza la tarjeta. */
  titulo: string;
  /** Qué sigue: ya hay casos, aún no los hay o no se sabe. */
  texto: string;
  /** `true` si ya hay casos que ver (el botón «Ver mis casos» es la acción principal); si no, se ofrece igual pero sin empujar. */
  conCasos: boolean;
}

/**
 * Tras aceptar: el nombre del grupo y qué sigue. `casesCount` viene de la respuesta de aceptar (el grupo, no el catálogo
 * mezclado de todos sus grupos); sin ese dato (servidor anterior) no se afirma que el grupo esté vacío.
 */
export function confirmacionIngreso(grupo: Pick<Invitation, 'groupName' | 'teacherName' | 'casesCount'>): ConfirmacionIngreso {
  const titulo = `Ya estás en «${grupo.groupName}»`;
  const casos = grupo.casesCount;
  if (typeof casos === 'number' && casos > 0) {
    return { titulo, texto: `Tu docente ya le asignó ${plural(casos, 'caso')} a este grupo. Ya puedes verlos.`, conCasos: true };
  }
  if (casos === 0) {
    const quien = grupo.teacherName?.trim() ? `, ${grupo.teacherName.trim()},` : '';
    return {
      titulo,
      texto: `Este grupo todavía no tiene casos. Los asigna tu docente${quien} y aparecerán en Casos cuando los abra. Si ya debería haber uno, avísale.`,
      conCasos: false,
    };
  }
  return { titulo, texto: 'Los casos que tu docente asigne a este grupo aparecerán en Casos.', conCasos: false };
}

/**
 * «Lo siguiente» de Inicio: una frase que dice qué hacer ahora. Un solo orden de prioridad:
 * continuar lo abierto, empezar el caso que ya está listo, aceptar una invitación pendiente y, si no hay nada que hacer,
 * decirlo (con el motivo si no hay casos). Una invitación pendiente nunca tapa un caso que ya se puede trabajar, pero
 * tampoco se pierde: Inicio la muestra siempre aparte, con su botón.
 */
export type TipoLoSiguiente = 'continuar' | 'empezar' | 'invitacion' | 'esperar' | 'terminado' | 'sin-casos';

export interface LoSiguiente {
  tipo: TipoLoSiguiente;
  frase: string;
}

export interface EntradaLoSiguiente {
  paso: SiguientePaso | null;
  /** La escena donde se retoma, si se conoce. */
  escena: string | null;
  invitaciones: readonly Invitation[] | null;
  /** Cuántas invitaciones pendientes hay (puede saberse aunque la lista completa no cargara). */
  pendientes: number;
}

export function loSiguiente({ paso, escena, invitaciones, pendientes }: EntradaLoSiguiente): LoSiguiente {
  if (paso?.tipo === 'continuar') {
    const donde = escena ? ` Retomas en ${escena}.` : ' Retomas donde lo dejaste.';
    return { tipo: 'continuar', frase: `Continúa «${paso.caso.title}».${donde}` };
  }
  if (paso?.tipo === 'ficha') {
    return { tipo: 'empezar', frase: `Empieza «${paso.caso.title}»: es tu siguiente caso y ya está abierto.` };
  }
  if (pendientes > 0) {
    return {
      tipo: 'invitacion',
      frase: pendientes === 1
        ? 'Acepta la invitación de tu docente para ver los casos de tu grupo.'
        : 'Acepta las invitaciones de tus docentes para ver los casos de tus grupos.',
    };
  }
  if (paso?.tipo === 'espera') {
    return { tipo: 'esperar', frase: `Por ahora no tienes nada pendiente: «${paso.caso.title}» todavía no está disponible. Aquí verás cuándo se abre.` };
  }
  if (paso?.tipo === 'terminado') {
    return { tipo: 'terminado', frase: 'Terminaste los casos asignados. Cuando tu docente asigne otro, aparecerá aquí.' };
  }
  switch (motivoSinCasos(invitaciones)) {
    case 'sin-grupo':
      return { tipo: 'sin-casos', frase: 'Todavía no tienes casos: primero necesitas estar en un grupo de tu docente.' };
    case 'grupo-sin-casos':
      return { tipo: 'sin-casos', frase: 'Todavía no tienes casos: tu docente aún no los asigna a tu grupo.' };
    default:
      return { tipo: 'sin-casos', frase: 'Todavía no tienes casos asignados. Los asigna tu docente a tu grupo.' };
  }
}
