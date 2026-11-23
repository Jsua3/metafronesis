import type { WorldDefinition } from '../../../core/models/simulation.model';
import { casoCopiadoDeLugar, casoSinLugar } from '../testing/caso-api';
import { universidad } from '../testing/universidad';
import type { CasoBorrador, Escena, Respuesta } from './caso';
import { casoDesdeApi } from './desde-api';
import {
  claveDeRegla, cuerpoCrearCaso, cuerpoDecision, cuerpoGuion, cuerpoNodo, finalesAApi, hitosAApi, solicitudDeSala,
} from './hacia-api';

const respuesta = (cambios: Partial<Respuesta> = {}): Respuesta => ({
  id: 'respuesta-1', texto: 'Te escucho.', clase: 'RECOMMENDED', razon: '', retroalimentacion: 'Da seguridad.',
  efectos: {}, destinoId: '2', marcaIa: false, ...cambios,
});

const escena = (cambios: Partial<Escena> = {}): Escena => ({
  id: 'escena-ab12', titulo: 'Escena nueva', narracion: '', salaId: 'consultorio', lineas: [], respuestas: [], esFinal: false,
  posicion: { x: 240, y: 120 }, intensidad: 'MEDIUM', advertencia: null, ...cambios,
});

describe('reglas del caso: hitos, riesgo y finales', () => {
  it('los hitos viajan con las claves y los campos de la API', () => {
    expect(hitosAApi([{ clave: 'valorar_el_riesgo', nombre: 'Valorar el riesgo', descripcion: 'Explorar.', decisivo: true }])).toEqual([
      { key: 'valorar_el_riesgo', label: 'Valorar el riesgo', description: 'Explorar.', decisive: true },
    ]);
  });

  it('una clave solo lleva letras, números y «_»: los guiones y los espacios pasan a «_»', () => {
    expect(claveDeRegla('final-1a2b3c4d')).toBe('final_1a2b3c4d');
    expect(claveDeRegla('Valorar el riesgo')).toBe('Valorar_el_riesgo');
    expect(claveDeRegla('x'.repeat(80))).toHaveLength(60);
  });

  describe('finales por hitos', () => {
    const base = casoDesdeApi(casoSinLugar().editor, casoSinLugar().mundos);

    it('en modo automático no se manda ninguno: valen los cuatro del modelo', () => {
      expect(finalesAApi({ ...base, modoFinales: 'automatico' })).toEqual([]);
    });

    it('en modo automático con un texto reescrito se mandan los cuatro de plantilla, con ese texto y la condición de los hitos decisivos', () => {
      const lugar = casoCopiadoDeLugar(universidad, ['sala-espera', 'consultorio']);
      const automatico = casoDesdeApi(lugar.editor, lugar.mundos, universidad);
      const decisivos = automatico.hitos.filter((h) => h.decisivo).map((h) => h.clave);
      expect(decisivos.length).toBeGreaterThan(0);
      const enviados = finalesAApi({ ...automatico, textosPlantilla: { protectora: { texto: 'Acompañaste bien.' } } });
      expect(enviados.map((f) => f.key)).toEqual(['critica', 'protectora', 'riesgo_persistente', 'con_brechas']);
      expect(enviados[1]).toMatchObject({ title: 'Intervención protectora', message: 'Acompañaste bien.', tone: 'positive', aiSuggested: false });
      expect(JSON.stringify(enviados[1].when)).toContain(decisivos[0]);
      expect(enviados[3]).not.toHaveProperty('when');
      // sin textos reescritos no se manda nada: el servidor usa los suyos
      expect(finalesAApi({ ...automatico, textosPlantilla: {} })).toEqual([]);
    });

    it('en modo propio se mandan los del docente, en orden, con su condición y su tono', () => {
      expect(finalesAApi({ ...base, modoFinales: 'propio' })).toEqual([
        { key: 'critica', title: 'Crítica', message: 'Pudo hacer daño.', tone: 'critical', when: { count: 'contraindicated', gte: 1 }, aiSuggested: false },
        { key: 'con_brechas', title: 'Con brechas', message: 'Quedaron cosas.', tone: 'neutral', aiSuggested: true },
      ]);
    });

    it('la marca de la IA se manda siempre, también en bajo (omitirla conserva la guardada), y un final sin condición no manda «when»', () => {
      const [critica] = finalesAApi({ ...base, modoFinales: 'propio' });
      expect(critica.aiSuggested).toBe(false);
      const [, brechas] = finalesAApi({ ...base, modoFinales: 'propio' });
      expect(brechas).not.toHaveProperty('when');
    });

    it('las claves se vuelven válidas y no se repiten', () => {
      const caso: CasoBorrador = {
        ...base, modoFinales: 'propio', finales: [
          { id: 'final-aa', nombre: 'A', texto: 'a', tono: 'neutral', condicion: { milestone: 'valorar_el_riesgo' }, marcaIa: false },
          { id: 'final_aa', nombre: 'B', texto: 'b', tono: 'neutral', condicion: null, marcaIa: false },
        ],
      };
      expect(finalesAApi(caso).map((f) => f.key)).toEqual(['final_aa', 'final_aa_2']);
    });
  });
});

