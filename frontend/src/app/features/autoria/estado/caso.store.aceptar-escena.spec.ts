import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { Cambio } from '../ia/propuestas';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { CasoStore } from './caso.store';

const CASO = 41;

/**
 * «Aceptar toda la escena»: una sola operación que baja las marcas de la escena, sus líneas, sus respuestas y las personas
 * marcadas de su sala, con las rutas de aceptar que ya existen, una tras otra.
 */
async function abrir() {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 }), universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  const [consultorio, pasillo] = servidor.editor.nodes;
  const psicologa = servidor.editor.characters[0];
  const mapaConsultorio = servidor.editor.maps[0];
  // Una escena con las cuatro clases de partes sugeridas: la escena misma, una línea, una respuesta y una persona de su sala.
  store.aplicarPropuesta([
    { op: 'set-intensity', nodeId: consultorio.id, intensity: 'HIGH', warningMessage: 'Habla de violencia.' },
    { op: 'add-line', nodeId: consultorio.id, characterId: psicologa.id, text: '¿Quieres contarme?', expression: 'preocupada' },
    { op: 'add-response', nodeId: consultorio.id, text: 'Te acompaño.', responseClass: 'RECOMMENDED', feedbackText: 'Da seguridad.', prohibitionReason: '', targetNodeId: pasillo.id },
    { op: 'place-character', mapId: mapaConsultorio.id, characterId: psicologa.id, x: 300, y: 350, expression: 'alegre' },
  ] as Cambio[], [true, true, true, true]);
  await store.sincronizado();
  expect(store.error()).toBeNull();
  servidor.llamadas.length = 0;
  const escenaId = String(consultorio.id);
  const marcas = () => {
    const e = store.caso()!.escenas.find((x) => x.id === escenaId)!;
    const sala = store.caso()!.salas.find((s) => s.id === e.salaId)!;
    return { escena: e.marcaIa === true, lineas: e.lineas.filter((l) => l.marcaIa).length, respuestas: e.respuestas.filter((r) => r.marcaIa).length, personas: sala.personajes.filter((p) => p.marcaIa).length };
  };
  const enServidor = () => ({
    nodo: servidor.editor.nodes[0].aiSuggested,
    decisiones: servidor.editor.decisions.filter((d) => d.aiSuggested).length,
    objetos: servidor.mundos.get(consultorio.id)!.objects.filter((o) => o.aiSuggested === true).length,
    lineas: servidor.mundos.get(consultorio.id)!.dialogues.flatMap((d) => d.lines).filter((l) => l.aiSuggested).length,
  });
  return { servidor, store, escenaId, marcas, enServidor };
}

