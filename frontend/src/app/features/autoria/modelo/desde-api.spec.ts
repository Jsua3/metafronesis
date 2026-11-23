import catalogoDelKit from '../../../../../character-kit/catalog.json';
import type { CaseEditorView, WorldDefinition } from '../../../core/models/simulation.model';
import { casoCopiadoDeLugar, casoSinLugar } from '../testing/caso-api';
import { universidad } from '../testing/universidad';
import { revisarCaminos } from './caminos';
import { EMOCION_A_EXPRESION, casoDesdeApi, salaIdDeMapa } from './desde-api';
import { puedeEnviar } from './revision';
import { finalesDePlantilla } from './finales';
import { finalesAApi } from './hacia-api';

const SALAS = ['pasillo', 'sala-espera', 'bienestar', 'consultorio'];

describe('casoDesdeApi: de lo que entrega el servidor al borrador del editor', () => {
  describe('un caso copiado de un lugar', () => {
    const { editor, mundos } = casoCopiadoDeLugar(universidad, SALAS);
    const caso = casoDesdeApi(editor, mundos, universidad);

    it('trae el título, la revisión y los ids del servidor como texto', () => {
      expect(caso.id).toBe('41');
      expect(caso.revision).toBe(3);
      expect(caso.titulo).toBe('Primera escucha en Bienestar');
      expect(caso.escenas.map((e) => e.id)).toEqual(editor.nodes.map((n) => String(n.id)));
      expect(caso.inicioId).toBe(String(editor.nodes[0].id));
    });

    it('el lugar se deduce de las salas y cada sala dice de dónde salió', () => {
      expect(caso.lugarId).toBe('universidad');
      expect(caso.salas.map((s) => s.id)).toEqual(SALAS);
      expect(caso.salas.every((s) => s.origen?.lugarId === 'universidad' && s.origen.salaId === s.id)).toBe(true);
    });

    it('una escena por sala, en la sala que le toca, con su posición y su título', () => {
      expect(caso.escenas.map((e) => e.salaId)).toEqual(SALAS);
      expect(caso.escenas[1].titulo).toBe('Sala de espera de Bienestar');
      expect(caso.escenas[0].posicion).toEqual({ x: editor.nodes[0].positionX, y: editor.nodes[0].positionY });
      expect(caso.escenas.every((e) => !e.esFinal && e.intensidad === 'MEDIUM' && e.advertencia === null)).toBe(true);
    });

    it('la sala recupera su fondo, su encuadre, su entrada y su nombre', () => {
      const sala = caso.salas[1];
      expect(sala.nombre).toBe('Sala de espera de Bienestar');
      expect(sala.encuadre).toBe('dos-paredes-derecha');
      expect(sala.fondo).toBe('/assets/biblioteca/escenarios/universidad/arte/salas/sala-espera.png');
      expect(sala.entrada).toEqual({ x: 480, y: 440 });
    });

    it('los muebles vuelven con su pieza del catálogo (también los repetidos) y sus posiciones', () => {
      const sala = caso.salas[1];
      expect(sala.muebles.map((m) => m.ref)).toEqual(['sillas-espera', 'sillas-espera', 'mesa-centro', 'planta', 'dispensador-agua']);
      expect(sala.muebles.map((m) => m.clave)).toEqual(['sillas-espera', 'sillas-espera-2', 'mesa-centro', 'planta', 'dispensador-agua']);
      expect(sala.muebles[0]).toMatchObject({ x: 300, y: 300 });
    });

    it('los objetos, los personajes y las puertas vuelven como los dejó la biblioteca', () => {
      const sala = caso.salas[1];
      expect(sala.objetos.map((o) => o.ref)).toEqual(['folleto-rutas', 'cartelera-horarios']);
      expect(sala.personajes).toEqual([
        expect.objectContaining({ ref: 'estudiante-consultante', x: 420, y: 330, mirando: 'derecha', expresion: 'preocupada' }),
      ]);
      expect(sala.puertas.map((p) => [p.id, p.hacia, p.etiqueta])).toEqual([
        ['puerta-pasillo', 'pasillo', 'Salir al pasillo'],
        ['puerta-bienestar', 'bienestar', 'Pasar a Bienestar'],
      ]);
    });

    it('las puertas hacia salas que no se eligieron no existen (el servidor no las copió)', () => {
      // El pasillo del lugar tiene siete puertas; solo una lleva a una sala elegida.
      expect(caso.salas[0].puertas.map((p) => p.hacia)).toEqual(['sala-espera']);
      const hacia = new Set(caso.salas.flatMap((s) => s.puertas.map((p) => p.hacia)));
      expect([...hacia].every((h) => SALAS.includes(h!))).toBe(true);
    });

    it('trae los personajes del caso con su retrato, y el catálogo del lugar', () => {
      expect(caso.personajes.map((p) => p.id)).toContain('estudiante-consultante');
      expect(caso.personajes[0]).toMatchObject({ nombre: expect.any(String), rol: expect.any(String), recipeId: expect.any(String) });
      expect(caso.catalogo.muebles.length).toBeGreaterThan(5);
    });

    it('los hitos y el nivel de riesgo del lugar llegan con las claves del caso', () => {
      expect(caso.hitos[0]).toEqual({
        clave: 'valorar_el_riesgo', nombre: 'Valorar el riesgo', descripcion: expect.any(String), decisivo: true,
      });
      expect(caso.nivelRiesgo).toBe('MODERATE');
    });

    it('sin finales propios, los finales son los del modelo (automático)', () => {
      expect(caso.modoFinales).toBe('automatico');
      expect(caso.finales).toEqual([]);
    });
  });

  // Review Focus 2: los casos viejos y los hechos a mano no nombran su sala.
  describe('un caso sin lugarId abre con salas vacías editables', () => {
    const { editor, mundos } = casoSinLugar();
    const caso = casoDesdeApi(editor, mundos);

    it('el caso no tiene lugar y no hay catálogo, pero cada mapa es una sala que se puede editar', () => {
      expect(caso.lugarId).toBeNull();
      expect(caso.catalogo).toEqual({ muebles: [], objetos: [], herramientas: [] });
      expect(caso.salas).toHaveLength(editor.maps.length);
      expect(caso.salas.map((s) => s.id)).toEqual(editor.maps.map((m) => m.key));
      expect(caso.salas.map((s) => s.nombre)).toEqual(editor.maps.map((m) => m.title));
    });

    it('la sala no sabe de dónde salió: no hay «volver a la sala original»', () => {
      expect(caso.salas.every((s) => s.origen === null)).toBe(true);
    });

    it('cada escena queda en la sala de su propio mapa', () => {
      expect(caso.escenas.map((e) => e.salaId)).toEqual(editor.maps.map((m) => m.key));
    });

    it('lo que había en el mapa se conserva: la persona sin personaje enlazado y el mueble sin pieza de catálogo', () => {
      const sala = caso.salas[0];
      expect(sala.personajes).toEqual([
        expect.objectContaining({ ref: 'camila', x: 300, y: 300, mirando: 'derecha', expresion: 'triste' }),
      ]);
      expect(sala.muebles).toEqual([expect.objectContaining({ ref: 'escritorio', x: 500, y: 320 })]);
      expect(sala.objetos).toEqual([]);
      expect(sala.puertas).toEqual([]);
    });

    it('la entrada de la sala es el punto de aparición del mapa y el encuadre es el de siempre', () => {
      expect(caso.salas[0].entrada).toEqual({ x: 100, y: 400 });
      expect(caso.salas[0].encuadre).toBe('tres-paredes');
    });
  });

  describe('dos escenas con la misma sala', () => {
    it('comparten sala cuando sus mapas dicen la misma ambient.salaId', () => {
      const { editor, mundos } = casoCopiadoDeLugar(universidad, ['pasillo', 'consultorio']);
      // Una escena más en el consultorio: otro nodo y otro mapa con la sala copiada.
      const mundoOriginal = mundos[1];
      const nodo = { ...editor.nodes[1], id: 900, key: 'escena-nueva', title: 'Segunda escena', startNode: false, displayOrder: 2 };
      const mapa = { ...editor.maps[1], id: 901, key: 'sala-escena-nueva', nodeId: 900, nodeKey: 'escena-nueva' };
      const mundoNuevo: WorldDefinition = { ...structuredClone(mundoOriginal), nodeId: 900, map: { ...mundoOriginal.map, id: 901, key: 'sala-escena-nueva' } };
      const editor2: CaseEditorView = { ...editor, nodes: [...editor.nodes, nodo], maps: [...editor.maps, mapa] };

      const caso = casoDesdeApi(editor2, [...mundos, mundoNuevo], universidad);

      expect(caso.salas.map((s) => s.id)).toEqual(['pasillo', 'consultorio']);
      expect(caso.escenas.map((e) => e.salaId)).toEqual(['pasillo', 'consultorio', 'consultorio']);
    });

    it('salaIdDeMapa usa ambient.salaId y, sin ella, la clave del mapa', () => {
      const { mundos } = casoCopiadoDeLugar(universidad, ['pasillo']);
      expect(salaIdDeMapa(mundos[0].map)).toBe('pasillo');
      expect(salaIdDeMapa({ ...mundos[0].map, ambient: {} })).toBe('sala-pasillo');
    });
  });

  describe('lo que escribe el docente en un caso con guion', () => {
    const { editor, mundos } = casoSinLugar();
    const caso = casoDesdeApi(editor, mundos);
    const [inicio, riesgo, cierre] = caso.escenas;

    it('las escenas traen el inicio, los finales, la intensidad, el aviso y la marca de la IA', () => {
      expect(caso.inicioId).toBe('1');
      expect([inicio.esFinal, riesgo.esFinal, cierre.esFinal]).toEqual([false, false, true]);
      expect(riesgo).toMatchObject({ intensidad: 'HIGH', advertencia: 'Habla de violencia.', marcaIa: true });
      expect(inicio.marcaIa).toBe(false);
    });

    it('las respuestas guardan la clase de 4 valores, la razón, los efectos y el destino', () => {
      expect(inicio.respuestas.map((r) => [r.id, r.clase, r.destinoId])).toEqual([
        ['51', 'RECOMMENDED', '2'],
        ['52', 'CONTRAINDICATED', '3'],
      ]);
      expect(riesgo.respuestas[0].clase).toBe('ACCEPTABLE');
      expect(inicio.respuestas[0].efectos).toEqual({
        persona: { bond: 1, activation: -1 }, hitos: ['valorar_el_riesgo'], competencias: ['ESCUCHA'],
      });
      expect(inicio.respuestas[1].razon).toBe('Apura a la persona.');
      expect(inicio.respuestas[1].marcaIa).toBe(true);
    });

    it('la retroalimentación es la pedagógica y, si falta, la inmediata', () => {
      expect(inicio.respuestas[0].retroalimentacion).toBe('Escuchar da seguridad.');
      expect(riesgo.respuestas[0].retroalimentacion).toBe('Es una opción.');
    });

    it('el guion sale del diálogo de la escena, con el personaje, la expresión y la marca de cada línea', () => {
      expect(inicio.lineas).toEqual([
        { id: '31:1', personajeId: 'camila', texto: 'No sé por dónde empezar.', expresion: 'triste', emocionDeOrigen: 'triste', marcaIa: false },
        { id: '31:2', personajeId: 'camila', texto: 'Tengo miedo.', expresion: 'en-crisis', emocionDeOrigen: 'en-crisis', marcaIa: true },
      ]);
      expect(riesgo.lineas).toEqual([]);
    });

    it('una expresión que el kit no tiene se lee como neutral, pero el valor de origen se conserva', () => {
      const m = structuredClone(mundos);
      m[0].dialogues[0].lines[0].emotion = 'furiosa';
      const linea = casoDesdeApi(editor, m).escenas[0].lineas[0];
      expect(linea.expresion).toBe('neutral');
      expect(linea.emocionDeOrigen).toBe('furiosa');
    });

    // M1: los casos viejos guardan emociones del vocabulario anterior; se leen con la tabla del kit.
    it.each([
      ['concerned', 'preocupada'], ['danger', 'triste'], ['vulnerable', 'preocupada'], ['positive', 'alegre'],
      ['guarded', 'cautelosa'], ['crisis', 'en-crisis'], ['calm', 'neutral'],
    ])('la emoción heredada «%s» se lee como el retrato «%s»', (emocion, retrato) => {
      const m = structuredClone(mundos);
      m[0].dialogues[0].lines[0].emotion = emocion;
      const linea = casoDesdeApi(editor, m).escenas[0].lineas[0];
      expect(linea.expresion).toBe(retrato);
      expect(linea.emocionDeOrigen).toBe(emocion);
    });

    it('los recursos de apoyo de cada nodo llegan a su escena', () => {
      const m = structuredClone(editor);
      m.nodes[0].supportResources = ['Línea de atención 106'];
      const escenas = casoDesdeApi(m, mundos).escenas;
      expect(escenas[0].recursosApoyo).toEqual(['Línea de atención 106']);
      expect(escenas[1].recursosApoyo).toEqual(editor.nodes[1].supportResources);
    });

    it('la tabla de emociones es la del kit de personajes', () => {
      expect(EMOCION_A_EXPRESION).toEqual(catalogoDelKit.emotionToPortrait);
    });

    // M2: la narración de la escena viaja con la escena.
    it('la escena lleva su narración', () => {
      expect(inicio.narracion).toBe('Narración de Primer contacto');
      expect(riesgo.narracion).toBe('Narración de Valoración del riesgo');
    });

    it('un hablante que no es un personaje del caso conserva su nombre', () => {
      const m = structuredClone(mundos);
      m[0].dialogues[0].lines[0].speakerName = 'Vecina';
      expect(casoDesdeApi(editor, m).escenas[0].lineas[0].personajeId).toBe('Vecina');
    });

    it('los diálogos atados a una persona del mapa que no son «guion-…» no son el guion de la escena', () => {
      const m = structuredClone(mundos);
      m[0].dialogues[0].key = 'dialogo-de-la-vecina';
      m[0].dialogues[0].mapObjectId = 21;
      expect(casoDesdeApi(editor, m).escenas[0].lineas).toEqual([]);
    });

    it('el guion sigue siendo el guion cuando cuelga de una persona de la sala (así lo recibe el estudiante)', () => {
      const m = structuredClone(mundos);
      expect(m[0].dialogues[0].key).toMatch(/^guion-/);
      m[0].dialogues[0].mapObjectId = 21;
      expect(casoDesdeApi(editor, m).escenas[0].lineas).toHaveLength(2);
    });

    it('los hitos y el riesgo del caso, y sus finales propios con la condición y la marca de la IA', () => {
      expect(caso.hitos.map((h) => [h.clave, h.decisivo])).toEqual([['valorar_el_riesgo', true], ['informar_derechos', false]]);
      expect(caso.nivelRiesgo).toBe('EXTREME');
      expect(caso.modoFinales).toBe('propio');
      expect(caso.finales).toEqual([
        { id: 'critica', nombre: 'Crítica', texto: 'Pudo hacer daño.', tono: 'critical', condicion: { count: 'contraindicated', gte: 1 }, marcaIa: false },
        { id: 'con_brechas', nombre: 'Con brechas', texto: 'Quedaron cosas.', tono: 'neutral', condicion: null, marcaIa: true },
      ]);
    });

    it('el personaje del caso trae su retrato', () => {
      expect(caso.personajes).toEqual([{ id: 'camila', nombre: 'Camila', rol: 'Consultante', recipeId: 'camila' }]);
    });
  });

  it('un caso sin escenas abre vacío', () => {
    const { editor } = casoSinLugar();
    const vacio = casoDesdeApi({ ...editor, maps: [], nodes: [], decisions: [] }, []);
    expect(vacio.salas).toEqual([]);
    expect(vacio.escenas).toEqual([]);
    expect(vacio.inicioId).toBeNull();
  });

  // M3: ninguna escena desaparece por no tener mapa.
  describe('escenas sin mapa', () => {
    const sinMapa = () => {
      const { editor, mundos } = casoSinLugar();
      // El cierre (terminal) pierde su mapa, como en un caso hecho a mano.
      return { editor: { ...editor, maps: editor.maps.filter((m) => m.nodeId !== 3) }, mundos: mundos.filter((m) => m.nodeId !== 3) };
    };

    it('un final sin mapa aparece, con sala nula, y las respuestas que llevan a él no quedan colgando', () => {
      const { editor, mundos } = sinMapa();
      const caso = casoDesdeApi(editor, mundos);
      expect(caso.escenas.map((e) => e.id)).toEqual(['1', '2', '3']);
      expect(caso.escenas[2]).toMatchObject({ titulo: 'Cierre', salaId: null, esFinal: true });
      expect(caso.salas.map((s) => s.id)).toEqual(['mapa-inicio', 'mapa-riesgo']);
      expect(caso.escenas.flatMap((e) => e.respuestas).filter((r) => r.destinoId === '3')).toHaveLength(2);
    });

    it('los caminos y el envío no dan avisos falsos por la escena sin mapa', () => {
      const { editor, mundos } = sinMapa();
      const caso = casoDesdeApi(editor, mundos);
      expect(revisarCaminos(caso)).toEqual([]);
      // Ningún aviso de caminos: solo que la sala de la escena no tiene a nadie con quien hablar, lo del modelo (la escena sin
      // recomendada, el hito que nadie marca) y lo de la IA.
      expect(puedeEnviar(caso).faltas.map((f) => f.codigo ?? f.mensaje)).toEqual([
        'La escena «Valoración del riesgo» tiene respuestas pero en su sala no hay nadie con quien hablar. Agrega una persona.',
        'scene-without-recommended', 'milestone-unreachable', '4 partes generadas por IA sin revisar.',
      ]);
    });

    it('el inicio sin mapa de un caso en blanco aparece como escena de inicio', () => {
      const { editor } = casoSinLugar();
      const blanco = casoDesdeApi({
        ...editor, maps: [], decisions: [], nodes: [{ ...editor.nodes[0], key: 'inicio', title: 'Inicio', startNode: true }],
      }, []);
      expect(blanco.salas).toEqual([]);
      expect(blanco.escenas).toHaveLength(1);
      expect(blanco.escenas[0]).toMatchObject({ id: '1', titulo: 'Inicio', salaId: null, lineas: [] });
      expect(blanco.inicioId).toBe('1');
    });
  });

  describe('finales de plantilla, competencias y estado', () => {
    const lugar = () => casoCopiadoDeLugar(universidad, SALAS);

    it('los cuatro finales de plantilla guardados vuelven como modo automático con solo los textos que cambió el docente', () => {
      const { editor, mundos } = lugar();
      const original = casoDesdeApi(editor, mundos, universidad);
      editor.rules.endings = finalesAApi({ ...original, textosPlantilla: { critica: { texto: 'Cuidado con esto.' } } });
      expect(editor.rules.endings).toHaveLength(4);
      const caso = casoDesdeApi(editor, mundos, universidad);
      expect(caso.modoFinales).toBe('automatico');
      expect(caso.finales).toEqual([]);
      expect(caso.textosPlantilla).toEqual({ critica: { texto: 'Cuidado con esto.' } });
      expect(finalesDePlantilla(caso)[0].texto).toBe('Cuidado con esto.');
    });

    it('finales propios que no son los de plantilla siguen siendo propios', () => {
      const { editor, mundos } = lugar();
      editor.rules.endings = [{ key: 'uno', title: 'Uno', message: 'Texto.', tone: 'neutral' }];
      const caso = casoDesdeApi(editor, mundos, universidad);
      expect(caso.modoFinales).toBe('propio');
      expect(caso.finales.map((f) => f.id)).toEqual(['uno']);
      expect(caso.textosPlantilla).toBeUndefined();
    });

    it('las competencias del caso salen de su rúbrica y el estado es el del servidor', () => {
      const { editor, mundos } = lugar();
      editor.status = 'IN_REVIEW';
      editor.rubrics = [{
        rubricId: 1, rubricName: 'R', description: null, scores: [], comment: null,
        criteria: [{ id: 1, competency: 'Ética profesional', title: 'Ética', description: null, displayOrder: 0 }],
      }];
      const caso = casoDesdeApi(editor, mundos, universidad);
      expect(caso.competencias).toEqual([{ codigo: 'ETICA_PROFESIONAL', nombre: 'Ética profesional' }]);
      expect(caso.estado).toBe('IN_REVIEW');
    });
  });
});

