import type { Mock } from 'vitest';
import type { Activation, WorldComment } from '../../core/models/simulation.model';
import { memoriaDeComentarios } from './caso/comentarios';
import {
  BurbujaVisible, MIRAR_LO_REVISADO, MundoCercania, ProximityReactions, acotarAncla,
} from './proximity-reactions';

/**
 * Reacciones al acercarse y al explorar (bloque B, tarea 22), con un mundo y un reloj falsos. Los eventos de cercanía llegan
 * muchas veces por segundo: se prueba la repetición.
 */

const COMENT_ABUELA_SIN_GESTO: WorldComment = { id: '7-0', objectKey: 'abuela', line: 'Gracias por venir.', emotion: 'triste', gesture: null };
const COMENT_ABUELA_2: WorldComment = { id: '7-1', objectKey: 'abuela', line: 'No he dormido.', emotion: null, gesture: null };

interface Opciones {
  comments?: WorldComment[];
  consultante?: string;
  activation?: Activation;
  cerca?: Record<string, string[]>;
  objetos?: string[];
}

function montar(opciones: Opciones = {}) {
  const mundo = {
    faceTowards: vi.fn(),
    playGesture: vi.fn(() => Promise.resolve()),
    peopleNear: vi.fn((key: string) => opciones.cerca?.[key] ?? []),
    isKeyPerson: vi.fn((key: string) => key === opciones.consultante),
    isPerson: vi.fn((key: string) => !(opciones.objetos ?? ['carpeta']).includes(key)),
  } satisfies Record<keyof MundoCercania, Mock>;
  let ahora = 0;
  let siguiente = 1;
  let pendientes: Array<{ h: number; at: number; fn: () => void }> = [];
  const reloj = {
    now: () => ahora,
    setTimeout: (fn: () => void, ms: number) => { const h = siguiente++; pendientes.push({ h, at: ahora + ms, fn }); return h; },
    clearTimeout: (h: number) => { pendientes = pendientes.filter(t => t.h !== h); },
    pendientes: () => pendientes.length,
    avanzar(ms: number) {
      const meta = ahora + ms;
      for (;;) {
        const due = pendientes.filter(t => t.at <= meta).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        pendientes = pendientes.filter(t => t !== due);
        ahora = due.at;
        due.fn();
      }
      ahora = meta;
    },
  };
  const burbujas: Array<BurbujaVisible | null> = [];
  const memoria = memoriaDeComentarios('intento-1', null);
  const r = new ProximityReactions(mundo, memoria, reloj, b => burbujas.push(b));
  r.setComments(opciones.comments ?? []);
  r.setActivation(opciones.activation ?? 'CALM');
  return { r, mundo, burbujas, reloj, memoria };
}

