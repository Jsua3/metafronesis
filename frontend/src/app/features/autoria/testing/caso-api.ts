/**
 * Un caso tal como lo entrega la API de autoría, para las pruebas de los mapeadores y del store.
 *
 * `casoCopiadoDeLugar` reproduce lo que escribe el servidor al crear un caso con `lugarId` y `salas`
 * (`backend_django/apps/biblioteca/services/copiar_al_caso.py`): un nodo y un mapa por sala, los muebles como `PROP`
 * con `metadata.arte`, los objetos con su tipo y `animacionCerca`, las personas enlazadas a su personaje, las puertas
 * como `EXIT` con `metadata.targetNodeKey`, y la sala nombrada en `ambient.salaId` / `ambient.lugarId`.
 */
import type {
  CaseEditorView, CharacterEditorState, MapEditorState, MapObjectEditorState, NodeEditorState, WorldCollisionZone,
  WorldDefinition, WorldObject, WorldObjectType,
} from '../../../core/models/simulation.model';
import type { Escenario } from '../modelo/escenario';

export interface CasoApi {
  editor: CaseEditorView;
  mundos: WorldDefinition[];
}

const MIRANDO: Record<string, string> = { izquierda: 'left', derecha: 'right' };
const ICONO: Record<string, string> = { PERSON: 'person', EXIT: 'door_front', NOTE: 'article', RESOURCE: 'description' };

export function objetoDeMundo(
  id: number, key: string, label: string, type: WorldObjectType, x: number, y: number, width: number, height: number,
  extra: Partial<WorldObject> = {},
): WorldObject {
  return {
    id, key, label, type, x, y, width, height, zIndex: 0, facing: 'down', colorHex: '#4FA3A5',
    icon: ICONO[type] ?? 'inventory_2', shortCode: 'ACT', collision: false, visible: true, interactionPrompt: '',
    interactionText: '', decisionOptionId: null, toolCode: null, unlockCondition: {}, movementPattern: {}, metadata: {},
    characterId: null, aiSuggested: false, ...extra,
  };
}

export function mundoVacio(nodeId: number, mapa: WorldDefinition['map'], revision: number, caseVersionId: number): WorldDefinition {
  return {
    schemaVersion: 2, caseVersionId, revision, nodeId, map: mapa, objects: [], collisionZones: [], dialogues: [],
    clinicalTools: [], safeExit: { configured: false, exitObjectKey: null, supportResources: [] },
    validation: { errors: [], warnings: [], canPublish: false }, availableDecisions: [], rooms: [],
  };
}

/** Las claves de objeto de una sala: la primera es la base, las demás `base-2`, `base-3`… */
class Claves {
  private readonly usadas = new Set<string>();
  nueva(base: string): string {
    let clave = base;
    for (let n = 2; this.usadas.has(clave); n++) clave = `${base}-${n}`;
    this.usadas.add(clave);
    return clave;
  }
}

