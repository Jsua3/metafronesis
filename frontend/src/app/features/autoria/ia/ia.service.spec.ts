import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthoringApi } from '../../../core/api/authoring.api';
import { CasoStore } from '../estado/caso.store';
import type { CasoBorrador } from '../modelo/caso';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { IaService, MENSAJE_APAGADO, MENSAJE_SOLO_LECTURA } from './ia.service';
import { MENSAJE_PROPUESTA_INVALIDA } from './propuestas';

/** Un caso del servidor: su id y los de sus escenas son números, como los del servidor. */
function caso(): CasoBorrador {
  const c = copiarEscenarioAlCaso(universidad, ['consultorio', 'pasillo'], 'Caso');
  c.id = '41';
  c.escenas[0].id = '1';
  c.escenas[1].id = '2';
  c.inicioId = '1';
  return c;
}

const error = (status: number, cuerpo: unknown = null) => throwError(() => new HttpErrorResponse({ status, error: cuerpo }));

function montar(api: Partial<Record<'assistantStatus' | 'assistantPropose' | 'assistantGuide', unknown>>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: AuthoringApi, useValue: api }] });
  const store = TestBed.inject(CasoStore);
  store.fijar(caso());
  return { ia: TestBed.inject(IaService), store };
}

const contexto = { pantalla: 'mapa', seleccion: null };
const resultado = (cambios: unknown[] = []) => ({ mensaje: 'Aquí va.', cambios, changes: cambios.length, model: 'm', modo: 'connected' });

describe('IaService · estado del asistente', () => {
  it('encendido y con cupo está listo, y dice cuántas ayudas quedan', async () => {
    const { ia } = montar({ assistantStatus: vi.fn(() => of({ enabled: true, mode: 'connected', remainingToday: 12 })) });
    expect(await ia.comprobar()).toBe('listo');
    expect(ia.restantes()).toBe(12);
  });

  it('apagado (404, o sin clave) lo dice y el resto del editor sigue', async () => {
    expect(await montar({ assistantStatus: vi.fn(() => error(404)) }).ia.comprobar()).toBe('apagado');
    expect(await montar({ assistantStatus: vi.fn(() => of({ enabled: false, mode: 'disabled', remainingToday: 0 })) }).ia.comprobar()).toBe('apagado');
  });

  it('sin cupo hoy queda en «sin-cupo»', async () => {
    const { ia } = montar({ assistantStatus: vi.fn(() => of({ enabled: true, mode: 'connected', remainingToday: 0 })) });
    expect(await ia.comprobar()).toBe('sin-cupo');
  });

  it('si no se puede preguntar queda en error, no en apagado', async () => {
    expect(await montar({ assistantStatus: vi.fn(() => error(500)) }).ia.comprobar()).toBe('error');
  });
});

describe('IaService · proponer', () => {
  it('manda la petición y la pantalla y devuelve los cambios revisados contra el borrador', async () => {
    const propose = vi.fn(() => of(resultado([{ op: 'add-line', nodeId: 1, characterId: 1, text: 'Hola', expression: 'neutral' }])));
    const { ia, store } = montar({ assistantPropose: propose, assistantStatus: vi.fn(() => of({ enabled: true, mode: 'connected', remainingToday: 5 })) });
    store.fijar({ ...caso(), personajes: [{ id: '1', nombre: 'Psicóloga', rol: 'Psicóloga', recipeId: '' }] });
    const r = await ia.proponer(store.caso()!, 'Escribe cómo saluda', contexto);
    expect(propose).toHaveBeenCalledWith(41, { pantalla: 'mapa', peticion: 'Escribe cómo saluda', seleccion: null });
    expect(r).toMatchObject({ invalida: false, mensaje: 'Aquí va.' });
    expect(r.cambios).toHaveLength(1);
  });

  it('una propuesta que ya no cuadra con el borrador se marca como inválida', async () => {
    const { ia, store } = montar({
      assistantPropose: vi.fn(() => of(resultado([{ op: 'add-line', nodeId: 99, characterId: 1, text: 'Hola', expression: 'neutral' }]))),
      assistantStatus: vi.fn(() => of({ enabled: true, mode: 'connected', remainingToday: 5 })),
    });
    const r = await ia.proponer(store.caso()!, 'Hola', contexto);
    expect(r).toMatchObject({ invalida: true, cambios: null, mensaje: MENSAJE_PROPUESTA_INVALIDA });
  });

  it('apagado (404): lo dice en lenguaje del docente y no inventa respuestas de ejemplo', async () => {
    const { ia, store } = montar({ assistantPropose: vi.fn(() => error(404)) });
    const r = await ia.proponer(store.caso()!, 'Hola', contexto);
    expect(ia.estado()).toBe('apagado');
    expect(r).toMatchObject({ mensaje: MENSAJE_APAGADO, cambios: [] });
  });

  it('sin cupo (429): usa el mensaje del servidor y queda sin cupo', async () => {
    const { ia, store } = montar({ assistantPropose: vi.fn(() => error(429, { code: 'AI_LIMIT_EXCEEDED', message: 'El programa agotó la ayuda de la IA de este mes.' })) });
    const r = await ia.proponer(store.caso()!, 'Hola', contexto);
    expect(ia.estado()).toBe('sin-cupo');
    expect(r.mensaje).toBe('El programa agotó la ayuda de la IA de este mes.');
    expect(r.cambios).toEqual([]);
  });

  it('una propuesta que el servidor no pudo validar (422) o un rechazo del modelo se dicen sin códigos', async () => {
    const invalida = montar({ assistantPropose: vi.fn(() => error(422, { code: 'AI_PROPOSAL_INVALID', message: 'Cambio 2: la escena no está en el caso.' })) });
    expect(await invalida.ia.proponer(invalida.store.caso()!, 'Hola', contexto)).toMatchObject({ invalida: true, mensaje: MENSAJE_PROPUESTA_INVALIDA });
    const rechazo = montar({ assistantPropose: vi.fn(() => error(422, { code: 'AI_REFUSED', message: 'No.' })) });
    const r = await rechazo.ia.proponer(rechazo.store.caso()!, 'Hola', contexto);
    expect(r.invalida).toBe(false);
    expect(r.mensaje).toMatch(/no pudo ayudar/i);
  });

  it('si el proveedor falla (502) pide reintentar y no cambia el estado del asistente', async () => {
    const { ia, store } = montar({ assistantPropose: vi.fn(() => error(502, { code: 'AI_PROVIDER_ERROR' })) });
    const r = await ia.proponer(store.caso()!, 'Hola', contexto);
    expect(r).toMatchObject({ error: true, cambios: [] });
    expect(r.mensaje).toMatch(/no respondió/i);
    expect(ia.estado()).not.toBe('apagado');
  });
});

