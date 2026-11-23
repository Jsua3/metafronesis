import {
  DialogueChoiceState, DialogueState, MapObjectState, SimulationWorldState,
} from '../../core/models/simulation.model';
import {
  DecorationCtx, activeDecisionObjectKeys, decorateDialogueState, otherStageDecisionKeys,
} from './dialogue-decoration.util';
import { CopyContext } from './evidence-copy.util';
import { DRAFT_COPY } from './draft-copy';

const STALE = DRAFT_COPY.noStepNow.text;

function choice(key: string, decisionOptionId: number | null, extra: Partial<DialogueChoiceState> = {}): DialogueChoiceState {
  return { key, text: `Opción ${key}`, decisionOptionId, requiredToolCode: null, effect: {}, ...extra };
}

function dialogue(key: string, choices: DialogueChoiceState[], extra: Partial<DialogueState> = {}): DialogueState {
  return {
    key, speakerName: 'Abuela de la niña', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Abuela de la niña', text: 'Hola.', emotion: 'neutral' }],
    choices, ...extra,
  };
}

function worldWith(partial: Partial<SimulationWorldState> = {}): SimulationWorldState {
  return {
    attemptId: 'a', status: 'IN_PROGRESS',
    map: { id: 1, key: 'hospital-urgencias', title: '', width: 960, height: 540, theme: '', spawnX: 0, spawnY: 0, ambient: {} },
    player: { x: 0, y: 0 }, objects: [], collisions: [], tools: [],
    inventory: [], inspectedObjectKeys: [], viewedDialogueKeys: [], usedToolKeys: [], flags: {},
    ...partial,
  };
}

function object(key: string, type: MapObjectState['type'], dlg: DialogueState | null): MapObjectState {
  return {
    key, label: key, type, x: 100, y: 400, width: 40, height: 40, color: '#fff', icon: '', shortCode: '',
    collision: false, interactionPrompt: '', interactionText: '', decisionOptionId: null, toolCode: null, dialogue: dlg,
  };
}

function ctxWith(partial: Partial<DecorationCtx> = {}): DecorationCtx {
  const copy: CopyContext = { world: null, npcs: [] };
  return {
    nodeKey: 'hospital-urgencias', nodeOptionIds: [101, 102, 103], world: worldWith(),
    viewedNpcKeys: new Set(), copy, notice: null, ...partial,
  };
}

// Las seis conversaciones de decisión del caso (ids ficticios) y la de herramienta de la Familia.
const H1 = dialogue('familia-duelo', [choice('h1-a', 101), choice('h1-b', 102), choice('h1-c', 103)]);
const H2 = dialogue('marco-normativo-hospital', [choice('h2-a', 201), choice('h2-b', 202), choice('h2-c', 203)]);
const H3 = dialogue('psicologa-acompanante', [choice('h3-a', 301), choice('h3-b', 302), choice('h3-c', 303), choice('h3-d', 304)]);
const C1 = dialogue('sobreviviente-consulta', [
  choice('c1-aplicar-riesgo', null, { requiredToolCode: 'RISK_METER' }),
  choice('c1-a', 401), choice('c1-b', 402), choice('c1-c', 403),
]);
const C2 = dialogue('marco-normativo-comisaria', [choice('c2-a', 501), choice('c2-b', 502), choice('c2-c', 503)]);
const C3 = dialogue('profesional-psicosocial', [choice('c3-a', 601), choice('c3-b', 602), choice('c3-c', 603)]);
const FAMILIA = dialogue('familia-crisis', [choice('pap-familia', null, { requiredToolCode: 'PAP' })]);

const decisionIds = (d: DialogueState) => d.choices.filter(c => c.decisionOptionId != null).map(c => c.decisionOptionId);