describe('casoDesdeApi: cómo se mueven las personas, a quién atender y los datos del caso', () => {
  const lugar = () => structuredClone(casoCopiadoDeLugar(universidad, SALAS));
  const personaDe = (mundos: WorldDefinition[], sala = 1) => mundos[sala].objects.find((o) => o.type === 'PERSON')!;

  it('una persona sin dato se queda quieta y no es a quien atender', () => {
    const { editor, mundos } = lugar();
    const caso = casoDesdeApi(editor, mundos, universidad);
    expect(caso.salas[1].personajes[0]).toMatchObject({ movimiento: 'quieto', personaClave: false });
  });

  it('lee que la persona camina por la sala', () => {
    const { editor, mundos } = lugar();
    personaDe(mundos).metadata = { ...personaDe(mundos).metadata, movimiento: 'deambula' };
    expect(casoDesdeApi(editor, mundos, universidad).salas[1].personajes[0].movimiento).toBe('deambula');
  });

  it('lee que la persona va y viene hasta un punto', () => {
    const { editor, mundos } = lugar();
    personaDe(mundos).metadata = { ...personaDe(mundos).metadata, movimiento: { tipo: 'va-y-viene', hasta: { x: 600, y: 420 } } };
    expect(casoDesdeApi(editor, mundos, universidad).salas[1].personajes[0].movimiento).toEqual({ tipo: 'va-y-viene', hasta: { x: 600, y: 420 } });
  });

  it('un movimiento mal formado se lee como quieto', () => {
    const { editor, mundos } = lugar();
    personaDe(mundos).metadata = { ...personaDe(mundos).metadata, movimiento: { tipo: 'va-y-viene', hasta: 'allá' } };
    expect(casoDesdeApi(editor, mundos, universidad).salas[1].personajes[0].movimiento).toBe('quieto');
  });

  it('lee a la persona a atender, y solo si el dato es verdadero', () => {
    const { editor, mundos } = lugar();
    personaDe(mundos).metadata = { ...personaDe(mundos).metadata, personaClave: true };
    expect(casoDesdeApi(editor, mundos, universidad).salas[1].personajes[0].personaClave).toBe(true);
    personaDe(mundos).metadata = { ...personaDe(mundos).metadata, personaClave: 'sí' };
    expect(casoDesdeApi(editor, mundos, universidad).salas[1].personajes[0].personaClave).toBe(false);
  });

  it('trae el contexto y los objetivos de aprendizaje del caso', () => {
    const { editor, mundos } = lugar();
    editor.context = 'Una estudiante llega a Bienestar.';
    editor.learningObjectives = ['Valorar el riesgo.', 'Validar sin juzgar.'];
    const caso = casoDesdeApi(editor, mundos, universidad);
    expect(caso.contexto).toBe('Una estudiante llega a Bienestar.');
    expect(caso.objetivos).toEqual(['Valorar el riesgo.', 'Validar sin juzgar.']);
  });

  it('un caso sin contexto ni objetivos los trae vacíos', () => {
    const { editor, mundos } = lugar();
    editor.context = undefined as unknown as string;
    editor.learningObjectives = undefined as unknown as string[];
    const caso = casoDesdeApi(editor, mundos, universidad);
    expect(caso.contexto).toBe('');
    expect(caso.objetivos).toEqual([]);
  });

  it('un objeto del mapa que ofrece una respuesta conserva cuál: sin eso el editor creería que nadie la ofrece', () => {
    const { editor, mundos } = lugar();
    const objeto = mundos[1].objects.find((o) => o.type !== 'PERSON' && o.type !== 'EXIT' && o.type !== 'PROP')!;
    objeto.decisionOptionId = 77;
    const caso = casoDesdeApi(editor, mundos, universidad);
    const colocado = caso.salas[1].objetos.find((o) => o.clave === objeto.key)!;
    expect(colocado.decisionOptionId).toBe(77);
    expect(caso.salas[1].objetos.filter((o) => o.decisionOptionId !== undefined)).toHaveLength(1);
  });

  it('A7 · lo que el servidor tiene marcado como sugerido por la IA (muebles, objetos y personas) llega con la marca; lo demás, sin ella', () => {
    const { editor, mundos } = lugar();
    const sala = mundos[1];
    const mueble = sala.objects.find((o) => o.type === 'PROP')!;
    const persona = sala.objects.find((o) => o.type === 'PERSON')!;
    mueble.aiSuggested = true;
    persona.aiSuggested = true;
    const caso = casoDesdeApi(editor, mundos, universidad);
    const delaSala = caso.salas[1];
    expect(delaSala.muebles.find((m) => m.clave === mueble.key)!.marcaIa).toBe(true);
    expect(delaSala.personajes.find((p) => p.clave === persona.key)!.marcaIa).toBe(true);
    expect([...delaSala.muebles, ...delaSala.objetos, ...delaSala.personajes].filter((c) => c.marcaIa)).toHaveLength(2);
  });
});

