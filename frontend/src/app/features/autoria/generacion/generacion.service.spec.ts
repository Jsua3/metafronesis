import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, throwError } from 'rxjs';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { GenerationErrorKind } from '../../../core/models/generacion.model';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import {
  ESCENAS_A_LA_VEZ, ESPERA_SI_OCUPADA_MS, GeneracionService, RELECTURAS_SIN_CAMBIO,
} from './generacion.service';

const DESCRIPCION = 'Una estudiante llega a Bienestar y dice que ya no puede más con lo que pasa en casa.';
const CLAVES = ['recepcion', 'consulta', 'orientacion', 'cierre'];

const MENSAJES: Record<string, string> = {
  timeout: 'La IA tardó demasiado en responder. Vuelve a intentarlo.',
  http: 'No pudimos hablar con la IA. Vuelve a intentarlo en un momento.',
  malformed: 'La IA respondió algo que no pudimos usar. Vuelve a intentarlo.',
  refusal: 'La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.',
};

function montar() {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo']), universidad);
  TestBed.configureTestingModule({ providers: [{ provide: AuthoringApi, useValue: servidor.autoria }] });
  const g = servidor.generaciones;
  return { servidor, g, api: servidor.autoria, servicio: TestBed.inject(GeneracionService) };
}

/** Deja correr las promesas pendientes sin adelantar el reloj. */
async function vaciar(): Promise<void> {
  for (let i = 0; i < 6; i++) await vi.advanceTimersByTimeAsync(0);
}

