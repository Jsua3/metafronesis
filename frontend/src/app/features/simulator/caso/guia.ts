/**
 * La guía de la escena sale del documento y del mundo: el objetivo que escribió la docente, lo que hay en la sala y
 * si algo queda por conocer. Un objeto sin revisar nunca se nombra (VD-19 de `world-places.util.ts`: no se anuncia
 * evidencia por descubrir), pero sí cuenta para «queda por conocer». Módulo puro: sin Angular ni Phaser.
 */
import type { PlaceCandidate } from '../world-places.util';
import { conNombre } from './plantilla-nombre';

export interface EntradaGuia {
  goal: string;
  lugares: readonly PlaceCandidate[];
  /** Claves de los objetos y las personas del mapa ya inspeccionados. */
  inspeccionados: readonly string[];
  /** Claves de persona sin el prefijo `npc:` con las que ya se habló. */
  hablados: ReadonlySet<string>;
  /** Las herramientas que hay en la sala (V7): «Recoge la herramienta…» hasta que entran al inventario. */
  herramientas?: readonly HerramientaSala[];
  /** La guía escrita en el caso (`ambiente.guia`) y lo que cuenta como hecho: reemplaza los pasos calculados. */
  autorada?: { guia: GuiaAutorada; mundo: EstadoParaGuia };
}

/** Un hecho que marca un paso de la guía escrita (contrato 3): exactamente una de las cuatro claves. */
export type HechoDelPaso = { talked: string } | { inspected: string } | { has: string } | { used: string };

export interface PasoAutorado {
  texto: string;
  hecho?: HechoDelPaso;
  /** Clave de un objeto de la sala: a él apuntan «Ir allí» y el anillo del mapa mientras el paso no esté hecho. */
  lugar?: string;
}

/** `ambiente.guia`: el paso del capítulo, su título y la lista de pasos de la sala. */
export interface GuiaAutorada {
  paso: number;
  titulo: string;
  pasos: readonly PasoAutorado[];
}

/** Lo del mundo que decide si un paso está hecho (todo en claves, sin Angular ni Phaser). */
export interface EstadoParaGuia {
  hablados: ReadonlySet<string>;
  viewedNpcKeysHere?: readonly string[];
  inspeccionados: readonly string[];
  inventario: readonly string[];
  herramientasUsadas: readonly string[];
}

/** Un paso de la guía escrita ya evaluado, tal como lo pinta la tarjeta. */
export interface PasoMostrado {
  texto: string;
  hecho: boolean;
}

export interface ElementoSala {
  key: string;
  label: string;
  tipo: 'persona' | 'objeto';
  visto: boolean;
}

export interface GuiaEscena {
  objetivo: string;
  enEstaSala: readonly ElementoSala[];
  quedaPorConocer: boolean;
  /**
   * El siguiente paso concreto (V7, guía para las primeras testers): hablar con la siguiente persona de la sala, recoger la
   * herramienta que hay en ella o, con todo hecho, por dónde seguir. Sale solo de los datos del caso (nombres de personas,
   * herramientas y puertas); nunca nombra un objeto sin revisar. `null` sin nada que proponer.
   */
  siguiente: string | null;
  /** Pasos de la sala ya hechos y en total (personas y herramientas): la tarjeta dice «2 de 6». */
  hechos: number;
  total: number;
  /**
   * A quién o a qué apunta el siguiente paso, con la clave que usa el mundo (la de un marcador o `npc:{clave}`): el anillo y la
   * marca del mundo, el plano y «Ir a…» salen de aquí, de modo que el texto del paso y lo que se marca nunca se contradicen.
   * `null` si el paso no apunta a nadie (nada que proponer).
   */
  siguienteLugar: LugarDelPaso | null;
  /** Con guía escrita: la pestaña «Paso 2 · Título» y la lista de pasos con su marca. Sin guía escrita, `null`. */
  pestana?: string | null;
  pasos?: readonly PasoMostrado[] | null;
}

/** Hacia dónde apunta el siguiente paso: una persona, una herramienta o la puerta por la que seguir. */
export interface LugarDelPaso {
  key: string;
  label: string;
  tipo: 'persona' | 'herramienta' | 'puerta';
}

/** Antes de que haya escena: sin objetivo y sin nada por conocer. */
export const GUIA_VACIA: GuiaEscena = { objetivo: '', enEstaSala: [], quedaPorConocer: false, siguiente: null, hechos: 0, total: 0, siguienteLugar: null };

/** Una herramienta en la sala (un marcador de tipo TOOL) y si ya está en el inventario. */
export interface HerramientaSala {
  key: string;
  label: string;
  recogida: boolean;
}

/** Lo que dice la tarjeta cuando no queda nada por hacer en la sala y hay una puerta abierta. */
export const pasoSalida = (puerta: string): string =>
  `Cuando termines en esta sala: ${puerta}. También llegas con «Ir a…», arriba a la derecha.`;