describe('cuerpoNodo: la escena como nodo', () => {
  it('una escena nueva manda lo que el docente ve y valores vacíos para lo demás', () => {
    expect(cuerpoNodo(escena(), { nodeKey: 'escena-nueva-en-consultorio', esInicio: false })).toEqual({
      nodeKey: 'escena-nueva-en-consultorio', title: 'Escena nueva', narrative: '', requiredTools: [], supportResources: [],
      sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: false, startNode: false,
      positionX: 240, positionY: 120, intensity: 'MEDIUM',
    });
  });

  // M2: la narración es de la escena; se manda la que tenga (también en una escena nueva, p. ej. la que propone la IA).
  it('la narración de la escena viaja: nueva (con texto) y editada', () => {
    expect(cuerpoNodo(escena({ narracion: 'La persona espera en el pasillo.' }), { nodeKey: 'x', esInicio: false }).narrative)
      .toBe('La persona espera en el pasillo.');
    const previo = casoSinLugar().editor.nodes[1];
    expect(cuerpoNodo(escena({ narracion: 'Texto nuevo' }), { esInicio: false, previo }).narrative).toBe('Texto nuevo');
  });

  it('una escena que ya existe conserva lo que el editor no muestra: las herramientas y los apoyos', () => {
    const { editor } = casoSinLugar();
    const previo = editor.nodes[1];
    const cuerpo = cuerpoNodo(escena({ titulo: 'Otro título', narracion: previo.narrative }), { esInicio: false, previo });
    expect(cuerpo).toMatchObject({
      nodeKey: 'riesgo', title: 'Otro título', narrative: 'Narración de Valoración del riesgo',
      requiredTools: ['ficha-riesgo'], supportResources: ['Línea 123'], sensitiveContent: true, safeExitRequired: true,
    });
  });

  it('los recursos de apoyo que el docente escribió viajan; sin ellos, una escena que ya existe conserva los suyos', () => {
    const previo = casoSinLugar().editor.nodes[1];
    expect(cuerpoNodo(escena({ recursosApoyo: ['Línea 106'] }), { esInicio: false, previo }).supportResources).toEqual(['Línea 106']);
    expect(cuerpoNodo(escena({ recursosApoyo: [] }), { esInicio: false, previo }).supportResources).toEqual([]);
    expect(cuerpoNodo(escena(), { esInicio: false, previo }).supportResources).toEqual(['Línea 123']);
    expect(cuerpoNodo(escena({ recursosApoyo: ['Línea 106'] }), { nodeKey: 'x', esInicio: false }).supportResources).toEqual(['Línea 106']);
  });

  it('no manda el enunciado de la decisión (el servidor no lo toca si falta)', () => {
    const cuerpo = cuerpoNodo(escena(), { nodeKey: 'x', esInicio: false, previo: casoSinLugar().editor.nodes[0] });
    expect(cuerpo).not.toHaveProperty('decisionPrompt');
  });

  it('marca final, inicio, intensidad y aviso', () => {
    const cuerpo = cuerpoNodo(escena({ esFinal: true, intensidad: 'HIGH', advertencia: 'Habla de violencia.' }), { nodeKey: 'x', esInicio: true });
    expect(cuerpo).toMatchObject({ terminal: true, startNode: true, intensity: 'HIGH', warningMessage: 'Habla de violencia.' });
  });

  it('la marca de la IA se manda al crear una escena que propuso la IA y al editar una que el servidor aún no tiene marcada; si ya la tiene, no se toca', () => {
    expect(cuerpoNodo(escena({ marcaIa: true }), { nodeKey: 'x', esInicio: false })).toMatchObject({ aiSuggested: true });
    const { nodes } = casoSinLugar().editor;
    expect(nodes[1].aiSuggested).toBe(true);
    expect(cuerpoNodo(escena({ marcaIa: true }), { esInicio: false, previo: nodes[1] })).not.toHaveProperty('aiSuggested');
    // la IA cambió una escena que existía (por ejemplo, su intensidad): hay que marcarla
    expect(cuerpoNodo(escena({ marcaIa: true }), { esInicio: false, previo: nodes[0] })).toMatchObject({ aiSuggested: true });
    expect(cuerpoNodo(escena({ marcaIa: false }), { esInicio: false, previo: nodes[0] })).not.toHaveProperty('aiSuggested');
    expect(cuerpoNodo(escena({ marcaIa: false }), { nodeKey: 'x', esInicio: false })).not.toHaveProperty('aiSuggested');
  });
});

describe('cuerpoDecision: la respuesta como opción', () => {
  it('guarda la clase de 4 valores, la retroalimentación y los efectos', () => {
    const cuerpo = cuerpoDecision(
      respuesta({ efectos: { persona: { bond: 1, activation: -1 }, hitos: ['valorar_el_riesgo'], competencias: ['ESCUCHA'] } }),
      1, { optionKey: 'escuchar' },
    );
    expect(cuerpo).toEqual({
      sourceNodeId: 1, targetNodeId: 2, optionKey: 'escuchar', text: 'Te escucho.', responseClass: 'RECOMMENDED',
      prohibitedConduct: false, prohibitionReason: null, immediateFeedback: '', feedbackText: 'Da seguridad.',
      effects: { persona: { bond: 1, activation: -1 }, milestones: ['valorar_el_riesgo'], competencies: ['ESCUCHA'] },
    });
  });

  it.each(['RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED'] as const)('la clase %s llega tal cual', (clase) => {
    const cuerpo = cuerpoDecision(respuesta({ clase, razon: 'Porque sí.' }), 1, { optionKey: 'o' })!;
    expect(cuerpo.responseClass).toBe(clase);
    expect(cuerpo.prohibitedConduct).toBe(clase === 'CONTRAINDICATED');
  });

  it('la razón solo viaja cuando la respuesta es contraindicada', () => {
    expect(cuerpoDecision(respuesta({ clase: 'CONTRAINDICATED', razon: 'Apura a la persona.' }), 1, { optionKey: 'o' })).toMatchObject({
      prohibitionReason: 'Apura a la persona.',
    });
    expect(cuerpoDecision(respuesta({ clase: 'RISKY', razon: 'sobra' }), 1, { optionKey: 'o' })).toMatchObject({ prohibitionReason: null });
  });

  it('sin clase, no manda «responseClass» (el servidor la exige al crear y lo dirá en palabras)', () => {
    const cuerpo = cuerpoDecision(respuesta({ clase: null }), 1, { optionKey: 'o' })!;
    expect(cuerpo).not.toHaveProperty('responseClass');
  });

  it('sin efectos manda «{}»: así se limpian los que había', () => {
    expect(cuerpoDecision(respuesta({ efectos: {} }), 1, { optionKey: 'o' })!.effects).toEqual({});
  });

  it('una respuesta sin destino, o con un destino que aún no está en el servidor, no se puede guardar', () => {
    expect(cuerpoDecision(respuesta({ destinoId: null }), 1, { optionKey: 'o' })).toBeNull();
    expect(cuerpoDecision(respuesta({ destinoId: 'escena-ab12' }), 1, { optionKey: 'o' })).toBeNull();
  });

  it('al editar, la clave de la opción y la retroalimentación inmediata son las que ya tenía', () => {
    const { editor } = casoSinLugar();
    const previo = editor.decisions[2];
    const cuerpo = cuerpoDecision(respuesta({ destinoId: '3', clase: 'ACCEPTABLE', retroalimentacion: 'Nueva.' }), 2, { previo })!;
    expect(cuerpo).toMatchObject({ optionKey: 'derivar', immediateFeedback: 'Es una opción.', feedbackText: 'Nueva.' });
  });

  it('no manda el texto de consecuencia ni el fundamento (no se tocan) ni la marca de la IA si el servidor ya la tiene', () => {
    const previo = casoSinLugar().editor.decisions[1];
    expect(previo.aiSuggested).toBe(true);
    const cuerpo = cuerpoDecision(respuesta({ marcaIa: true }), 1, { previo })!;
    expect(cuerpo).not.toHaveProperty('consequenceText');
    expect(cuerpo).not.toHaveProperty('theoryBasis');
    expect(cuerpo).not.toHaveProperty('aiSuggested');
  });

  it('A7 · una respuesta existente que la IA cambió se manda con la marca en alto; si no la cambió, no se toca', () => {
    const previo = casoSinLugar().editor.decisions[0];
    expect(previo.aiSuggested).toBe(false);
    expect(cuerpoDecision(respuesta({ marcaIa: true }), 1, { previo })).toMatchObject({ aiSuggested: true });
    expect(cuerpoDecision(respuesta({ marcaIa: false }), 1, { previo })).not.toHaveProperty('aiSuggested');
  });

  it('una respuesta que propuso la IA se crea con la marca en alto', () => {
    expect(cuerpoDecision(respuesta({ marcaIa: true }), 1, { optionKey: 'o' })).toMatchObject({ aiSuggested: true });
  });

  it('la clase y los efectos sobreviven ida y vuelta: del servidor al borrador y de vuelta a la petición', () => {
    const { editor, mundos } = casoSinLugar();
    const caso = casoDesdeApi(editor, mundos);
    for (const d of editor.decisions) {
      const r = caso.escenas.flatMap((e) => e.respuestas).find((x) => x.id === String(d.id))!;
      const cuerpo = cuerpoDecision(r, d.sourceNodeId, { previo: d })!;
      expect(cuerpo).toMatchObject({
        sourceNodeId: d.sourceNodeId, targetNodeId: d.targetNodeId, optionKey: d.optionKey, text: d.text,
        responseClass: d.responseClass, prohibitionReason: d.prohibitionReason, effects: d.effects,
        prohibitedConduct: d.prohibitedConduct,
      });
    }
  });
});

