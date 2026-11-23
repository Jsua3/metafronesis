import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { DecisionOptionUpsertRequest, EndingRule, NodeUpsertRequest, WorldRoomSaveRequest } from '../../../core/models/simulation.model';
import type { CasoBorrador, ClaseRespuesta } from '../modelo/caso';
import { casoCopiadoDeLugar, casoSinLugar } from '../testing/caso-api';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';
import { CasoStore } from './caso.store';

const CASO = 41;

/** El store contra un servidor en memoria. `lugar` es lo que responde la biblioteca. */
function montar(opciones: { sinLugar?: boolean } = {}) {
  TestBed.resetTestingModule();
  const caso = opciones.sinLugar ? casoSinLugar() : casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  const servidor = new ServidorFalso(caso, opciones.sinLugar ? null : universidad);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
  return { servidor, store: TestBed.inject(CasoStore) };
}

async function abrir(opciones: { sinLugar?: boolean } = {}) {
  const m = montar(opciones);
  await m.store.cargar(opciones.sinLugar ? 7 : CASO);
  m.servidor.llamadas.length = 0;
  return m;
}

const caso = (store: CasoStore): CasoBorrador => store.caso()!;
const sala = (store: CasoStore, id: string) => caso(store).salas.find((s) => s.id === id)!;
const escenaDe = (store: CasoStore, salaId: string) => caso(store).escenas.find((e) => e.salaId === salaId)!;

describe('CasoStore con la API · abrir un caso', () => {
  it('cargar lee el caso, el mundo de cada mapa y el lugar, y lo deja como borrador', async () => {
    const { servidor, store } = montar();
    await store.cargar(CASO);
    expect(servidor.metodos).toEqual(['caseEditor', 'worldEditor', 'worldEditor', 'libraryPlace']);
    expect(caso(store).id).toBe(String(CASO));
    expect(caso(store).revision).toBe(3);
    expect(caso(store).lugarId).toBe('universidad');
    expect(caso(store).salas.map((s) => s.id)).toEqual(['consultorio', 'pasillo']);
    expect(store.cargando()).toBe(false);
    expect(store.errorDeCarga()).toBeNull();
  });

  it('si el caso no se puede leer, lo dice sin dejar un caso a medias', async () => {
    const { servidor, store } = montar();
    servidor.fallar('caseEditor', 404);
    await store.cargar(CASO);
    expect(store.caso()).toBeNull();
    expect(store.errorDeCarga()).toMatch(/no encontramos|no pudimos/i);
  });

  it('un caso sin lugarId abre con salas vacías editables (sin catálogo, pero se pueden mover y guardar)', async () => {
    const { servidor, store } = await abrir({ sinLugar: true });
    expect(caso(store).lugarId).toBeNull();
    expect(caso(store).catalogo).toEqual({ muebles: [], objetos: [], herramientas: [] });
    expect(caso(store).salas.length).toBeGreaterThan(0);

    // Editar una sala: mover el escritorio. Se guarda sobre el mapa, con la revisión vigente.
    const consultorio = caso(store).salas[0];
    const indice = consultorio.muebles.findIndex((m) => m.ref === 'escritorio');
    expect(indice).toBeGreaterThanOrEqual(0);
    store.moverElemento(consultorio.id, 'mueble', indice, 600, 340);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['saveWorld']);
    const guardado = servidor.llamadas[0].args[0] as WorldRoomSaveRequest;
    expect(guardado.revision).toBe(12);
    expect(guardado.objects.find((o) => o.key === 'escritorio')).toMatchObject({ x: 600, y: 340 });
    expect(store.error()).toBeNull();
  });

  // M4: el mapa de la escena nueva dice siempre su sala; si no, al recargar la sala se parte en dos.
  it('una escena nueva en una sala de un caso sin lugar no parte la sala al recargar', async () => {
    const { servidor, store } = await abrir({ sinLugar: true });
    const antes = caso(store).salas.map((s) => s.id);
    const salaId = caso(store).salas[0].id;
    expect(servidor.mundos.get(1)!.map.ambient).toEqual({}); // el mapa hermano no dice su sala

    store.agregarEscena(salaId, caso(store).escenas[0].id);
    await store.sincronizado();
    expect(store.error()).toBeNull();

    const guardado = servidor.llamadasA('saveWorld')[0].args[0] as WorldRoomSaveRequest;
    expect(guardado.map.ambient['salaId']).toBe(salaId);
    expect(guardado.map.ambient).not.toHaveProperty('lugarId'); // el caso no tiene lugar

    await store.cargar(7);
    expect(caso(store).salas.map((s) => s.id)).toEqual(antes);
    expect(caso(store).escenas).toHaveLength(4);
    expect(caso(store).escenas.filter((e) => e.salaId === salaId)).toHaveLength(2);
  });

  it('una escena nueva en una sala de un lugar escribe la sala y el lugar en su mapa', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('consultorio', escenaDe(store, 'consultorio').id);
    await store.sincronizado();
    const guardado = servidor.llamadasA('saveWorld')[0].args[0] as WorldRoomSaveRequest;
    expect(guardado.map.ambient).toMatchObject({ salaId: 'consultorio', lugarId: 'universidad' });
  });

  it('crearCaso manda el lugar y las salas elegidas y devuelve el id del caso nuevo', async () => {
    const { servidor, store } = montar();
    const id = await store.crearCaso('Mi caso', 'universidad', ['consultorio', 'pasillo']);
    expect(id).toBe(CASO);
    expect(servidor.llamadasA('createCase')[0].args[0]).toEqual({ title: 'Mi caso', lugarId: 'universidad', salas: ['consultorio', 'pasillo'], porPiezas: true });
  });
});