export function casoCopiadoDeLugar(
  lugar: Escenario, idsDeSalas: string[], opciones: { caseVersionId?: number; revision?: number; titulo?: string } = {},
): CasoApi {
  const caseVersionId = opciones.caseVersionId ?? 41;
  const revision = opciones.revision ?? 3;
  let siguienteId = 1000;
  const id = () => siguienteId++;
  const elegidas = idsDeSalas.map((s) => lugar.salas.find((x) => x.id === s)!);
  const entradas = new Map(elegidas.map((s) => [s.id, s.entrada]));
  const muebles = new Map(lugar.catalogo.muebles.map((m) => [m.id, m]));
  const objetosCat = new Map(lugar.catalogo.objetos.map((o) => [o.id, o]));
  const personajes = new Map(lugar.personajes.map((p) => [p.id, p]));

  const characters: CharacterEditorState[] = [];
  for (const sala of elegidas) {
    for (const p of sala.personajes) {
      if (characters.some((c) => c.key === p.ref)) continue;
      const info = personajes.get(p.ref)!;
      characters.push({
        id: id(), key: p.ref, displayName: info.nombre, roleLabel: info.rol, portraitKey: '', showInBrief: false,
        displayOrder: characters.length,
      });
    }
  }

  const nodes: NodeEditorState[] = [];
  const maps: MapEditorState[] = [];
  const mundos: WorldDefinition[] = [];
  const objects: MapObjectEditorState[] = [];

  elegidas.forEach((sala, i) => {
    const nodeId = id();
    const mapId = id();
    nodes.push({
      id: nodeId, key: sala.id, title: sala.nombre, narrative: sala.descripcion, supportResources: [], requiredTools: [],
      sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: false, startNode: i === 0,
      positionX: 180 + (i % 4) * 280, positionY: 180 + Math.floor(i / 4) * 200, intensity: 'MEDIUM', decisionPrompt: '', goal: '',
      displayOrder: i, aiSuggested: false,
    });
    maps.push({
      id: mapId, key: `sala-${sala.id}`, title: sala.nombre, width: 960, height: 528, theme: 'clinical-soft',
      spawnX: sala.entrada.x, spawnY: sala.entrada.y, nodeId, nodeKey: sala.id,
    });
    const claves = new Claves();
    const mundoObjetos: WorldObject[] = [];
    const zonas: WorldCollisionZone[] = [];
    for (const c of sala.muebles) {
      const m = muebles.get(c.ref)!;
      const clave = claves.nueva(c.ref);
      mundoObjetos.push(objetoDeMundo(id(), clave, m.nombre, 'PROP', c.x, c.y, m.ancho, m.alto, {
        metadata: { arte: m.arte, colision: m.colision, apoyo: 'pies', ...(c.espejo ? { espejo: true } : {}) },
      }));
      if (m.colision) {
        zonas.push({
          id: id(), key: `choque-${clave}`, label: m.nombre, x: c.x - Math.floor(m.ancho / 2), y: c.y - m.alto,
          width: m.ancho, height: m.alto,
        });
      }
    }
    for (const c of sala.objetos) {
      const o = objetosCat.get(c.ref)!;
      const metadata: Record<string, unknown> = { arte: o.arte, apoyo: 'pies' };
      if (o.animacionCerca) metadata['animacionCerca'] = { ...o.animacionCerca };
      mundoObjetos.push(objetoDeMundo(id(), claves.nueva(c.ref), o.nombre, o.tipo, c.x, c.y, 32, 32, {
        interactionPrompt: o.textoInteraccion, interactionText: o.alRevisar ?? '', metadata,
      }));
    }
    for (const c of sala.personajes) {
      const info = personajes.get(c.ref)!;
      const personaje = characters.find((x) => x.key === c.ref)!;
      mundoObjetos.push(objetoDeMundo(id(), claves.nueva(c.ref), info.nombre, 'PERSON', c.x, c.y, 48, 48, {
        interactionPrompt: 'Hablar', facing: (MIRANDO[c.mirando] ?? 'down') as WorldObject['facing'],
        characterId: personaje.id, metadata: { recipeId: info.recipeId, movimiento: 'quieto', expresion: c.expresion, apoyo: 'pies' },
      }));
    }
    for (const p of sala.puertas) {
      const destino = entradas.get(p.hacia);
      if (!destino) continue;
      mundoObjetos.push(objetoDeMundo(id(), claves.nueva(p.id), p.etiqueta, 'EXIT', p.x, p.y, 24, 40, {
        interactionPrompt: p.etiqueta, metadata: { targetNodeKey: p.hacia, entryX: destino.x, entryY: destino.y, pintada: true },
      }));
    }
    const mundo = mundoVacio(nodeId, {
      id: mapId, key: `sala-${sala.id}`, title: sala.nombre, width: 960, height: 528, theme: 'clinical-soft',
      spawnX: sala.entrada.x, spawnY: sala.entrada.y,
      ambient: { backgroundImage: sala.fondo, encuadre: sala.encuadre, salaId: sala.id, lugarId: lugar.id },
    }, revision, caseVersionId);
    mundo.objects = mundoObjetos;
    mundo.collisionZones = zonas;
    mundos.push(mundo);
    for (const o of mundoObjetos) {
      objects.push({
        id: o.id, key: o.key, label: o.label, type: o.type, x: o.x, y: o.y, width: o.width, height: o.height,
        colorHex: o.colorHex, icon: o.icon, shortCode: o.shortCode, collision: o.collision, visible: o.visible,
        interactionPrompt: o.interactionPrompt, interactionText: o.interactionText, decisionOptionId: null,
        toolCode: null, characterId: o.characterId ?? null, mapId, aiSuggested: false,
      });
    }
  });
  const rooms = maps.map((m) => ({ nodeId: m.nodeId, nodeKey: m.nodeKey, mapKey: m.key, title: m.title }));
  for (const mundo of mundos) mundo.rooms = rooms;

  const editor: CaseEditorView = {
    caseVersionId, revision, title: opciones.titulo ?? 'Primera escucha en Bienestar', semanticVersion: '0.1.0',
    status: 'DRAFT', context: '', learningObjectives: [], nodes, decisions: [], maps, objects, tools: [], hints: [],
    characters,
    rules: {
      milestones: (lugar.hitos ?? []).map((h) => ({
        key: h.key.replaceAll('-', '_'), label: h.label, description: h.description, decisive: h.decisive,
      })),
      riskLevel: lugar.nivelRiesgoPorDefecto ?? null,
      endings: [],
    },
    rubrics: [], checklistCompletion: 0, publishable: false,
    checklist: { items: [], contentReview: { fulfilled: false }, strict: false },
  };
  return { editor, mundos };
}

