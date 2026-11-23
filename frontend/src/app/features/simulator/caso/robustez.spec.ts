import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';

import {
  OrdenDeRespuestas, borrarIntencion, borrarLectura, claveDeNpc, esLecturaRecuperable, esPlazoVencido, esperaDeReintento,
  guardarIntencion, guardarLectura, leerIntencion, leerLectura, lineaDeArranque, objetoDeLectura, pasoTrasFalloDeGuardado,
  respuestaVigente, veredictoDeEnvio, veredictoDeIntencion,
} from './robustez';

describe('robustez del juego: reglas puras', () => {
  it('reconoce el plazo vencido y nada más', () => {
    expect(esPlazoVencido(new TimeoutError())).toBe(true);
    expect(esPlazoVencido(new Error('x'))).toBe(false);
    expect(esPlazoVencido(null)).toBe(false);
  });

  it('la espera del reintento crece y tiene tope', () => {
    expect([1, 2, 3, 4, 5, 9].map(esperaDeReintento)).toEqual([600, 1200, 2400, 4800, 8000, 8000]);
  });

  it('el guardado reintenta con espera creciente y, agotados los intentos, avisa', () => {
    expect(pasoTrasFalloDeGuardado(1)).toEqual({ accion: 'reintentar', esperaMs: 600 });
    expect(pasoTrasFalloDeGuardado(3)).toEqual({ accion: 'reintentar', esperaMs: 2400 });
    expect(pasoTrasFalloDeGuardado(4)).toEqual({ accion: 'avisar' });
  });

  it('una respuesta vieja que llega después de una más nueva se descarta', () => {
    const orden = new OrdenDeRespuestas();
    const a = orden.emitir();
    const b = orden.emitir();
    expect(orden.aceptar(b)).toBe(true);
    expect(orden.aceptar(a)).toBe(false);
    const c = orden.emitir();
    expect(orden.aceptar(c)).toBe(true);
  });

  it('la vigencia pide el mismo intento en curso y la misma sala', () => {
    const pedida = { attemptId: 'a', mapKey: 'sala' };
    expect(respuestaVigente(pedida, { attemptId: 'a', status: 'IN_PROGRESS', mapKey: 'sala' })).toBe(true);
    expect(respuestaVigente(pedida, { attemptId: 'a', status: 'PAUSED', mapKey: 'sala' })).toBe(false);
    expect(respuestaVigente(pedida, { attemptId: 'a', status: 'IN_PROGRESS', mapKey: 'otra' })).toBe(false);
    expect(respuestaVigente(pedida, { attemptId: 'b', status: 'IN_PROGRESS', mapKey: 'sala' })).toBe(false);
  });

  describe('veredicto de un envío de decisión fallido', () => {
    const http = (status: number) => new HttpErrorResponse({ status });
    it('el plazo vencido conserva la intención', () => expect(veredictoDeEnvio(new TimeoutError())).toBe('plazo'));
    it('un 4xx no la da por perdida: se concilia con el servidor', () => {
      expect(veredictoDeEnvio(http(400))).toBe('conciliar');
      expect(veredictoDeEnvio(http(409))).toBe('conciliar');
    });
    it('el 403 de consentimiento no es ambiguo: no se consulta el intento', () => {
      const consentimiento = new HttpErrorResponse({ status: 403, error: { code: 'CONSENT_REQUIRED' } });
      expect(veredictoDeEnvio(consentimiento)).toBe('conservar');
    });
    it('un 5xx o la red caída la conservan', () => {
      expect(veredictoDeEnvio(http(503))).toBe('conservar');
      expect(veredictoDeEnvio(http(0))).toBe('conservar');
    });
  });

  it('el servidor dice si la decisión se aplicó: avanzó de nodo o cerró el caso', () => {
    const intencion = { nodeId: 5 };
    expect(veredictoDeIntencion(intencion, { status: 'IN_PROGRESS', currentNode: { id: 5 } })).toBe('pendiente');
    expect(veredictoDeIntencion(intencion, { status: 'IN_PROGRESS', currentNode: { id: 6 } })).toBe('aplicada');
    expect(veredictoDeIntencion(intencion, { status: 'COMPLETED', currentNode: { id: 5 } })).toBe('aplicada');
    expect(veredictoDeIntencion(intencion, { status: 'PAUSED', currentNode: { id: 5 } })).toBe('pendiente');
  });

  describe('almacenamiento', () => {
    const memoria = () => {
      const datos = new Map<string, string>();
      return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v), removeItem: (k: string) => void datos.delete(k) };
    };

    it('la intención de decidir sobrevive: se guarda, se lee y se borra', () => {
      const almacen = memoria();
      const intencion = { attemptId: 'a', nodeId: 5, decisionOptionId: 41, requestId: 'r-1' };
      guardarIntencion(almacen, intencion);
      expect(leerIntencion(almacen, 'a')).toEqual(intencion);
      expect(leerIntencion(almacen, 'otro')).toBeNull();
      borrarIntencion(almacen, 'a');
      expect(leerIntencion(almacen, 'a')).toBeNull();
    });

    it('un valor dañado o incompleto no se toma por intención ni por punto de lectura', () => {
      const almacen = memoria();
      almacen.setItem('siep_decision_pendiente_a', '{no es json');
      almacen.setItem('siep_punto_lectura_a', JSON.stringify({ attemptId: 'a', nodeId: 1, objectKey: 'x', dialogueKey: 'd', line: -1 }));
      expect(leerIntencion(almacen, 'a')).toBeNull();
      expect(leerLectura(almacen, 'a')).toBeNull();
    });

    it('un almacenamiento que lanza no rompe nada', () => {
      const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cuota'); }, removeItem: () => { throw new Error('x'); } };
      expect(() => guardarIntencion(roto, { attemptId: 'a', nodeId: 1, decisionOptionId: 1, requestId: 'r' })).not.toThrow();
      expect(leerIntencion(roto, 'a')).toBeNull();
      expect(() => borrarLectura(roto, 'a')).not.toThrow();
    });

    it('el punto de lectura guarda la conversación y la línea', () => {
      const almacen = memoria();
      guardarLectura(almacen, { attemptId: 'a', nodeId: 5, objectKey: 'abuela', dialogueKey: 'd1', line: 2 });
      expect(leerLectura(almacen, 'a')).toEqual({ attemptId: 'a', nodeId: 5, objectKey: 'abuela', dialogueKey: 'd1', line: 2 });
      borrarLectura(almacen, 'a');
      expect(leerLectura(almacen, 'a')).toBeNull();
    });

    it('un punto de lectura sin el nodo en que se guardó no se toma por válido: no se sabría si la escena cambió', () => {
      const almacen = memoria();
      almacen.setItem('siep_punto_lectura_a', JSON.stringify({ attemptId: 'a', objectKey: 'abuela', dialogueKey: 'd1', line: 2 }));
      expect(leerLectura(almacen, 'a')).toBeNull();
    });
  });

  it('la conversación de un personaje de ambiente (npc-<clave>) también se recupera, con su clave', () => {
    const dialogo = { key: 'npc-vecino', lines: [{}, {}] };
    expect(claveDeNpc('npc-vecino')).toBe('vecino');
    expect(claveDeNpc('consequence-123')).toBeNull();
    expect(claveDeNpc('npc-')).toBeNull();
    expect(objetoDeLectura(null, dialogo)).toBe('npc-vecino');
    expect(objetoDeLectura({ key: 'npc:vecino' }, dialogo)).toBe('npc-vecino');
    expect(objetoDeLectura(null, { key: 'npc-vecino', lines: [] })).toBeNull();
    expect(objetoDeLectura({ key: 'abuela', type: 'PERSON' }, { key: 'd', lines: [{}] })).toBe('abuela');
    expect(objetoDeLectura(null, { key: 'd', lines: [{}] })).toBeNull();
    expect(objetoDeLectura({ key: 'tool-x', type: 'TOOL' }, { key: 'd', lines: [{}] })).toBeNull();
  });

  it('solo la conversación de un objeto del mundo se recupera', () => {
    const dialogo = { key: 'd', lines: [{}] };
    expect(esLecturaRecuperable({ key: 'abuela', type: 'PERSON' }, dialogo)).toBe(true);
    expect(esLecturaRecuperable({ key: 'tool-x', type: 'TOOL' }, dialogo)).toBe(false);
    expect(esLecturaRecuperable({ key: 'npc:vecino' }, dialogo)).toBe(false);
    expect(esLecturaRecuperable({ key: 'puerta', type: 'EXIT' }, dialogo)).toBe(false);
    expect(esLecturaRecuperable({ key: 'abuela' }, { key: 'd', lines: [] })).toBe(false);
    expect(esLecturaRecuperable(null, dialogo)).toBe(false);
  });

  it('la línea de arranque es la guardada solo si es de esa conversación y existe', () => {
    const dialogo = { key: 'd', lines: [{}, {}, {}] };
    expect(lineaDeArranque({ key: 'd', line: 2 }, dialogo)).toBe(2);
    expect(lineaDeArranque({ key: 'd', line: 9 }, dialogo)).toBe(2);
    expect(lineaDeArranque({ key: 'otra', line: 2 }, dialogo)).toBe(0);
    expect(lineaDeArranque(null, dialogo)).toBe(0);
  });
});
