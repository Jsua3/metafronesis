import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { EndingRule, NodeUpsertRequest } from '../../../core/models/simulation.model';
import { FINALES_AUTOMATICOS, finalesDePlantilla } from '../modelo/finales';
import { casoCopiadoDeLugar, listaDelServidor } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { CasoStore } from './caso.store';

const CASO = 41;

async function abrir(estado?: string) {
  TestBed.resetTestingModule();
  const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  if (estado) datos.editor.status = estado;
  const servidor = new ServidorFalso(datos, universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  return { servidor, store };
}

const hitosDecisivos = (store: CasoStore) => store.caso()!.hitos.filter((h) => h.decisivo).map((h) => h.clave);

describe('CasoStore · intensidad y aviso de la escena', () => {
  it('cambiar la intensidad y escribir el aviso viajan al servidor con la revisión vigente', async () => {
    const { servidor, store } = await abrir();
    const escena = store.caso()!.escenas[0];
    store.editarEscena(escena.id, { intensidad: 'HIGH' });
    store.editarEscena(escena.id, { advertencia: 'Esta escena trata de violencia.' });
    await store.sincronizado();
    const cuerpo = servidor.llamadasA('updateNode').at(-1)!.args[1] as NodeUpsertRequest;
    expect(cuerpo).toMatchObject({ intensity: 'HIGH', warningMessage: 'Esta escena trata de violencia.' });
    expect(servidor.editor.nodes[0]).toMatchObject({ intensity: 'HIGH', warningMessage: 'Esta escena trata de violencia.' });
    expect(store.error()).toBeNull();
  });
});

describe('CasoStore · hitos decisivos y finales de plantilla', () => {
  it('marcar hitos decisivos regenera los cuatro finales de plantilla con texto editable', async () => {
    const { servidor, store } = await abrir();
    // Sin ediciones el servidor usa sus cuatro finales: marcar un hito decisivo solo cambia el hito.
    const nuevo = store.caso()!.hitos.find((h) => !h.decisivo)!.clave;
    store.editarHito(nuevo, { decisivo: true });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateMilestones']);
    expect(hitosDecisivos(store)).toContain(nuevo);
    expect(finalesDePlantilla(store.caso()!).map((f) => f.id)).toEqual(['critica', 'protectora', 'riesgo_persistente', 'con_brechas']);
    expect(JSON.stringify(finalesDePlantilla(store.caso()!)[1].condicion)).toContain(nuevo);

    // La docente reescribe el texto de la protectora: ahora los cuatro finales viajan, con su texto.
    servidor.llamadas.length = 0;
    store.editarTextoPlantilla('protectora', { texto: 'Acompañaste bien a la persona.' });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateEndings']);
    const guardados = servidor.llamadasA('updateEndings')[0].args[0] as EndingRule[];
    expect(guardados.map((f) => f.key)).toEqual(['critica', 'protectora', 'riesgo_persistente', 'con_brechas']);
    expect(guardados[1].message).toBe('Acompañaste bien a la persona.');
    expect(guardados[0].message).toBe(FINALES_AUTOMATICOS.critica.texto);

    // Marcar otro hito como decisivo regenera la condición de los cuatro y NO pisa el texto editado.
    servidor.llamadas.length = 0;
    const otro = store.caso()!.hitos.find((h) => !h.decisivo)!.clave;
    store.editarHito(otro, { decisivo: true });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateMilestones', 'updateEndings']);
    const regenerados = servidor.llamadasA('updateEndings')[0].args[0] as EndingRule[];
    expect(JSON.stringify(regenerados[1].when)).toContain(otro);
    expect(regenerados[1].message).toBe('Acompañaste bien a la persona.');
    expect(store.caso()!.textosPlantilla).toEqual({ protectora: { texto: 'Acompañaste bien a la persona.' } });
    expect(store.error()).toBeNull();
  });

  it('quitar un hito decisivo que nombran los finales guardados primero cambia los finales y luego el hito', async () => {
    const { servidor, store } = await abrir();
    store.editarTextoPlantilla('critica', { texto: 'Cuidado.' });
    await store.sincronizado();
    servidor.llamadas.length = 0;
    const decisivo = hitosDecisivos(store)[0];
    store.borrarHito(decisivo);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateEndings', 'updateMilestones']);
    expect(store.error()).toBeNull();
    expect(servidor.editor.rules.milestones.some((h) => h.key === decisivo)).toBe(false);
  });

  it('volver al texto del modelo deja de mandar los cuatro finales', async () => {
    const { servidor, store } = await abrir();
    store.editarTextoPlantilla('critica', { texto: 'Cuidado.' });
    await store.sincronizado();
    expect(servidor.editor.rules.endings).toHaveLength(4);
    store.restaurarTextoPlantilla('critica');
    await store.sincronizado();
    expect(servidor.editor.rules.endings).toEqual([]);
    expect(store.caso()!.textosPlantilla).toEqual({});
  });

  it('al reabrir el caso los cuatro finales guardados siguen siendo el modo automático con su texto', async () => {
    const { store } = await abrir();
    store.editarTextoPlantilla('con_brechas', { nombre: 'Con pendientes' });
    await store.sincronizado();
    await store.cargar(CASO, true);
    expect(store.caso()!.modoFinales).toBe('automatico');
    expect(store.caso()!.textosPlantilla).toEqual({ con_brechas: { nombre: 'Con pendientes' } });
  });
});

describe('CasoStore · enviar a revisión y solo lectura', () => {
  it('enviar llama a la transición de envío con la revisión vigente y el caso queda en revisión', async () => {
    const { servidor, store } = await abrir();
    expect(store.soloLectura()).toBe(false);
    const ciclo = await store.enviarARevision('Revisa con cuidado el final.');
    expect(servidor.metodos).toEqual(['transitionCase', 'caseEditor', 'worldEditor', 'worldEditor', 'libraryPlace']);
    const envio = servidor.llamadasA('transitionCase')[0];
    expect(envio.args[0]).toEqual({ action: 'submit', note: 'Revisa con cuidado el final.' });
    expect(envio.revision).toBe(3);
    expect(ciclo.state).toBe('IN_REVIEW');
    expect(store.caso()!.estado).toBe('IN_REVIEW');
    expect(store.soloLectura()).toBe(true);
  });

  it('A4 · enviar con la revisión vencida activa el conflicto (ofrece recargar) y el caso sigue editable', async () => {
    const { servidor, store } = await abrir();
    servidor.otraSesionEscribe();
    const error = await store.enviarARevision().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(store.conflicto()).not.toBeNull();
    expect(store.conflicto()!.mensaje).toContain('Otra persona');
    expect(store.haySinGuardar()).toBe(true);
    expect(store.soloLectura()).toBe(false);
    // Recargar trae la versión del servidor y quita el aviso; entonces el envío sale.
    await store.recargar();
    expect(store.conflicto()).toBeNull();
    await store.enviarARevision();
    expect(store.soloLectura()).toBe(true);
  });

  it('A4 · los bloqueos de la compuerta (también un 409) NO son un conflicto de revisión', async () => {
    const { servidor, store } = await abrir();
    servidor.bloqueos = [{ code: 'CHECKLIST_INCOMPLETE', message: 'Falta la lista.' }];
    await store.enviarARevision().catch(() => undefined);
    expect(store.conflicto()).toBeNull();
  });

  it('un caso en revisión es de solo lectura: ninguna edición cambia el borrador ni llama al servidor', async () => {
    const { servidor, store } = await abrir('IN_REVIEW');
    expect(store.soloLectura()).toBe(true);
    const escena = store.caso()!.escenas[0];
    store.editarEscena(escena.id, { titulo: 'Otro título' });
    store.agregarEscena(escena.salaId, escena.id);
    store.agregarLinea(escena.id);
    await store.sincronizado();
    expect(store.caso()!.escenas[0].titulo).toBe(escena.titulo);
    expect(store.caso()!.escenas).toHaveLength(2);
    expect(servidor.llamadas).toEqual([]);
  });

  it('si la compuerta tiene bloqueadores el envío falla con ellos y el caso sigue editable', async () => {
    const { servidor, store } = await abrir();
    servidor.bloqueos = [{ code: 'VALIDATION_ERRORS', message: 'Tiene 1 error.', issues: [{ code: 'milestone-unreachable', severity: 'error', message: 'El hito no se puede cumplir.' }] }];
    const error = await store.enviarARevision().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(409);
    expect(store.soloLectura()).toBe(false);
  });

  it('la revisión con el servidor trae los hallazgos y el ciclo del caso', async () => {
    const { servidor, store } = await abrir();
    servidor.hallazgos = [{ code: 'scene-without-recommended', severity: 'error', message: 'Falta una.', nodeId: 1 }];
    const resultado = await store.revisarConServidor();
    expect(servidor.metodos).toEqual(['validateCase', 'lifecycle']);
    expect(resultado.hallazgos.map((h) => h.code)).toEqual(['scene-without-recommended']);
    expect(resultado.ciclo).toMatchObject({ state: 'DRAFT', allowedTransitions: ['submit'] });
  });

  it('la clave de una opción del servidor dice qué respuesta del borrador es', async () => {
    const { servidor, store } = await abrir();
    const origen = store.caso()!.escenas[0];
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Cuéntame.', clase: 'ACCEPTABLE', destinoId: store.caso()!.escenas[1].id });
    await store.sincronizado();
    const clave = servidor.editor.decisions[0].optionKey;
    expect(store.respuestaDeOpcion(clave)).toBe(id);
    expect(store.respuestaDeOpcion('no-existe')).toBeUndefined();
  });
});

describe('CasoStore · lista de verificación ética', () => {
  async function conLista(estado?: string) {
    TestBed.resetTestingModule();
    const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
    datos.editor.checklist = listaDelServidor(['contentOriginal']);
    if (estado) datos.editor.status = estado;
    const servidor = new ServidorFalso(datos, universidad);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
    const store = TestBed.inject(CasoStore);
    await store.cargar(CASO);
    servidor.llamadas.length = 0;
    return { servidor, store };
  }

  it('el borrador trae los ítems de la lista con su texto, si son obligatorios, si están cumplidos y quién los respalda', async () => {
    const { store } = await conLista();
    const lista = store.caso()!.lista!;
    expect(lista.items.map((i) => i.codigo)).toEqual(['contentOriginal', 'ethicsReviewed', 'safetyProtocols', 'noStigmatizing', 'triggerWarnings', 'accessibilityOk', 'scopeEducational']);
    expect(lista.items[0]).toMatchObject({ obligatorio: true, cumplido: true, respaldo: 'Declaración de quien autora el caso', respaldado: null });
    expect(lista.items[2]).toMatchObject({ respaldo: 'Lo comprueba el sistema', respaldado: false });
    expect(lista.items[6]).toMatchObject({ obligatorio: false, enBorrador: true });
    expect(lista.constanciaRegistrada).toBe(false);
  });

  it('marcar un ítem guarda toda la lista con la revisión vigente, por la misma cola que los demás cambios', async () => {
    const { servidor, store } = await conLista();
    store.marcarItemLista('ethicsReviewed', true);
    store.marcarItemLista('noStigmatizing', true);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateChecklist', 'updateChecklist']);
    const [primera, segunda] = servidor.llamadasA('updateChecklist');
    expect(primera.revision).toBe(3);
    expect(segunda.revision).toBe(4); // la que devolvió la anterior
    expect(segunda.args[0]).toEqual({
      contentOriginal: true, ethicsReviewed: true, safetyProtocols: false, noStigmatizing: true, triggerWarnings: false, accessibilityOk: false,
      scopeEducational: false,
    });
    expect(store.caso()!.lista!.items.filter((i) => i.cumplido).map((i) => i.codigo)).toEqual(['contentOriginal', 'ethicsReviewed', 'noStigmatizing']);
    expect(store.error()).toBeNull();
  });

  it('desmarcar un ítem y volver a marcarlo lo deja como estaba', async () => {
    const { servidor, store } = await conLista();
    store.marcarItemLista('contentOriginal', false);
    await store.sincronizado();
    expect((servidor.llamadasA('updateChecklist')[0].args[0] as Record<string, boolean>)['contentOriginal']).toBe(false);
    expect(store.caso()!.lista!.items[0].cumplido).toBe(false);
  });

  it('un caso en revisión no deja cambiar la lista', async () => {
    const { servidor, store } = await conLista('IN_REVIEW');
    store.marcarItemLista('ethicsReviewed', true);
    await store.sincronizado();
    expect(servidor.llamadas).toEqual([]);
    expect(store.caso()!.lista!.items[1].cumplido).toBe(false);
  });

  it('un ítem que la lista no tiene se ignora', async () => {
    const { servidor, store } = await conLista();
    store.marcarItemLista('no_existe', true);
    await store.sincronizado();
    expect(servidor.llamadas).toEqual([]);
  });
});