describe('CasoStore con la API · cada acción llama a su endpoint con la revisión actual', () => {
  it('cada acción del store llama a su endpoint con la revisión actual', async () => {
    const { servidor, store } = await abrir();
    const consultorio = escenaDe(store, 'consultorio');
    const pasillo = escenaDe(store, 'pasillo');

    /** Ejecuta la acción, espera a que el servidor la reciba y comprueba qué rutas llamó y con qué revisión. */
    const probar = async (que: string, accion: () => unknown, esperadas: string[]) => {
      const antes = servidor.editor.revision;
      servidor.llamadas.length = 0;
      await accion();
      await store.sincronizado();
      expect(servidor.metodos, que).toEqual(esperadas);
      const primera = servidor.llamadas.find((l) => l.revision !== undefined);
      if (primera) expect(primera.revision, `${que}: revisión`).toBe(antes);
      const escrituras = servidor.llamadas.filter((l) => !['caseEditor', 'worldEditor', 'libraryPlace'].includes(l.metodo));
      expect(escrituras.every((l) => l.revision !== undefined), `${que}: todas las escrituras llevan revisión`).toBe(true);
      expect(store.conflicto(), `${que}: sin conflicto`).toBeNull();
      expect(store.error(), `${que}: sin error`).toBeNull();
    };

    // Escenas
    let nueva = '';
    await probar('agregar una escena', () => { nueva = store.agregarEscena('consultorio', consultorio.id); }, ['createNode', 'createMap', 'saveWorld']);
    await probar('mover una escena', () => store.moverEscena(nueva, 700, 220), ['updateNode']);
    await probar('cambiar el título', () => store.editarEscena(nueva, { titulo: 'Después de la espera' }), ['updateNode']);
    await probar('marcar como final', () => store.marcarFinal(nueva, true), ['updateNode']);

    // Líneas del guion
    let linea = '';
    await probar('agregar una línea', () => { linea = store.agregarLinea(consultorio.id); }, ['createDialogue', 'worldEditor', 'saveWorld']); // el guion nuevo cuelga de una persona de la sala
    await probar('escribir la línea', () => store.editarLinea(consultorio.id, linea, { texto: 'Hola, pasa.' }), ['updateDialogue']);
    await probar('duplicar la línea', () => store.duplicarLinea(consultorio.id, linea), ['updateDialogue']);
    await probar('mover la línea', () => store.moverLinea(consultorio.id, linea, 1), ['updateDialogue']);
    await probar('borrar la línea', () => store.borrarLinea(consultorio.id, linea), ['updateDialogue']);

    // Respuestas: una respuesta sin clase ni destino se queda en el borrador
    let respuesta = '';
    await probar('agregar una respuesta', () => { respuesta = store.agregarRespuesta(consultorio.id); }, []);
    await probar('escribir la respuesta', () => store.editarRespuesta(consultorio.id, respuesta, { texto: 'Cuéntame.' }), []);
    await probar('elegir la clase', () => store.editarRespuesta(consultorio.id, respuesta, { clase: 'RECOMMENDED' }), []);
    await probar('elegir a dónde lleva (ya se puede guardar)', () => store.conectar(respuesta, pasillo.id), ['createDecision', 'saveWorld']); // y la elección en el guion
    await probar('editar la respuesta', () => store.editarRespuesta(consultorio.id, respuesta, { retroalimentacion: 'Escuchar da seguridad.' }), ['updateDecision']);
    await probar('conectar con otra escena', () => store.conectar(respuesta, nueva), ['updateDecision']);
    await probar('dejarla sin destino', () => store.conectar(respuesta, null), ['deleteDecision', 'saveWorld']);
    await probar('conectar de nuevo', () => store.conectar(respuesta, pasillo.id), ['createDecision', 'saveWorld']);
    await probar('una respuesta que abre una escena nueva', () => store.respuestaAEscenaNueva(consultorio.id, respuesta), ['createNode', 'createMap', 'saveWorld', 'updateDecision']);
    await probar('conectar con…, a una escena nueva', () => store.conectarEscena(pasillo.id, 'nueva'), ['createNode', 'createMap', 'saveWorld']);
    await probar('borrar la respuesta', () => store.borrarRespuesta(consultorio.id, respuesta), ['deleteDecision', 'saveWorld']);

    // Hitos, riesgo y finales
    await probar('agregar un hito', () => store.agregarHito({ clave: 'abrir_la_conversacion', nombre: 'Abrir la conversación', descripcion: '', decisivo: false }), ['updateMilestones']);
    await probar('editar un hito', () => store.editarHito('abrir_la_conversacion', { nombre: 'Abrir la charla' }), ['updateMilestones']);
    await probar('borrar un hito', () => store.borrarHito('abrir_la_conversacion'), ['updateMilestones']);
    await probar('cambiar el nivel de riesgo', () => store.fijarNivelRiesgo(caso(store).nivelRiesgo === 'SEVERE' ? 'EXTREME' : 'SEVERE'), ['updateRisk']);
    await probar('finales propios (sin ninguno escrito aún no hay nada que guardar)', () => store.fijarModoFinales('propio'), []);
    let final = '';
    await probar('agregar un final', () => { final = store.agregarFinal(); }, ['updateEndings']);
    await probar('editar un final', () => store.editarFinal(final, { texto: 'La persona se siente escuchada.' }), ['updateEndings']);
    let otro = '';
    await probar('agregar otro final', () => { otro = store.agregarFinal(); }, ['updateEndings']);
    await probar('mover un final', () => store.moverFinal(otro, -1), ['updateEndings']);
    await probar('borrar el otro final', () => store.borrarFinal(otro), ['updateEndings']);
    await probar('borrar un final', () => store.borrarFinal(final), ['updateEndings']);

    // Sala: se guarda en todos los mapas de la sala (el consultorio ya tiene dos escenas)
    const salaConsultorio = sala(store, 'consultorio');
    const enCadaMapa = (extra: string[] = []) => [...extra, ...caso(store).escenas.filter((e) => e.salaId === 'consultorio').map(() => 'saveWorld')];
    await probar('mover un mueble', () => store.moverElemento('consultorio', 'mueble', 0, 520, 360), enCadaMapa());
    await probar('voltear un mueble', () => store.voltearMueble('consultorio', 0), enCadaMapa());
    await probar('agregar un mueble', () => store.agregarElemento('consultorio', 'mueble', 'sofa'), enCadaMapa());
    await probar('agregar un objeto', () => store.agregarElemento('consultorio', 'objeto', 'mochila'), enCadaMapa());
    await probar('cambiar a un personaje', () => store.editarPersonajeEnSala('consultorio', 0, { expresion: 'triste' }), enCadaMapa());
    await probar('quitar algo de la sala', () => store.quitarElemento('consultorio', 'objeto', salaConsultorio.objetos.length), enCadaMapa());
    await probar('deshacer en la sala', () => store.deshacer(), enCadaMapa());
    await probar('rehacer en la sala', () => store.rehacer(), enCadaMapa());
    await probar('volver a la sala original', () => store.volverSalaOriginal('consultorio'), enCadaMapa(['libraryPlace']));

    // Borrar
    await probar('borrar una escena', () => store.borrarEscena(nueva), ['deleteNode']);
  });

  it('dos acciones seguidas van en orden, cada una con la revisión que devolvió la anterior', async () => {
    const { servidor, store } = await abrir();
    const inicio = escenaDe(store, 'consultorio');
    store.moverEscena(inicio.id, 10, 10);
    store.moverEscena(escenaDe(store, 'pasillo').id, 20, 20);
    store.marcarFinal(inicio.id, true);
    await store.sincronizado();
    expect(servidor.llamadas.map((l) => l.metodo)).toEqual(['updateNode', 'updateNode', 'updateNode']);
    expect(servidor.llamadas.map((l) => l.revision)).toEqual([3, 4, 5]);
    expect(store.conflicto()).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('el borrador se ve cambiado al instante, antes de que el servidor responda', async () => {
    const { store } = await abrir();
    const id = escenaDe(store, 'consultorio').id;
    store.editarEscena(id, { titulo: 'Recibir a Camila' });
    expect(caso(store).escenas.find((e) => e.id === id)!.titulo).toBe('Recibir a Camila');
    expect(store.guardando()).toBe(true);
    await store.sincronizado();
    expect(store.guardando()).toBe(false);
  });
});

describe('CasoStore con la API · ordenar el mapa', () => {
  it('ordenar el mapa guarda la posición de las escenas que se movieron', async () => {
    const { servidor, store } = await abrir();
    store.moverEscena(escenaDe(store, 'pasillo').id, 900, 700);
    await store.sincronizado();
    servidor.llamadas.length = 0;
    store.ordenarAutomaticamente();
    await store.sincronizado();
    expect(servidor.metodos.length).toBeGreaterThan(0);
    expect(servidor.metodos.every((m) => m === 'updateNode')).toBe(true);
    for (const e of caso(store).escenas) {
      const nodo = servidor.editor.nodes.find((n) => String(n.id) === e.id)!;
      expect([nodo.positionX, nodo.positionY]).toEqual([e.posicion.x, e.posicion.y]);
    }
  });
});

describe('CasoStore con la API · conflicto de revisión', () => {
  it('conflicto de revisión: conserva el borrador, lo expone y recargar relee el caso sin perder lo escrito', async () => {
    const { servidor, store } = await abrir();
    const id = escenaDe(store, 'consultorio').id;
    servidor.otraSesionEscribe(); // otra persona guardó entre medias

    store.editarEscena(id, { titulo: 'Mi título nuevo' });
    await store.sincronizado();

    // 409: no se revierte ni se descarta lo escrito
    expect(store.conflicto()).not.toBeNull();
    expect(caso(store).escenas.find((e) => e.id === id)!.titulo).toBe('Mi título nuevo');
    expect(store.error()).toBeNull();
    expect(servidor.metodos).toEqual(['updateNode']);

    // Mientras haya conflicto no se manda nada más
    store.moverEscena(id, 5, 5);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateNode']);
    expect(caso(store).escenas.find((e) => e.id === id)!.posicion).toEqual({ x: 5, y: 5 });

    // Recargar relee del servidor y deja a la vista lo que no se guardó
    await store.recargar();
    expect(servidor.metodos).toContain('caseEditor');
    expect(store.conflicto()).toBeNull();
    expect(caso(store).revision).toBe(servidor.editor.revision);
    expect(caso(store).escenas.find((e) => e.id === id)!.titulo).not.toBe('Mi título nuevo');
    expect(store.recuperado().join(' ')).toContain('Mi título nuevo');

    // Y se puede seguir editando con la revisión nueva
    servidor.llamadas.length = 0;
    store.editarEscena(id, { titulo: 'Otra vez' });
    await store.sincronizado();
    expect(servidor.llamadas[0].revision).toBe(servidor.editor.revision - 1);
    expect(store.conflicto()).toBeNull();
  });
});

describe('CasoStore con la API · si el servidor rechaza un cambio', () => {
  it('una mutación que falla con 500 se revierte sola, sin tocar las demás', async () => {
    const { servidor, store } = await abrir();
    const a = escenaDe(store, 'consultorio').id;
    const b = escenaDe(store, 'pasillo').id;
    const tituloB = caso(store).escenas.find((e) => e.id === b)!.titulo;
    servidor.fallar('updateNode', 500);

    store.editarEscena(a, { titulo: 'Esto no se guarda' });
    store.moverEscena(b, 333, 111);
    await store.sincronizado();

    const escenas = caso(store).escenas;
    expect(escenas.find((e) => e.id === a)!.titulo).not.toBe('Esto no se guarda'); // revertida
    expect(escenas.find((e) => e.id === b)!.posicion).toEqual({ x: 333, y: 111 }); // la otra sigue
    expect(escenas.find((e) => e.id === b)!.titulo).toBe(tituloB);
    expect(store.error()).toMatch(/no se pudo guardar/i);
    expect(store.conflicto()).toBeNull();
    expect(servidor.metodos).toEqual(['updateNode', 'updateNode']);
    expect(servidor.editor.nodes.find((n) => Number(n.id) === Number(b))!.positionX).toBe(333);
  });

  it('una escena nueva que el servidor rechaza desaparece del borrador y no deja nada a medias', async () => {
    const { servidor, store } = await abrir();
    const antes = caso(store).escenas.length;
    servidor.fallar('createMap', 400, 'No se pudo crear el mapa.');
    const id = store.agregarEscena('consultorio');
    expect(caso(store).escenas).toHaveLength(antes + 1);
    await store.sincronizado();
    expect(caso(store).escenas).toHaveLength(antes);
    expect(caso(store).escenas.some((e) => e.id === id)).toBe(false);
    // Deshizo el nodo que alcanzó a crear y, como el servidor aceptó algo por el camino, volvió a leer el caso para estar seguro de lo que quedó.
    expect(servidor.metodos).toEqual(['createNode', 'createMap', 'deleteNode', 'caseEditor', 'worldEditor', 'worldEditor']);
    expect(servidor.editor.nodes).toHaveLength(antes);
    expect(store.error()).toContain('Revisa lo que escribiste'); // un 400 no cita el texto del backend
  });
});

describe('CasoStore con la API · el guion', () => {
  it('el guion guarda la clase de 4 valores y los efectos', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const destino = escenaDe(store, 'pasillo');
    const clases: ClaseRespuesta[] = ['RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED'];
    for (const clase of clases) {
      const id = store.agregarRespuesta(origen.id);
      store.editarRespuesta(origen.id, id, {
        texto: `Respuesta ${clase}`, clase, razon: clase === 'CONTRAINDICATED' ? 'Apura a la persona.' : '',
        retroalimentacion: 'Porque sí.', destinoId: destino.id,
        efectos: { persona: { bond: 1, activation: -1 }, hitos: ['valorar_el_riesgo'], competencias: ['ESCUCHA'] },
      });
    }
    await store.sincronizado();

    const cuerpos = servidor.llamadasA('createDecision').map((l) => l.args[0] as DecisionOptionUpsertRequest);
    expect(cuerpos.map((c) => c.responseClass)).toEqual(clases);
    for (const c of cuerpos) {
      expect(c.effects).toEqual({ persona: { bond: 1, activation: -1 }, milestones: ['valorar_el_riesgo'], competencies: ['ESCUCHA'] });
      expect(c.sourceNodeId).toBe(Number(origen.id));
      expect(c.targetNodeId).toBe(Number(destino.id));
    }
    expect(cuerpos[3]).toMatchObject({ prohibitedConduct: true, prohibitionReason: 'Apura a la persona.' });
    expect(cuerpos[0]).toMatchObject({ prohibitedConduct: false, prohibitionReason: null });
    expect(new Set(cuerpos.map((c) => c.optionKey)).size).toBe(4); // cada opción con su clave
    expect(servidor.editor.decisions.map((d) => d.responseClass)).toEqual(clases);
  });

  it('una respuesta sin clase queda en el borrador, no llama al servidor y dice qué falta', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Cuéntame más.', destinoId: escenaDe(store, 'pasillo').id });
    await store.sincronizado();

    expect(servidor.metodos).toEqual([]);
    expect(servidor.editor.decisions).toHaveLength(0);
    expect(caso(store).escenas.find((e) => e.id === origen.id)!.respuestas.find((r) => r.id === id)!.clase).toBeNull(); // nunca una clase por defecto
    expect(store.sinGuardar()).toEqual([expect.objectContaining({ respuestaId: id, mensaje: 'Elige cómo es esta respuesta para guardarla.' })]);

    store.editarRespuesta(origen.id, id, { clase: 'ACCEPTABLE' });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['createDecision']);
    expect(store.sinGuardar()).toEqual([]);
  });

  it('una contraindicada sin razón espera a que se escriba', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Apúrate.', clase: 'CONTRAINDICATED', destinoId: escenaDe(store, 'pasillo').id });
    await store.sincronizado();
    expect(servidor.metodos).toEqual([]);
    expect(store.sinGuardar()[0].mensaje).toBe('Escribe por qué es contraindicada para guardarla.');
    store.editarRespuesta(origen.id, id, { razon: 'Apura a la persona.' });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['createDecision']);
  });

  it('borrar una escena borra antes las respuestas de otras escenas que llegaban a ella', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const destino = escenaDe(store, 'pasillo');
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Vamos.', clase: 'ACCEPTABLE', destinoId: destino.id });
    await store.sincronizado();
    servidor.llamadas.length = 0;

    store.borrarEscena(destino.id);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['deleteDecision', 'deleteNode']);
    expect(store.error()).toBeNull();
    // la respuesta sigue en el borrador, sin destino, para que el docente la vuelva a conectar
    expect(caso(store).escenas.find((e) => e.id === origen.id)!.respuestas.find((r) => r.id === id)!.destinoId).toBeNull();
  });

  it('el guion de una escena con líneas lleva el nombre del personaje, la expresión y la marca de la IA', async () => {
    const { servidor, store } = await abrir();
    const escena = escenaDe(store, 'consultorio');
    const id = store.agregarLinea(escena.id);
    store.editarLinea(escena.id, id, { texto: 'Pasa, por favor.', expresion: 'alegre' });
    await store.sincronizado();
    const cuerpo = servidor.llamadasA('createDialogue')[0].args[1] as { lines: Array<{ speakerName: string; text: string; emotion: string; aiSuggested: boolean }> };
    expect(cuerpo.lines).toEqual([{ displayOrder: 1, speakerName: expect.any(String), text: '', emotion: 'neutral', aiSuggested: false }]);
    expect(servidor.llamadasA('updateDialogue')[0].args[1]).toMatchObject({ lines: [{ text: 'Pasa, por favor.', emotion: 'alegre' }] });
  });
});