describe('cuerpoGuion: las emociones heredadas no se pierden (M1)', () => {
  const mundoConEmociones = (emociones: string[]) => {
    const { editor, mundos } = casoSinLugar();
    const m = structuredClone(mundos);
    m[0].dialogues[0].lines = emociones.map((emotion, i) => ({ order: i + 1, speakerName: 'Camila', text: `L${i}`, emotion, aiSuggested: false }));
    return { editor, m };
  };

  it('leer y guardar sin tocar deja cada emoción como estaba (concerned, danger, vulnerable, furiosa)', () => {
    const originales = ['concerned', 'danger', 'vulnerable', 'furiosa', 'triste'];
    const { editor, m } = mundoConEmociones(originales);
    const caso = casoDesdeApi(editor, m);
    const cuerpo = cuerpoGuion(caso.escenas[0], caso.personajes, { nodeKey: 'inicio', previo: m[0].dialogues[0] });
    expect(cuerpo.lines!.map((l) => l.emotion)).toEqual(originales);
  });

  it('si el docente cambia la expresión, se escribe el retrato elegido', () => {
    const { editor, m } = mundoConEmociones(['concerned', 'danger']);
    const caso = casoDesdeApi(editor, m);
    caso.escenas[0].lineas[0] = { ...caso.escenas[0].lineas[0], expresion: 'alegre' };
    caso.escenas[0].lineas[1] = { ...caso.escenas[0].lineas[1], expresion: 'triste' }; // «danger» ya se lee como «triste»: no se toca
    const cuerpo = cuerpoGuion(caso.escenas[0], caso.personajes, { nodeKey: 'inicio', previo: m[0].dialogues[0] });
    expect(cuerpo.lines!.map((l) => l.emotion)).toEqual(['alegre', 'danger']);
  });

  it('una línea nueva escribe la expresión elegida', () => {
    const personajes = [{ id: 'camila', nombre: 'Camila', rol: 'Consultante', recipeId: 'camila' }];
    const cuerpo = cuerpoGuion(escena({ lineas: [{ id: 'l', personajeId: 'camila', texto: 'Hola', expresion: 'cautelosa', marcaIa: false }] }), personajes, { nodeKey: 'x' });
    expect(cuerpo.lines![0].emotion).toBe('cautelosa');
  });
});

describe('cuerpoGuion: las líneas como diálogo', () => {
  const personajes = [{ id: 'camila', nombre: 'Camila', rol: 'Consultante', recipeId: 'camila' }];
  const lineas = [
    { id: 'l1', personajeId: 'camila', texto: 'Hola.', expresion: 'triste' as const, marcaIa: false },
    { id: 'l2', personajeId: 'Vecina', texto: 'Adiós.', expresion: 'en-crisis' as const, marcaIa: true },
  ];

  it('numera las líneas desde 1 con el nombre del personaje, la expresión y la marca de la IA', () => {
    expect(cuerpoGuion(escena({ lineas }), personajes, { nodeKey: 'consultorio' })).toEqual({
      treeKey: 'guion-consultorio', speakerName: 'Camila', portraitKey: null, emotion: 'neutral',
      lines: [
        { displayOrder: 1, speakerName: 'Camila', text: 'Hola.', emotion: 'triste', aiSuggested: false },
        { displayOrder: 2, speakerName: 'Vecina', text: 'Adiós.', emotion: 'en-crisis', aiSuggested: true },
      ],
    });
  });

  it('un guion sin líneas manda una lista vacía (borra las que había) con un hablante cualquiera', () => {
    const cuerpo = cuerpoGuion(escena({ lineas: [] }), personajes, { nodeKey: 'consultorio' });
    expect(cuerpo.lines).toEqual([]);
    expect(cuerpo.speakerName).not.toBe('');
  });

  it('al editar, el diálogo conserva su clave, su retrato y su emoción', () => {
    const previo = casoSinLugar().mundos[0].dialogues[0];
    const cuerpo = cuerpoGuion(escena({ lineas }), personajes, { nodeKey: 'inicio', previo });
    expect(cuerpo).toMatchObject({ treeKey: 'guion-inicio', portraitKey: null, emotion: 'neutral' });
  });
});

