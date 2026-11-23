import { HttpErrorResponse } from '@angular/common/http';
import { Subject, TimeoutError } from 'rxjs';

import {
  type EntornoDeRed, PausaPendiente, ReintentoAlVolver, type PuertoDePausa, borrarMarcaDePausa, esperaDeSincronizacion, guardarMarcaDePausa,
  hayMarcaDePausa, puedeReenviarEleccion, veredictoDeFalloDePausa,
} from './pausa-local';

/** Entorno falso: el reloj y la red los mueve la prueba. */
function entornoFalso() {
  const esperas: Array<{ accion: () => void; ms: number; viva: boolean }> = [];
  const oyentes = new Set<() => void>();
  const entorno: EntornoDeRed = {
    esperar: (accion, ms) => {
      const espera = { accion, ms, viva: true };
      esperas.push(espera);
      return () => { espera.viva = false; };
    },
    alVolverLaRed: accion => { oyentes.add(accion); return () => { oyentes.delete(accion); }; },
  };
  return {
    entorno,
    esperasVivas: () => esperas.filter(e => e.viva),
    /** Cumple la espera viva más reciente. */
    vencer: () => { const e = esperas.filter(x => x.viva).at(-1); if (e) { e.viva = false; e.accion(); } },
    volverLaRed: () => [...oyentes].forEach(oyente => oyente()),
    oyentes: () => oyentes.size,
  };
}

describe('pausa-local: reglas puras', () => {
  it('la espera crece 2, 4, 8, 16 y se queda en 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(esperaDeSincronizacion)).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
  });

  it('sin red, plazo vencido, 5xx o un error cualquiera: reintentar', () => {
    for (const err of [new HttpErrorResponse({ status: 0 }), new HttpErrorResponse({ status: 502 }), new TimeoutError(), new Error('x')]) {
      expect(veredictoDeFalloDePausa(err)).toBe('reintentar');
    }
  });

  it('un 4xx se consulta: el primer envío pudo haberse aplicado', () => {
    for (const status of [400, 403, 404, 409]) expect(veredictoDeFalloDePausa(new HttpErrorResponse({ status }))).toBe('consultar');
  });
});

describe('ReintentoAlVolver', () => {
  it('dispara al vencer la espera, una sola vez, y se desarma', () => {
    const red = entornoFalso();
    const accion = vi.fn();
    const reintento = new ReintentoAlVolver(accion, red.entorno);
    reintento.armar(2_000);
    expect(reintento.armado).toBe(true);
    red.vencer();
    expect(accion).toHaveBeenCalledTimes(1);
    expect(reintento.armado).toBe(false);
    expect(red.oyentes()).toBe(0);
  });

  it('dispara en el acto al volver la red y cancela la espera', () => {
    const red = entornoFalso();
    const accion = vi.fn();
    new ReintentoAlVolver(accion, red.entorno).armar(30_000);
    red.volverLaRed();
    expect(accion).toHaveBeenCalledTimes(1);
    expect(red.esperasVivas()).toHaveLength(0);
  });

  it('armado solo por la red (sin espera) espera al evento', () => {
    const red = entornoFalso();
    const accion = vi.fn();
    new ReintentoAlVolver(accion, red.entorno).armar(null);
    expect(red.esperasVivas()).toHaveLength(0);
    red.volverLaRed();
    expect(accion).toHaveBeenCalledTimes(1);
  });

  it('cerrado, armar ya no hace nada (ni espera ni oyente), aunque llegue tarde un fallo', () => {
    const red = entornoFalso();
    const accion = vi.fn();
    const reintento = new ReintentoAlVolver(accion, red.entorno);
    reintento.cerrar();
    reintento.armar(2_000);
    expect(red.esperasVivas()).toHaveLength(0);
    expect(red.oyentes()).toBe(0);
    expect(reintento.armado).toBe(false);
  });

  it('rearmar reemplaza la espera y no duplica el oyente; cancelar no dispara nada', () => {
    const red = entornoFalso();
    const accion = vi.fn();
    const reintento = new ReintentoAlVolver(accion, red.entorno);
    reintento.armar(2_000);
    reintento.armar(4_000);
    expect(red.esperasVivas()).toHaveLength(1);
    expect(red.oyentes()).toBe(1);
    reintento.cancelar();
    red.volverLaRed();
    expect(accion).not.toHaveBeenCalled();
    expect(red.oyentes()).toBe(0);
  });
});

interface Intento { status: string; marca?: string }