describe('CasoStore con la API · finales por hitos', () => {
  it('finales por hitos en modo automático y propio', async () => {
    const { servidor, store } = await abrir();
    const decisivo = caso(store).hitos.find((h) => h.decisivo)!;
    expect(caso(store).modoFinales).toBe('automatico');

    // Automático: sin finales propios (valen los cuatro del modelo)
    store.fijarModoFinales('automatico');
    await store.sincronizado();
    expect(servidor.llamadasA('updateEndings')).toHaveLength(0); // ya lo estaba: no hay nada que decir

    // Propio: el final nuevo se pide por el primer hito decisivo
    store.fijarModoFinales('propio');
    const id = store.agregarFinal();
    await store.sincronizado();
    const finales = servidor.llamadasA('updateEndings').at(-1)!.args[0] as EndingRule[];
    expect(finales).toHaveLength(1);
    expect(finales[0].when).toEqual({ milestone: decisivo.clave });
    expect(finales[0]).toMatchObject({ aiSuggested: false });
    expect(caso(store).finales[0].id).toBe(id);

    // Volver a automático borra los propios en el servidor (la pantalla pregunta antes: ver finales.component.spec; el almacén obedece)
    store.fijarModoFinales('automatico');
    await store.sincronizado();
    expect(servidor.llamadasA('updateEndings').at(-1)!.args[0]).toEqual([]);
    expect(servidor.editor.rules.endings).toEqual([]);
  });
});