describe('solicitudDeSala: la sala como mundo del mapa', () => {
  const copiado = casoCopiadoDeLugar(universidad, ['pasillo', 'sala-espera', 'bienestar', 'consultorio']);
  const caso = () => casoDesdeApi(copiado.editor, copiado.mundos, universidad);
  const contexto = { revision: 3, catalogo: universidad.catalogo, personajes: universidad.personajes, personajesDelCaso: copiado.editor.characters };
  const indiceEspera = 1;

  it('una sala sin cambios se guarda igual a como estaba: no se pierde nada', () => {
    const c = caso();
    for (let i = 0; i < c.salas.length; i++) {
      const { solicitud, faltanPersonajes } = solicitudDeSala(c.salas[i], contexto, copiado.mundos[i]);
      expect(solicitud.objects).toEqual(copiado.mundos[i].objects);
      expect(solicitud.collisionZones).toEqual(copiado.mundos[i].collisionZones);
      expect(solicitud.map).toEqual(copiado.mundos[i].map);
      expect(faltanPersonajes).toEqual([]);
    }
  });

  it('manda la revisión y no toca los diálogos ni las herramientas (una lista ausente no se toca)', () => {
    const { solicitud } = solicitudDeSala(caso().salas[0], contexto, copiado.mundos[0]);
    expect(solicitud.revision).toBe(3);
    expect(solicitud).not.toHaveProperty('dialogues');
    expect(solicitud).not.toHaveProperty('clinicalTools');
  });

  it('mover un mueble cambia su posición y la de su huella de choque', () => {
    const c = caso();
    const mundo = copiado.mundos[indiceEspera];
    c.salas[indiceEspera].muebles[2] = { ...c.salas[indiceEspera].muebles[2], x: 600, y: 400 };
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, mundo);
    const mueble = solicitud.objects.find((o) => o.key === 'mesa-centro')!;
    expect([mueble.x, mueble.y]).toEqual([600, 400]);
    const zona = solicitud.collisionZones.find((z) => z.key === 'choque-mesa-centro')!;
    const original = mundo.collisionZones.find((z) => z.key === 'choque-mesa-centro')!;
    expect(zona).toEqual({ ...original, x: original.x + (600 - 520), y: original.y + (400 - 340) });
  });

  it('quitar un mueble lo quita del mapa y quita su huella', () => {
    const c = caso();
    const quitado = c.salas[indiceEspera].muebles.splice(2, 1)[0];
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);
    expect(solicitud.objects.some((o) => o.key === quitado.clave)).toBe(false);
    expect(solicitud.collisionZones.some((z) => z.key === `choque-${quitado.clave}`)).toBe(false);
  });

  it('voltear un mueble lo marca como espejo', () => {
    const c = caso();
    c.salas[indiceEspera].muebles[3] = { ...c.salas[indiceEspera].muebles[3], espejo: true };
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);
    expect(solicitud.objects.find((o) => o.key === 'planta')!.metadata).toMatchObject({ espejo: true });
  });

  it('agregar un mueble del catálogo copia sus valores y le da su huella si choca', () => {
    const c = caso();
    c.salas[indiceEspera].muebles.push({ ref: 'sofa', x: 200, y: 420, espejo: false });
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);
    const sofa = universidad.catalogo.muebles.find((m) => m.id === 'sofa')!;
    const nuevo = solicitud.objects.find((o) => o.key === 'sofa')!;
    expect(nuevo).toMatchObject({
      id: 0, label: sofa.nombre, type: 'PROP', x: 200, y: 420, width: sofa.ancho, height: sofa.alto, collision: false,
      metadata: { arte: sofa.arte, colision: sofa.colision, apoyo: 'pies' },
    });
    expect(solicitud.collisionZones.some((z) => z.key === 'choque-sofa')).toBe(sofa.colision);
    if (sofa.colision) {
      expect(solicitud.collisionZones.find((z) => z.key === 'choque-sofa')).toMatchObject({
        x: 200 - Math.floor(sofa.ancho / 2), y: 420 - sofa.alto, width: sofa.ancho, height: sofa.alto,
      });
    }
  });

  it('lo que el docente agrega desde el catálogo dice que su posición es el punto de apoyo en el suelo (como la copia del servidor)', () => {
    const c = caso();
    const pieza = universidad.catalogo.objetos[0];
    c.salas[indiceEspera].muebles.push({ ref: 'planta', x: 200, y: 420, espejo: false });
    c.salas[indiceEspera].objetos.push({ ref: pieza.id, x: 300, y: 300 });
    c.salas[indiceEspera].personajes.push({ ref: copiado.editor.characters[0].key, x: 350, y: 300, mirando: 'derecha', expresion: 'neutral' });
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);
    const nuevos = solicitud.objects.filter((o) => o.id === 0);
    expect(nuevos.map((o) => o.type).sort()).toEqual(['PERSON', 'PROP', pieza.tipo].sort());
    for (const nuevo of nuevos) expect(nuevo.metadata['apoyo'], nuevo.key).toBe('pies');
  });

  it('lo que ya estaba conserva su apoyo: un caso de antes no se vuelve «de pies» por moverle algo', () => {
    const mundo: WorldDefinition = structuredClone(copiado.mundos[indiceEspera]);
    for (const objeto of mundo.objects) delete objeto.metadata['apoyo']; // como los casos hechos antes de la revisión final
    const c = casoDesdeApi(copiado.editor, copiado.mundos.map((m) => (m.nodeId === mundo.nodeId ? mundo : m)), universidad);
    c.salas[indiceEspera].muebles[0] = { ...c.salas[indiceEspera].muebles[0], x: 500, y: 400 };
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, mundo);
    for (const objeto of solicitud.objects) expect('apoyo' in objeto.metadata, objeto.key).toBe(false);
  });

  it('las paredes de la sala (zonas que no son la huella de un mueble) pasan intactas al guardar', () => {
    const mundo: WorldDefinition = structuredClone(copiado.mundos[indiceEspera]);
    const paredes = [
      { id: 901, key: 'pared-fondo', label: 'Pared del fondo', x: 0, y: 0, width: 960, height: 236 },
      { id: 902, key: 'borde-delantero', label: 'Borde delantero', x: 0, y: 486, width: 960, height: 42 },
    ];
    mundo.collisionZones = [...paredes, ...mundo.collisionZones];
    const c = caso();
    c.salas[indiceEspera].muebles[0] = { ...c.salas[indiceEspera].muebles[0], x: 500, y: 400 };
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, mundo);
    expect(solicitud.collisionZones.filter((z) => !z.key.startsWith('choque-'))).toEqual(paredes);
  });

  it('agregar el mismo mueble dos veces les da claves distintas', () => {
    const c = caso();
    c.salas[indiceEspera].muebles.push({ ref: 'planta', x: 200, y: 420 }, { ref: 'planta', x: 300, y: 420 });
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);
    expect(solicitud.objects.filter((o) => o.key.startsWith('planta')).map((o) => o.key)).toEqual(['planta', 'planta-2', 'planta-3']);
  });

  it('un mueble nuevo que el borrador ya llamó de cierta forma conserva esa clave (todos los mapas de la sala lo llaman igual)', () => {
    const c = caso();
    c.salas[indiceEspera].muebles.push({ ref: 'planta', x: 200, y: 420, clave: 'planta-7' });
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);
    expect(solicitud.objects.filter((o) => o.id === 0).map((o) => o.key)).toEqual(['planta-7']);
    expect(solicitud.collisionZones.some((z) => z.key === 'choque-planta-7')).toBe(universidad.catalogo.muebles.find((m) => m.id === 'planta')!.colision);
    // y si dos piezas nuevas piden la misma clave, la segunda busca otra en vez de pisar a la primera
    c.salas[indiceEspera].muebles.push({ ref: 'planta', x: 300, y: 420, clave: 'planta-7' });
    const { solicitud: otra } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);
    expect(otra.objects.filter((o) => o.id === 0).map((o) => o.key)).toEqual(['planta-7', 'planta-2']);
  });

  it('agregar un objeto copia su tipo, su texto de interacción y su animación de cercanía', () => {
    const c = caso();
    const pieza = universidad.catalogo.objetos.find((o) => o.tipo === 'RESOURCE')!;
    c.salas[indiceEspera].objetos.push({ ref: pieza.id, x: 300, y: 300 });
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);
    const nuevo = solicitud.objects.find((o) => o.key.startsWith(pieza.id) && o.id === 0)!;
    expect(nuevo).toMatchObject({
      type: 'RESOURCE', width: 32, height: 32, interactionPrompt: pieza.textoInteraccion, interactionText: pieza.alRevisar ?? '',
    });
    expect(nuevo.metadata).toMatchObject({ arte: pieza.arte, animacionCerca: pieza.animacionCerca, apoyo: 'pies' });
  });

  it('agregar un personaje del lugar lo enlaza a su personaje del caso; si el caso aún no lo tiene, lo dice', () => {
    const c = caso();
    const enCaso = copiado.editor.characters[0];
    c.salas[indiceEspera].personajes.push({ ref: enCaso.key, x: 300, y: 300, mirando: 'izquierda', expresion: 'triste' });
    const sinPersonaje = universidad.personajes.find((p) => !copiado.editor.characters.some((x) => x.key === p.id))!;
    c.salas[indiceEspera].personajes.push({ ref: sinPersonaje.id, x: 350, y: 300, mirando: 'derecha', expresion: 'neutral' });

    const { solicitud, faltanPersonajes } = solicitudDeSala(c.salas[indiceEspera], contexto, copiado.mundos[indiceEspera]);

    const nuevo = solicitud.objects.find((o) => o.id === 0 && o.type === 'PERSON' && o.characterId === enCaso.id)!;
    expect(nuevo).toMatchObject({
      facing: 'left', width: 48, height: 48, metadata: { expresion: 'triste', movimiento: 'quieto', apoyo: 'pies' },
    });
    expect(faltanPersonajes).toEqual([sinPersonaje.id]);
    expect(solicitud.objects.find((o) => o.label === sinPersonaje.nombre)?.characterId).toBeUndefined();
  });

  it('cambiar la mirada o la expresión de un personaje conserva lo demás: el movimiento y la persona clave', () => {
    const mundo: WorldDefinition = structuredClone(copiado.mundos[indiceEspera]);
    const persona = mundo.objects.find((o) => o.type === 'PERSON')!;
    persona.metadata = { ...persona.metadata, personaClave: true, movimiento: 'deambula' };
    // El borrador se lee de lo que el servidor tiene: sabe que camina y que es a quien atender.
    const c = casoDesdeApi(copiado.editor, copiado.mundos.map((m) => (m.nodeId === mundo.nodeId ? mundo : m)), universidad);
    expect(c.salas[indiceEspera].personajes[0]).toMatchObject({ movimiento: 'deambula', personaClave: true });
    c.salas[indiceEspera].personajes[0] = { ...c.salas[indiceEspera].personajes[0], mirando: 'izquierda', expresion: 'triste' };
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, mundo);
    const guardada = solicitud.objects.find((o) => o.key === persona.key)!;
    expect(guardada.facing).toBe('left');
    expect(guardada.metadata).toEqual({ ...persona.metadata, expresion: 'triste' });
  });

  describe('A7 · la marca «sugerido por la IA» de lo que hay en la sala', () => {
    it('un objeto existente que la IA movió o colocó se guarda con la marca en alto; los demás no cambian', () => {
      const c = caso();
      const sala = c.salas[indiceEspera];
      sala.muebles[2] = { ...sala.muebles[2], x: 600, y: 400, marcaIa: true };
      sala.personajes[0] = { ...sala.personajes[0], marcaIa: true };
      const { solicitud } = solicitudDeSala(sala, contexto, copiado.mundos[indiceEspera]);
      const marcados = solicitud.objects.filter((o) => o.aiSuggested === true).map((o) => o.key).sort();
      expect(marcados).toEqual([sala.muebles[2].clave, sala.personajes[0].clave].sort());
      expect(solicitud.objects.find((o) => o.key === sala.muebles[0].clave)).toEqual(copiado.mundos[indiceEspera].objects.find((o) => o.key === sala.muebles[0].clave));
    });

    it('un personaje nuevo que colocó la IA nace con la marca; uno que puso el docente, sin ella', () => {
      const c = caso();
      const sala = c.salas[indiceEspera];
      const delLugar = universidad.personajes[0].id;
      sala.personajes.push({ ref: delLugar, x: 300, y: 350, mirando: 'izquierda', expresion: 'neutral', clave: 'ia-1', marcaIa: true });
      sala.personajes.push({ ref: delLugar, x: 320, y: 350, mirando: 'izquierda', expresion: 'neutral', clave: 'doc-1' });
      const { solicitud } = solicitudDeSala(sala, contexto, copiado.mundos[indiceEspera]);
      expect(solicitud.objects.find((o) => o.key === 'ia-1')).toMatchObject({ aiSuggested: true });
      expect(solicitud.objects.find((o) => o.key === 'doc-1')).not.toHaveProperty('aiSuggested');
    });

    it('un objeto que ya se aceptó deja de mandarse marcado aunque la copia guardada del mapa aún diga que sí', () => {
      const c = caso();
      const sala = c.salas[indiceEspera];
      const mundo = structuredClone(copiado.mundos[indiceEspera]);
      mundo.objects.find((o) => o.key === sala.muebles[0].clave)!.aiSuggested = true; // la copia vieja
      const { solicitud } = solicitudDeSala(sala, contexto, mundo); // el borrador ya no tiene la marca
      expect(solicitud.objects.find((o) => o.key === sala.muebles[0].clave)!.aiSuggested).toBe(false);
    });
  });

  it('un objeto guarda la herramienta que entrega: la elegida, ninguna, o la del servidor si no cambió', () => {
    const c = caso();
    const i = c.salas.findIndex((s) => s.objetos.length > 0);
    const sala = c.salas[i];
    const mundo = structuredClone(copiado.mundos[i]);
    const clave = sala.objetos[0].clave!;
    const guardado = (s: typeof sala, m: typeof mundo, k: string) => solicitudDeSala(s, contexto, m).solicitud.objects.find((o) => o.key === k)!;
    // Sin cambio: el objeto se manda tal como lo tenía el servidor.
    expect(guardado(sala, mundo, clave)).toEqual(mundo.objects.find((o) => o.key === clave));
    // La docente elige una herramienta para un objeto que ya estaba y para uno nuevo.
    sala.objetos[0] = { ...sala.objetos[0], toolCode: 'ficha-riesgo' };
    sala.objetos.push({ ref: sala.objetos[0].ref, x: 200, y: 300, clave: 'nuevo-1', toolCode: 'directorio-rutas' });
    expect(guardado(sala, mundo, clave).toolCode).toBe('ficha-riesgo');
    expect(guardado(sala, mundo, 'nuevo-1').toolCode).toBe('directorio-rutas');
    // La quita: el servidor la tenía y ahora se manda vacía.
    delete sala.objetos[0].toolCode;
    mundo.objects.find((o) => o.key === clave)!.toolCode = 'ficha-riesgo';
    expect(guardado(sala, mundo, clave).toolCode).toBeNull();
  });

  it('una sala sin lugar (sin catálogo) también se guarda: lo que había se conserva', () => {
    const { editor, mundos } = casoSinLugar();
    const sinLugar = casoDesdeApi(editor, mundos);
    const sinCatalogo = { revision: 12, catalogo: sinLugar.catalogo, personajes: [], personajesDelCaso: editor.characters };
    const { solicitud } = solicitudDeSala(sinLugar.salas[0], sinCatalogo, mundos[0]);
    expect(solicitud.objects).toEqual(mundos[0].objects);
  });

  it('una escena nueva en una sala que ya existe: el mapa nuevo parte de una copia de los objetos del mapa hermano (ids en 0)', () => {
    const c = caso();
    const hermano = copiado.mundos[indiceEspera];
    const nuevoMapa: WorldDefinition = {
      ...structuredClone(hermano), nodeId: 900, map: { ...hermano.map, id: 901, key: 'sala-escena-nueva' },
      objects: hermano.objects.map((o) => ({ ...structuredClone(o), id: 0 })),
      collisionZones: hermano.collisionZones.map((z) => ({ ...z, id: 0 })),
    };
    const { solicitud } = solicitudDeSala(c.salas[indiceEspera], contexto, nuevoMapa);
    expect(solicitud.objects).toEqual(nuevoMapa.objects);
    expect(solicitud.objects.some((o) => o.type === 'EXIT')).toBe(true); // las puertas viajan con la copia
    expect(solicitud.map.key).toBe('sala-escena-nueva');
    expect(solicitud.map.ambient).toEqual(hermano.map.ambient);
  });

  it('el fondo, el encuadre y la sala a la que pertenece el mapa no cambian al guardar', () => {
    const c = caso();
    const { solicitud } = solicitudDeSala(c.salas[0], contexto, copiado.mundos[0]);
    expect(solicitud.map.ambient).toEqual(copiado.mundos[0].map.ambient);
  });

  it('cambiar el punto de entrada de la sala cambia el de aparición del mapa', () => {
    const c = caso();
    c.salas[0].entrada = { x: 300, y: 300 };
    const { solicitud } = solicitudDeSala(c.salas[0], contexto, copiado.mundos[0]);
    expect([solicitud.map.spawnX, solicitud.map.spawnY]).toEqual([300, 300]);
  });
});

