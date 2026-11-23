import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { DecisionOptionUpsertRequest, EndingRule, NodeUpsertRequest } from '../../../core/models/simulation.model';
import type { Cambio } from '../ia/propuestas';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { CasoStore } from './caso.store';

const CASO = 41;

/** El store abierto desde el servidor en memoria; la propuesta nombra filas del servidor (escena, personaje, mapa…). */
async function abrir() {
  TestBed.resetTestingModule();
  const caso = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  const servidor = new ServidorFalso(caso, universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  const [consultorio, pasillo] = servidor.editor.nodes;
  const psicologa = servidor.editor.characters[0];
  return { servidor, store, consultorio, pasillo, psicologa, mapaConsultorio: servidor.editor.maps[0] };
}

describe('CasoStore · propuestas de la IA (con servidor)', () => {
  it('aplicar una propuesta sustituye los ids temporales por escenas reales y la guarda en orden, con las marcas', async () => {
    const { servidor, store, consultorio, pasillo, psicologa } = await abrir();
    const cambios: Cambio[] = [
      { op: 'add-scene', id: 'nueva-1', title: 'Dudar en la espera', narrative: 'La persona duda en la puerta.', intensity: 'HIGH', warningMessage: 'Habla de violencia.', afterNodeId: consultorio.id },
      { op: 'add-line', nodeId: 'nueva-1', characterId: psicologa.id, text: '¿Quieres contarme?', expression: 'preocupada' },
      { op: 'add-response', nodeId: consultorio.id, text: 'Te acompaño.', responseClass: 'RECOMMENDED', feedbackText: 'Da seguridad.', prohibitionReason: '', targetNodeId: 'nueva-1' },
      { op: 'add-response', nodeId: 'nueva-1', text: 'Apúrate.', responseClass: 'CONTRAINDICATED', feedbackText: 'Presiona.', prohibitionReason: 'Apura a la persona.', targetNodeId: pasillo.id },
    ];
    store.aplicarPropuesta(cambios, [true, true, true, true]);

    // En el borrador se ve de inmediato, todo marcado como sugerido por la IA
    const escenas = store.caso()!.escenas;
    expect(escenas).toHaveLength(3);
    expect(escenas.at(-1)).toMatchObject({ titulo: 'Dudar en la espera', marcaIa: true, intensidad: 'HIGH', advertencia: 'Habla de violencia.' });

    await store.sincronizado();
    expect(store.error()).toBeNull();
    expect(servidor.metodos).toEqual([
      'createNode', 'createMap', 'saveWorld', // la escena nueva
      'createDialogue', 'worldEditor', 'saveWorld', // su línea, en el guion que cuelga de una persona de la sala
      'createDecision', 'createDecision', // las dos respuestas, ya con la escena real como destino
      'saveWorld', // y sus elecciones en ese guion: sin ellas ninguna opción tendría por dónde elegirse
    ]);
    const nodo = servidor.llamadasA('createNode')[0].args[0] as NodeUpsertRequest;
    expect(nodo).toMatchObject({ aiSuggested: true, intensity: 'HIGH', warningMessage: 'Habla de violencia.', narrative: 'La persona duda en la puerta.' });
    const creada = servidor.editor.nodes.at(-1)!;
    const [primera, segunda] = servidor.llamadasA('createDecision').map((l) => l.args[0] as DecisionOptionUpsertRequest);
    expect(primera).toMatchObject({ sourceNodeId: consultorio.id, targetNodeId: creada.id, aiSuggested: true });
    expect(segunda).toMatchObject({ sourceNodeId: creada.id, targetNodeId: pasillo.id, responseClass: 'CONTRAINDICATED', prohibitionReason: 'Apura a la persona.', aiSuggested: true });
    expect(servidor.llamadasA('createDialogue')[0].args[1]).toMatchObject({ lines: [{ text: '¿Quieres contarme?', emotion: 'preocupada', aiSuggested: true }] });
  });

  it('una propuesta que no cuadra no cambia nada y lo dice', async () => {
    const { servidor, store } = await abrir();
    const antes = store.caso();
    expect(() => store.aplicarPropuesta([{ op: 'add-line', nodeId: 999, characterId: 1, text: '', expression: 'neutral' } as Cambio], [true])).toThrow();
    expect(store.caso()).toBe(antes);
    await store.sincronizado();
    expect(servidor.llamadas).toHaveLength(0);
  });

  it('cambiar la clase de una respuesta, su efecto en la persona y su hito actualiza la opción del servidor', async () => {
    const { servidor, store, consultorio, pasillo } = await abrir();
    const origen = store.caso()!.escenas.find((e) => e.id === String(consultorio.id))!;
    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: 'Hola', clase: 'ACCEPTABLE', destinoId: String(pasillo.id) });
    await store.sincronizado();
    const decision = servidor.editor.decisions[0];
    servidor.llamadas.length = 0;

    store.aplicarPropuesta([
      { op: 'set-response-class', decisionId: decision.id, responseClass: 'RISKY', prohibitionReason: '' },
      { op: 'set-persona-effect', decisionId: decision.id, bond: -1, activation: null },
      { op: 'mark-milestone', decisionId: decision.id, milestoneKey: 'valorar_el_riesgo' },
    ] as Cambio[], [true, true, true]);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateDecision']); // las tres partes viajan en una sola actualización
    expect(servidor.editor.decisions[0]).toMatchObject({ responseClass: 'RISKY', effects: { persona: { bond: -1 }, milestones: ['valorar_el_riesgo'] } });
  });

  it('un final propuesto pasa a modo propio y se guarda con su marca', async () => {
    const { servidor, store } = await abrir();
    store.aplicarPropuesta([
      { op: 'add-ending', key: 'se_va', title: 'Se va sin ayuda', message: 'Se fue.', tone: 'critical', when: { count: 'contraindicated', gte: 1 } },
    ] as Cambio[], [true]);
    await store.sincronizado();
    expect(store.caso()!.modoFinales).toBe('propio');
    expect(servidor.metodos).toEqual(['updateEndings']);
    // Los cuatro del modelo (sin marca) más el propuesto, antes del de por defecto: el caso no queda con un solo final.
    const finales = servidor.llamadas[0].args[0] as EndingRule[];
    expect(finales.map((f) => f.key)).toEqual(['critica', 'protectora', 'riesgo_persistente', 'se_va', 'con_brechas']);
    expect(finales.map((f) => f.aiSuggested === true)).toEqual([false, false, false, true, false]);
    expect(finales[3]).toMatchObject({ key: 'se_va', aiSuggested: true, when: { count: 'contraindicated', gte: 1 } });
    expect(servidor.editor.rules.endings).toHaveLength(5);
  });

  it('colocar y mover en una sala se guardan en el mapa, con la marca de la IA en lo que se tocó', async () => {
    const { servidor, store, psicologa, mapaConsultorio } = await abrir();
    const objeto = servidor.mundos.get(mapaConsultorio.nodeId)!.objects.find((o) => o.type === 'PROP')!;
    store.aplicarPropuesta([
      { op: 'place-character', mapId: mapaConsultorio.id, characterId: psicologa.id, x: 300, y: 350, expression: 'alegre' },
      { op: 'move', objectId: objeto.id, x: 420, y: 330 },
    ] as Cambio[], [true, true]);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['saveWorld']);
    const mundo = servidor.mundos.get(mapaConsultorio.nodeId)!;
    expect(mundo.objects.filter((o) => o.type === 'PERSON')).toHaveLength(2);
    expect(mundo.objects.find((o) => o.key === objeto.key)).toMatchObject({ x: 420, aiSuggested: true });
    expect(mundo.objects.filter((o) => o.type === 'PERSON').filter((o) => o.aiSuggested === true)).toHaveLength(1); // solo la que colocó la IA
    expect(mundo.objects.filter((o) => o.aiSuggested === true)).toHaveLength(2);
  });

  it('A7 · cambiar la intensidad de una escena que existía la marca en el servidor, y aceptarla la baja', async () => {
    const { servidor, store, consultorio } = await abrir();
    expect(servidor.editor.nodes[0].aiSuggested).toBe(false);
    store.aplicarPropuesta([{ op: 'set-intensity', nodeId: consultorio.id, intensity: 'HIGH', warningMessage: 'Habla de violencia.' }] as Cambio[], [true]);
    await store.sincronizado();
    expect((servidor.llamadasA('updateNode')[0].args[1] as NodeUpsertRequest).aiSuggested).toBe(true);
    expect(servidor.editor.nodes[0]).toMatchObject({ intensity: 'HIGH', aiSuggested: true });
    expect(store.caso()!.escenas[0].marcaIa).toBe(true);
    servidor.llamadas.length = 0;
    store.aceptarIa({ escenaId: store.caso()!.escenas[0].id });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['acceptAiNode']);
    expect(servidor.editor.nodes[0].aiSuggested).toBe(false);
  });

  it('A7 · cambiar la clase de una respuesta que existía la marca en el servidor, y aceptarla la baja', async () => {
    const { servidor, store, consultorio, pasillo } = await abrir();
    const origen = store.caso()!.escenas.find((e) => e.id === String(consultorio.id))!;
    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: 'Hola', clase: 'ACCEPTABLE', destinoId: String(pasillo.id) });
    await store.sincronizado();
    const decision = servidor.editor.decisions[0];
    expect(decision.aiSuggested).toBe(false);
    store.aplicarPropuesta([{ op: 'set-response-class', decisionId: decision.id, responseClass: 'RISKY', prohibitionReason: '' }] as Cambio[], [true]);
    await store.sincronizado();
    expect((servidor.llamadasA('updateDecision').at(-1)!.args[1] as DecisionOptionUpsertRequest).aiSuggested).toBe(true);
    expect(servidor.editor.decisions[0]).toMatchObject({ responseClass: 'RISKY', aiSuggested: true });
    servidor.llamadas.length = 0;
    store.aceptarIa({ escenaId: origen.id, respuestaId: r });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['acceptAiDecision']);
    expect(servidor.editor.decisions[0].aiSuggested).toBe(false);
  });

  it('A7 · aceptar una persona que colocó la IA baja la marca del objeto en el servidor, y moverla después no la vuelve a marcar', async () => {
    const { servidor, store, psicologa, mapaConsultorio } = await abrir();
    store.aplicarPropuesta([
      { op: 'place-character', mapId: mapaConsultorio.id, characterId: psicologa.id, x: 300, y: 350, expression: 'alegre' },
    ] as Cambio[], [true]);
    await store.sincronizado();
    const sala = store.caso()!.salas.find((x) => x.id === 'consultorio')!;
    const puesta = sala.personajes.at(-1)!;
    expect(puesta.marcaIa).toBe(true);
    const enServidor = () => servidor.mundos.get(mapaConsultorio.nodeId)!.objects.find((o) => o.key === puesta.clave)!;
    expect(enServidor().aiSuggested).toBe(true);

    servidor.llamadas.length = 0;
    store.aceptarIa({ salaId: 'consultorio', tipo: 'personaje', indice: sala.personajes.length - 1 });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['acceptAiObject']);
    expect(servidor.llamadasA('acceptAiObject')[0].args[0]).toBe(enServidor().id);
    expect(enServidor().aiSuggested).toBe(false);
    expect(store.caso()!.salas.find((x) => x.id === 'consultorio')!.personajes.at(-1)!.marcaIa).toBe(false);

    // mover algo después no la vuelve a marcar (la copia guardada del mapa en la sesión todavía dice que sí)
    const indice = store.caso()!.salas.find((x) => x.id === 'consultorio')!.personajes.length - 1;
    store.moverElemento('consultorio', 'personaje', indice, 340, 350);
    await store.sincronizado();
    expect(enServidor()).toMatchObject({ x: 340, aiSuggested: false });
  });

  it('aceptar una escena creada por la IA le quita la marca', async () => {
    const { servidor, store, consultorio } = await abrir();
    store.aplicarPropuesta([
      { op: 'add-scene', id: 'nueva-1', title: 'Nueva', narrative: '', intensity: 'MEDIUM', warningMessage: '', afterNodeId: consultorio.id },
    ] as Cambio[], [true]);
    await store.sincronizado();
    const nueva = store.caso()!.escenas.at(-1)!;
    expect(nueva.marcaIa).toBe(true);
    servidor.llamadas.length = 0;
    store.aceptarIa({ escenaId: nueva.id });
    await store.sincronizado();
    expect(store.caso()!.escenas.at(-1)!.marcaIa).toBe(false);
    expect(servidor.metodos).toEqual(['acceptAiNode']);
    expect(servidor.editor.nodes.at(-1)!.aiSuggested).toBe(false);
  });
});
