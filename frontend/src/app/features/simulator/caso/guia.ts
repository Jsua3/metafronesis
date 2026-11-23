/**
 * La guía de la escena sale del documento y del mundo: el objetivo que escribió la docente, lo que hay en la sala y
 * si algo queda por conocer. Un objeto sin revisar nunca se nombra (VD-19 de `world-places.util.ts`: no se anuncia
 * evidencia por descubrir), pero sí cuenta para «queda por conocer». Módulo puro: sin Angular ni Phaser.
 */
import type { PlaceCandidate } from '../world-places.util';

export interface EntradaGuia {
  goal: string;
  lugares: readonly PlaceCandidate[];
  /** Claves de los objetos y las personas del mapa ya inspeccionados. */
  inspeccionados: readonly string[];
  /** Claves de persona sin el prefijo `npc:` con las que ya se habló. */
  hablados: ReadonlySet<string>;
  /** Las herramientas que hay en la sala (V7): «Recoge la herramienta…» hasta que entran al inventario. */
  herramientas?: readonly HerramientaSala[];
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
}

/** Antes de que haya escena: sin objetivo y sin nada por conocer. */
export const GUIA_VACIA: GuiaEscena = { objetivo: '', enEstaSala: [], quedaPorConocer: false, siguiente: null, hechos: 0, total: 0 };

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
    ...personas.map(p => ({ texto: `Habla con ${p.label}`, hecho: p.visto })),
    ...herramientas.map(h => ({ texto: `Recoge la herramienta «${h.label}»`, hecho: h.recogida })),
  ];
  const hechos = pasos.filter(p => p.hecho).length;
  const pendiente = pasos.find(p => !p.hecho);
  // Con todo hecho, la primera puerta sin aviso (las cerradas lo traen: «se abre más adelante»).
  const puerta = lugares.find(l => l.kind === 'door' && !l.note && l.label.trim() !== '');
  const siguiente = pendiente?.texto ?? (puerta ? pasoSalida(puerta.label.trim()) : null);
  return { siguiente, hechos, total: pasos.length };
}

const PREFIJO_NPC = 'npc:';

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
  return {
    objetivo: e.goal.trim(),
    enEstaSala: todos.filter(el => el.tipo === 'persona' || el.visto),
    quedaPorConocer: todos.some(el => !el.visto),
    ...siguientePaso(personas, e.herramientas ?? [], e.lugares),
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