/**
 * Un caso que no salió de un lugar (como SIM-VBG-001): sus mapas no dicen a qué sala pertenecen, sus personas no
 * están enlazadas a un personaje y trae opciones con las cuatro clases, efectos, un guion y finales propios.
 */
export function casoSinLugar(): CasoApi {
  const caseVersionId = 7;
  const revision = 12;
  const nodo = (id: number, key: string, title: string, extra: Partial<NodeEditorState> = {}): NodeEditorState => ({
    id, key, title, narrative: `Narración de ${title}`, supportResources: ['Línea 123'], requiredTools: ['ficha-riesgo'],
    sensitiveContent: true, safeExitRequired: true, warningMessage: null, terminal: false, startNode: false,
    positionX: 100 * id, positionY: 50, intensity: 'MEDIUM', decisionPrompt: '¿Qué haces?', displayOrder: id, aiSuggested: false, goal: '',
    ...extra,
  });
  const nodes = [
    nodo(1, 'inicio', 'Primer contacto', { startNode: true }),
    nodo(2, 'riesgo', 'Valoración del riesgo', { intensity: 'HIGH', warningMessage: 'Habla de violencia.', aiSuggested: true }),
    nodo(3, 'cierre', 'Cierre', { terminal: true }),
  ];
  const mapa = (id: number, nodeId: number, key: string, title: string) => ({
    id, key, title, width: 960, height: 528, theme: 'clinical-soft', spawnX: 100, spawnY: 400, nodeId,
    nodeKey: nodes.find((n) => n.id === nodeId)!.key,
  });
  const maps = [mapa(11, 1, 'mapa-inicio', 'Consultorio'), mapa(12, 2, 'mapa-riesgo', 'Oficina'), mapa(13, 3, 'mapa-cierre', 'Pasillo')];
  const mundo = (m: (typeof maps)[number]) =>
    mundoVacio(m.nodeId, { id: m.id, key: m.key, title: m.title, width: 960, height: 528, theme: 'clinical-soft', spawnX: 100, spawnY: 400, ambient: {} }, revision, caseVersionId);
  const [m1, m2, m3] = maps.map(mundo);
  m1.objects = [
    objetoDeMundo(21, 'camila', 'Camila', 'PERSON', 300, 300, 48, 48, { facing: 'right', metadata: { expresion: 'triste' } }),
    objetoDeMundo(22, 'escritorio', 'Escritorio', 'PROP', 500, 320, 120, 60),
  ];
  m1.dialogues = [{
    id: 31, key: 'guion-inicio', speakerName: 'Camila', portraitKey: null, emotion: 'neutral', mapObjectId: null,
    lines: [
      { order: 1, speakerName: 'Camila', text: 'No sé por dónde empezar.', emotion: 'triste', aiSuggested: false },
      { order: 2, speakerName: 'Camila', text: 'Tengo miedo.', emotion: 'en-crisis', aiSuggested: true },
    ],
    choices: [],
  }];
  const characters: CharacterEditorState[] = [
    { id: 61, key: 'camila', displayName: 'Camila', roleLabel: 'Consultante', portraitKey: 'camila', showInBrief: true, displayOrder: 0 },
  ];
  const editor: CaseEditorView = {
    caseVersionId, revision, title: 'Violencia de género', semanticVersion: '1.0.0', status: 'DRAFT', context: 'Contexto',
    learningObjectives: ['Valorar el riesgo'], nodes, maps, objects: [], tools: [], hints: [], characters,
    decisions: [
      {
        id: 51, optionKey: 'escuchar', sourceNodeId: 1, sourceKey: 'inicio', targetNodeId: 2, targetKey: 'riesgo',
        text: 'Escucho sin interrumpir.', responseClass: 'RECOMMENDED', prohibitedConduct: false, prohibitionReason: null,
        immediateFeedback: 'Bien.', effects: { persona: { bond: 1, activation: -1 }, milestones: ['valorar_el_riesgo'], competencies: ['ESCUCHA'] },
        consequenceText: 'Se abre.', theoryBasis: 'Rogers', feedbackText: 'Escuchar da seguridad.', aiSuggested: false, requires: {}, reaction: {},
      },
      {
        id: 52, optionKey: 'apurar', sourceNodeId: 1, sourceKey: 'inicio', targetNodeId: 3, targetKey: 'cierre',
        text: 'Cuéntame rápido.', responseClass: 'CONTRAINDICATED', prohibitedConduct: true, prohibitionReason: 'Apura a la persona.',
        immediateFeedback: '', effects: {}, consequenceText: '', theoryBasis: '', feedbackText: '', aiSuggested: true, requires: {}, reaction: {},
      },
      {
        id: 53, optionKey: 'derivar', sourceNodeId: 2, sourceKey: 'riesgo', targetNodeId: 3, targetKey: 'cierre',
        text: 'Te acompaño a Bienestar.', responseClass: 'ACCEPTABLE', prohibitedConduct: false, prohibitionReason: null,
        immediateFeedback: 'Es una opción.', effects: {}, consequenceText: '', theoryBasis: '', feedbackText: '', aiSuggested: false, requires: {}, reaction: {},
      },
    ],
    rules: {
      milestones: [
        { key: 'valorar_el_riesgo', label: 'Valorar el riesgo', description: 'Explorar señales.', decisive: true },
        { key: 'informar_derechos', label: 'Informar derechos', description: 'Explicar rutas.', decisive: false },
      ],
      riskLevel: 'EXTREME',
      endings: [
        { key: 'critica', title: 'Crítica', message: 'Pudo hacer daño.', tone: 'critical', when: { count: 'contraindicated', gte: 1 } },
        { key: 'con_brechas', title: 'Con brechas', message: 'Quedaron cosas.', tone: 'neutral', aiSuggested: true },
      ],
    },
    rubrics: [], checklistCompletion: 0, publishable: false,
    checklist: { items: [], contentReview: { fulfilled: false }, strict: false },
  };
  return { editor, mundos: [m1, m2, m3] };
}