describe('ProximityReactions', () => {
  it('al acercarse a quien tiene un comentario, sale la burbuja y su gesto', () => {
    const { r, mundo, burbujas } = montar({ comments: [COMENT_ABUELA_SIN_GESTO, { ...COMENT_ABUELA_2, gesture: 'baja-la-mirada' }] });
    r.onProximity('abuela');
    expect(burbujas.at(-1)).toMatchObject({ objectKey: 'abuela', comment: { id: '7-0' } });
    expect(mundo.faceTowards).toHaveBeenCalledWith('abuela', 'player');
    r.onProximity(null);
    expect(burbujas.at(-1)).toBeNull();
    r.onProximity('abuela');
    expect(burbujas.at(-1)).toMatchObject({ comment: { id: '7-1' } });
    expect(mundo.playGesture).toHaveBeenCalledWith('abuela', 'baja-la-mirada', { mark: false });
  });

  it('un comentario por acercamiento: seguir junto a ella no abre el siguiente', () => {
    const { r, burbujas } = montar({ comments: [COMENT_ABUELA_SIN_GESTO, COMENT_ABUELA_2] });
    for (let i = 0; i < 30; i++) r.onProximity('abuela');   // el evento llega muchas veces por segundo
    expect(burbujas.filter(b => b !== null)).toHaveLength(1);
  });

  it('un comentario ya dicho no vuelve (lo recuerda la memoria)', () => {
    const { r, burbujas, memoria } = montar({ comments: [COMENT_ABUELA_SIN_GESTO] });
    memoria.marcar('7-0');
    r.onProximity('abuela');
    expect(burbujas).toEqual([]);
  });

  it('la consultante en crisis se agita y no voltea', () => {
    const { r, mundo } = montar({ comments: [], consultante: 'abuela', activation: 'CRISIS' });
    r.onProximity('abuela');
    expect(mundo.playGesture).toHaveBeenCalledWith('abuela', 'se-agita', { mark: false });
    expect(mundo.faceTowards).not.toHaveBeenCalled();
  });

  it('el gesto del comentario reemplaza el de la consultante', () => {
    const { r, mundo } = montar({ comments: [{ ...COMENT_ABUELA_SIN_GESTO, gesture: 'asiente' }], consultante: 'abuela', activation: 'TENSE' });
    r.onProximity('abuela');
    expect(mundo.playGesture).toHaveBeenCalledTimes(1);
    expect(mundo.playGesture).toHaveBeenCalledWith('abuela', 'asiente', { mark: false });
  });

  it('los objetos no reaccionan; los NPC del escenario sí', () => {
    const { r, mundo } = montar({ comments: [] });
    r.onProximity('carpeta');
    expect(mundo.faceTowards).not.toHaveBeenCalled();
    r.onProximity('npc:vecino');
    expect(mundo.faceTowards).toHaveBeenCalledWith('npc:vecino', 'player');
  });

  it('con el panel de respuestas abierto nadie reacciona ni sale burbuja', () => {
    const { r, mundo, burbujas } = montar({ comments: [COMENT_ABUELA_SIN_GESTO] });
    r.setBlocked(true);
    r.onProximity('abuela');
    expect(mundo.faceTowards).not.toHaveBeenCalled();
    expect(burbujas).toEqual([]);
    r.setBlocked(false);
    r.onProximity('abuela');
    expect(burbujas.at(-1)).toMatchObject({ comment: { id: '7-0' } });
  });

  it('un comentario pendiente espera a que el panel se cierre, aunque no se mueva', () => {
    const { r, burbujas } = montar({ comments: [COMENT_ABUELA_SIN_GESTO] });
    r.setBlocked(true);
    r.onProximity('abuela');
    r.setBlocked(false);
    expect(burbujas.at(-1)).toMatchObject({ comment: { id: '7-0' } });
  });

  it('al bloquearse con la burbuja a la vista, se va', () => {
    const { r, burbujas, reloj } = montar({ comments: [COMENT_ABUELA_SIN_GESTO] });
    r.onProximity('abuela');
    r.setBlocked(true);
    expect(burbujas.at(-1)).toBeNull();
    expect(reloj.pendientes()).toBe(0);
  });

  it('cambiar a otra persona retira la burbuja de la anterior', () => {
    const { r, burbujas } = montar({ comments: [COMENT_ABUELA_SIN_GESTO] });
    r.onProximity('abuela');
    r.onProximity('npc:vecino');
    expect(burbujas.at(-1)).toBeNull();
  });

  it('la burbuja se va a los 6 s y la reacción automática no se repite antes de 4 s', () => {
    const { r, mundo, burbujas, reloj } = montar({ comments: [COMENT_ABUELA_SIN_GESTO] });
    r.onProximity('abuela');
    reloj.avanzar(6000);
    expect(burbujas.at(-1)).toBeNull();
    r.onProximity(null); r.onProximity('abuela');
    expect(mundo.faceTowards).toHaveBeenCalledTimes(1);
    reloj.avanzar(4000);
    r.onProximity(null); r.onProximity('abuela');
    expect(mundo.faceTowards).toHaveBeenCalledTimes(2);
  });

  it('al revisar un objeto, las personas cercanas lo miran', () => {
    const { r, mundo } = montar({ comments: [], cerca: { carpeta: ['abuela'] } });
    r.onInspected('carpeta');
    expect(mundo.peopleNear).toHaveBeenCalledWith('carpeta', 160);
    expect(mundo.faceTowards).toHaveBeenCalledWith('abuela', 'carpeta');
    expect(MIRAR_LO_REVISADO).toBe(true);
  });

  it('dispose cancela el temporizador de la burbuja', () => {
    const { r, reloj } = montar({ comments: [COMENT_ABUELA_SIN_GESTO] });
    r.onProximity('abuela');
    r.dispose();
    expect(reloj.pendientes()).toBe(0);
  });

  it('dispose con la burbuja a la vista avisa que ya no hay burbuja', () => {
    const { r, burbujas } = montar({ comments: [COMENT_ABUELA_SIN_GESTO] });
    r.onProximity('abuela');
    r.dispose();
    expect(burbujas.at(-1)).toBeNull();
    const avisos = burbujas.length;
    r.dispose();   // sin burbuja no avisa de nuevo
    expect(burbujas).toHaveLength(avisos);
  });
});

describe('acotarAncla', () => {
  const lienzo = { ancho: 800, alto: 500 };

  it('deja el ancla donde está si la burbuja cabe', () => {
    expect(acotarAncla({ x: 400, y: 300 }, lienzo)).toEqual({ x: 400, y: 300 });
  });

  it('la aparta de los bordes izquierdo, derecho y superior para que no se recorte', () => {
    expect(acotarAncla({ x: 5, y: 20 }, lienzo)).toEqual({ x: 135, y: 100 });
    expect(acotarAncla({ x: 790, y: 300 }, lienzo).x).toBe(665);
    expect(acotarAncla({ x: 400, y: 9999 }, lienzo).y).toBe(492);
  });

  it('en un lienzo estrecho la deja centrada y sin tamaño no toca nada', () => {
    expect(acotarAncla({ x: 0, y: 300 }, { ancho: 200, alto: 500 }).x).toBe(100);
    expect(acotarAncla({ x: 7, y: 7 }, { ancho: 0, alto: 0 })).toEqual({ x: 7, y: 7 });
  });
});