describe('cuerpoCrearCaso', () => {
  it('con lugar manda el lugar y las salas en el orden elegido, por piezas como la generación con IA', () => {
    expect(cuerpoCrearCaso('Caso', 'universidad', ['pasillo', 'consultorio'])).toEqual({
      title: 'Caso', lugarId: 'universidad', salas: ['pasillo', 'consultorio'], porPiezas: true,
    });
  });

  it('sin lugar manda solo el título', () => {
    expect(cuerpoCrearCaso('Caso', null, [])).toEqual({ title: 'Caso' });
  });

  it('manda la descripción cuando la hay (la compuerta de publicación la exige) y la recorta', () => {
    expect(cuerpoCrearCaso('Caso', 'universidad', ['pasillo'], '  La persona llega y es escuchada.  ')).toEqual({
      title: 'Caso', description: 'La persona llega y es escuchada.', lugarId: 'universidad', salas: ['pasillo'], porPiezas: true,
    });
    expect(cuerpoCrearCaso('Caso', 'universidad', ['pasillo'], '   ')).toEqual({ title: 'Caso', lugarId: 'universidad', salas: ['pasillo'], porPiezas: true });
  });
});

describe('solicitudDeSala: cómo se mueve una persona y a quién atender', () => {
  const copiado = casoCopiadoDeLugar(universidad, ['pasillo', 'sala-espera', 'bienestar', 'consultorio']);
  const caso = () => casoDesdeApi(copiado.editor, copiado.mundos, universidad);
  const contexto = { revision: 3, catalogo: universidad.catalogo, personajes: universidad.personajes, personajesDelCaso: copiado.editor.characters };
  const indice = 1;
  const personaGuardada = (solicitud: { objects: WorldDefinition['objects'] }) => solicitud.objects.find((o) => o.type === 'PERSON')!;

  it('una persona que va y viene se guarda con la forma que lee el juego', () => {
    const c = caso();
    c.salas[indice].personajes[0].movimiento = { tipo: 'va-y-viene', hasta: { x: 600, y: 420 } };
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, copiado.mundos[indice]);
    expect(personaGuardada(solicitud).metadata['movimiento']).toEqual({ tipo: 'va-y-viene', hasta: { x: 600, y: 420 } });
  });

  it('una persona que camina por la sala se guarda como «deambula»', () => {
    const c = caso();
    c.salas[indice].personajes[0].movimiento = 'deambula';
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, copiado.mundos[indice]);
    expect(personaGuardada(solicitud).metadata['movimiento']).toBe('deambula');
  });

  it('volver a «se queda quieto» lo escribe, aunque antes caminara', () => {
    const mundo: WorldDefinition = structuredClone(copiado.mundos[indice]);
    const persona = mundo.objects.find((o) => o.type === 'PERSON')!;
    persona.metadata = { ...persona.metadata, movimiento: 'deambula' };
    const c = caso();
    c.salas[indice].personajes[0].movimiento = 'quieto';
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, mundo);
    expect(personaGuardada(solicitud).metadata['movimiento']).toBe('quieto');
  });

  it('marcar a la persona a atender escribe el dato; desmarcarla lo quita del todo', () => {
    const c = caso();
    c.salas[indice].personajes[0].personaClave = true;
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, copiado.mundos[indice]);
    expect(personaGuardada(solicitud).metadata['personaClave']).toBe(true);

    const marcado: WorldDefinition = structuredClone(copiado.mundos[indice]);
    const persona = marcado.objects.find((o) => o.type === 'PERSON')!;
    persona.metadata = { ...persona.metadata, personaClave: true };
    c.salas[indice].personajes[0].personaClave = false;
    const { solicitud: sin } = solicitudDeSala(c.salas[indice], contexto, marcado);
    expect(personaGuardada(sin).metadata).not.toHaveProperty('personaClave');
  });

  it('lo que no cambió no se reescribe: una sala leída y guardada queda igual (sin «personaClave: false» ni «movimiento» nuevos)', () => {
    const c = caso();
    expect(c.salas[indice].personajes[0]).toMatchObject({ movimiento: 'quieto', personaClave: false });
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, copiado.mundos[indice]);
    expect(solicitud.objects).toEqual(copiado.mundos[indice].objects);
  });

  it('un movimiento mal formado se conserva sin tocar', () => {
    const mundo: WorldDefinition = structuredClone(copiado.mundos[indice]);
    const persona = mundo.objects.find((o) => o.type === 'PERSON')!;
    const movimiento = { tipo: 'ruta', puntos: [{ x: 1, y: 2 }], modo: 'circuito' };
    persona.metadata = { ...persona.metadata, movimiento };
    const c = casoDesdeApi(copiado.editor, [copiado.mundos[0], mundo, ...copiado.mundos.slice(2)], universidad);
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, mundo);
    expect(personaGuardada(solicitud).metadata['movimiento']).toEqual(movimiento);
  });

  it('un movimiento que el juego no entiende se conserva mientras el docente no lo cambie', () => {
    const mundo: WorldDefinition = structuredClone(copiado.mundos[indice]);
    const persona = mundo.objects.find((o) => o.type === 'PERSON')!;
    persona.metadata = { ...persona.metadata, movimiento: 'baila' };
    const c = casoDesdeApi(copiado.editor, [copiado.mundos[0], mundo, ...copiado.mundos.slice(2)], universidad);
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, mundo);
    expect(personaGuardada(solicitud).metadata['movimiento']).toBe('baila');
  });

  it('una persona nueva en la sala nace quieta y sin ser la persona a atender', () => {
    const c = caso();
    const enCaso = copiado.editor.characters[0];
    c.salas[indice].personajes.push({ ref: enCaso.key, x: 300, y: 300, mirando: 'izquierda', expresion: 'neutral' });
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, copiado.mundos[indice]);
    const nueva = solicitud.objects.find((o) => o.id === 0 && o.type === 'PERSON')!;
    expect(nueva.metadata['movimiento']).toBe('quieto');
    expect(nueva.metadata).not.toHaveProperty('personaClave');
  });

  it('una persona nueva puede nacer ya con su movimiento y su marca (deshacer un «quitar»)', () => {
    const c = caso();
    const enCaso = copiado.editor.characters[0];
    c.salas[indice].personajes.push({
      ref: enCaso.key, x: 300, y: 300, mirando: 'izquierda', expresion: 'neutral', movimiento: 'deambula', personaClave: true,
    });
    const { solicitud } = solicitudDeSala(c.salas[indice], contexto, copiado.mundos[indice]);
    const nueva = solicitud.objects.find((o) => o.id === 0 && o.type === 'PERSON')!;
    expect(nueva.metadata).toMatchObject({ movimiento: 'deambula', personaClave: true });
  });
});

