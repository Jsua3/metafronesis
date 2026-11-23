import type { CasoBorrador, Escena } from './caso';
import { escenasAlcanzables } from './hitos';
import { clasificarPendientes, estaVacia, type Etapa, type Pendiente } from './pendientes';

/**
 * El avance del caso por etapas y el «Siguiente paso» (EDITOR.md §3.1). Funciones puras: leen el caso y las faltas ya
 * clasificadas; no cambian ninguna regla de envío (eso sigue en `puedeEnviar`).
 */

/** Estado de una etapa: se dice con forma y con texto, nunca solo con color. */
export type EstadoEtapa = 'sin-empezar' | 'en-curso' | 'con-pendientes' | 'lista';

export interface AvanceEtapa {
  etapa: Etapa;
  /** Nombre corto, el de la barra. */
  nombre: string;
  /** Nombre completo, el que oye el lector de pantalla. */
  nombreLargo: string;
  /** La dirección corta del editor a la que lleva (`RutasAutoria.a`). */
  ruta: string;
  estado: EstadoEtapa;
  /** Cuánto lleva, en palabras («3 de 8 escenas escritas»); vacío si no aplica. */
  detalle: string;
  /** Cuántos «por corregir» tiene. */
  pendientes: number;
}

const ETIQUETAS: Record<Etapa, { nombre: string; nombreLargo: string; ruta: string }> = {
  datos: { nombre: 'Datos', nombreLargo: 'Datos del caso', ruta: '/editor/datos' },
  lugar: { nombre: 'Lugar', nombreLargo: 'Lugar y salas', ruta: '/editor/plano' },
  historia: { nombre: 'Historia', nombreLargo: 'Historia: escenas y guion', ruta: '/editor' },
  // E5: la etapa abre «Pasos profesionales», la primera de sus tres pestañas (Pasos, Rúbrica y Finales).
  evaluacion: { nombre: 'Evaluación', nombreLargo: 'Evaluación', ruta: '/editor/evaluacion' },
  enviar: { nombre: 'Enviar', nombreLargo: 'Enviar a revisión', ruta: '/revision' },
};

/** Cómo se dice cada estado en voz alta (el lector de pantalla y el globo del hilo). */
export const TEXTO_ESTADO: Record<EstadoEtapa, string> = {
  'sin-empezar': 'sin empezar',
  'en-curso': 'en curso',
  'con-pendientes': 'con pendientes',
  lista: 'lista',
};

/** Las escenas en orden de historia: primero las que se alcanzan desde el inicio, luego las sueltas en su orden. */
export function escenasEnOrden(caso: Pick<CasoBorrador, 'escenas' | 'inicioId'>): Escena[] {
  const alcanzables = escenasAlcanzables(caso);
  const vistas = new Set(alcanzables.map((e) => e.id));
  return [...alcanzables, ...caso.escenas.filter((e) => !vistas.has(e.id))];
}