describe('IaService · guía', () => {
  it('con asistente devuelve la acción elegida', async () => {
    const { ia } = montar({
      assistantStatus: vi.fn(() => of({ enabled: true, mode: 'connected', remainingToday: 5 })),
      assistantGuide: vi.fn(() => of({ accionId: 'agregar-escena', changes: 0, mensaje: 'Aquí.', model: 'm', modo: 'foco' })),
    });
    await ia.comprobar();
    expect(await ia.guia('¿Cómo agrego una escena?', [{ id: 'agregar-escena', nombre: 'Agregar una escena', pantalla: 'Escenas' }])).toEqual({
      accionId: 'agregar-escena', modo: 'foco', mensaje: 'Aquí.',
    });
  });

  it('apagado devuelve null: el buscador lo resuelve sin IA', async () => {
    const guide = vi.fn();
    const { ia } = montar({ assistantStatus: vi.fn(() => error(404)), assistantGuide: guide });
    await ia.comprobar();
    expect(await ia.guia('algo', [])).toBeNull();
    expect(guide).not.toHaveBeenCalled();
  });
});

// M6: con una sesión real (servidor en memoria) las escenas del borrador tienen un id propio y el servidor, otro.
describe('IaService · la escena elegida viaja con el número del servidor', () => {
  async function abrirConServidor() {
    TestBed.resetTestingModule();
    const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 }), universidad);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
    const store = TestBed.inject(CasoStore);
    await store.cargar(41);
    servidor.llamadas.length = 0;
    return { servidor, store, ia: TestBed.inject(IaService) };
  }

  it('una escena que el servidor ya tiene se nombra con su número, no con el id del borrador', async () => {
    const { servidor, store, ia } = await abrirConServidor();
    const escena = store.caso()!.escenas[1];
    const numero = servidor.editor.nodes[1].id;
    await ia.proponer(store.caso()!, 'Hola', { pantalla: 'guion', seleccion: escena.id });
    expect(servidor.llamadasA('assistantPropose')[0].args[1]).toEqual({ pantalla: 'guion', peticion: 'Hola', seleccion: String(numero) });
  });

  it('una escena del borrador aún sin guardar se guarda primero y se nombra con el número que recibe', async () => {
    const { servidor, store, ia } = await abrirConServidor();
    const nueva = store.agregarEscena('consultorio', store.caso()!.escenas[0].id);
    expect(store.nodoDeEscena(nueva)).toBeNull(); // todavía no está en el servidor
    await ia.proponer(store.caso()!, 'Escribe el guion', { pantalla: 'guion', seleccion: nueva });
    expect(servidor.metodos.indexOf('createNode')).toBeLessThan(servidor.metodos.indexOf('assistantPropose'));
    const numero = servidor.editor.nodes.at(-1)!.id;
    const enviado = servidor.llamadasA('assistantPropose')[0].args[1] as { seleccion: string };
    expect(enviado.seleccion).toBe(String(numero));
    expect(enviado.seleccion).not.toBe(nueva);
  });

  it('si la escena no llegó al servidor, no se manda el id del borrador (el servidor no lo conoce)', async () => {
    const { servidor, store, ia } = await abrirConServidor();
    servidor.fallar('createNode', 500);
    const nueva = store.agregarEscena('consultorio', store.caso()!.escenas[0].id);
    await ia.proponer(store.caso()!, 'Escribe el guion', { pantalla: 'guion', seleccion: nueva });
    const enviado = servidor.llamadasA('assistantPropose')[0]?.args[1] as { seleccion: unknown } | undefined;
    expect(enviado?.seleccion ?? null).toBeNull();
  });

  it('en otras pantallas la selección no es una escena y se manda tal cual', async () => {
    const { servidor, store, ia } = await abrirConServidor();
    await ia.proponer(store.caso()!, 'Mueve la mesa', { pantalla: 'sala', seleccion: 'consultorio' });
    expect(servidor.llamadasA('assistantPropose')[0].args[1]).toMatchObject({ pantalla: 'sala', seleccion: 'consultorio' });
  });
});

describe('IaService · un caso que ya no es un borrador', () => {
  it('no le pide nada al asistente (cada petición gasta cupo) y dice que el caso no se puede cambiar', async () => {
    const propose = vi.fn(() => of(resultado()));
    const { ia, store } = montar({ assistantPropose: propose });
    store.fijar({ ...store.caso()!, estado: 'IN_REVIEW' });
    const respuesta = await ia.proponer(store.caso()!, 'Agrega una escena', contexto);
    expect(propose).not.toHaveBeenCalled();
    expect(respuesta).toMatchObject({ mensaje: MENSAJE_SOLO_LECTURA, cambios: [], error: true });
  });
});