describe('solicitudDeSala: un objeto que ofrece una respuesta', () => {
  const copiado = casoCopiadoDeLugar(universidad, ['pasillo', 'sala-espera', 'bienestar', 'consultorio']);
  const contexto = { revision: 3, catalogo: universidad.catalogo, personajes: universidad.personajes, personajesDelCaso: copiado.editor.characters };

  it('lo que ofrece sigue ofreciéndolo al guardar la sala, también si se mueve', () => {
    const mundo: WorldDefinition = structuredClone(copiado.mundos[1]);
    const objeto = mundo.objects.find((o) => o.type !== 'PERSON' && o.type !== 'EXIT' && o.type !== 'PROP')!;
    objeto.decisionOptionId = 77;
    const mundos = copiado.mundos.map((m) => (m.nodeId === mundo.nodeId ? mundo : m));
    const caso = casoDesdeApi(copiado.editor, mundos, universidad);
    const intacta = solicitudDeSala(caso.salas[1], contexto, mundo).solicitud;
    expect(intacta.objects).toEqual(mundo.objects);
    const indice = caso.salas[1].objetos.findIndex((o) => o.clave === objeto.key);
    caso.salas[1].objetos[indice] = { ...caso.salas[1].objetos[indice], x: 600, y: 400 };
    const movida = solicitudDeSala(caso.salas[1], contexto, mundo).solicitud.objects.find((o) => o.key === objeto.key)!;
    expect([movida.x, movida.y, movida.decisionOptionId]).toEqual([600, 400, 77]);
  });
});