describe('PausaPendiente', () => {
  let red: ReturnType<typeof entornoFalso>;
  let envios: Array<Subject<Intento>>;
  let consultas: Array<Subject<Intento>>;
  let decisionEnVuelo: boolean;
  let puerto: PuertoDePausa<Intento> & Record<string, ReturnType<typeof vi.fn>>;
  let pausa: PausaPendiente<Intento>;

  beforeEach(() => {
    red = entornoFalso();
    envios = [];
    consultas = [];
    decisionEnVuelo = false;
    puerto = {
      enviar: vi.fn(() => { const s = new Subject<Intento>(); envios.push(s); return s; }),
      consultar: vi.fn(() => { const s = new Subject<Intento>(); consultas.push(s); return s; }),
      decisionEnVuelo: vi.fn(() => decisionEnVuelo),
      alRegistrar: vi.fn(),
      alFallar: vi.fn((_err: unknown, seguir: () => void) => seguir()),
      alQuedarPendiente: vi.fn(),
      alRendirse: vi.fn(),
    } as never;
    pausa = new PausaPendiente(puerto, red.entorno);
  });

  const red503 = () => new HttpErrorResponse({ status: 503 });
  const http = (status: number) => new HttpErrorResponse({ status });

  it('iniciar envía una vez y, al registrarse, lo dice y deja de estar activa', () => {
    pausa.iniciar();
    pausa.intentar();   // un segundo disparo mientras el envío sigue en vuelo no lo duplica
    expect(puerto.enviar).toHaveBeenCalledTimes(1);
    expect(pausa.activa).toBe(true);
    envios[0].next({ status: 'PAUSED' });
    expect(puerto.alRegistrar).toHaveBeenCalledWith({ status: 'PAUSED' });
    expect(pausa.activa).toBe(false);
    expect(puerto.alQuedarPendiente).not.toHaveBeenCalled();
  });

  it('sin red: queda pendiente, reintenta con espera creciente y registra al lograrlo', () => {
    pausa.iniciar();
    envios[0].error(http(0));
    expect(puerto.alQuedarPendiente).toHaveBeenLastCalledWith(1, expect.anything());
    expect(red.esperasVivas().map(e => e.ms)).toEqual([2_000]);
    red.vencer();
    expect(puerto.enviar).toHaveBeenCalledTimes(2);
    envios[1].error(red503());
    expect(red.esperasVivas().map(e => e.ms)).toEqual([4_000]);
    red.vencer();
    envios[2].next({ status: 'PAUSED' });
    expect(puerto.alRegistrar).toHaveBeenCalledTimes(1);
    expect(red.esperasVivas()).toHaveLength(0);
    expect(red.oyentes()).toBe(0);
  });

  it('al volver la red reintenta en el acto, sin esperar el plazo', () => {
    pausa.iniciar();
    envios[0].error(http(0));
    red.volverLaRed();
    expect(puerto.enviar).toHaveBeenCalledTimes(2);
    expect(red.esperasVivas()).toHaveLength(0);
  });

  it('nunca da la pausa por perdida: tras muchos fallos sigue reintentando con tope de 30 s', () => {
    pausa.iniciar();
    for (let i = 0; i < 8; i++) { envios[i].error(http(0)); red.vencer(); }
    envios[8].error(http(0));
    expect(red.esperasVivas().map(e => e.ms)).toEqual([30_000]);
    expect(pausa.activa).toBe(true);
  });

  it('no envía mientras hay una decisión en vuelo; al liberarse y llamar intentar(), sale', () => {
    decisionEnVuelo = true;
    pausa.iniciar();
    expect(puerto.enviar).not.toHaveBeenCalled();
    expect(pausa.activa).toBe(true);
    decisionEnVuelo = false;
    pausa.intentar();
    expect(puerto.enviar).toHaveBeenCalledTimes(1);
  });

  it('un 4xx consulta el intento: si el servidor ya lo tiene en pausa, se adopta sin reenviar', () => {
    pausa.iniciar();
    envios[0].error(http(409));
    expect(puerto.consultar).toHaveBeenCalledTimes(1);
    consultas[0].next({ status: 'PAUSED', marca: 'servidor' });
    expect(puerto.alRegistrar).toHaveBeenCalledWith({ status: 'PAUSED', marca: 'servidor' });
    expect(puerto.enviar).toHaveBeenCalledTimes(1);
  });

  it('un 4xx con el intento aún en curso reintenta UNA vez; si el 4xx se repite no hay bucle: se rinde y lo dice', () => {
    pausa.iniciar();
    envios[0].error(http(400));
    consultas[0].next({ status: 'IN_PROGRESS' });
    expect(puerto.enviar).toHaveBeenCalledTimes(2);
    envios[1].error(http(400));
    expect(puerto.consultar).toHaveBeenCalledTimes(1);
    expect(puerto.alRendirse).toHaveBeenCalledTimes(1);
    expect(red.esperasVivas()).toHaveLength(0);
    expect(red.oyentes()).toBe(0);
    expect(pausa.activa).toBe(false);
  });

  it('si la consulta misma responde con un 4xx, se rinde en vez de esperar 30 s para siempre', () => {
    pausa.iniciar();
    envios[0].error(http(403));
    consultas[0].error(http(403));
    expect(puerto.alRendirse).toHaveBeenCalledTimes(1);
    expect(red.esperasVivas()).toHaveLength(0);
  });

  it('cerrar (al destruir la pantalla) apaga todo para siempre: un fallo en vuelo posterior no arma nada y iniciar no envía', () => {
    pausa.iniciar();
    pausa.cerrar();
    envios[0].error(http(0));
    expect(red.esperasVivas()).toHaveLength(0);
    expect(red.oyentes()).toBe(0);
    pausa.iniciar();
    expect(puerto.enviar).toHaveBeenCalledTimes(1);
  });

  it('si la consulta tampoco responde, espera y reintenta el envío', () => {
    pausa.iniciar();
    envios[0].error(http(403));
    consultas[0].error(http(0));
    expect(red.esperasVivas()).toHaveLength(1);
    red.vencer();
    expect(puerto.enviar).toHaveBeenCalledTimes(2);
  });

  it('si el anfitrión no pide seguir (el ensayo ya no existe), no reintenta ni queda armada', () => {
    (puerto.alFallar as ReturnType<typeof vi.fn>).mockImplementation(() => undefined);
    pausa.iniciar();
    envios[0].error(http(404));
    expect(puerto.alQuedarPendiente).not.toHaveBeenCalled();
    expect(puerto.consultar).not.toHaveBeenCalled();
    expect(red.esperasVivas()).toHaveLength(0);
    expect(red.oyentes()).toBe(0);
  });

  it('cancelar descarta la respuesta tardía y apaga el reintento', () => {
    pausa.iniciar();
    pausa.cancelar();
    envios[0].next({ status: 'PAUSED' });
    expect(puerto.alRegistrar).not.toHaveBeenCalled();
    expect(pausa.activa).toBe(false);
    pausa.iniciar();
    expect(puerto.enviar).toHaveBeenCalledTimes(2);
  });

  it('intentar() sin pausa pendiente no envía nada', () => {
    pausa.intentar();
    expect(puerto.enviar).not.toHaveBeenCalled();
  });
});