describe('CasoStore · aceptar toda la escena sugerida por la IA', () => {
  it('cuenta las partes: la escena, sus líneas, sus respuestas y las personas marcadas de su sala', async () => {
    const { store, escenaId, marcas } = await abrir();
    expect(marcas()).toEqual({ escena: true, lineas: 1, respuestas: 1, personas: 1 });
    expect(store.partesIaDeEscena(escenaId)).toBe(4);
    expect(store.partesIaDeEscena('no-existe')).toBe(0);
  });

  it('aceptar toda la escena baja escena, líneas, respuestas y personas, y llama a cada ruta una vez', async () => {
    const { servidor, store, escenaId, marcas, enServidor } = await abrir();
    store.aceptarEscenaIa(escenaId);
    // en el borrador, al instante
    expect(marcas()).toEqual({ escena: false, lineas: 0, respuestas: 0, personas: 0 });
    expect(store.partesIaDeEscena(escenaId)).toBe(0);
    await store.sincronizado();
    expect(store.error()).toBeNull();
    // y en el servidor, cada ruta una vez y en serie: escena, guion, respuesta, persona
    const aceptar = servidor.metodos.filter((m) => m.startsWith('acceptAi'));
    expect(aceptar).toEqual(['acceptAiNode', 'acceptAiDecision', 'acceptAiObject']);
    expect(servidor.llamadasA('updateDialogue').length + servidor.llamadasA('createDialogue').length).toBe(1);
    expect(servidor.metodos.indexOf('acceptAiNode')).toBeLessThan(servidor.metodos.indexOf('acceptAiDecision'));
    expect(enServidor()).toEqual({ nodo: false, decisiones: 0, objetos: 0, lineas: 0 });
    // cada escritura mandó la revisión que devolvió la anterior
    const revisiones = servidor.llamadas.filter((l) => l.revision !== undefined).map((l) => l.revision!);
    expect(revisiones).toEqual([...revisiones].sort((a, b) => a - b));
    expect(new Set(revisiones).size).toBe(revisiones.length);
  });

  it('con nada que aceptar no hace nada ni llama al servidor', async () => {
    const { servidor, store, escenaId } = await abrir();
    store.aceptarEscenaIa(escenaId);
    await store.sincronizado();
    servidor.llamadas.length = 0;
    store.aceptarEscenaIa(escenaId);
    await store.sincronizado();
    expect(servidor.llamadas).toEqual([]);
    expect(store.error()).toBeNull();
  });

  it('si una ruta falla a la mitad, lo aceptado queda y el aviso dice cuántas faltan; volver a pulsar termina', async () => {
    const { servidor, store, escenaId, marcas, enServidor } = await abrir();
    servidor.fallar('acceptAiDecision', 500);
    store.aceptarEscenaIa(escenaId);
    await store.sincronizado();
    // la escena (1) y la línea (1) ya estaban aceptadas; faltan la respuesta y la persona
    expect(store.error()).toContain('Se aceptaron 2 de 4 partes. Vuelve a pulsar para terminar.');
    expect(enServidor()).toMatchObject({ nodo: false, lineas: 0, decisiones: 1 });
    expect(marcas()).toEqual({ escena: false, lineas: 0, respuestas: 1, personas: 1 });
    expect(store.partesIaDeEscena(escenaId)).toBe(2);
    expect(store.conflicto()).toBeNull();

    servidor.llamadas.length = 0;
    store.aceptarEscenaIa(escenaId);
    await store.sincronizado();
    expect(servidor.metodos.filter((m) => m.startsWith('acceptAi'))).toEqual(['acceptAiDecision', 'acceptAiObject']); // solo lo que faltaba
    expect(marcas()).toEqual({ escena: false, lineas: 0, respuestas: 0, personas: 0 });
    expect(enServidor()).toEqual({ nodo: false, decisiones: 0, objetos: 0, lineas: 0 });
  });

  it('si falla la primera ruta, el aviso dice que no se aceptó ninguna y todo sigue marcado', async () => {
    const { servidor, store, escenaId, marcas } = await abrir();
    servidor.fallar('acceptAiNode', 500);
    store.aceptarEscenaIa(escenaId);
    await store.sincronizado();
    expect(store.error()).toContain('Se aceptaron 0 de 4 partes. Vuelve a pulsar para terminar.');
    expect(marcas()).toEqual({ escena: true, lineas: 1, respuestas: 1, personas: 1 });
  });

  it('las respuestas guardadas de una escena salen por su número del servidor, también las creadas en esta visita', async () => {
    const { servidor, store, escenaId } = await abrir();
    const [creada] = store.caso()!.escenas.find((e) => e.id === escenaId)!.respuestas.map((r) => r.id);
    expect(store.respuestasGuardadasDe(escenaId)).toEqual([creada]);
    const otra = store.agregarRespuesta(escenaId); // en pantalla, sin guardar: no cuenta
    expect(store.respuestasGuardadasDe(escenaId)).toEqual([creada]);
    expect(otra).not.toBe(creada);
    expect(servidor.editor.decisions).toHaveLength(1);
    expect(store.respuestasGuardadasDe('no-existe')).toEqual([]);
  });

  it('un choque de revisión sigue siendo un choque, no un «a medias»', async () => {
    const { servidor, store, escenaId } = await abrir();
    servidor.fallar('acceptAiDecision', 409, 'Otra persona cambió el caso.');
    store.aceptarEscenaIa(escenaId);
    await store.sincronizado();
    expect(store.error() ?? '').not.toContain('Se aceptaron');
  });
});