/** La etapa a la que pertenece una dirección del programa (`/portal/casos/2/editor/escena/10` → historia). */
export function etapaDeDireccion(url: string): Etapa | null {
  const ruta = url.split(/[?#]/)[0];
  const editor = /\/editor(\/.*)?$/.exec(ruta);
  if (!editor) return null;
  const resto = (editor[1] ?? '').replace(/\/$/, '');
  if (resto === '/revision') return 'enviar';
  if (resto === '/datos') return 'datos';
  if (resto === '/plano' || resto.startsWith('/sala/')) return 'lugar';
  if (resto === '/finales' || resto === '/evaluacion' || resto === '/rubrica') return 'evaluacion';
  if (resto === '' || resto.startsWith('/escena/')) return 'historia';
  return null;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El avance de cada etapa, en el orden del hilo. */
export function avanceDelCaso(caso: CasoBorrador, pendientes: readonly Pendiente[] = clasificarPendientes(caso)): AvanceEtapa[] {
  const corregir = (etapa: Etapa) => pendientes.filter((p) => p.etapa === etapa && p.tipo === 'por-corregir').length;
  const con = (etapa: Etapa, estado: EstadoEtapa, detalle = ''): AvanceEtapa => {
    const n = corregir(etapa);
    return { etapa, ...ETIQUETAS[etapa], estado: n > 0 ? 'con-pendientes' : estado, detalle, pendientes: n };
  };

  const hayContexto = !!caso.contexto?.trim();
  const hayObjetivos = !!caso.objetivos?.some((o) => o.trim());
  const datos = con('datos', hayContexto && hayObjetivos ? 'lista' : hayContexto || hayObjetivos ? 'en-curso' : 'sin-empezar');

  const lugar = con('lugar', caso.salas.length ? 'lista' : 'sin-empezar', caso.salas.length ? plural(caso.salas.length, 'sala', 'salas') : '');

  const total = caso.escenas.length;
  const escritas = caso.escenas.filter((e) => !estaVacia(e)).length;
  const historia = con('historia', total > 0 && escritas === total ? 'lista' : escritas > 0 ? 'en-curso' : 'sin-empezar',
    total ? `${escritas} de ${plural(total, 'escena escrita', 'escenas escritas')}` : '');
  // Mientras quede trabajo por escribir en la historia, la etapa no puede estar «lista».
  if (historia.estado === 'lista' && pendientes.some((p) => p.etapa === 'historia' && p.tipo === 'por-escribir')) historia.estado = 'en-curso';

  const cubiertos = caso.hitos.filter((h) => caso.escenas.some((e) => e.respuestas.some((r) => r.efectos.hitos?.includes(h.clave)))).length;
  const faltaEvaluacion = pendientes.some((p) => p.etapa === 'evaluacion' && p.tipo !== 'sugerencia');
  const evaluacion = con('evaluacion',
    caso.hitos.length === 0 ? 'sin-empezar' : !faltaEvaluacion ? 'lista' : cubiertos > 0 ? 'en-curso' : 'sin-empezar',
    caso.hitos.length ? `${cubiertos} de ${plural(caso.hitos.length, 'paso cubierto', 'pasos cubiertos')}` : '');

  const enviado = caso.estado !== undefined && caso.estado !== 'DRAFT';
  const enviar = con('enviar', enviado ? 'lista' : 'sin-empezar', enviado ? 'Caso enviado' : '');
  return [datos, lugar, historia, evaluacion, enviar];
}

/** Lo que el lector de pantalla oye de una etapa: «Historia: escenas y guion, 3 de 8 escenas escritas, 1 pendiente». */
export function textoDeEtapa(a: AvanceEtapa): string {
  const partes = [a.nombreLargo, a.detalle || TEXTO_ESTADO[a.estado]];
  if (a.pendientes) partes.push(plural(a.pendientes, 'pendiente', 'pendientes'));
  else if (a.detalle && a.estado === 'lista') partes.push('lista');
  return partes.join(', ');
}

export interface PasoSiguiente {
  texto: string;
  /** Dirección corta del editor; vacía = quedarse en la pantalla actual. */
  ruta: string;
  ancla?: string;
  accionId?: string;
}

/** Lo que el marco sabe además del caso: si hay un aviso de guardado que mirar primero. */
export interface EstadoDelMarco {
  avisoDeGuardado?: boolean;
}

/**
 * Qué conviene hacer ahora (§3.1), en este orden: el aviso de guardado; lo que sugirió la IA; la primera escena vacía en
 * orden de historia; el primer «por corregir» de la historia o del lugar; el contexto y los objetivos; los pasos que
 * ninguna respuesta cumple; los finales; probar hasta un final; la lista de verificación; enviar.
 */
export function siguientePaso(caso: CasoBorrador, marco: EstadoDelMarco = {}, pendientes: readonly Pendiente[] = clasificarPendientes(caso)): PasoSiguiente {
  // Ruta vacía: el aviso vive en el marco, en cualquier pantalla; basta con llevarle el foco.
  if (marco.avisoDeGuardado) return { texto: 'Revisa el aviso de guardado', ruta: '', ancla: 'avisos-de-guardado' };

  const ia = pendientes.find((p) => p.ir.accionId === 'aceptar-ia');
  if (ia) {
    const n = Number(/^(\d+)/.exec(ia.mensaje)?.[1] ?? '1');
    return { texto: `Revisa lo que sugirió la IA (${n})`, ruta: ia.ir.ruta, accionId: 'aceptar-ia', ancla: ia.ir.ancla };
  }

  const orden = escenasEnOrden(caso);
  const vacia = orden.findIndex(estaVacia);
  if (vacia >= 0) return { texto: `Escribe la escena ${vacia + 1} · ${orden[vacia].titulo}`, ruta: `/editor/escena/${orden[vacia].id}` };

  const corregir = pendientes.find((p) => p.tipo === 'por-corregir' && (p.etapa === 'historia' || p.etapa === 'lugar'));
  if (corregir) return { texto: corregir.mensaje, ruta: corregir.ir.ruta, ancla: corregir.ir.ancla, accionId: corregir.ir.accionId };

  if (!caso.contexto?.trim() || !caso.objetivos?.some((o) => o.trim())) {
    return { texto: 'Escribe lo que lee el estudiante antes de empezar', ruta: '/editor/datos' };
  }

  const paso = pendientes.find((p) => p.codigo === 'milestone-unreachable');
  if (paso) {
    const nombre = /«([^»]+)»/.exec(paso.mensaje)?.[1] ?? 'el paso';
    return { texto: `Marca qué respuestas cumplen «${nombre}»`, ruta: paso.ir.ruta, ancla: paso.ir.ancla };
  }

  const final = pendientes.find((p) => p.etapa === 'evaluacion' && p.tipo !== 'sugerencia');
  if (final) return { texto: final.mensaje, ruta: final.ir.ruta, ancla: final.ir.ancla, accionId: final.ir.accionId };

  if (caso.probadoHastaElFinal !== true) return { texto: 'Prueba el caso hasta un final', ruta: '/editor', accionId: 'probar' };

  if (pendientes.some((p) => p.codigo === 'CHECKLIST_INCOMPLETE')) {
    return { texto: 'Completa la lista de verificación', ruta: '/revision', ancla: 'lista-verificacion' };
  }
  return { texto: 'Enviar a Psicología', ruta: '/revision' };
}