describe('CasoStore con la API · salas compartidas', () => {
  it('una escena nueva en una sala que existe lleva la sala copiada, y editar la sala la guarda en todos sus mapas', async () => {
    const { servidor, store } = await abrir();
    const antes = escenaDe(store, 'consultorio');
    const id = store.agregarEscena('consultorio', antes.id);
    await store.sincronizado();

    // El mapa nuevo nace con el ambiente de la sala y sus objetos (con ids nuevos)
    const mapaNuevo = servidor.mundos.get(Number(servidor.editor.nodes.at(-1)!.id))!;
    const hermano = servidor.mundos.get(Number(antes.id))!;
    expect(mapaNuevo.map.ambient).toEqual(hermano.map.ambient);
    expect(mapaNuevo.objects.map((o) => o.key)).toEqual(hermano.objects.map((o) => o.key));
    expect(mapaNuevo.objects.every((o) => o.id !== 0)).toBe(true);
    expect(caso(store).salas.filter((s) => s.id === 'consultorio')).toHaveLength(1); // sigue siendo UNA sala

    // Mover algo en la sala se guarda en los dos mapas
    servidor.llamadas.length = 0;
    store.moverElemento('consultorio', 'mueble', 0, 450, 350);
    await store.sincronizado();
    const guardados = servidor.llamadasA('saveWorld');
    expect(guardados).toHaveLength(2);
    expect(guardados.map((g) => g.args[1])).toEqual([Number(antes.id), Number(servidor.editor.nodes.at(-1)!.id)]);
    for (const g of guardados) {
      const cuerpo = g.args[0] as WorldRoomSaveRequest;
      expect(cuerpo.objects.find((o) => o.key === sala(store, 'consultorio').muebles[0].clave)).toMatchObject({ x: 450, y: 350 });
    }
    expect(id).toBeTruthy();
  });

  it('un mueble agregado a una sala compartida recibe la misma clave en todos sus mapas', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('consultorio');
    await store.sincronizado();
    store.agregarElemento('consultorio', 'mueble', 'sofa');
    await store.sincronizado();
    const clave = sala(store, 'consultorio').muebles.at(-1)!.clave!;
    expect(clave).toBeTruthy();
    for (const g of servidor.llamadasA('saveWorld').slice(-2)) {
      const nuevos = (g.args[0] as WorldRoomSaveRequest).objects.filter((o) => o.key === clave);
      expect(nuevos).toHaveLength(1);
    }
    // Guardar otra vez no lo duplica
    store.moverElemento('consultorio', 'mueble', sala(store, 'consultorio').muebles.length - 1, 300, 300);
    await store.sincronizado();
    for (const m of servidor.mundos.values()) {
      if (m.map.ambient['salaId'] === 'consultorio') expect(m.objects.filter((o) => o.key === clave)).toHaveLength(1);
    }
  });

  it('deshacer y rehacer valen para la sala y se guardan', async () => {
    const { servidor, store } = await abrir();
    expect(store.puedeDeshacer()).toBe(false);
    const x0 = sala(store, 'consultorio').personajes[0].x;
    store.moverElemento('consultorio', 'personaje', 0, x0 + 40, 300);
    expect(store.puedeDeshacer()).toBe(true);
    await store.sincronizado();
    store.deshacer();
    expect(sala(store, 'consultorio').personajes[0].x).toBe(x0);
    expect(store.puedeRehacer()).toBe(true);
    await store.sincronizado();
    const ultimo = servidor.llamadasA('saveWorld').at(-1)!.args[0] as WorldRoomSaveRequest;
    expect(ultimo.objects.find((o) => o.type === 'PERSON')!.x).toBe(x0);
  });

  it('volver a la sala original relee la biblioteca y la guarda', async () => {
    const { servidor, store } = await abrir();
    store.quitarElemento('consultorio', 'mueble', 0);
    await store.sincronizado();
    servidor.llamadas.length = 0;
    await store.volverSalaOriginal('consultorio');
    await store.sincronizado();
    expect(servidor.metodos).toContain('saveWorld');
    const original = universidad.salas.find((s) => s.id === 'consultorio')!;
    expect(sala(store, 'consultorio').muebles.map((m) => m.ref)).toEqual(original.muebles.map((m) => m.ref));
  });

  it('el borrador de una escena no pasa a otra visita: cerrar deja el store vacío', async () => {
    const { store } = await abrir();
    store.cerrar();
    expect(store.caso()).toBeNull();
  });
});