describe('decorateDialogueState: filtro por etapa', () => {
  it('quita las decisiones que no están en nodeOptionIds y conserva las de herramienta', () => {
    const out = decorateDialogueState(C1, ctxWith({ nodeOptionIds: [401, 402, 403] }));
    expect(out.choices.map(c => c.key)).toEqual(['c1-aplicar-riesgo', 'c1-a', 'c1-b', 'c1-c']);
    expect(out.stale).toBeUndefined();
    expect(out.lines).toHaveLength(1);

    const partial = decorateDialogueState(H3, ctxWith({ nodeOptionIds: [302, 304, 999] }));
    expect(partial.choices.map(c => c.key)).toEqual(['h3-b', 'h3-d']);
  });

  it('con nodeOptionIds null o vacío no filtra (no se conoce la etapa)', () => {
    for (const ids of [null, []]) {
      const out = decorateDialogueState(H2, ctxWith({ nodeOptionIds: ids }));
      expect(out.choices).toHaveLength(3);
      expect(out.stale).toBeUndefined();
      expect(out.lines).toEqual(H2.lines);
    }
  });

  it('una conversación de otra etapa queda informativa: línea de «otro momento» y sin decisiones', () => {
    const out = decorateDialogueState(H2, ctxWith({ nodeOptionIds: [101, 102, 103] }));
    expect(out.stale).toBe(true);
    expect(out.choices).toEqual([]);
    expect(out.lines.at(-1)).toEqual({ order: 2, speakerName: '', text: STALE, emotion: 'neutral' });
    expect(out.lines[0]).toEqual(H2.lines[0]);
    expect(out.notice).toBeUndefined();
  });

  it('si queda una opción de herramienta, la conversación sigue siendo accionable (el paso «usar» de la etapa 6)', () => {
    const out = decorateDialogueState(C1, ctxWith({ nodeOptionIds: [601, 602, 603], world: worldWith({ inventory: ['RISK_METER'] }) }));
    expect(out.stale).toBe(true);
    expect(out.choices.map(c => c.key)).toEqual(['c1-aplicar-riesgo']);
    expect(out.choices[0].toolMissing).toBe(false);
  });

  it('las conversaciones sin decisiones nunca son «de otra etapa»', () => {
    const out = decorateDialogueState(FAMILIA, ctxWith({ nodeOptionIds: [101, 102, 103] }));
    expect(out.stale).toBeUndefined();
    expect(out.lines).toEqual(FAMILIA.lines);
  });

  it('AC-3: en cada etapa solo el objeto de esa etapa conserva decisiones, y todas son de esa etapa', () => {
    const stages: Array<{ n: number; ids: number[]; owner: string; objects: DialogueState[] }> = [
      { n: 1, ids: [101, 102, 103], owner: 'familia-duelo', objects: [H1, H2, H3] },
      { n: 2, ids: [201, 202, 203], owner: 'marco-normativo-hospital', objects: [H1, H2, H3] },
      { n: 3, ids: [301, 302, 303, 304], owner: 'psicologa-acompanante', objects: [H1, H2, H3] },
      { n: 4, ids: [401, 402, 403], owner: 'sobreviviente-consulta', objects: [C1, C2, C3] },
      { n: 5, ids: [501, 502, 503], owner: 'marco-normativo-comisaria', objects: [C1, C2, C3] },
      { n: 6, ids: [601, 602, 603], owner: 'profesional-psicosocial', objects: [C1, C2, C3] },
    ];
    for (const stage of stages) {
      const live = stage.objects.map(d => decorateDialogueState(d, ctxWith({ nodeOptionIds: stage.ids })));
      for (const out of live) {
        for (const id of decisionIds(out)) expect(stage.ids).toContain(id);
        expect(!!out.stale).toBe(out.key !== stage.owner);
      }
      expect(live.filter(out => !out.stale)).toHaveLength(1);
    }
  });
});

describe('decorateDialogueState: un solo aviso para las decisiones', () => {
  const AVISO = 'Puedes conocer más antes de responder.';

  it('pone el aviso de la pantalla en notice (nunca por opción) cuando hay decisiones activas', () => {
    const out = decorateDialogueState(H1, ctxWith({ notice: AVISO }));
    expect(out.notice).toBe(AVISO);
    expect(out.choices.every(c => c.evidenceWarning === undefined)).toBe(true);
  });

  it('sin aviso no hay notice', () => {
    const out = decorateDialogueState(H1, ctxWith({ notice: null }));
    expect(out.notice).toBeUndefined();
    expect('notice' in out).toBe(false);
  });

  it('solo avisa si hay decisiones activas: no en conversaciones de herramienta ni en las de otra etapa', () => {
    expect(decorateDialogueState(FAMILIA, ctxWith({ notice: AVISO })).notice).toBeUndefined();
    expect(decorateDialogueState(H2, ctxWith({ notice: AVISO })).notice).toBeUndefined();
  });

  it('con nodeOptionIds desconocidos (null) las decisiones cuentan como activas', () => {
    expect(decorateDialogueState(H1, ctxWith({ notice: AVISO, nodeOptionIds: null })).notice).toBe(AVISO);
  });

  it('retira el aviso por opción heredado (evidenceWarning)', () => {
    const d = dialogue('x', [choice('a', 101, { evidenceWarning: 'viejo' })]);
    const out = decorateDialogueState(d, ctxWith());
    expect('evidenceWarning' in out.choices[0]).toBe(false);
  });
});