describe('cuerpoNodo y cuerpoDecision: los campos 2.1 solo viajan si la docente los cambió', () => {
  it('cuerpoNodo manda goal y comments solo si cambiaron o no había previo con ellos', () => {
    const previo = casoSinLugar().editor.nodes[0];
    previo.goal = 'Escuchar.';
    previo.comments = [{ personaje: 'camila', linea: 'Hola.' }];
    const igual = cuerpoNodo(escena({ objetivo: 'Escuchar.', comentarios: [{ personaje: 'camila', linea: 'Hola.' }] }), { esInicio: false, previo });
    expect(igual).not.toHaveProperty('goal');
    expect(igual).not.toHaveProperty('comments');
    const ausentes = cuerpoNodo(escena(), { esInicio: false, previo });
    expect(ausentes).not.toHaveProperty('goal');
    expect(ausentes).not.toHaveProperty('comments');
    const cambiado = cuerpoNodo(escena({ objetivo: 'Otro.', comentarios: [] }), { esInicio: false, previo });
    expect(cambiado.goal).toBe('Otro.');
    expect(cambiado.comments).toEqual([]);
    const sinPrevio = cuerpoNodo(escena({ objetivo: 'Nuevo.' }), { nodeKey: 'x', esInicio: false });
    expect(sinPrevio.goal).toBe('Nuevo.');
    expect(sinPrevio).not.toHaveProperty('comments');
  });

  it('cuerpoNodo: el orden de las claves de un comentario no cuenta como cambio; otra emoción sí', () => {
    const previo = casoSinLugar().editor.nodes[0];
    previo.comments = [{ personaje: 'camila', linea: 'Hola.', emocion: 'triste', cuando: { talked: 'a' } }];
    const mismo = cuerpoNodo(escena({ comentarios: [{ cuando: { talked: 'a' }, emocion: 'triste', linea: 'Hola.', personaje: 'camila' }] }), { esInicio: false, previo });
    expect(mismo).not.toHaveProperty('comments');
    const otro = cuerpoNodo(escena({ comentarios: [{ personaje: 'camila', linea: 'Hola.', emocion: 'alegre', cuando: { talked: 'a' } }] }), { esInicio: false, previo });
    expect(otro.comments).toHaveLength(1);
  });

  it('hacia-api no manda requires ni reaction si no se los pasan', () => {
    const previo = casoSinLugar().editor.decisions[0];
    const cuerpo = cuerpoDecision(respuesta(), 1, { previo })!;
    expect(cuerpo).not.toHaveProperty('requires');
    expect(cuerpo).not.toHaveProperty('reaction');
    expect(cuerpoDecision(respuesta(), 1, { optionKey: 'o' })).not.toHaveProperty('requires');
  });

  it('el requisito o la reacción que no cambiaron faltan del cuerpo; el que cambió, solo ese campo, y {} los quita', () => {
    const previo = casoSinLugar().editor.decisions[0];
    previo.requires = { all: [{ talked: 'camila' }, { milestone: 'x' }] };
    previo.reaction = { linea: 'Gracias.', gesto: 'asiente' };
    const sinCambio = cuerpoDecision(
      respuesta({ requiere: { all: [{ talked: 'camila' }, { milestone: 'x' }] }, reaccion: { gesto: 'asiente', linea: 'Gracias.' } }), 1, { previo },
    )!;
    expect(sinCambio).not.toHaveProperty('requires');
    expect(sinCambio).not.toHaveProperty('reaction');

    const soloReaccion = cuerpoDecision(
      respuesta({ requiere: previo.requires, reaccion: { linea: 'De nada.' } }), 1, { previo },
    )!;
    expect(soloReaccion).not.toHaveProperty('requires');
    expect(soloReaccion.reaction).toEqual({ linea: 'De nada.' });

    const quitado = cuerpoDecision(respuesta({ requiere: {}, reaccion: {} }), 1, { previo })!;
    expect(quitado.requires).toEqual({});
    expect(quitado.reaction).toEqual({});
  });

  it('un requisito que el editor no sabe armar no se pierde al cambiar otra cosa de la respuesta', () => {
    const previo = casoSinLugar().editor.decisions[0];
    previo.requires = { any: [{ milestone: 'a' }, { not: { inspected: 'b' } }] };
    const cuerpo = cuerpoDecision(respuesta({ texto: 'Otro texto.', requiere: structuredClone(previo.requires) }), 1, { previo })!;
    expect(cuerpo.text).toBe('Otro texto.');
    expect(cuerpo).not.toHaveProperty('requires');
  });

  it('compara la reacción y los comentarios contra el previo normalizado: un valor fuera del vocabulario no cuenta como cambio', () => {
    const caso = casoSinLugar();
    const decision = caso.editor.decisions[0];
    (decision as { reaction: unknown }).reaction = { linea: 'Gracias.', gesto: 'saluda', emocion: 'furiosa' };
    const leida = casoDesdeApi(caso.editor, caso.mundos).escenas.flatMap((e) => e.respuestas).find((r) => r.id === String(decision.id))!;
    expect(leida.reaccion).toEqual({ linea: 'Gracias.' });
    expect(cuerpoDecision(leida, 1, { previo: decision })).not.toHaveProperty('reaction');

    const nodo = caso.editor.nodes[0];
    (nodo as { comments: unknown }).comments = [{ personaje: 'camila', linea: 'Hola.', gesto: 'saluda' }];
    const escenaLeida = casoDesdeApi(caso.editor, caso.mundos).escenas.find((e) => e.id === String(nodo.id))!;
    expect(escenaLeida.comentarios).toEqual([{ personaje: 'camila', linea: 'Hola.' }]);
    expect(cuerpoNodo(escenaLeida, { esInicio: false, previo: nodo })).not.toHaveProperty('comments');
  });

  it('una respuesta nueva con requisito y reacción los manda', () => {
    const cuerpo = cuerpoDecision(
      respuesta({ requiere: { talked: 'camila' }, reaccion: { linea: 'Ok.' } }), 1, { optionKey: 'o' },
    )!;
    expect(cuerpo.requires).toEqual({ talked: 'camila' });
    expect(cuerpo.reaction).toEqual({ linea: 'Ok.' });
  });

  it('un previo del servidor que aún no trae requires/reaction cuenta como vacío', () => {
    const previo = { ...casoSinLugar().editor.decisions[0] } as Record<string, unknown>;
    delete previo['requires'];
    delete previo['reaction'];
    const cuerpo = cuerpoDecision(respuesta({ requiere: {}, reaccion: {} }), 1, { previo: previo as never })!;
    expect(cuerpo).not.toHaveProperty('requires');
    expect(cuerpo).not.toHaveProperty('reaction');
    expect(cuerpoDecision(respuesta({ requiere: { talked: 'a' } }), 1, { previo: previo as never })!.requires).toEqual({ talked: 'a' });
  });
});