describe('CasoStore con la API · lo que propuso la IA', () => {
  it('aceptar una escena, una respuesta o un final baja la marca en el servidor', async () => {
    const { servidor, store } = await abrir();
    const origen = escenaDe(store, 'consultorio');
    const destino = escenaDe(store, 'pasillo');
    const id = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, id, { texto: 'Sí.', clase: 'ACCEPTABLE', destinoId: destino.id, marcaIa: true });
    await store.sincronizado();
    servidor.llamadas.length = 0;

    store.aceptarIa({ escenaId: origen.id, respuestaId: id });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['acceptAiDecision']);

    store.fijarModoFinales('propio');
    const final = store.agregarFinal();
    store.editarFinal(final, { marcaIa: true });
    await store.sincronizado();
    servidor.llamadas.length = 0;
    store.aceptarIa({ finalId: final });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateEndings']);
    expect((servidor.llamadas[0].args[0] as EndingRule[])[0].aiSuggested).toBe(false);
  });
});

describe('CasoStore con la API · lo que cambia un servidor distinto al de siempre', () => {
  it('el cuerpo de la escena que se crea lleva su clave, el título y si es la de inicio', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('pasillo');
    await store.sincronizado();
    const cuerpo = servidor.llamadasA('createNode')[0].args[0] as NodeUpsertRequest;
    expect(cuerpo).toMatchObject({ nodeKey: 'escena-1', startNode: false, terminal: false, intensity: 'MEDIUM' });
    expect(cuerpo.title).toContain('Escena nueva');
  });
});