describe('decorateDialogueState: herramienta ausente, ausencia de líneas extra y pureza', () => {
  it('toolMissing refleja el inventario y no toca las opciones sin herramienta', () => {
    const none = decorateDialogueState(FAMILIA, ctxWith());
    expect(none.choices[0].toolMissing).toBe(true);
    const has = decorateDialogueState(FAMILIA, ctxWith({ world: worldWith({ inventory: ['PAP'] }) }));
    expect(has.choices[0].toolMissing).toBe(false);
    const decision = decorateDialogueState(H1, ctxWith());
    expect(decision.choices.every(c => c.toolMissing === undefined)).toBe(true);
    const noWorld = decorateDialogueState(FAMILIA, ctxWith({ world: null }));
    expect(noWorld.choices[0].toolMissing).toBeUndefined();
  });

  it('no agrega líneas por evidencia ni conoce NODE_EVIDENCE', async () => {
    expect(decorateDialogueState(H1, ctxWith({ notice: null })).lines).toEqual(H1.lines);
    const config = await import('./evidence-gating.config');
    expect(Object.keys(config)).not.toContain('NODE_EVIDENCE');
  });

  it('una conversación sin decisiones ofrecidas dice que por ahora no hay nada que decidir', () => {
    const d = decorateDialogueState(H1, ctxWith({ nodeOptionIds: [999], notice: null }));
    expect(d.stale).toBe(true);
    expect(d.lines.at(-1)!.text).toBe('Por ahora no hay nada que decidir en esta conversación.');
  });

  it('no muta la conversación de entrada y es idempotente', () => {
    const snapshot = JSON.stringify(H2);
    const ctx = ctxWith();
    const once = decorateDialogueState(H2, ctx);
    expect(JSON.stringify(H2)).toBe(snapshot);
    expect(decorateDialogueState(once, ctx)).toEqual(once);
    const decisionOnce = decorateDialogueState(H1, ctx);
    expect(decorateDialogueState(decisionOnce, ctx)).toEqual(decisionOnce);
  });
});

describe('activeDecisionObjectKeys / otherStageDecisionKeys', () => {
  const world = worldWith({
    objects: [
      object('familia-duelo', 'PERSON', H1), object('marco-normativo-hospital', 'OBJECT', H2),
      object('psicologa-acompanante', 'PERSON', H3), object('tool-pap', 'TOOL', null),
      object('familia-crisis', 'PERSON', FAMILIA), object('puerta-urgencias', 'EXIT', null),
    ],
  });

  it('el único objeto destacado es el que aloja la decisión activa', () => {
    expect([...activeDecisionObjectKeys(world, [101, 102, 103])]).toEqual(['familia-duelo']);
    expect([...activeDecisionObjectKeys(world, [201])]).toEqual(['marco-normativo-hospital']);
    expect([...activeDecisionObjectKeys(world, [999])]).toEqual([]);
  });

  it('los objetos de decisión de otras etapas se atenúan; herramientas, puertas y conversaciones sin decisión, no', () => {
    expect([...otherStageDecisionKeys(world, [101, 102, 103])].sort())
      .toEqual(['marco-normativo-hospital', 'psicologa-acompanante']);
    expect([...otherStageDecisionKeys(world, [301])].sort()).toEqual(['familia-duelo', 'marco-normativo-hospital']);
  });

  it('con ids desconocidos (null o vacío) o sin mundo no se atenúa ni se destaca nada', () => {
    for (const ids of [null, []]) {
      expect(activeDecisionObjectKeys(world, ids).size).toBe(0);
      expect(otherStageDecisionKeys(world, ids).size).toBe(0);
    }
    expect(activeDecisionObjectKeys(null, [101]).size).toBe(0);
    expect(otherStageDecisionKeys(null, [101]).size).toBe(0);
  });

  it('activos y atenuados son disjuntos y cubren todos los objetos de decisión', () => {
    const ids = [201, 202, 203];
    const active = activeDecisionObjectKeys(world, ids);
    const other = otherStageDecisionKeys(world, ids);
    for (const key of active) expect(other.has(key)).toBe(false);
    expect(active.size + other.size).toBe(3);
  });
});