/** El siguiente paso y la cuenta, con las personas, las herramientas y las puertas de la sala (módulo puro). */
function siguientePaso(personas: readonly ElementoSala[], herramientas: readonly HerramientaSala[], lugares: readonly PlaceCandidate[]) {
  const pasos = [
    ...personas.map(p => ({ texto: `Habla con ${p.label}`, hecho: p.visto, lugar: { key: p.key, label: p.label, tipo: 'persona' } as LugarDelPaso })),
    ...herramientas.map(h => ({ texto: `Recoge la herramienta «${h.label}»`, hecho: h.recogida, lugar: { key: h.key, label: h.label, tipo: 'herramienta' } as LugarDelPaso })),
  ];
  const hechos = pasos.filter(p => p.hecho).length;
  const pendiente = pasos.find(p => !p.hecho);
  // Con todo hecho, la primera puerta sin aviso (las cerradas lo traen: «se abre más adelante»).
  const puerta = lugares.find(l => l.kind === 'door' && !l.note && l.label.trim() !== '');
  const siguiente = pendiente?.texto ?? (puerta ? pasoSalida(puerta.label.trim()) : null);
  const siguienteLugar: LugarDelPaso | null = pendiente?.lugar ?? (puerta ? { key: puerta.key, label: puerta.label.trim(), tipo: 'puerta' } : null);
  return { siguiente, hechos, total: pasos.length, siguienteLugar };
}

const PREFIJO_NPC = 'npc:';

/** ¿Se cumple el hecho de un paso? Sin hecho, el paso no se marca solo (es una decisión del estudiante). */
export function pasoCumplido(hecho: HechoDelPaso | undefined, m: EstadoParaGuia): boolean {
  if (!hecho) return false;
  if ('talked' in hecho) {
    if (m.viewedNpcKeysHere !== undefined) return m.viewedNpcKeysHere.includes(hecho.talked);
    // Conserva los hechos de exploración de las respuestas anteriores.
    return m.hablados.has(hecho.talked) || m.hablados.has(PREFIJO_NPC + hecho.talked) || m.inspeccionados.includes(hecho.talked);
  }
  if ('inspected' in hecho) return m.inspeccionados.includes(hecho.inspected);
  if ('has' in hecho) return m.inventario.includes(hecho.has);
  const clave = hecho.used;
  if (clave.includes('@')) return m.herramientasUsadas.includes(clave);
  return m.herramientasUsadas.some(k => k === clave || k.startsWith(`${clave}@`));
}

/** Lee `ambiente.guia` con tolerancia: lo que no tenga la forma del contrato se ignora y la tarjeta calcula sus pasos. */
export function leerGuiaAutorada(ambiente: unknown, nombre?: string): GuiaAutorada | null {
  const crudo = (ambiente as { guia?: unknown } | null | undefined)?.guia as Record<string, unknown> | undefined;
  if (!crudo || typeof crudo !== 'object' || !Array.isArray(crudo['pasos'])) return null;
  const pasos: PasoAutorado[] = [];
  for (const p of crudo['pasos'] as unknown[]) {
    const o = p as Record<string, unknown> | null;
    if (!o || typeof o['texto'] !== 'string' || o['texto'].trim() === '') continue;
    const paso: PasoAutorado = { texto: conNombre(o['texto'].trim(), nombre) };
    const h = o['hecho'] as Record<string, unknown> | undefined;
    if (h && typeof h === 'object') {
      for (const k of ['talked', 'inspected', 'has', 'used'] as const) {
        if (typeof h[k] === 'string' && h[k] !== '') { paso.hecho = { [k]: h[k] } as HechoDelPaso; break; }
      }
    }
    if (typeof o['lugar'] === 'string' && o['lugar'] !== '') paso.lugar = o['lugar'];
    pasos.push(paso);
  }
  if (pasos.length === 0) return null;
  const numero = Number(crudo['paso']);
  return {
    paso: Number.isFinite(numero) && numero > 0 ? Math.floor(numero) : 1,
    titulo: typeof crudo['titulo'] === 'string' ? conNombre(crudo['titulo'].trim(), nombre) : '',
    pasos,
  };
}

/** La pestaña de la tarjeta: «Paso 2 · Contén antes de informar» (sin título, solo «Paso 2»). */
export const pestanaDeLaGuia = (g: Pick<GuiaAutorada, 'paso' | 'titulo'>): string =>
  g.titulo ? `Paso ${g.paso} · ${g.titulo}` : `Paso ${g.paso}`;