// P6, tarea 8: sin esto la compuerta marca todas las respuestas como errores (`WORLD.OPTION_WITHOUT_TRIGGER`: ningún diálogo ni
// objeto las ofrece) y el estudiante vería la sala sin poder responder.
describe('CasoStore con la API · las respuestas se ofrecen en el guion de una persona de la sala', () => {
  /** El guion de la escena como lo tiene el servidor ahora y la persona de la que cuelga. */
  const guionDe = (servidor: ServidorFalso, store: CasoStore, salaId: string) => {
    const nodo = Number(escenaDe(store, salaId).id);
    const mundo = servidor.mundos.get(nodo)!;
    const arbol = mundo.dialogues.find((d) => d.key.startsWith('guion-'))!;
    return { mundo, arbol, duenio: mundo.objects.find((o) => o.id === arbol?.mapObjectId) };
  };

  /** Una escena con una línea y dos respuestas que llevan a la otra escena. */
  async function conGuionYRespuestas() {
    const { servidor, store } = await abrir();
    const consultorio = escenaDe(store, 'consultorio');
    const pasillo = escenaDe(store, 'pasillo');
    store.agregarLinea(consultorio.id);
    const linea = escenaDe(store, 'consultorio').lineas[0].id;
    store.editarLinea(consultorio.id, linea, { texto: 'Hola, pasa.' });
    const respuestas: string[] = [];
    for (const texto of ['Te escucho.', 'Cuéntame.']) {
      const id = store.agregarRespuesta(consultorio.id);
      store.editarRespuesta(consultorio.id, id, { texto, clase: 'RECOMMENDED', retroalimentacion: 'Escuchar da seguridad.' });
      store.conectar(id, pasillo.id);
      respuestas.push(id);
    }
    await store.sincronizado();
    expect(store.error()).toBeNull();
    return { servidor, store, consultorio, pasillo, respuestas };
  }

  it('el guion cuelga de una persona de la sala y sus elecciones son las respuestas, cada una con su opción del servidor', async () => {
    const { servidor, store } = await conGuionYRespuestas();
    const { arbol, duenio } = guionDe(servidor, store, 'consultorio');
    expect(duenio?.type).toBe('PERSON');
    expect(arbol.lines.map((l) => l.text)).toEqual(['Hola, pasa.']);
    const opciones = servidor.editor.decisions.filter((d) => d.text === 'Te escucho.' || d.text === 'Cuéntame.');
    expect(arbol.choices.map((c) => [c.text, c.decisionOptionId])).toEqual(opciones.map((d) => [d.text, d.id]));
    expect(arbol.choices.map((c) => c.displayOrder)).toEqual([1, 2]);
  });

  it('borrar una respuesta la quita de las elecciones, y dejarla sin destino también', async () => {
    const { servidor, store, consultorio, respuestas } = await conGuionYRespuestas();
    store.conectar(respuestas[0], null);
    await store.sincronizado();
    expect(guionDe(servidor, store, 'consultorio').arbol.choices.map((c) => c.text)).toEqual(['Cuéntame.']);
    store.borrarRespuesta(consultorio.id, respuestas[1]);
    await store.sincronizado();
    expect(guionDe(servidor, store, 'consultorio').arbol.choices).toEqual([]);
    expect(store.error()).toBeNull();
  });

  it('cambiar el texto de una línea no vuelve a mandar las elecciones si no cambiaron', async () => {
    const { servidor, store, consultorio } = await conGuionYRespuestas();
    servidor.llamadas.length = 0;
    store.editarLinea(consultorio.id, escenaDe(store, 'consultorio').lineas[0].id, { texto: 'Hola, pasa y siéntate.' });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateDialogue']);
  });

  it('si la sala se guarda sin la persona de la que colgaba el guion, el guion se vuelve a escribir con otra persona', async () => {
    const { servidor, store } = await conGuionYRespuestas();
    const antes = guionDe(servidor, store, 'consultorio');
    // La sala del consultorio trae una sola persona: se suma otra del lugar y se quita la que tenía el guion.
    store.agregarElemento('consultorio', 'personaje', caso(store).personajes.find((p) => !sala(store, 'consultorio').personajes.some((x) => x.ref === p.id))!.id);
    await store.sincronizado();
    const salaConsultorio = sala(store, 'consultorio');
    const indice = salaConsultorio.personajes.findIndex((p) => p.clave === antes.duenio!.key);
    expect(indice).toBeGreaterThanOrEqual(0);
    expect(salaConsultorio.personajes.length).toBeGreaterThan(1);
    store.quitarElemento('consultorio', 'personaje', indice);
    await store.sincronizado();
    const despues = guionDe(servidor, store, 'consultorio');
    expect(despues.arbol).toBeDefined();
    expect(despues.arbol.lines.map((l) => l.text)).toEqual(['Hola, pasa.']);
    expect(despues.duenio?.key).not.toBe(antes.duenio!.key);
  });
});

describe('CasoStore con la API · recursos de apoyo de una escena', () => {
  it('escribirlos manda el nodo con sus recursos y la lista de verificación puede respaldar «protocolos de seguridad»', async () => {
    const { servidor, store } = await abrir();
    const consultorio = escenaDe(store, 'consultorio');
    store.editarEscena(consultorio.id, { recursosApoyo: ['Línea 106', 'Consultorio de Bienestar, piso 2'] });
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateNode']);
    expect((servidor.llamadas[0].args[1] as NodeUpsertRequest).supportResources).toEqual(['Línea 106', 'Consultorio de Bienestar, piso 2']);
    expect(servidor.editor.nodes.find((n) => String(n.id) === consultorio.id)!.supportResources).toEqual(['Línea 106', 'Consultorio de Bienestar, piso 2']);
    expect(store.error()).toBeNull();
  });
});

