import { HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';

import type { Generation } from '../../../core/models/generacion.model';
import { casoCopiadoDeLugar } from './caso-api';
import { GeneracionFalsa } from './generacion-falsa';
import { ServidorFalso } from './servidor-falso';
import { universidad } from './universidad';

const DESCRIPCION = 'Una estudiante llega a Bienestar y dice que ya no puede más con lo que pasa en casa.';
const NODO = { nodeKey: 'x', title: 'X', narrative: '', requiredTools: [], supportResources: [], sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: false, startNode: false, positionX: 0, positionY: 0 };

/** Lo que falla un observable de la API falsa: el `HttpErrorResponse` (estado y cuerpo). */
async function fallo(o: Observable<unknown>): Promise<HttpErrorResponse> {
  try {
    await firstValueFrom(o);
  } catch (e) {
    return e as HttpErrorResponse;
  }
  throw new Error('Se esperaba un error y salió bien.');
}

describe('GeneracionFalsa: la generación de casos en memoria', () => {
  let servidor: ServidorFalso;
  let g: ServidorFalso['generaciones'];
  const api = () => servidor.autoria;

  beforeEach(() => {
    servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo']), universidad);
    g = servidor.generaciones;
  });

  async function hastaEscenasListas(): Promise<Generation> {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    const conEsqueleto = await firstValueFrom(api().generationSkeleton(creada.id));
    for (const e of conEsqueleto.scenes) await firstValueFrom(api().generationScene(creada.id, e.clave));
    return firstValueFrom(api().generation(creada.id));
  }

  it('la generación falsa recorre los estados del contrato', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    expect(creada.status).toBe('created');
    expect(creada.skeleton).toBeNull();
    expect(creada.callsLimit).toBe(20);

    const conEsqueleto = await firstValueFrom(api().generationSkeleton(creada.id));
    expect(conEsqueleto.status).toBe('skeleton_ready');
    expect(conEsqueleto.skeleton!.escenas.map((e) => e.clave)).toEqual(['recepcion', 'consulta', 'orientacion', 'cierre']);
    expect(conEsqueleto.skeleton!.escenas.map((e) => e.final)).toEqual([false, false, false, true]);
    expect(conEsqueleto.scenes.every((e) => e.state === 'pending')).toBe(true);

    const [primera, ...resto] = conEsqueleto.scenes;
    let ultima = await firstValueFrom(api().generationScene(creada.id, primera.clave));
    expect(ultima.status).toBe('skeleton_ready');
    expect(ultima.scenes[0].state).toBe('done');
    for (const e of resto) ultima = await firstValueFrom(api().generationScene(creada.id, e.clave));
    expect(ultima.status).toBe('scenes_ready');
    expect(ultima.callsUsed).toBe(5);

    const importada = await firstValueFrom(api().generationAssemble(creada.id));
    expect(importada.status).toBe('imported');
    expect(importada.caseVersionId).toBeGreaterThan(0);
    expect(importada.issues).toEqual([]);
  });

  it('imported crea el caso en el servidor, con el guion 2.1 y todo marcado de la IA', async () => {
    const listas = await hastaEscenasListas();
    const importada = await firstValueFrom(api().generationAssemble(listas.id));
    const editor = await firstValueFrom(api().caseEditor(importada.caseVersionId!));

    expect(editor.caseVersionId).toBe(importada.caseVersionId);
    expect(editor.nodes.map((n) => n.key)).toEqual(['recepcion', 'consulta', 'orientacion', 'cierre']);
    expect(editor.nodes.every((n) => n.aiSuggested === true && n.goal !== '')).toBe(true);
    expect(editor.nodes[0].startNode).toBe(true);
    expect(editor.nodes[0].comments).toHaveLength(1);
    expect(editor.nodes[3].terminal).toBe(true);
    expect(editor.decisions).toHaveLength(9);
    expect(editor.decisions.every((d) => d.aiSuggested === true)).toBe(true);
    expect(editor.decisions.some((d) => Object.keys(d.requires).length > 0)).toBe(true);
    expect(editor.decisions.every((d) => d.reaction.linea)).toBe(true);
    expect(editor.hints.length).toBe(6);
    expect(servidor.mundos.size).toBe(4);
  });

  it('una segunda escena igual mientras corre la primera da 409 GENERATION_BUSY', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    await firstValueFrom(api().generationSkeleton(creada.id));
    g.retener('scene', 'recepcion');

    const primera = firstValueFrom(api().generationScene(creada.id, 'recepcion'));
    expect(g.actual(creada.id)!.scenes[0].state).toBe('running');
    const segunda = await fallo(api().generationScene(creada.id, 'recepcion'));
    expect(segunda.status).toBe(409);
    expect(segunda.error.code).toBe('GENERATION_BUSY');
    expect(segunda.error.message).toBe('Esta parte ya se está escribiendo. Espera un momento.');

    // otra escena distinta sí puede escribirse a la vez
    await firstValueFrom(api().generationScene(creada.id, 'consulta'));
    g.liberar('scene', 'recepcion');
    expect((await primera).scenes[0].state).toBe('done');
  });

  it('el esqueleto retenido también da GENERATION_BUSY a quien lo pide otra vez', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    g.retener('skeleton');
    const primero = firstValueFrom(api().generationSkeleton(creada.id));
    expect((await fallo(api().generationSkeleton(creada.id))).error.code).toBe('GENERATION_BUSY');
    g.liberar('skeleton');
    expect((await primero).status).toBe('skeleton_ready');
  });

  it('una llamada retenida a la que nadie escucha sigue su curso al liberarla y no deja la clave colgada', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    await firstValueFrom(api().generationSkeleton(creada.id));
    g.retener('scene', 'recepcion');
    const suscripcion = api().generationScene(creada.id, 'recepcion').subscribe();
    expect(g.actual(creada.id)!.scenes[0].state).toBe('running');
    suscripcion.unsubscribe();

    g.liberar('scene', 'recepcion');
    expect(g.actual(creada.id)!.scenes[0]).toMatchObject({ state: 'done', error: null });
    // la clave ya no está en curso: pedirla otra vez es un paso fuera de estado, no «ocupada»
    expect((await fallo(api().generationScene(creada.id, 'recepcion'))).error.code).toBe('GENERATION_STATE');
  });

  it('cancelar con una llamada retenida: al liberarla no pisa el estado cancelled', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    g.retener('skeleton');
    void firstValueFrom(api().generationSkeleton(creada.id));
    await firstValueFrom(api().cancelGeneration(creada.id));

    g.liberar('skeleton');
    const tras = g.actual(creada.id)!;
    expect(tras.status).toBe('cancelled');
    expect(tras.skeleton).toBeNull();
    expect(tras.scenes).toEqual([]);
  });

  it('una etapa fuera de su estado da 409 GENERATION_STATE y no cambia nada', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    expect((await fallo(api().generationAssemble(creada.id))).error.code).toBe('GENERATION_STATE');
    expect((await fallo(api().generationScene(creada.id, 'recepcion'))).error.code).toBe('GENERATION_STATE');
    await firstValueFrom(api().generationSkeleton(creada.id));
    expect((await fallo(api().generationSkeleton(creada.id))).error.code).toBe('GENERATION_STATE');
    await firstValueFrom(api().generationScene(creada.id, 'recepcion'));
    expect((await fallo(api().generationScene(creada.id, 'recepcion'))).error.code).toBe('GENERATION_STATE');
    expect((await fallo(api().generationScene(creada.id, 'recepcion', true))).error.code).toBe('GENERATION_STATE');
    expect((await fallo(api().generationScene(creada.id, 'no-existe'))).status).toBe(404);
    expect(g.actual(creada.id)!.status).toBe('skeleton_ready');
  });

  it('needs_repair deja las escenas de repair.scenes en pending y solo admite repair=1 en ellas', async () => {
    const listas = await hastaEscenasListas();
    g.resultadoDelEnsamblado('needs_repair');
    const reparar = await firstValueFrom(api().generationAssemble(listas.id));

    expect(reparar.status).toBe('needs_repair');
    expect(reparar.repairRounds).toBe(1);
    expect(reparar.repair!.round).toBe(1);
    const [clave] = reparar.repair!.scenes;
    expect(reparar.scenes.filter((s) => s.state === 'pending').map((s) => s.clave)).toEqual([clave]);
    expect(reparar.repair!.issues[clave][0].code).toBe('DSL.OCL-09');

    // sin repair=1 la escena pendiente no se admite, y repair=1 no se admite en una escena que no se reparaba
    expect((await fallo(api().generationScene(listas.id, clave))).error.code).toBe('GENERATION_STATE');
    const otra = reparar.scenes.find((s) => s.clave !== clave)!.clave;
    expect((await fallo(api().generationScene(listas.id, otra, true))).error.code).toBe('GENERATION_STATE');

    const reparada = await firstValueFrom(api().generationScene(listas.id, clave, true));
    expect(reparada.status).toBe('scenes_ready');
    expect(reparada.repair).toBeNull();
    const importada = await firstValueFrom(api().generationAssemble(listas.id));
    expect(importada.status).toBe('imported');
  });

  it('sin rondas de reparación, needs_repair importa y deja las faltas editoriales', async () => {
    const listas = await hastaEscenasListas();
    g.resultadoDelEnsamblado('needs_repair', 'needs_repair', 'needs_repair');
    for (let ronda = 0; ronda < 2; ronda++) {
      const r = await firstValueFrom(api().generationAssemble(listas.id));
      expect(r.status).toBe('needs_repair');
      await firstValueFrom(api().generationScene(listas.id, r.repair!.scenes[0], true));
    }
    const final = await firstValueFrom(api().generationAssemble(listas.id));
    expect(final.status).toBe('imported');
    expect(final.repairRounds).toBe(2);
    expect(final.issues.map((i) => i.code)).toEqual(['DSL.OCL-09']);
    expect(final.caseVersionId).not.toBeNull();
  });

  it('failed no crea nada y deja las faltas que impidieron importar', async () => {
    const listas = await hastaEscenasListas();
    g.resultadoDelEnsamblado('failed');
    const fallida = await firstValueFrom(api().generationAssemble(listas.id));
    expect(fallida.status).toBe('failed');
    expect(fallida.caseVersionId).toBeNull();
    expect(fallida.issues[0].severity).toBe('error');
    expect(servidor.editor.nodes.some((n) => n.key === 'recepcion')).toBe(false);
  });

  it('un fallo de la IA deja lastError y la escena en error, no cambia el estado y se puede reintentar', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    await firstValueFrom(api().generationSkeleton(creada.id));
    g.fallar('scene', 502, 'AI_PROVIDER_ERROR', 'timeout');

    const error = await fallo(api().generationScene(creada.id, 'recepcion'));
    expect(error.status).toBe(502);
    expect(error.error).toMatchObject({ code: 'AI_PROVIDER_ERROR', kind: 'timeout', message: 'La IA tardó demasiado en responder. Vuelve a intentarlo.' });
    const tras = g.actual(creada.id)!;
    expect(tras.status).toBe('skeleton_ready');
    expect(tras.scenes[0]).toMatchObject({ state: 'error', error: { kind: 'timeout' } });
    expect(tras.lastError).toMatchObject({ stage: 'scene', clave: 'recepcion', kind: 'timeout' });
    expect(tras.callsUsed).toBe(2);

    const bien = await firstValueFrom(api().generationScene(creada.id, 'recepcion'));
    expect(bien.scenes[0]).toMatchObject({ state: 'done', error: null });
    expect(bien.lastError).toBeNull();
  });

  it('AI_REFUSED es una negativa y los fallos programados se gastan por llamada', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    g.fallar('skeleton', 422, 'AI_REFUSED', undefined, 2);
    for (let i = 0; i < 2; i++) {
      const e = await fallo(api().generationSkeleton(creada.id));
      expect(e.status).toBe(422);
      expect(e.error.code).toBe('AI_REFUSED');
      expect(e.error.kind).toBeUndefined();
      expect(e.error.message).toBe('La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.');
    }
    expect(g.actual(creada.id)!.lastError).toMatchObject({ stage: 'skeleton', clave: null, kind: 'refusal' });
    expect((await firstValueFrom(api().generationSkeleton(creada.id))).status).toBe('skeleton_ready');
  });

  it('al gastar todas las llamadas da 429 GENERATION_CALLS_EXHAUSTED', async () => {
    const limitada = new GeneracionFalsa(undefined, undefined, { tope: 2 });
    const creada = await firstValueFrom(limitada.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    await firstValueFrom(limitada.generationSkeleton(creada.id));
    await firstValueFrom(limitada.generationScene(creada.id, 'recepcion'));
    const e = await fallo(limitada.generationScene(creada.id, 'consulta'));
    expect(e.status).toBe(429);
    expect(e.error.code).toBe('GENERATION_CALLS_EXHAUSTED');
  });

  it('solo hay una generación en curso: otra da 409 GENERATION_IN_PROGRESS con su id', async () => {
    const creada = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    const e = await fallo(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    expect(e.status).toBe(409);
    expect(e.error).toMatchObject({ code: 'GENERATION_IN_PROGRESS', generationId: creada.id });
    const estado = await firstValueFrom(api().generationStatus());
    expect(estado.inProgress?.id).toBe(creada.id);
    expect(estado.remainingToday).toBe(4);

    const cancelada = await firstValueFrom(api().cancelGeneration(creada.id));
    expect(cancelada.status).toBe('cancelled');
    expect((await firstValueFrom(api().generationStatus())).inProgress).toBeNull();
    expect((await firstValueFrom(api().generationStatus())).remainingToday).toBe(4);
    expect((await fallo(api().cancelGeneration(creada.id))).error.code).toBe('GENERATION_STATE');
  });

  it('valida la descripción y el lugar con su campo, y el límite diario con 429', async () => {
    const corta = await fallo(api().startGeneration({ lugarId: 'universidad', descripcion: 'muy corta' }));
    expect(corta.status).toBe(400);
    expect(corta.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'descripcion', message: 'Cuéntanos un poco más: al menos 40 caracteres.' });
    const larga = await fallo(api().startGeneration({ lugarId: 'universidad', descripcion: 'x'.repeat(2001) }));
    expect(larga.error.message).toBe('La descripción puede tener hasta 2000 caracteres.');
    const sinLugar = await fallo(api().startGeneration({ lugarId: '', descripcion: DESCRIPCION }));
    expect(sinLugar.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'lugarId', message: 'Elige el lugar donde pasa el caso.' });

    for (let i = 0; i < 5; i++) {
      const una = await firstValueFrom(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
      if (i < 4) await firstValueFrom(api().cancelGeneration(una.id));
    }
    await firstValueFrom(api().cancelGeneration('generacion-5'));
    const tope = await fallo(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    expect(tope.status).toBe(429);
    expect(tope.error).toMatchObject({ code: 'AI_LIMIT_EXCEEDED', scope: 'daily' });
    expect((await firstValueFrom(api().generationStatus())).remainingToday).toBe(0);
  });

  it('apagada responde 404 en todo salvo el estado, que dice enabled: false', async () => {
    g.habilitada = false;
    expect((await firstValueFrom(api().generationStatus())).enabled).toBe(false);
    const e = await fallo(api().startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
    expect(e.status).toBe(404);
    expect(e.error.message).toBe('La generación con IA no está disponible.');
  });

  it('una generación ajena o inexistente es un 404, y las llamadas se registran al suscribirse', async () => {
    const sinSuscribir = api().generation('nada');
    expect(g.llamadas).toEqual([]);
    const e = await fallo(sinSuscribir);
    expect(e.status).toBe(404);
    expect(e.error.message).toBe('La generación no existe.');
    expect(g.llamadas).toEqual([{ metodo: 'generation', args: ['nada'] }]);
  });

  it('el servidor falso guarda requires, reaction, goal y comments con ausente = no tocar', async () => {
    const cv = servidor.editor.caseVersionId;
    const [a, b] = servidor.editor.nodes;
    const comentario = { personaje: 'camila', linea: 'Hola.', cuando: { talked: 'camila' }, emocion: 'triste', gesto: 'asiente' };

    await firstValueFrom(api().updateNode(cv, a.id, { ...NODO, title: a.title, goal: 'Entender qué pasó.', comments: [comentario] }));
    expect(servidor.editor.nodes[0]).toMatchObject({ goal: 'Entender qué pasó.', comments: [comentario] });
    // ausente = no tocar
    await firstValueFrom(api().updateNode(cv, a.id, { ...NODO, title: 'Otro título' }));
    expect(servidor.editor.nodes[0]).toMatchObject({ title: 'Otro título', goal: 'Entender qué pasó.', comments: [comentario] });
    // `[]`, `null` y vacío limpian
    await firstValueFrom(api().updateNode(cv, a.id, { ...NODO, title: 'Otro título', comments: null, goal: '' }));
    expect(servidor.editor.nodes[0]).toMatchObject({ goal: '', comments: [] });
    await firstValueFrom(api().updateNode(cv, a.id, { ...NODO, title: 'Otro título', comments: [comentario] }));
    await firstValueFrom(api().updateNode(cv, a.id, { ...NODO, title: 'Otro título', comments: [] }));
    expect(servidor.editor.nodes[0].comments).toEqual([]);

    const requiere = { all: [{ talked: 'camila' }, { milestone: 'escuchar' }] };
    const reaccion = { linea: 'Gracias.', emocion: 'alegre', gesto: 'asiente', personaje: 'camila' };
    const cuerpo = {
      sourceNodeId: a.id, targetNodeId: b.id, optionKey: 'nueva', text: 'Te escucho.', responseClass: 'RECOMMENDED' as const,
      prohibitedConduct: false, prohibitionReason: null, immediateFeedback: '',
    };
    await firstValueFrom(api().createDecision(cv, { ...cuerpo, requires: requiere, reaction: reaccion }));
    const creada = servidor.editor.decisions.at(-1)!;
    expect(creada).toMatchObject({ requires: requiere, reaction: reaccion });

    await firstValueFrom(api().updateDecision(cv, creada.id, { ...cuerpo, text: 'Te escucho de verdad.' }));
    expect(servidor.editor.decisions.at(-1)).toMatchObject({ text: 'Te escucho de verdad.', requires: requiere, reaction: reaccion });
    await firstValueFrom(api().updateDecision(cv, creada.id, { ...cuerpo, requires: {}, reaction: null }));
    expect(servidor.editor.decisions.at(-1)).toMatchObject({ requires: {}, reaction: {} });
    await firstValueFrom(api().updateDecision(cv, creada.id, { ...cuerpo, requires: requiere }));
    await firstValueFrom(api().updateDecision(cv, creada.id, { ...cuerpo, requires: null }));
    expect(servidor.editor.decisions.at(-1)!.requires).toEqual({});

    // una respuesta nueva sin esos campos nace sin requisito ni reacción
    await firstValueFrom(api().createDecision(cv, { ...cuerpo, optionKey: 'otra' }));
    expect(servidor.editor.decisions.at(-1)).toMatchObject({ requires: {}, reaction: {} });
  });

  describe('lo que añadió el contrato final de C1', () => {
    const iniciar = (descripcion: string) => api().startGeneration({ lugarId: 'universidad', descripcion });
    const conEsqueleto = async () => {
      const creada = await firstValueFrom(iniciar(DESCRIPCION));
      await firstValueFrom(api().generationSkeleton(creada.id));
      return creada;
    };

    it.each([
      ['un correo', 'Una estudiante escribió a camila.rojas@correo.com porque ya no puede más con lo que pasa en casa.'],
      ['un celular', 'Una estudiante llama al 3105551234 porque ya no puede más con lo que pasa en casa y quiere hablar.'],
      ['un documento', 'Una estudiante con cédula 1023456789 llega a Bienestar y dice que ya no puede más con lo de casa.'],
    ])('rechaza una descripción con %s con el motivo fijo y no crea nada', async (_nombre, texto) => {
      const e = await fallo(iniciar(texto));
      expect(e.status).toBe(400);
      expect(e.error).toMatchObject({
        code: 'VALIDATION_ERROR', field: 'descripcion',
        message: 'La descripción parece traer datos reales de una persona (correo, teléfono o número de documento). Cuéntala sin datos que identifiquen a nadie.',
      });
      expect((await firstValueFrom(api().generationStatus())).inProgress).toBeNull();
    });

    it.each(['<b>negrita</b>', 'mira https://ejemplo.org', 'entra a www.ejemplo.org'])(
      'una descripción que no es texto plano (%s) da su mensaje en el campo', async (marca) => {
        const e = await fallo(iniciar(`${DESCRIPCION} ${marca}`));
        expect(e.status).toBe(400);
        expect(e.error).toMatchObject({
          field: 'descripcion', message: 'La descripción debe ser texto plano, sin etiquetas, enlaces ni caracteres especiales.',
        });
      });

    it('el tope global cuenta lo que crearon las demás docentes y dice otro texto que el tope por docente', async () => {
      const compartida = new GeneracionFalsa(undefined, undefined, { cupoGlobal: 3, creadasPorOtras: 2 });
      const una = await firstValueFrom(compartida.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
      await firstValueFrom(compartida.cancelGeneration(una.id)); // las canceladas cuentan
      const e = await fallo(compartida.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
      expect(e.status).toBe(429);
      expect(e.error).toMatchObject({
        code: 'AI_LIMIT_EXCEEDED', scope: 'daily',
        message: 'La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana.',
      });
      const propia = new GeneracionFalsa(undefined, undefined, { cupoDiario: 1 });
      const primera = await firstValueFrom(propia.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
      await firstValueFrom(propia.cancelGeneration(primera.id));
      const otra = await fallo(propia.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }));
      expect(otra.error).toMatchObject({ scope: 'daily', message: 'Llegaste al límite de casos generados por hoy.' });
    });

    it('apagada, todo da 404 con su mensaje, también a mitad de una generación', async () => {
      const creada = await conEsqueleto();
      g.habilitada = false;
      for (const o of [api().generation(creada.id), api().generationScene(creada.id, 'recepcion'), api().generationAssemble(creada.id), api().cancelGeneration(creada.id)]) {
        const e = await fallo(o);
        expect(e.status).toBe(404);
        expect(e.error.message).toBe('La generación con IA no está disponible.');
      }
      expect((await firstValueFrom(api().generationStatus())).enabled).toBe(false);
    });

    it('?repair solo admite 1 o true: cualquier otro valor no vacío es 400 con field repair', async () => {
      const creada = await conEsqueleto();
      const e = await fallo(g.generationScene(creada.id, 'recepcion', 'si'));
      expect(e.status).toBe(400);
      expect(e.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'repair', message: 'El parámetro repair solo admite 1.' });
      expect(g.actual(creada.id)!.callsUsed).toBe(1); // no gastó llamada
      // `1` y `true` pasan la validación (aquí la escena no está en reparación: es un paso fuera de estado, no un 400)
      expect((await fallo(g.generationScene(creada.id, 'recepcion', '1'))).error.code).toBe('GENERATION_STATE');
      expect((await fallo(g.generationScene(creada.id, 'recepcion', 'true'))).error.code).toBe('GENERATION_STATE');
    });

    it('una tercera escena a la vez da 409 GENERATION_BUSY sin gastar llamada', async () => {
      const creada = await conEsqueleto();
      g.retener('scene', 'recepcion');
      g.retener('scene', 'consulta');
      void firstValueFrom(api().generationScene(creada.id, 'recepcion'));
      void firstValueFrom(api().generationScene(creada.id, 'consulta'));
      const usadas = g.actual(creada.id)!.callsUsed;

      const tercera = await fallo(api().generationScene(creada.id, 'orientacion'));
      expect(tercera.status).toBe(409);
      expect(tercera.error).toMatchObject({ code: 'GENERATION_BUSY', message: 'Esta parte ya se está escribiendo. Espera un momento.' });
      expect(g.actual(creada.id)!.callsUsed).toBe(usadas);
      expect(g.actual(creada.id)!.scenes[2].state).toBe('pending');

      g.liberar('scene', 'recepcion');
      expect((await firstValueFrom(api().generationScene(creada.id, 'orientacion'))).scenes[2].state).toBe('done');
      g.liberar('scene', 'consulta');
    });

    it('una escena en curso hace más de 150 s se ve como error timeout y se puede pedir otra vez, sin cambiar lo guardado', async () => {
      const creada = await conEsqueleto();
      g.retener('scene', 'recepcion');
      void firstValueFrom(api().generationScene(creada.id, 'recepcion'));
      g.avanzarReloj(149);
      expect((await firstValueFrom(api().generation(creada.id))).scenes[0].state).toBe('running');

      g.avanzarReloj(1);
      const vista = await firstValueFrom(api().generation(creada.id));
      expect(vista.scenes[0]).toEqual({
        clave: 'recepcion', titulo: 'Recepción', state: 'error', error: { kind: 'timeout', message: 'La IA tardó demasiado en responder. Vuelve a intentarlo.' },
      });
      expect(vista.status).toBe('skeleton_ready');
      expect(g.actual(creada.id)!.scenes[0].state).toBe('running');

      // abandonada: se puede pedir de nuevo, ya no es «ocupada»
      const otra = await firstValueFrom(api().generationScene(creada.id, 'recepcion'));
      expect(otra.scenes[0]).toMatchObject({ state: 'done', error: null });
      g.liberar('scene', 'recepcion');
    });

    it('el esqueleto en curso hace más de 150 s se ve como lastError skeleton timeout', async () => {
      const creada = await firstValueFrom(iniciar(DESCRIPCION));
      g.retener('skeleton');
      void firstValueFrom(api().generationSkeleton(creada.id));
      g.avanzarReloj(150);

      const vista = await firstValueFrom(api().generation(creada.id));
      expect(vista.status).toBe('created');
      expect(vista.lastError).toEqual({
        stage: 'skeleton', clave: null, kind: 'timeout', message: 'La IA tardó demasiado en responder. Vuelve a intentarlo.',
      });
      expect((await firstValueFrom(api().generationSkeleton(creada.id))).status).toBe('skeleton_ready');
      g.liberar('skeleton');
    });

    it('createdAt y updatedAt son UTC con segundos, sin milisegundos', async () => {
      const creada = await firstValueFrom(iniciar(DESCRIPCION));
      expect(creada.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(creada.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });

    it('issues solo se llena en imported y failed y solo con faltas de severidad error; en needs_repair viajan en repair.issues', async () => {
      const listas = await hastaEscenasListas();
      g.resultadoDelEnsamblado('needs_repair', 'needs_repair', 'needs_repair');
      const r1 = await firstValueFrom(api().generationAssemble(listas.id));
      expect(r1.status).toBe('needs_repair');
      expect(r1.issues).toEqual([]);
      expect(Object.values(r1.repair!.issues).flat().every((i) => i.severity === 'error')).toBe(true);
      await firstValueFrom(api().generationScene(listas.id, r1.repair!.scenes[0], true));
      const r2 = await firstValueFrom(api().generationAssemble(listas.id));
      await firstValueFrom(api().generationScene(listas.id, r2.repair!.scenes[0], true));
      const importada = await firstValueFrom(api().generationAssemble(listas.id));
      expect(importada.status).toBe('imported');
      expect(importada.issues.length).toBeGreaterThan(0);
      expect(importada.issues.every((i) => i.severity === 'error')).toBe(true);
      expect(importada.repair).toBeNull();
      expect(importada.lastError).toBeNull();
      expect(importada.callsLimit).toBe(20);
    });
  });

  it('rehearsedToEnd se devuelve en la vista del editor cuando el ensayo llegó a un final', async () => {
    expect((await firstValueFrom(api().caseEditor(servidor.editor.caseVersionId))).rehearsedToEnd ?? false).toBe(false);
    servidor.marcarEnsayado();
    expect((await firstValueFrom(api().caseEditor(servidor.editor.caseVersionId))).rehearsedToEnd).toBe(true);
  });
});