/** Los siete ítems de la lista de verificación como los entrega el servidor (con quién respalda cada uno). */
export function listaDelServidor(marcados: string[] = [], opciones: { constancia?: boolean; respaldados?: string[]; estricto?: boolean } = {}): CaseEditorView['checklist'] {
  const item = (code: string, label: string, required: boolean, backing: 'system' | 'constancia' | 'author', backingLabel: string, backed: boolean | null, draft = false) =>
    ({ code, label, required, fulfilled: marcados.includes(code), draft, backing, backingLabel, backed: opciones.respaldados && backed !== null ? opciones.respaldados.includes(code) : backed });
  return {
    items: [
      item('contentOriginal', 'Contenido original — sin copiar personajes, mapas ni narrativa comercial.', true, 'author', 'Declaración de quien autora el caso', null),
      opciones.estricto
        ? item('ethicsReviewed', 'Revisión ética — caso validado por experto o comité.', true, 'constancia', 'Lo respalda la constancia de Psicología', opciones.constancia === true)
        : item('ethicsReviewed', 'Revisión ética — caso validado por experto o comité.', true, 'author', 'Declaración de quien autora el caso', null),
      item('safetyProtocols', 'Protocolos de seguridad — ruta VBG, NNA y salida segura incluidos.', true, 'system', 'Lo comprueba el sistema', false),
      item('noStigmatizing', 'Sin lenguaje estigmatizante ni estereotipos clínicos.', true, 'author', 'Declaración de quien autora el caso', null),
      item('triggerWarnings', 'Advertencias de contenido sensible configuradas en nodos.', true, 'system', 'Lo comprueba el sistema', true),
      item('accessibilityOk', 'Accesibilidad — fallback accesible y controles táctiles probados.', true, 'author', 'Declaración de quien autora el caso', null),
      item('scopeEducational', 'El caso declara su alcance educativo: es un ejercicio formativo, no un diagnóstico ni una intervención clínica real.', false, 'author', 'Declaración de quien autora el caso', null, true),
    ],
    contentReview: opciones.constancia ? { fulfilled: true, reviewer: 'Psicología', reviewedOn: '2026-10-20', reference: 'ACTA-1' } : { fulfilled: false },
    strict: false,
  };
}