/** Los pasos escritos, evaluados contra el mundo, y a dónde apunta el primero pendiente que trae `lugar`. */
function pasosAutorados(a: NonNullable<EntradaGuia['autorada']>, lugares: readonly PlaceCandidate[]) {
  const directos = a.guia.pasos.map(p => pasoCumplido(p.hecho, a.mundo));
  // Un paso sin `hecho` (un consejo, «Quédate», o la decisión final) no se puede verificar: se da por cumplido cuando ya se
  // cumplió un paso posterior (quien juega lo dejó atrás). Así la flecha y la cuenta nunca se quedan en un consejo, y la
  // decisión, que es la última y no tiene hecho, queda como el paso actual cuando lo demás está hecho.
  const evaluados = a.guia.pasos.map((p, i) => ({
    ...p,
    cumplido: directos[i] || (!p.hecho && directos.slice(i + 1).some(Boolean)),
  }));
  const pendiente = evaluados.find(p => !p.cumplido);
  const conLugar = evaluados.find(p => !p.cumplido && p.lugar);
  let siguienteLugar: LugarDelPaso | null = null;
  if (conLugar?.lugar) {
    const destino = lugares.find(l => l.key === conLugar.lugar || l.key === PREFIJO_NPC + conLugar.lugar);
    if (destino) {
      const tipo: LugarDelPaso['tipo'] = destino.kind === 'person' ? 'persona' : destino.kind === 'door' ? 'puerta' : 'herramienta';
      siguienteLugar = { key: destino.key, label: destino.label.trim() || conLugar.lugar, tipo };
    }
  }
  return {
    pestana: pestanaDeLaGuia(a.guia),
    pasos: evaluados.map(p => ({ texto: p.texto, hecho: p.cumplido })),
    siguiente: pendiente?.texto ?? null,
    hechos: evaluados.filter(p => p.cumplido).length,
    total: evaluados.length,
    siguienteLugar,
  };
}

export function armarGuia(e: EntradaGuia): GuiaEscena {
  const inspeccionados = new Set(e.inspeccionados);
  const vistas = new Set<string>();
  const personas: ElementoSala[] = [];
  const objetos: ElementoSala[] = [];

  for (const lugar of e.lugares) {
    const label = lugar.label.trim();
    if (lugar.kind === 'door' || label === '' || vistas.has(lugar.key)) continue;
    vistas.add(lugar.key);

    if (lugar.kind === 'person') {
      // Con o sin el prefijo `npc:`: una persona del mapa (las de un caso por piezas) queda hablada al interactuar con ella,
      // y el servidor la apunta en los inspeccionados, no en las conversaciones vistas (V7).
      const clave = lugar.key.startsWith(PREFIJO_NPC) ? lugar.key.slice(PREFIJO_NPC.length) : lugar.key;
      const visto = e.hablados.has(clave) || inspeccionados.has(clave);
      personas.push({ key: lugar.key, label, tipo: 'persona', visto });
    } else {
      objetos.push({ key: lugar.key, label, tipo: 'objeto', visto: inspeccionados.has(lugar.key) });
    }
  }

  const todos = [...personas, ...objetos];
  const calculado = siguientePaso(personas, e.herramientas ?? [], e.lugares);
  const base = {
    objetivo: e.goal.trim(),
    enEstaSala: todos.filter(el => el.tipo === 'persona' || el.visto),
    quedaPorConocer: todos.some(el => !el.visto),
  };
  if (!e.autorada) return { ...base, ...calculado };

  // Con guía escrita manda ella; si ningún pendiente trae `lugar` (o su objeto no está), se cae al siguiente lugar calculado.
  const { siguienteLugar, ...escrita } = pasosAutorados(e.autorada, e.lugares);
  return {
    ...base,
    ...escrita,
    // Con todos los pasos hechos, el aviso de salida de siempre.
    siguiente: escrita.siguiente ?? calculado.siguiente,
    siguienteLugar: siguienteLugar ?? calculado.siguienteLugar,
  };
}

/** Los ids de `despues` que no estaban en `antes`; en la primera carga (`antes` nulo) nada es nuevo. */
export function opcionesNuevas(antes: readonly number[] | null, despues: readonly number[]): number[] {
  if (antes === null) return [];
  const previas = new Set(antes);
  return despues.filter(id => !previas.has(id));
}

/**
 * ¿Toca el aviso «hay otra forma de responder»? Solo si hay ids nuevos y el nodo es el mismo que en la lectura anterior:
 * si el estudiante cambió de nodo, los ids que «aparecen» son de otro nodo y no los abrió explorar. Sin nodo previo
 * registrado (primera lectura) no hay con qué comparar y se confía en la lista previa.
 */
export function avisarOpcionNueva(e: {
  nodoAntes: number | null;
  nodoDespues: number | null;
  antes: readonly number[] | null;
  despues: readonly number[];
}): boolean {
  if (e.nodoAntes !== null && e.nodoAntes !== e.nodoDespues) return false;
  return opcionesNuevas(e.antes, e.despues).length > 0;
}
