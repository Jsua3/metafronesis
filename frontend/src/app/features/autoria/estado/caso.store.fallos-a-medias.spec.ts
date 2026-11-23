import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { Cambio } from '../ia/propuestas';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { CasoStore } from './caso.store';

/**
 * A6 · un cambio de varias llamadas que falla en la segunda: el servidor conserva lo que ya se guardó, así que el editor
 * muestra lo que quedó (no lo de antes) y lo dice. Un fallo que no alcanzó a guardar nada sigue diciendo «Lo dejamos como estaba».
 */
const CASO = 41;
const A_MEDIAS = 'Quedó a medias: esto es lo que se guardó.';

async function abrir() {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 }), universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  return { servidor, store };
}

const escenaDe = (store: CasoStore, salaId: string) => store.caso()!.escenas.find((e) => e.salaId === salaId)!;

describe('A6 · fallos a medias en cambios de varios pasos', () => {
  it('una respuesta que abre una escena nueva y falla al guardar la respuesta: la escena que quedó en el sistema se ve', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const pasillo = escenaDe(store, 'pasillo');
    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: 'Cuéntame.', clase: 'RECOMMENDED', destinoId: pasillo.id });
    await store.sincronizado();
    servidor.llamadas.length = 0;
    servidor.fallar('updateDecision', 500);

    const nueva = store.respuestaAEscenaNueva(origen.id, r);
    await store.sincronizado();

    expect(servidor.editor.nodes).toHaveLength(3); // la escena sí se creó
    const escenas = store.caso()!.escenas;
    expect(escenas).toHaveLength(3);
    expect(escenas.some((e) => e.id === nueva)).toBe(true); // con el mismo id que la pantalla recibió
    expect(store.error()).toContain(A_MEDIAS);
    expect(store.error()).not.toContain('Lo dejamos como estaba');
    // la respuesta sigue llevando a donde la tiene el sistema
    expect(escenas.find((e) => e.id === origen.id)!.respuestas.find((x) => x.id === r)!.destinoId).toBe(pasillo.id);
    expect(store.conflicto()).toBeNull();
  });

  it('duplicar una escena con guion y fallar al guardar el guion: queda la copia sin guion y lo dice', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    store.agregarLinea(origen.id);
    store.editarLinea(origen.id, store.caso()!.escenas.find((e) => e.id === origen.id)!.lineas[0].id, { texto: 'Pasa, por favor.' });
    await store.sincronizado();
    servidor.llamadas.length = 0;
    servidor.fallar('createDialogue', 500);

    const copia = store.duplicarEscena(origen.id);
    await store.sincronizado();

    const escenas = store.caso()!.escenas;
    const laCopia = escenas.find((e) => e.id === copia);
    expect(laCopia).toBeDefined();
    expect(laCopia!.lineas).toEqual([]); // el guion no se alcanzó a guardar
    expect(escenas.find((e) => e.id === origen.id)!.lineas[0].texto).toBe('Pasa, por favor.');
    expect(store.error()).toContain(A_MEDIAS);
  });

  it('aplicar una propuesta que falla a medias: se ve lo que se guardó y «Deshacer lo aplicado» se apaga', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const psicologa = servidor.editor.characters[0];
    servidor.fallar('createDialogue', 500);

    store.aplicarPropuesta([
      { op: 'add-scene', id: 'nueva-1', title: 'Escena del asistente', narrative: 'Una narración.', intensity: 'MEDIUM', warningMessage: '', afterNodeId: Number(origen.id) },
      { op: 'add-line', nodeId: 'nueva-1', characterId: psicologa.id, text: 'Hola.', expression: 'neutral' },
    ] as Cambio[], [true, true]);
    expect(store.puedeDeshacerPropuesta()).toBe(true); // mientras viaja, sí
    await store.sincronizado();

    expect(store.puedeDeshacerPropuesta()).toBe(false);
    const escenas = store.caso()!.escenas;
    expect(escenas).toHaveLength(3);
    expect(escenas.at(-1)!.titulo).toBe('Escena del asistente');
    expect(escenas.at(-1)!.lineas).toEqual([]);
    expect(store.error()).toContain(A_MEDIAS);
  });

  it('agregar un hito en modo automático con textos propios: si fallan los finales, el hito que sí se guardó se ve', async () => {
    const { servidor, store } = await abrir();
    store.editarTextoPlantilla('protectora', { nombre: 'Con buen cuidado' });
    await store.sincronizado();
    const hitosAntes = store.caso()!.hitos.length;
    servidor.llamadas.length = 0;
    servidor.fallar('updateEndings', 500);

    store.agregarHito({ clave: 'abrir_la_conversacion', nombre: 'Abrir la conversación', descripcion: '', decisivo: true });
    await store.sincronizado();

    expect(servidor.editor.rules.milestones).toHaveLength(hitosAntes + 1);
    expect(store.caso()!.hitos).toHaveLength(hitosAntes + 1);
    expect(store.caso()!.hitos.at(-1)!.clave).toBe('abrir_la_conversacion');
    expect(store.error()).toContain(A_MEDIAS);
  });

  it('si el primer paso falla y no queda nada guardado, el aviso sigue siendo «Lo dejamos como estaba»', async () => {
    const { servidor, store } = await abrir();
    const antes = store.caso()!.escenas.length;
    servidor.fallar('createMap', 400, 'No se pudo crear el mapa.');
    store.agregarEscena('consultorio');
    await store.sincronizado();
    expect(store.caso()!.escenas).toHaveLength(antes);
    expect(store.error()).toContain('Lo dejamos como estaba');
    expect(store.error()).not.toContain(A_MEDIAS);
  });

  it('lo que el docente aún no completó (una respuesta sin clase) no se pierde al releer el caso', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const pendiente = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, pendiente, { texto: 'Todavía sin clase' });
    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: 'Completa.', clase: 'RECOMMENDED', destinoId: escenaDe(store, 'pasillo').id });
    await store.sincronizado();
    servidor.fallar('updateDecision', 500);

    store.respuestaAEscenaNueva(origen.id, r);
    await store.sincronizado();

    expect(store.error()).toContain(A_MEDIAS);
    const respuestas = store.caso()!.escenas.find((e) => e.id === origen.id)!.respuestas;
    expect(respuestas.find((x) => x.id === pendiente)?.texto).toBe('Todavía sin clase');
    expect(store.sinGuardar().map((p) => p.respuestaId)).toContain(pendiente);
  });
});