describe('casoDesdeApi: los campos 2.1 (objetivo, pistas, comentarios, requisito y reacción)', () => {
  const base = () => casoSinLugar();

  it('lee el objetivo, las pistas de la sala de la escena por su orden y los comentarios', () => {
    const { editor, mundos } = base();
    const mapaDeInicio = editor.maps.find((m) => m.nodeId === 1)!;
    const mapaDeRiesgo = editor.maps.find((m) => m.nodeId === 2)!;
    editor.nodes[0].goal = 'Que la persona se sienta escuchada.';
    editor.hints = [
      { id: 92, mapId: mapaDeInicio.id, order: 2, text: 'Mira la carpeta.' },
      { id: 91, mapId: mapaDeInicio.id, order: 1, text: 'Empieza por saludar.' },
      { id: 93, mapId: mapaDeRiesgo.id, order: 1, text: 'Otra sala.' },
    ];
    editor.nodes[0].comments = [
      { personaje: 'camila', linea: 'Me da pena.', cuando: { talked: 'camila' }, emocion: 'triste', gesto: 'baja-la-mirada' },
      { personaje: 'camila', linea: 'Hola.' },
    ];
    const [inicio, riesgo] = casoDesdeApi(editor, mundos).escenas;
    expect(inicio.objetivo).toBe('Que la persona se sienta escuchada.');
    expect(inicio.pistas).toEqual([{ id: '91', texto: 'Empieza por saludar.' }, { id: '92', texto: 'Mira la carpeta.' }]);
    expect(inicio.comentarios).toEqual([
      { personaje: 'camila', linea: 'Me da pena.', cuando: { talked: 'camila' }, emocion: 'triste', gesto: 'baja-la-mirada' },
      { personaje: 'camila', linea: 'Hola.' },
    ]);
    expect(riesgo.pistas).toEqual([{ id: '93', texto: 'Otra sala.' }]);
    expect(riesgo.objetivo).toBe('');
  });

  it('sin comments del servidor (aún no lo envía) da []; sin pistas, []', () => {
    const { editor, mundos } = base();
    for (const n of editor.nodes) delete n.comments;
    const escenas = casoDesdeApi(editor, mundos).escenas;
    expect(escenas.every((e) => Array.isArray(e.comentarios) && e.comentarios.length === 0)).toBe(true);
    expect(escenas.every((e) => Array.isArray(e.pistas) && e.pistas.length === 0)).toBe(true);
  });

  it('lee el requisito (el JSON tal cual, copiado) y la reacción de cada respuesta; sin ellos, {}', () => {
    const { editor, mundos } = base();
    editor.decisions[0].requires = { all: [{ talked: 'camila' }, { milestone: 'informar_derechos' }] };
    editor.decisions[0].reaction = { linea: 'Gracias.', emocion: 'alegre', gesto: 'asiente', personaje: 'camila' };
    const respuestas = casoDesdeApi(editor, mundos).escenas[0].respuestas;
    expect(respuestas[0].requiere).toEqual({ all: [{ talked: 'camila' }, { milestone: 'informar_derechos' }] });
    expect(respuestas[0].requiere).not.toBe(editor.decisions[0].requires);
    expect(respuestas[0].reaccion).toEqual({ linea: 'Gracias.', emocion: 'alegre', gesto: 'asiente', personaje: 'camila' });
    expect(respuestas[1].requiere).toEqual({});
    expect(respuestas[1].reaccion).toEqual({});
  });

  it('una reacción con una emoción o un gesto fuera del vocabulario no los inventa', () => {
    const { editor, mundos } = base();
    editor.decisions[0].reaction = { linea: 'Ya.', emocion: 'furiosa', gesto: 'salta' };
    expect(casoDesdeApi(editor, mundos).escenas[0].respuestas[0].reaccion).toEqual({ linea: 'Ya.' });
  });

  it('el ensayo hasta el final: rehearsedToEnd, y su ausencia es false', () => {
    const { editor, mundos } = base();
    expect(casoDesdeApi(editor, mundos).probadoHastaElFinal).toBe(false);
    expect(casoDesdeApi({ ...editor, rehearsedToEnd: true }, mundos).probadoHastaElFinal).toBe(true);
  });

  it('las herramientas del caso y la que entrega cada objeto', () => {
    const { editor, mundos } = casoCopiadoDeLugar(universidad, SALAS);
    editor.tools = [
      { id: 1, code: 'PAP', label: 'Primeros auxilios', icon: '', category: '', description: '', active: true },
      { id: 2, code: 'OFF', label: 'Apagada', icon: '', category: '', description: '', active: false },
    ];
    const objeto = mundos[1].objects.find((o) => o.type !== 'PERSON' && o.type !== 'PROP' && o.type !== 'EXIT')!;
    objeto.toolCode = 'PAP';
    const caso = casoDesdeApi(editor, mundos, universidad);
    expect(caso.herramientas).toEqual([{ codigo: 'PAP', nombre: 'Primeros auxilios' }]);
    expect(caso.salas[1].objetos.find((o) => o.clave === objeto.key)!.toolCode).toBe('PAP');
    expect(caso.salas[1].objetos.filter((o) => o.toolCode !== undefined)).toHaveLength(1);
  });
});
