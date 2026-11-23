import { MapObjectState } from '../../core/models/simulation.model';
import { DoorStatus } from './door-status.util';
import { interactionVerb, participatesInInteraction, readsLocally } from './interaction-verb.util';

function obj(type: MapObjectState['type'], label: string, prompt = 'Aplicar la técnica clínica'): MapObjectState {
  return {
    key: 'k', label, type, x: 0, y: 0, width: 40, height: 40, color: '#fff', icon: '', shortCode: '',
    collision: false, interactionPrompt: prompt, interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
  };
}

const LOCKED: DoorStatus = { state: 'locked', missing: [], stageLocked: false, message: 'Antes de pasar, revisa el Expediente del caso (a la derecha, al fondo).' };
const OPEN: DoorStatus = { state: 'open', missing: [], stageLocked: false, message: null };

describe('interactionVerb (F§4.3)', () => {
  it.each([
    ['PERSON', 'Enfermera de urgencias', 'Hablar con Enfermera de urgencias'],
    ['OBJECT', 'Expediente del caso', 'Revisar Expediente del caso'],
    ['ROUTE', 'Ruta', 'Revisar Ruta'],
    ['WARNING', 'Acceso a quirófano', 'Revisar Acceso a quirófano'],
    ['TOOL', 'Kit PAP', 'Recoger Kit PAP'],
    ['EXIT', 'Sala de escucha familiar', 'Pasar a Sala de escucha familiar'],
  ] as const)('%s → «%s»', (type, label, expected) => {
    expect(interactionVerb(obj(type, label), null)).toEqual({ text: expected, locked: false, reason: null });
  });

  it('no usa el interactionPrompt sembrado (algunos sugieren la acción clínica)', () => {
    expect(interactionVerb(obj('PERSON', 'Familia en crisis', 'Aplicar PAP a la familia'), null)?.text)
      .toBe('Hablar con Familia en crisis');
  });

  it('una salida bloqueada conserva el verbo y suma candado y motivo', () => {
    expect(interactionVerb(obj('EXIT', 'Consultorio'), LOCKED)).toEqual({
      text: 'Pasar a Consultorio', locked: true, reason: LOCKED.message,
    });
  });

  it.each([
    ['Volver al pasillo', 'Volver al pasillo'],
    ['Pasar a la sala de espera', 'Pasar a la sala de espera'],
    ['Salir a la entrada de urgencias', 'Salir a la entrada de urgencias'],
    ['Ir al pasillo de atención', 'Ir al pasillo de atención'],
    ['Entrar al consultorio psicosocial', 'Entrar al consultorio psicosocial'],
    ['Irene', 'Pasar a Irene'],
  ] as const)('una salida cuya etiqueta ya dice el movimiento va tal cual: «%s» → «%s»', (label, expected) => {
    expect(interactionVerb(obj('EXIT', label), null)?.text).toBe(expected);
  });

  it('una salida abierta, o sin estado de puerta, no se bloquea', () => {
    expect(interactionVerb(obj('EXIT', 'Consultorio'), OPEN)).toEqual({ text: 'Pasar a Consultorio', locked: false, reason: null });
    expect(interactionVerb(obj('EXIT', 'Consultorio'), null)?.locked).toBe(false);
  });

  it('un estado de puerta no afecta a lo que no es una salida', () => {
    expect(interactionVerb(obj('PERSON', 'Sobreviviente'), LOCKED)).toEqual({ text: 'Hablar con Sobreviviente', locked: false, reason: null });
  });
});

describe('interactionVerb: los 11 tipos del servidor', () => {
  it('PROP no tiene verbo: se dibuja y choca, no se usa', () => {
    expect(interactionVerb(obj('PROP', 'Planta pequeña'), null)).toBeNull();
  });

  it.each([
    ['NOTE', 'Cartel de la Línea 155', 'Revisar Cartel de la Línea 155'],
    ['RESOURCE', 'Botiquín', 'Revisar Botiquín'],
  ] as const)('%s → «%s» se revisa, aunque el catálogo diga «Leer»', (type, label, expected) => {
    expect(interactionVerb(obj(type, label, 'Leer'), null)).toEqual({ text: expected, locked: false, reason: null });
  });
});

describe('participatesInInteraction: PROP no entra en la prioridad de interacción', () => {
  const con = (type: MapObjectState['type'], extra: Partial<MapObjectState> = {}) => ({ ...obj(type, 'x'), ...extra });

  it('un mueble nunca participa, ni con decisión', () => {
    expect(participatesInInteraction(con('PROP'))).toBe(false);
    expect(participatesInInteraction(con('PROP', { decisionOptionId: 3 }))).toBe(false);
  });

  it('los tipos de siempre y las notas y recursos sí', () => {
    for (const type of ['PERSON', 'OBJECT', 'ROUTE', 'TOOL', 'WARNING', 'EXIT', 'NOTE', 'RESOURCE'] as const) {
      expect(participatesInInteraction(con(type))).toBe(true);
    }
  });

  it('TOOL_TARGET y TRIGGER solo cuentan si traen con qué actuar; si no, se dibujan sin interacción', () => {
    for (const type of ['TOOL_TARGET', 'TRIGGER'] as const) {
      expect(participatesInInteraction(con(type))).toBe(false);
      expect(participatesInInteraction(con(type, { decisionOptionId: 3 }))).toBe(true);
      expect(participatesInInteraction(con(type, { toolCode: 'PAP' }))).toBe(true);
    }
  });
});

describe('readsLocally: NOTE muestra su texto sin llamar al servidor', () => {
  const con = (type: MapObjectState['type'], extra: Partial<MapObjectState> = {}) => ({ ...obj(type, 'x'), ...extra });

  it('una nota y un recurso se leen aquí mismo', () => {
    expect(readsLocally(con('NOTE'))).toBe(true);
    expect(readsLocally(con('RESOURCE'))).toBe(true);
  });

  it('con una decisión, una herramienta o un diálogo propio siguen el camino de siempre', () => {
    expect(readsLocally(con('NOTE', { decisionOptionId: 3 }))).toBe(false);
    expect(readsLocally(con('RESOURCE', { toolCode: 'PAP' }))).toBe(false);
    expect(readsLocally(con('NOTE', { dialogue: { key: 'd' } as MapObjectState['dialogue'] }))).toBe(false);
  });

  it('los demás tipos no se leen aquí', () => {
    for (const type of ['PERSON', 'OBJECT', 'ROUTE', 'TOOL', 'WARNING', 'EXIT', 'PROP', 'TOOL_TARGET', 'TRIGGER'] as const) {
      expect(readsLocally(con(type))).toBe(false);
    }
  });
});