describe('CasoStore con la API · cómo se mueve una persona y a quién atender', () => {
  const persona = (store: CasoStore, salaId: string, indice = 0) => sala(store, salaId).personajes[indice];
  const guardada = (servidor: ServidorFalso, store: CasoStore, salaId: string, clave: string) =>
    servidor.mundos.get(Number(escenaDe(store, salaId).id))!.objects.find((o) => o.key === clave)!;

  it('elegir que una persona camina o va y viene se guarda en el mapa con la forma que lee el juego', async () => {
    const { servidor, store } = await abrir();
    const clave = persona(store, 'consultorio').clave!;
    expect(store.fijarMovimiento('consultorio', 0, 'deambula')).toEqual({ ok: true });
    await store.sincronizado();
    expect(guardada(servidor, store, 'consultorio', clave).metadata['movimiento']).toBe('deambula');

    const hasta = { x: 700, y: 420 };
    expect(store.fijarMovimiento('consultorio', 0, { tipo: 'va-y-viene', hasta })).toEqual({ ok: true });
    await store.sincronizado();
    expect(guardada(servidor, store, 'consultorio', clave).metadata['movimiento']).toEqual({ tipo: 'va-y-viene', hasta });
    expect(persona(store, 'consultorio').movimiento).toEqual({ tipo: 'va-y-viene', hasta });
    expect(store.error()).toBeNull();
  });

  it('un punto de ida dentro de un mueble no se fija: el movimiento queda como estaba y se dice por qué', async () => {
    const { servidor, store } = await abrir();
    const escritorio = sala(store, 'consultorio').muebles.find((m) => m.ref === 'escritorio')!;
    servidor.llamadas.length = 0;
    const resultado = store.fijarMovimiento('consultorio', 0, { tipo: 'va-y-viene', hasta: { x: escritorio.x, y: escritorio.y - 10 } });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toMatch(/dentro de «.+»/);
    await store.sincronizado();
    expect(persona(store, 'consultorio').movimiento).toBe('quieto');
    expect(servidor.metodos).toEqual([]);
  });

  it('un punto fuera de la sala tampoco se fija', async () => {
    const { store } = await abrir();
    const resultado = store.fijarMovimiento('consultorio', 0, { tipo: 'va-y-viene', hasta: { x: 5, y: 5 } });
    expect(resultado.ok).toBe(false);
    expect(persona(store, 'consultorio').movimiento).toBe('quieto');
  });

  it('marcar a una persona como la persona a atender se guarda; marcar a otra desmarca a la primera y dice quién era', async () => {
    const { servidor, store } = await abrir();
    store.agregarElemento('consultorio', 'personaje', caso(store).personajes.find((p) => !sala(store, 'consultorio').personajes.some((x) => x.ref === p.id))!.id);
    await store.sincronizado();
    const primera = persona(store, 'consultorio', 0);
    const segunda = persona(store, 'consultorio', 1);

    expect(store.marcarPersonaAAtender('consultorio', 0, true)).toBeNull();
    await store.sincronizado();
    expect(guardada(servidor, store, 'consultorio', primera.clave!).metadata['personaClave']).toBe(true);

    const nombreDeLaPrimera = caso(store).personajes.find((p) => p.id === primera.ref)!.nombre;
    expect(store.marcarPersonaAAtender('consultorio', 1, true)).toBe(nombreDeLaPrimera);
    await store.sincronizado();
    expect(persona(store, 'consultorio', 0).personaClave).toBe(false);
    expect(persona(store, 'consultorio', 1).personaClave).toBe(true);
    expect(guardada(servidor, store, 'consultorio', primera.clave!).metadata).not.toHaveProperty('personaClave');
    expect(guardada(servidor, store, 'consultorio', segunda.clave!).metadata['personaClave']).toBe(true);
    expect(store.error()).toBeNull();
  });

  it('desmarcar a la persona a atender deja la sala sin ninguna', async () => {
    const { servidor, store } = await abrir();
    const clave = persona(store, 'consultorio').clave!;
    store.marcarPersonaAAtender('consultorio', 0, true);
    expect(store.marcarPersonaAAtender('consultorio', 0, false)).toBeNull();
    await store.sincronizado();
    expect(guardada(servidor, store, 'consultorio', clave).metadata).not.toHaveProperty('personaClave');
  });

  it('la persona a atender de una sala compartida se guarda en todos sus mapas', async () => {
    const { servidor, store } = await abrir();
    store.agregarEscena('consultorio');
    await store.sincronizado();
    servidor.llamadas.length = 0;
    store.marcarPersonaAAtender('consultorio', 0, true);
    await store.sincronizado();
    const guardados = servidor.llamadasA('saveWorld');
    expect(guardados).toHaveLength(2);
    for (const g of guardados) {
      const cuerpo = g.args[0] as WorldRoomSaveRequest;
      expect(cuerpo.objects.find((o) => o.type === 'PERSON')!.metadata['personaClave']).toBe(true);
    }
  });

  it('cambiar cómo se mueve o a quién atender se puede deshacer y rehacer', async () => {
    const { store } = await abrir();
    store.fijarMovimiento('consultorio', 0, 'deambula');
    store.marcarPersonaAAtender('consultorio', 0, true);
    await store.sincronizado();
    store.deshacer();
    expect(persona(store, 'consultorio').personaClave).toBe(false);
    expect(persona(store, 'consultorio').movimiento).toBe('deambula');
    store.deshacer();
    expect(persona(store, 'consultorio').movimiento).toBe('quieto');
    store.rehacer();
    store.rehacer();
    expect(persona(store, 'consultorio')).toMatchObject({ movimiento: 'deambula', personaClave: true });
    await store.sincronizado();
  });

  it('mover a una persona que va y viene conserva su punto de ida', async () => {
    const { store } = await abrir();
    const hasta = { x: 700, y: 420 };
    store.fijarMovimiento('consultorio', 0, { tipo: 'va-y-viene', hasta });
    store.moverElemento('consultorio', 'personaje', 0, 320, 330);
    await store.sincronizado();
    expect(persona(store, 'consultorio').movimiento).toEqual({ tipo: 'va-y-viene', hasta });
  });
});