describe('GeneracionService: el orquestador de la generación', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const veces = (g: ReturnType<typeof montar>['g'], metodo: string, clave?: string, reparar?: boolean) =>
    g.llamadas.filter((l) => l.metodo === metodo && (clave === undefined || l.args[1] === clave)
      && (reparar === undefined || l.args[2] === reparar)).length;

  it('recorre esqueleto, escenas de dos en dos, ensamblado e imported', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    await servicio.continuar(id);

    expect(servicio.generacion()!.status).toBe('imported');
    expect(servicio.etapa()).toEqual({ tipo: 'listo', caseVersionId: servicio.generacion()!.caseVersionId });
    expect(servicio.generacion()!.caseVersionId).toBeGreaterThan(0);
    expect(servicio.error()).toBeNull();
    expect(servicio.trabajando()).toBe(false);
    expect(veces(g, 'generationSkeleton')).toBe(1);
    expect(CLAVES.map((c) => veces(g, 'generationScene', c))).toEqual([1, 1, 1, 1]);
    expect(veces(g, 'generationAssemble')).toBe(1);
  });

  it('muestra la escena que se está escribiendo con su número y su título, y las claves de todo el lote que pidió', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.retener('scene', 'recepcion');
    g.retener('scene', 'consulta');
    const corrida = servicio.continuar(id);
    await vaciar();

    expect(servicio.trabajando()).toBe(true);
    // Las dos escenas del lote se están escribiendo a la vez: la pantalla las marca a las dos en curso.
    expect(servicio.etapa()).toEqual({ tipo: 'escena', n: 1, total: 4, titulo: 'Recepción', claves: ['recepcion', 'consulta'] });
    servicio.detener();
    g.liberar('scene', 'recepcion');
    g.liberar('scene', 'consulta');
    await corrida;
  });

  it('nunca pide más de dos escenas a la vez', async () => {
    const { g, servicio } = montar();
    expect(ESCENAS_A_LA_VEZ).toBe(2);
    const id = await servicio.empezar('universidad', DESCRIPCION);
    for (const c of CLAVES) g.retener('scene', c);
    let terminada = false;
    void servicio.continuar(id).then(() => { terminada = true; });

    let maximo = 0;
    for (let ronda = 0; ronda < 12 && !terminada; ronda++) {
      await vaciar();
      const enCurso = g.actual(id)!.scenes.filter((s) => s.state === 'running');
      maximo = Math.max(maximo, enCurso.length);
      for (const s of enCurso) g.liberar('scene', s.clave);
    }
    await vaciar();

    expect(terminada).toBe(true);
    expect(maximo).toBe(2);
    expect(servicio.generacion()!.status).toBe('imported');
  });

  it.each<GenerationErrorKind>(['timeout', 'http', 'malformed'])(
    'un 502 %s se reintenta una vez y luego pide a la docente',
    async (kind) => {
      const { g, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      g.fallar('skeleton', 502, 'AI_PROVIDER_ERROR', kind, 2);
      await servicio.continuar(id);

      expect(veces(g, 'generationSkeleton')).toBe(2);
      expect(servicio.error()).toEqual({ mensaje: MENSAJES[kind], reintentable: true, parte: 'esqueleto' });
      expect(servicio.trabajando()).toBe(false);
      expect(servicio.generacion()!.status).toBe('created');
    },
  );

  it('un 502 que sale bien al reintentar no molesta a la docente', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.fallar('skeleton', 502, 'AI_PROVIDER_ERROR', 'timeout', 1);
    await servicio.continuar(id);

    expect(veces(g, 'generationSkeleton')).toBe(2);
    expect(servicio.error()).toBeNull();
    expect(servicio.generacion()!.status).toBe('imported');
  });

  it('un 502 en una escena, tras su reintento, la nombra y «Reintentar» la retoma hasta el final', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    // dos escenas a la vez: cada una gasta su intento y su reintento
    g.fallar('scene', 502, 'AI_PROVIDER_ERROR', 'malformed', 4);
    await servicio.continuar(id);

    expect(servicio.error()).toEqual({ mensaje: MENSAJES['malformed'], reintentable: true, parte: 'escena', clave: 'recepcion' });
    expect(veces(g, 'generationScene')).toBe(4);

    await servicio.reintentar();
    expect(servicio.error()).toBeNull();
    expect(servicio.generacion()!.status).toBe('imported');
  });

  it('al publicar un error de escena relee la generación: la pantalla ve cada escena como quedó', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.fallar('scene', 502, 'AI_PROVIDER_ERROR', 'malformed', 4);
    await servicio.continuar(id);

    expect(servicio.error()).toMatchObject({ parte: 'escena', clave: 'recepcion' });
    const escenas = servicio.generacion()!.scenes;
    expect(escenas.find((s) => s.clave === 'recepcion')!.state).toBe('error');
    expect(escenas.find((s) => s.clave === 'consulta')!.state).toBe('error');
  });

  it('si la relectura del camino de error falla, el error se publica igual', async () => {
    const { g, api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.fallar('skeleton', 422, 'AI_REFUSED');
    const real = api.generation.bind(api);
    let lecturas = 0;
    vi.spyOn(api, 'generation').mockImplementation((i: string) =>
      ++lecturas === 1 ? real(i) : throwError(() => new HttpErrorResponse({ status: 500 })));
    await servicio.continuar(id);

    expect(lecturas).toBe(2);
    expect(servicio.error()).toEqual({ mensaje: MENSAJES['refusal'], reintentable: true, parte: 'esqueleto' });
    expect(servicio.trabajando()).toBe(false);
  });

  it('una relectura fallida nombra la parte en curso, no siempre el esqueleto', async () => {
    const { api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    await firstValueFrom(api.generationSkeleton(id));
    const real = api.generation.bind(api);
    let lecturas = 0;
    vi.spyOn(api, 'generation').mockImplementation((i: string) =>
      ++lecturas === 1 ? real(i) : throwError(() => new HttpErrorResponse({ status: 500 })));
    await servicio.continuar(id);

    expect(servicio.error()).toMatchObject({ parte: 'escena', reintentable: true });
  });

  it('primera lectura fallida: «Reintentar» vuelve a pedir y avanza hasta el final', async () => {
    const { api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    servicio.generacion.set(null);
    const real = api.generation.bind(api);
    let lecturas = 0;
    vi.spyOn(api, 'generation').mockImplementation((i: string) =>
      ++lecturas <= 2 ? throwError(() => new HttpErrorResponse({ status: 500 })) : real(i));
    await servicio.continuar(id);

    expect(servicio.generacion()).toBeNull();
    expect(servicio.error()).toMatchObject({ reintentable: true, parte: 'esqueleto' });

    await servicio.reintentar();
    expect(servicio.error()).toBeNull();
    expect(servicio.generacion()!.status).toBe('imported');
  });

  it('un refusal no se reintenta solo y muestra su mensaje', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.fallar('skeleton', 422, 'AI_REFUSED');
    await servicio.continuar(id);

    expect(veces(g, 'generationSkeleton')).toBe(1);
    expect(servicio.error()).toEqual({ mensaje: MENSAJES['refusal'], reintentable: true, parte: 'esqueleto' });

    await servicio.reintentar();
    expect(servicio.generacion()!.status).toBe('imported');
  });

  it('un error de red sin respuesta da el mensaje de http', async () => {
    const { g, api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    // un corte de red no trae cuerpo de la API: Angular lo entrega como estado 0 con un `ProgressEvent`
    const sinRed = () => throwError(() => new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }));
    vi.spyOn(api, 'generationSkeleton').mockImplementation(sinRed);
    await servicio.continuar(id);

    expect(api.generationSkeleton).toHaveBeenCalledTimes(2);
    expect(servicio.error()).toEqual({ mensaje: MENSAJES['http'], reintentable: true, parte: 'esqueleto' });
    expect(veces(g, 'generationSkeleton')).toBe(0);
  });

  it('el tope de llamadas termina sin reintento', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.fallar('scene', 429, 'GENERATION_CALLS_EXHAUSTED', undefined, 2);
    await servicio.continuar(id);

    expect(servicio.error()).toMatchObject({
      mensaje: 'Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo.', reintentable: false, parte: 'escena',
    });
    expect(veces(g, 'generationScene')).toBe(2);
    expect(servicio.trabajando()).toBe(false);

    await servicio.reintentar();
    expect(veces(g, 'generationScene')).toBe(2);
  });

  it('needs_repair repara solo las escenas listadas y vuelve a ensamblar', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.resultadoDelEnsamblado('needs_repair');
    await servicio.continuar(id);

    expect(veces(g, 'generationScene', undefined, true)).toBe(1);
    expect(veces(g, 'generationScene', 'consulta', true)).toBe(1);
    expect(veces(g, 'generationAssemble')).toBe(2);
    expect(servicio.generacion()!.status).toBe('imported');
    expect(servicio.generacion()!.repairRounds).toBe(1);
  });

  it('muestra la ronda y la escena que se repara', async () => {
    const { g, api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    await firstValueFrom(api.generationSkeleton(id));
    for (const c of CLAVES) await firstValueFrom(api.generationScene(id, c));
    g.resultadoDelEnsamblado('needs_repair');
    await firstValueFrom(api.generationAssemble(id));
    g.retener('scene', 'consulta');

    const corrida = servicio.continuar(id);
    await vaciar();
    expect(servicio.etapa()).toEqual({ tipo: 'reparando', ronda: 1, titulo: 'Primera escucha', claves: ['consulta'] });
    g.liberar('scene', 'consulta');
    await corrida;
    expect(servicio.etapa()).toMatchObject({ tipo: 'listo' });
  });

  it('failed muestra el fallo y no pide nada más', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.resultadoDelEnsamblado('failed');
    await servicio.continuar(id);

    expect(servicio.generacion()!.status).toBe('failed');
    expect(servicio.etapa()).toEqual({ tipo: 'fallo' });
    expect(servicio.error()).toBeNull();
    expect(veces(g, 'generationAssemble')).toBe(1);
  });

  it('con GENERATION_BUSY espera y relee en vez de pedir otra vez', async () => {
    const { g, api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    // «otra pestaña» está escribiendo el esqueleto
    g.retener('skeleton');
    void firstValueFrom(api.generationSkeleton(id));
    const corrida = servicio.continuar(id);
    await vaciar();

    expect(veces(g, 'generationSkeleton')).toBe(2);
    expect(servicio.error()).toBeNull();
    expect(servicio.trabajando()).toBe(true);

    await vi.advanceTimersByTimeAsync(ESPERA_SI_OCUPADA_MS - 1);
    expect(veces(g, 'generationSkeleton')).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(veces(g, 'generationSkeleton')).toBe(3); // la relectura mostró `created` y volvió a probar: sigue ocupada

    g.liberar('skeleton');
    await vi.advanceTimersByTimeAsync(ESPERA_SI_OCUPADA_MS);
    await corrida;
    expect(veces(g, 'generationSkeleton')).toBe(3);
    expect(servicio.generacion()!.status).toBe('imported');
  });

  it('una escena que corre en otra pestaña no se pide otra vez; tras 36 relecturas sin cambio pasa a error', async () => {
    const { g, api, servicio } = montar();
    // 36 × 5 s = 180 s: por encima de los 150 s en que el servidor da una escena por abandonada
    expect(RELECTURAS_SIN_CAMBIO).toBe(36);
    const id = await servicio.empezar('universidad', DESCRIPCION);
    await firstValueFrom(api.generationSkeleton(id));
    g.retener('scene', 'recepcion');
    void firstValueFrom(api.generationScene(id, 'recepcion')); // la otra pestaña
    const corrida = servicio.continuar(id);
    await vaciar();

    expect(veces(g, 'generationScene', 'recepcion')).toBe(1);
    expect(servicio.generacion()!.scenes.filter((s) => s.state === 'done').map((s) => s.clave)).toEqual(['consulta', 'orientacion', 'cierre']);

    await vi.advanceTimersByTimeAsync(ESPERA_SI_OCUPADA_MS * RELECTURAS_SIN_CAMBIO);
    await corrida;
    expect(servicio.error()).toEqual({
      mensaje: 'Esta parte tarda más de lo normal en escribirse. Vuelve a intentarlo.', reintentable: true, parte: 'escena', clave: 'recepcion',
    });
    expect(servicio.trabajando()).toBe(false);
    expect(veces(g, 'generationScene', 'recepcion')).toBe(1);

    // «Reintentar esta parte» sí la pide (el servidor decide si sigue ocupada)
    void servicio.reintentar();
    await vaciar();
    expect(veces(g, 'generationScene', 'recepcion')).toBe(2);
    servicio.detener();
    g.liberar('scene', 'recepcion');
  });

  it('continuar con una generación a medias sigue desde la escena que faltaba', async () => {
    const { g, api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    await firstValueFrom(api.generationSkeleton(id));
    await firstValueFrom(api.generationScene(id, 'recepcion'));
    await firstValueFrom(api.generationScene(id, 'consulta'));
    g.llamadas.length = 0;

    await servicio.continuar(id);

    expect(veces(g, 'generationSkeleton')).toBe(0);
    expect(veces(g, 'generationScene', 'recepcion')).toBe(0);
    expect(veces(g, 'generationScene', 'consulta')).toBe(0);
    expect(veces(g, 'generationScene', 'orientacion')).toBe(1);
    expect(veces(g, 'generationScene', 'cierre')).toBe(1);
    expect(servicio.generacion()!.status).toBe('imported');
  });

  it('detener no deja pedidos nuevos en vuelo', async () => {
    const { g, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    for (const c of CLAVES) g.retener('scene', c);
    const corrida = servicio.continuar(id);
    await vaciar();
    expect(veces(g, 'generationScene')).toBe(2);

    servicio.detener();
    expect(servicio.trabajando()).toBe(false);
    g.liberar('scene', 'recepcion');
    g.liberar('scene', 'consulta');
    await corrida;
    await vaciar();

    expect(veces(g, 'generationScene')).toBe(2);
    expect(servicio.trabajando()).toBe(false);
    // lo que ya iba en vuelo terminó en el servidor, y esa petición no dejó nada colgado
    expect(g.actual(id)!.scenes.map((s) => s.state)).toEqual(['done', 'done', 'pending', 'pending']);
  });

  it('detener durante una espera no relee ni vuelve a pedir', async () => {
    const { g, api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    g.retener('skeleton');
    void firstValueFrom(api.generationSkeleton(id));
    const corrida = servicio.continuar(id);
    await vaciar();
    const antes = g.llamadas.length;

    servicio.detener();
    await vi.advanceTimersByTimeAsync(ESPERA_SI_OCUPADA_MS * 5);
    await corrida;
    expect(g.llamadas.length).toBe(antes);
    g.liberar('skeleton');
  });

  it('cancelar usa el id dado o el actual y limpia el estado', async () => {
    const { api, servicio } = montar();
    // sin nada en el servicio: solo se conoce el id que el servidor dice en curso (`inProgress`)
    const id = await servicio.empezar('universidad', DESCRIPCION);
    servicio.generacion.set(null);
    const estado = await servicio.estado();
    expect(estado.inProgress?.id).toBe(id);

    await servicio.cancelar(estado.inProgress!.id);
    expect((await firstValueFrom(api.generationStatus())).inProgress).toBeNull();
    expect(servicio.generacion()).toBeNull();

    const otra = await servicio.empezar('universidad', DESCRIPCION);
    await servicio.cancelar();
    expect((await firstValueFrom(api.generation(otra))).status).toBe('cancelled');
    expect(servicio.generacion()).toBeNull();
    expect(servicio.etapa()).toBeNull();

    // sin id ni generación: no hace nada
    await expect(servicio.cancelar()).resolves.toBeUndefined();
  });

  it('cancelar lanza ante un error que no es 409 ni 404, para que la pantalla lo muestre', async () => {
    const { api, servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    vi.spyOn(api, 'cancelGeneration').mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    await expect(servicio.cancelar(id)).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  it('cancelar una generación ya terminada no es un error', async () => {
    const { servicio } = montar();
    const id = await servicio.empezar('universidad', DESCRIPCION);
    await servicio.continuar(id);
    await expect(servicio.cancelar(id)).resolves.toBeUndefined();
    expect(servicio.generacion()).toBeNull();
  });

  describe('el contrato final de C1', () => {
    const sinRed404 = (mensaje: string) =>
      throwError(() => new HttpErrorResponse({ status: 404, error: { success: false, code: 'NOT_FOUND', message: mensaje } }));

    it('el mensaje del servidor manda sobre el fijo del cliente, y el fijo solo respalda cuando no llega ninguno', async () => {
      const { api, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      vi.spyOn(api, 'generationSkeleton').mockImplementation(() => throwError(() => new HttpErrorResponse({
        status: 422, error: { success: false, code: 'AI_REFUSED', message: 'Mensaje que escribió el servidor.' },
      })));
      await servicio.continuar(id);
      expect(servicio.error()).toEqual({ mensaje: 'Mensaje que escribió el servidor.', reintentable: true, parte: 'esqueleto' });

      vi.spyOn(api, 'generationSkeleton').mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'AI_REFUSED' } })));
      await servicio.continuar(id);
      expect(servicio.error()?.mensaje).toBe(MENSAJES['refusal']);
    });

    it('el tope global llega con su propio texto y no se reemplaza por el del tope por docente', async () => {
      const { api, servicio } = montar();
      vi.spyOn(api, 'startGeneration').mockImplementation(() => throwError(() => new HttpErrorResponse({
        status: 429, error: {
          success: false, code: 'AI_LIMIT_EXCEEDED', scope: 'daily',
          message: 'La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana.',
        },
      })));
      await expect(servicio.empezar('universidad', DESCRIPCION)).rejects.toMatchObject({
        tipo: 'limite', mensaje: 'La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana.',
      });
    });

    it('un 404 a mitad del avance (apagada) se muestra con su mensaje, sin reintento y sin giro eterno', async () => {
      const { api, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      await firstValueFrom(api.generationSkeleton(id));
      vi.spyOn(api, 'generationScene').mockImplementation(() => sinRed404('La generación con IA no está disponible.'));
      await servicio.continuar(id);

      expect(servicio.error()).toEqual({
        mensaje: 'La generación con IA no está disponible.', reintentable: false, fatal: true, parte: 'escena', clave: 'recepcion',
      });
      expect(servicio.trabajando()).toBe(false);
      await servicio.reintentar(); // sin botón: no vuelve a pedir
      expect(api.generationScene).toHaveBeenCalledTimes(2);
    });

    it('una generación que no existe (404 «La generación no existe.») termina sin reintento', async () => {
      const { servicio } = montar();
      await servicio.continuar('no-existe');

      expect(servicio.error()).toEqual({ mensaje: 'La generación no existe.', reintentable: false, fatal: true, parte: 'esqueleto' });
      expect(servicio.trabajando()).toBe(false);
      expect(servicio.generacion()).toBeNull();
    });

    it('al retomar, una escena vencida (error timeout) se ofrece y no se pide sola; «Reintentar» sí la pide', async () => {
      const { g, api, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      await firstValueFrom(api.generationSkeleton(id));
      g.retener('scene', 'recepcion');
      void firstValueFrom(api.generationScene(id, 'recepcion')); // otra pestaña que se quedó a medias
      g.avanzarReloj(150);

      await servicio.continuar(id);
      expect(servicio.error()).toEqual({ mensaje: MENSAJES['timeout'], reintentable: true, parte: 'escena', clave: 'recepcion' });
      expect(veces(g, 'generationScene', 'recepcion')).toBe(1);
      expect(servicio.generacion()!.scenes.filter((s) => s.state === 'done')).toHaveLength(3);
      expect(servicio.trabajando()).toBe(false);

      await servicio.reintentar();
      expect(veces(g, 'generationScene', 'recepcion')).toBe(2);
      expect(servicio.error()).toBeNull();
      expect(servicio.generacion()!.status).toBe('imported');
      g.liberar('scene', 'recepcion');
    });

    it('al retomar, un esqueleto vencido (lastError skeleton timeout) se ofrece y no se pide solo', async () => {
      const { g, api, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      g.retener('skeleton');
      void firstValueFrom(api.generationSkeleton(id));
      g.avanzarReloj(150);

      await servicio.continuar(id);
      expect(servicio.error()).toEqual({ mensaje: MENSAJES['timeout'], reintentable: true, parte: 'esqueleto' });
      expect(veces(g, 'generationSkeleton')).toBe(1);
      expect(servicio.trabajando()).toBe(false);

      await servicio.reintentar();
      expect(veces(g, 'generationSkeleton')).toBe(2);
      expect(servicio.generacion()!.status).toBe('imported');
      g.liberar('skeleton');
    });

    it('tras salir de la pantalla, las escenas que terminan después no disparan otra lectura', async () => {
      const { g, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      for (const c of CLAVES) g.retener('scene', c);
      const corrida = servicio.continuar(id);
      await vaciar(); // el esqueleto sale bien y las dos primeras escenas quedan en vuelo
      expect(veces(g, 'generationScene')).toBe(2);
      servicio.detener();
      const lecturas = veces(g, 'generation');
      g.liberar('scene', 'recepcion');
      g.liberar('scene', 'consulta');
      await vaciar();
      await corrida;
      expect(veces(g, 'generation')).toBe(lecturas);
    });

    it('un esqueleto que vence en otra pestaña MIENTRAS se espera se ofrece y no se pide solo (cada intento cuesta)', async () => {
      const { g, api, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      g.retener('skeleton');
      void firstValueFrom(api.generationSkeleton(id)); // «otra pestaña» está escribiendo el esqueleto
      const corrida = servicio.continuar(id);
      await vaciar();
      expect(veces(g, 'generationSkeleton')).toBe(2); // la nuestra recibió GENERATION_BUSY, que no gasta

      g.avanzarReloj(150); // la de la otra pestaña vence
      await vi.advanceTimersByTimeAsync(ESPERA_SI_OCUPADA_MS);
      await corrida;
      expect(servicio.error()).toEqual({ mensaje: MENSAJES['timeout'], reintentable: true, parte: 'esqueleto' });
      expect(veces(g, 'generationSkeleton')).toBe(2); // no volvió a pedirlo por su cuenta
      expect(servicio.trabajando()).toBe(false);

      await servicio.reintentar(); // la docente lo pide: una llamada
      expect(veces(g, 'generationSkeleton')).toBe(3);
      expect(servicio.generacion()!.status).toBe('imported');
      g.liberar('skeleton');
    });

    it('al retomar, un ensamblado que ya falló se ofrece y no se pide solo', async () => {
      const { g, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      g.fallar('assemble', 502, 'AI_PROVIDER_ERROR', 'http', 2);
      await servicio.continuar(id);
      expect(servicio.error()).toMatchObject({ parte: 'ensamblado', reintentable: true });
      expect(veces(g, 'generationAssemble')).toBe(2);

      await servicio.continuar(id); // volver a la pantalla
      expect(veces(g, 'generationAssemble')).toBe(2);
      expect(servicio.error()).toEqual({ mensaje: MENSAJES['http'], reintentable: true, parte: 'ensamblado' });

      await servicio.reintentar();
      expect(servicio.generacion()!.status).toBe('imported');
    });

    it('con dos escenas en curso, un 409 GENERATION_BUSY de otra se espera y se relee, sin gastar llamada', async () => {
      const { g, api, servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      await firstValueFrom(api.generationSkeleton(id));
      g.retener('scene', 'recepcion');
      g.retener('scene', 'consulta');
      void firstValueFrom(api.generationScene(id, 'recepcion')); // dos pestañas ya escribiendo
      void firstValueFrom(api.generationScene(id, 'consulta'));
      const antes = g.actual(id)!.callsUsed;

      const corrida = servicio.continuar(id);
      await vaciar();
      expect(g.actual(id)!.callsUsed).toBe(antes); // la tercera y la cuarta dieron 409
      expect(servicio.trabajando()).toBe(true);
      expect(servicio.error()).toBeNull();

      g.liberar('scene', 'recepcion');
      g.liberar('scene', 'consulta');
      await vi.advanceTimersByTimeAsync(ESPERA_SI_OCUPADA_MS);
      await corrida;
      expect(servicio.generacion()!.status).toBe('imported');
    });
  });

  describe('empezar: los errores de inicio', () => {
    it('400 con campo lo deja en su campo', async () => {
      const { servicio } = montar();
      await expect(servicio.empezar('universidad', 'muy corta')).rejects.toMatchObject({
        tipo: 'campo', campo: 'descripcion', mensaje: 'Cuéntanos un poco más: al menos 40 caracteres.',
      });
      await expect(servicio.empezar('', DESCRIPCION)).rejects.toMatchObject({ tipo: 'campo', campo: 'lugarId' });
    });

    it('GENERATION_IN_PROGRESS ofrece retomar con su generationId', async () => {
      const { servicio } = montar();
      const id = await servicio.empezar('universidad', DESCRIPCION);
      await expect(servicio.empezar('universidad', DESCRIPCION)).rejects.toMatchObject({
        tipo: 'en-curso', generationId: id, mensaje: 'Ya tienes un caso generándose. Retómalo o cancélalo para empezar otro.',
      });
    });

    it('AI_LIMIT_EXCEEDED trae su mensaje fijo', async () => {
      const { servicio } = montar();
      for (let i = 0; i < 5; i++) {
        await servicio.empezar('universidad', DESCRIPCION);
        await servicio.cancelar();
      }
      await expect(servicio.empezar('universidad', DESCRIPCION)).rejects.toMatchObject({
        tipo: 'limite', mensaje: 'Llegaste al límite de casos generados por hoy.',
      });
    });

    it('apagada (404) lo dice con su motivo', async () => {
      const { g, servicio } = montar();
      g.habilitada = false;
      await expect(servicio.empezar('universidad', DESCRIPCION)).rejects.toMatchObject({
        tipo: 'apagado', mensaje: 'La generación con IA no está disponible.',
      });
      expect((await servicio.estado()).enabled).toBe(false);
    });
  });
});