describe('marca de pausa pendiente (sobrevive a salir, recargar o cerrar la pestaña)', () => {
  const memoria = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

  it('se guarda por intento, sin token, y se borra', () => {
    const almacen = memoria();
    guardarMarcaDePausa(almacen, 'a1');
    expect(hayMarcaDePausa(almacen, 'a1')).toBe(true);
    expect(hayMarcaDePausa(almacen, 'otro')).toBe(false);
    expect([...almacen.m.values()].join('')).not.toMatch(/token/i);
    borrarMarcaDePausa(almacen, 'a1');
    expect(hayMarcaDePausa(almacen, 'a1')).toBe(false);
  });

  it('un almacenamiento que lanza no rompe nada', () => {
    const roto = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => guardarMarcaDePausa(roto, 'a')).not.toThrow();
    expect(hayMarcaDePausa(roto, 'a')).toBe(false);
    expect(() => borrarMarcaDePausa(roto, 'a')).not.toThrow();
  });
});

describe('puedeReenviarEleccion (solo si la conversación de esa elección sigue abierta, en el mismo nodo)', () => {
  const base = {
    pendiente: { nodeId: 1, dialogueKey: 'd' }, intento: { status: 'IN_PROGRESS', nodeId: 1 }, dialogoAbierto: 'd', otraSuperposicion: false, ocupado: false,
  };
  it('reenvía con todo igual', () => expect(puedeReenviarEleccion(base)).toBe('reenviar'));
  it('espera si hay otra petición en curso', () => expect(puedeReenviarEleccion({ ...base, ocupado: true })).toBe('esperar'));
  it('descarta si la persona cerró la conversación, abrió otra, o hay otra superposición', () => {
    expect(puedeReenviarEleccion({ ...base, dialogoAbierto: null })).toBe('descartar');
    expect(puedeReenviarEleccion({ ...base, dialogoAbierto: 'otra' })).toBe('descartar');
    expect(puedeReenviarEleccion({ ...base, otraSuperposicion: true })).toBe('descartar');
  });
  it('descarta si cambió el nodo, el intento no está en curso o no hay intención', () => {
    expect(puedeReenviarEleccion({ ...base, intento: { status: 'IN_PROGRESS', nodeId: 2 } })).toBe('descartar');
    expect(puedeReenviarEleccion({ ...base, intento: { status: 'PAUSED', nodeId: 1 } })).toBe('descartar');
    expect(puedeReenviarEleccion({ ...base, pendiente: null })).toBe('descartar');
  });
});