describe('CasoStore con la API · los datos del caso (contexto y objetivos)', () => {
  it('guardar el contexto y los objetivos se ve al instante y llama a la ficha con la revisión vigente', async () => {
    const { servidor, store } = await abrir();
    const revision = servidor.editor.revision;
    store.editarFicha('Una estudiante llega a Bienestar.', ['Valorar el riesgo.', 'Validar sin juzgar.']);
    expect(caso(store).contexto).toBe('Una estudiante llega a Bienestar.');
    expect(caso(store).objetivos).toEqual(['Valorar el riesgo.', 'Validar sin juzgar.']);
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateBrief']);
    expect(servidor.llamadas[0].revision).toBe(revision);
    expect(servidor.llamadas[0].args[0]).toEqual({ context: 'Una estudiante llega a Bienestar.', learningObjectives: ['Valorar el riesgo.', 'Validar sin juzgar.'] });
    expect(servidor.editor.context).toBe('Una estudiante llega a Bienestar.');
    expect(caso(store).revision).toBe(servidor.editor.revision);
    expect(store.error()).toBeNull();
  });

  it('los temas sensibles y el nombre viajan en el mismo «brief», solo lo que cambió (RK-7 y RK-8)', async () => {
    const { servidor, store } = await abrir();
    servidor.editor.contentWarnings = [];
    await store.cargar(servidor.editor.caseVersionId, true);
    servidor.llamadas.length = 0;
    store.editarFicha(caso(store).contexto ?? '', caso(store).objetivos ?? [], { temas: ['  Violencia de pareja ', '', 'Duelo'], titulo: '  Primera atención  ' });
    expect(caso(store).temasSensibles).toEqual(['Violencia de pareja', 'Duelo']);
    expect(caso(store).titulo).toBe('Primera atención');
    await store.sincronizado();
    expect(servidor.metodos).toEqual(['updateBrief']);
    expect(servidor.llamadas[0].args[0]).toEqual({ contentWarnings: ['Violencia de pareja', 'Duelo'], title: 'Primera atención' });
    expect(servidor.editor.contentWarnings).toEqual(['Violencia de pareja', 'Duelo']);
    expect(servidor.editor.title).toBe('Primera atención');
  });

  it('con un servidor que no trae temas sensibles, no se mandan aunque la pantalla los pase vacíos', async () => {
    const { servidor, store } = await abrir();
    expect(caso(store).temasSensibles).toBeUndefined();
    store.editarFicha('Nuevo.', [], {});
    await store.sincronizado();
    expect(servidor.llamadas[0].args[0]).toEqual({ context: 'Nuevo.', learningObjectives: [] });
  });

  it('el contexto se guarda sin espacios sobrantes', async () => {
    const { servidor, store } = await abrir();
    store.editarFicha('  Un contexto.  \n', []);
    await store.sincronizado();
    expect((servidor.llamadas[0].args[0] as { context: string }).context).toBe('Un contexto.');
  });

  it('si no cambió nada no le dice nada al servidor', async () => {
    const { servidor, store } = await abrir();
    store.editarFicha(caso(store).contexto ?? '', caso(store).objetivos ?? []);
    await store.sincronizado();
    expect(servidor.metodos).toEqual([]);
  });

  it('dos cambios seguidos se mandan en uno', async () => {
    const { servidor, store } = await abrir();
    store.editarFicha('Uno.', []);
    store.editarFicha('Dos.', ['Objetivo.']);
    await store.sincronizado();
    expect(servidor.llamadasA('updateBrief').length).toBeLessThanOrEqual(2);
    expect(servidor.editor.context).toBe('Dos.');
    expect(servidor.editor.learningObjectives).toEqual(['Objetivo.']);
  });

  it('si el servidor no acepta el texto, el borrador vuelve a lo que había, lo dice y guarda lo que se escribió para no perderlo', async () => {
    const { servidor, store } = await abrir();
    const antes = caso(store).contexto;
    servidor.fallar('updateBrief', 400, 'No.', { campo: 'context' });
    store.editarFicha('Texto que no se acepta.', []);
    await store.sincronizado();
    expect(caso(store).contexto).toBe(antes);
    expect(store.error()).toMatch(/No se pudo guardar los datos del caso/);
    expect(store.descartado().join(' ')).toContain('Texto que no se acepta.');
  });

  it('un caso que ya no es un borrador no se cambia', async () => {
    const { servidor, store } = await abrir();
    servidor.editor.status = 'IN_REVIEW';
    await store.cargar(CASO, true);
    servidor.llamadas.length = 0;
    store.editarFicha('Otro contexto.', ['Otro.']);
    await store.sincronizado();
    expect(servidor.metodos).toEqual([]);
    expect(caso(store).contexto).not.toBe('Otro contexto.');
  });

  it('un conflicto de revisión conserva lo escrito y lo avisa', async () => {
    const { servidor, store } = await abrir();
    servidor.otraSesionEscribe();
    store.editarFicha('Mi contexto.', []);
    await store.sincronizado();
    expect(store.conflicto()).not.toBeNull();
    expect(store.conflicto()!.sinGuardar.join(' ')).toContain('Mi contexto.');
    expect(caso(store).contexto).toBe('Mi contexto.');
  });
});

describe('CasoStore con la API · releerProbado (si el ensayo llegó a un final)', () => {
  it('relee el editor y pone probadoHastaElFinal sin tocar lo demás ni mandar nada', async () => {
    const { servidor, store } = await abrir();
    expect(caso(store).probadoHastaElFinal).toBe(false);
    const antes = structuredClone(caso(store));
    servidor.marcarEnsayado(true);
    await store.releerProbado();
    expect(servidor.metodos).toEqual(['caseEditor']);
    expect(caso(store).probadoHastaElFinal).toBe(true);
    expect({ ...caso(store), probadoHastaElFinal: false }).toEqual(antes);
    servidor.marcarEnsayado(false);
    await store.releerProbado();
    expect(caso(store).probadoHastaElFinal).toBe(false);
  });

  it('no deja pendiente nada que guardar, y si la lectura falla conserva lo que había', async () => {
    const { servidor, store } = await abrir();
    servidor.marcarEnsayado(true);
    await store.releerProbado();
    servidor.llamadas.length = 0;
    await store.sincronizado();
    expect(servidor.metodos).toEqual([]);
    servidor.fallar('caseEditor', 500);
    await store.releerProbado();
    expect(caso(store).probadoHastaElFinal).toBe(true);
  });

  it('sin caso abierto no hace nada', async () => {
    const { servidor, store } = montar();
    await store.releerProbado();
    expect(servidor.metodos).toEqual([]);
  });
});
