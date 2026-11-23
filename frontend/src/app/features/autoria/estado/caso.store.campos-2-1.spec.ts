import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { DecisionOptionUpsertRequest, HintUpsertRequest, NodeUpsertRequest } from '../../../core/models/simulation.model';
import type { CasoBorrador, Comentario } from '../modelo/caso';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { CasoStore } from './caso.store';

const CASO = 41;

function montar() {
  TestBed.resetTestingModule();
  const caso = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  const servidor = new ServidorFalso(caso, universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  return { servidor, store: TestBed.inject(CasoStore) };
}

const borrador = (store: CasoStore): CasoBorrador => store.caso()!;
const escenaDe = (store: CasoStore, salaId: string) => borrador(store).escenas.find((e) => e.salaId === salaId)!;

/** Un caso abierto con una respuesta ya guardada (clase y destino) en la escena del consultorio. */
async function conRespuestaGuardada() {
  const { servidor, store } = montar();
  await store.cargar(CASO);
  const consultorio = escenaDe(store, 'consultorio');
  const pasillo = escenaDe(store, 'pasillo');
  const respuesta = store.agregarRespuesta(consultorio.id);
  store.editarRespuesta(consultorio.id, respuesta, { texto: 'Te escucho.', clase: 'RECOMMENDED', retroalimentacion: 'Da seguridad.' });
  store.conectar(respuesta, pasillo.id);
  await store.sincronizado();
  expect(store.error()).toBeNull();
  servidor.llamadas.length = 0;
  return { servidor, store, consultorio, pasillo, respuesta };
}

describe('CasoStore con la API · campos 2.1', () => {
  it('editar el requisito manda solo requires en el PUT de la decisión, con la revisión que devolvió la anterior', async () => {
    const { servidor, store, consultorio, respuesta } = await conRespuestaGuardada();
    const antes = servidor.editor.revision;
    const requisito = { all: [{ talked: 'psicologa-bienestar' }, { milestone: 'valorar_riesgo' }] };

    store.editarRequisito(consultorio.id, respuesta, requisito);
    await store.sincronizado();

    const puts = servidor.llamadasA('updateDecision');
    expect(puts).toHaveLength(1);
    expect(puts[0].revision).toBe(antes);
    const cuerpo = puts[0].args[1] as DecisionOptionUpsertRequest;
    expect(cuerpo.requires).toEqual(requisito);
    expect(cuerpo).not.toHaveProperty('reaction');
    expect(servidor.editor.decisions.at(-1)!.requires).toEqual(requisito);

    // Una segunda edición viaja con la revisión que dejó la primera.
    const intermedia = servidor.editor.revision;
    store.editarRequisito(consultorio.id, respuesta, { talked: 'psicologa-bienestar' });
    await store.sincronizado();
    expect(servidor.llamadasA('updateDecision').at(-1)!.revision).toBe(intermedia);
    expect(store.error()).toBeNull();
  });

  it('editar la reacción manda solo reaction, sin las claves vacías, y {} la limpia', async () => {
    const { servidor, store, consultorio, respuesta } = await conRespuestaGuardada();

    store.editarReaccion(consultorio.id, respuesta, { linea: 'Gracias.', gesto: 'asiente', personaje: '' });
    await store.sincronizado();
    const cuerpo = servidor.llamadasA('updateDecision')[0].args[1] as DecisionOptionUpsertRequest;
    expect(cuerpo.reaction).toEqual({ linea: 'Gracias.', gesto: 'asiente' });
    expect(cuerpo).not.toHaveProperty('requires');

    store.editarReaccion(consultorio.id, respuesta, {});
    await store.sincronizado();
    expect((servidor.llamadasA('updateDecision')[1].args[1] as DecisionOptionUpsertRequest).reaction).toEqual({});
    expect(servidor.editor.decisions.at(-1)!.reaction).toEqual({});
    expect(escenaDe(store, 'consultorio').respuestas[0].reaccion).toEqual({});
  });

  it('una respuesta sin clase guarda su reacción y su requisito en el borrador y los manda al clasificarla', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    servidor.llamadas.length = 0;
    const consultorio = escenaDe(store, 'consultorio');
    const pasillo = escenaDe(store, 'pasillo');
    const id = store.agregarRespuesta(consultorio.id);
    store.editarRespuesta(consultorio.id, id, { texto: 'Cuéntame.' });
    store.editarReaccion(consultorio.id, id, { linea: 'Me cuesta hablar.', emocion: 'triste' });
    store.editarRequisito(consultorio.id, id, { talked: 'psicologa-bienestar' });
    await store.sincronizado();
    expect(servidor.llamadasA('createDecision')).toHaveLength(0); // aún sin clase ni destino
    expect(escenaDe(store, 'consultorio').respuestas[0]).toMatchObject({
      reaccion: { linea: 'Me cuesta hablar.', emocion: 'triste' }, requiere: { talked: 'psicologa-bienestar' },
    });

    store.editarRespuesta(consultorio.id, id, { clase: 'ACCEPTABLE', retroalimentacion: 'Bien.' });
    store.conectar(id, pasillo.id);
    await store.sincronizado();

    const creada = servidor.llamadasA('createDecision')[0].args[0] as DecisionOptionUpsertRequest;
    expect(creada.reaction).toEqual({ linea: 'Me cuesta hablar.', emocion: 'triste' });
    expect(creada.requires).toEqual({ talked: 'psicologa-bienestar' });
    expect(store.error()).toBeNull();
  });

  it('editar el objetivo manda solo goal en el PUT de la escena y no repite lo que no cambió', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    servidor.llamadas.length = 0;
    const consultorio = escenaDe(store, 'consultorio');

    store.editarObjetivo(consultorio.id, 'Escuchar sin juzgar.');
    await store.sincronizado();
    const cuerpo = servidor.llamadasA('updateNode')[0].args[1] as NodeUpsertRequest;
    expect(cuerpo.goal).toBe('Escuchar sin juzgar.');
    expect(cuerpo).not.toHaveProperty('comments');

    store.editarObjetivo(consultorio.id, 'Escuchar sin juzgar.'); // igual: nada que decirle al servidor
    await store.sincronizado();
    expect(servidor.llamadasA('updateNode')).toHaveLength(1);

    store.editarObjetivo(consultorio.id, '');
    await store.sincronizado();
    expect((servidor.llamadasA('updateNode')[1].args[1] as NodeUpsertRequest).goal).toBe('');
    expect(servidor.editor.nodes.find((n) => String(n.id) === consultorio.id)!.goal).toBe('');
  });

  it('fijarPistas crea, cambia y borra para dejar exactamente esas', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    const consultorio = escenaDe(store, 'consultorio');
    const mapa = servidor.editor.maps.find((m) => String(m.nodeId) === consultorio.id)!;
    servidor.llamadas.length = 0;

    store.fijarPistas(consultorio.id, ['Mira la carpeta.', 'Pregunta por la familia.']);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['createHint', 'createHint']);
    expect((servidor.llamadasA('createHint')[0].args[1] as HintUpsertRequest).text).toBe('Mira la carpeta.');
    expect(servidor.editor.hints.filter((h) => h.mapId === mapa.id).map((h) => h.text)).toEqual(['Mira la carpeta.', 'Pregunta por la familia.']);

    servidor.llamadas.length = 0;
    store.fijarPistas(consultorio.id, ['Mira la carpeta.', 'Habla con calma.', 'Revisa la ventana.']);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateHint', 'createHint']); // la primera no cambió
    expect(servidor.editor.hints.filter((h) => h.mapId === mapa.id).map((h) => h.text))
      .toEqual(['Mira la carpeta.', 'Habla con calma.', 'Revisa la ventana.']);

    servidor.llamadas.length = 0;
    store.fijarPistas(consultorio.id, ['Revisa la ventana.']);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateHint', 'deleteHint', 'deleteHint']);
    expect(servidor.editor.hints.filter((h) => h.mapId === mapa.id).map((h) => h.text)).toEqual(['Revisa la ventana.']);
    expect(escenaDe(store, 'consultorio').pistas!.map((p) => p.texto)).toEqual(['Revisa la ventana.']);

    store.fijarPistas(consultorio.id, []);
    await store.sincronizado();
    expect(servidor.editor.hints.filter((h) => h.mapId === mapa.id)).toEqual([]);
    expect(store.error()).toBeNull();
  });

  it('una pista en blanco se queda en el borrador y no se manda', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    const consultorio = escenaDe(store, 'consultorio');
    servidor.llamadas.length = 0;
    store.fijarPistas(consultorio.id, ['Mira la carpeta.', '']);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['createHint']);
    expect(escenaDe(store, 'consultorio').pistas).toHaveLength(2);
    expect(store.error()).toBeNull();
  });

  it('una pista nueva conserva su id mientras su cambio espera en la cola y después de guardarse', async () => {
    // El campo de la pista se identifica por su id: si el id cambia al guardar, el campo se rehace y se pierde lo que la
    // docente estaba escribiendo (solo se guarda al salir del campo).
    const { store } = montar();
    await store.cargar(CASO);
    const consultorio = escenaDe(store, 'consultorio');
    store.editarObjetivo(consultorio.id, 'Que el estudiante escuche antes de orientar.'); // otro cambio en vuelo
    store.fijarPistas(consultorio.id, ['Mira la carpeta.', '']);
    const ids = escenaDe(store, 'consultorio').pistas!.map((p) => p.id);
    await store.sincronizado();
    expect(escenaDe(store, 'consultorio').pistas!.map((p) => p.id)).toEqual(ids);
    expect(store.error()).toBeNull();
  });

  it('fijarComentarios manda comments, y con 7 lanza y no cambia el borrador', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    servidor.llamadas.length = 0;
    const consultorio = escenaDe(store, 'consultorio');
    const comentario = (n: number): Comentario => ({ personaje: 'psicologa-bienestar', linea: `Comentario ${n}.` });

    store.fijarComentarios(consultorio.id, [comentario(1), { ...comentario(2), cuando: { talked: 'psicologa-bienestar' }, emocion: 'triste' }]);
    await store.sincronizado();
    const cuerpo = servidor.llamadasA('updateNode')[0].args[1] as NodeUpsertRequest;
    expect(cuerpo.comments).toHaveLength(2);
    expect(cuerpo).not.toHaveProperty('goal');

    const antes = structuredClone(escenaDe(store, 'consultorio').comentarios);
    const llamadas = servidor.llamadas.length;
    expect(() => store.fijarComentarios(consultorio.id, Array.from({ length: 7 }, (_, i) => comentario(i)))).toThrow();
    await store.sincronizado();
    expect(escenaDe(store, 'consultorio').comentarios).toEqual(antes);
    expect(servidor.llamadas).toHaveLength(llamadas);
  });

  it('volver a fijar la lista anterior de comentarios la guarda', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    const consultorio = escenaDe(store, 'consultorio');
    store.fijarComentarios(consultorio.id, [{ personaje: 'psicologa-bienestar', linea: 'Hola.' }]);
    await store.sincronizado();
    servidor.llamadas.length = 0;

    // El historial del store solo cubre salas: volver a una lista anterior es fijarla otra vez, y se guarda como cualquier otro cambio.
    const anterior = structuredClone(escenaDe(store, 'consultorio').comentarios!);
    store.fijarComentarios(consultorio.id, [{ personaje: 'psicologa-bienestar', linea: 'Otra cosa.' }]);
    store.fijarComentarios(consultorio.id, anterior);
    await store.sincronizado();

    expect(escenaDe(store, 'consultorio').comentarios).toEqual([{ personaje: 'psicologa-bienestar', linea: 'Hola.' }]);
    const ultimo = servidor.llamadasA('updateNode').at(-1)!.args[1] as NodeUpsertRequest;
    expect(ultimo.comments).toEqual([{ personaje: 'psicologa-bienestar', linea: 'Hola.' }]);
    expect(servidor.editor.nodes.find((n) => String(n.id) === consultorio.id)!.comments).toEqual([{ personaje: 'psicologa-bienestar', linea: 'Hola.' }]);
  });

  it('el 400 de los comentarios no se lleva el objetivo ni el título que esperaban en la cola', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    const consultorio = escenaDe(store, 'consultorio');
    servidor.llamadas.length = 0;

    // Tres cambios de la misma escena en la cola: el 1.º sale ya; el objetivo y los comentarios esperan, cada uno con su clave.
    servidor.fallar('updateNode', 400, 'Un comentario no puede superar los 400 caracteres.', { campo: 'comments', saltar: 2 });
    store.editarEscena(consultorio.id, { titulo: 'Consultorio nuevo' });
    store.editarObjetivo(consultorio.id, 'Escuchar.');
    store.fijarComentarios(consultorio.id, [{ personaje: 'psicologa-bienestar', linea: 'x'.repeat(401) }]);
    await store.sincronizado();

    expect(servidor.llamadasA('updateNode')).toHaveLength(3);
    expect(escenaDe(store, 'consultorio').comentarios).toEqual([]);
    expect(escenaDe(store, 'consultorio').objetivo).toBe('Escuchar.');
    expect(escenaDe(store, 'consultorio').titulo).toBe('Consultorio nuevo');
    expect(servidor.editor.nodes.find((n) => String(n.id) === consultorio.id)!.goal).toBe('Escuchar.');
    expect(store.error()).toContain('Un comentario no puede superar los 400 caracteres.');
  });

  it('duplicar una escena con pistas las guarda en el servidor: borrador y servidor coinciden', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    const consultorio = escenaDe(store, 'consultorio');
    store.fijarPistas(consultorio.id, ['Mira la carpeta.', 'Habla con calma.']);
    await store.sincronizado();
    const mapaOriginal = servidor.editor.maps.find((m) => String(m.nodeId) === consultorio.id)!;
    servidor.llamadas.length = 0;

    const copiaId = store.duplicarEscena(consultorio.id);
    const idsAlDuplicar = borrador(store).escenas.find((e) => e.id === copiaId)!.pistas!.map((p) => p.id);
    await store.sincronizado();
    expect(store.error()).toBeNull();

    const copia = borrador(store).escenas.find((e) => e.id === copiaId)!;
    expect(copia.pistas!.map((p) => p.texto)).toEqual(['Mira la carpeta.', 'Habla con calma.']);
    expect(copia.pistas!.map((p) => p.id)).not.toEqual(consultorio.pistas!.map((p) => p.id)); // ids propios
    expect(copia.pistas!.map((p) => p.id)).toEqual(idsAlDuplicar); // y los mismos que tuvo al duplicarse (la cola reaplica el cambio)
    expect(servidor.metodos.filter((m) => m === 'createHint')).toHaveLength(2);
    const mapaCopia = servidor.editor.maps.find((m) => m.id !== mapaOriginal.id && servidor.editor.hints.some((h) => h.mapId === m.id))!;
    expect(servidor.editor.hints.filter((h) => h.mapId === mapaCopia.id).map((h) => h.text)).toEqual(['Mira la carpeta.', 'Habla con calma.']);
    expect(servidor.editor.hints.filter((h) => h.mapId === mapaOriginal.id).map((h) => h.text)).toEqual(['Mira la carpeta.', 'Habla con calma.']);
  });

  it('un 400 con field comments revierte solo ese cambio y muestra el mensaje del servidor', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    const consultorio = escenaDe(store, 'consultorio');
    store.editarObjetivo(consultorio.id, 'Escuchar.');
    await store.sincronizado();

    servidor.fallar('updateNode', 400, 'Un comentario no puede superar los 400 caracteres.', { campo: 'comments' });
    store.fijarComentarios(consultorio.id, [{ personaje: 'psicologa-bienestar', linea: 'x'.repeat(401) }]);
    await store.sincronizado();

    expect(escenaDe(store, 'consultorio').comentarios).toEqual([]);
    expect(escenaDe(store, 'consultorio').objetivo).toBe('Escuchar.'); // lo anterior queda
    expect(store.error()).toContain('Un comentario no puede superar los 400 caracteres.');
    expect(store.conflicto()).toBeNull();
  });
});
