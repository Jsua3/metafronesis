import { DialogueState } from '../../core/models/simulation.model';
import { resolveViewMode } from './simulation-view-mode.util';

function dialogueWith(choices: DialogueState['choices']): DialogueState {
  return {
    key: 'd1', speakerName: 'Paciente', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Paciente', text: 'Hola', emotion: 'neutral' }],
    choices,
  };
}

const choice = {
  key: 'c1', text: 'Escuchar', decisionOptionId: 7,
  requiredToolCode: null, effect: {},
};

describe('resolveViewMode', () => {
  it('explora cuando no hay nada activo', () => {
    expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: null }))
      .toBe('explore');
  });

  it('outcome cuando el intento terminó, por encima de todo lo demás', () => {
    expect(resolveViewMode({ status: 'COMPLETED', journalOpen: true, dialogue: dialogueWith([choice]) }))
      .toBe('outcome');
    expect(resolveViewMode({ status: 'SAFE_EXITED', journalOpen: false, dialogue: null }))
      .toBe('outcome');
  });

  it('journal cuando la bitácora está abierta y el intento sigue en curso', () => {
    expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: true, dialogue: dialogueWith([choice]) }))
      .toBe('journal');
  });

  // Bloque I1: las decisiones van sobre el mundo, como en la maqueta; el panel lateral ya no se pide.
  it('dialogue-cinematic también cuando el diálogo activo tiene opciones de decisión', () => {
    expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: dialogueWith([choice]) }))
      .toBe('dialogue-cinematic');
  });

  it('dialogue-cinematic cuando el diálogo es informativo (sin opciones)', () => {
    expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: dialogueWith([]) }))
      .toBe('dialogue-cinematic');
  });

  it('explore cuando aún no hay intento cargado', () => {
    expect(resolveViewMode({ status: null, journalOpen: false, dialogue: null }))
      .toBe('explore');
  });

  describe('holdOutcome (respaldo de la decisión en dos tiempos, T12.3)', () => {
    it('con el intento terminado y un diálogo retenido muestra el diálogo cinemático, no el resultado', () => {
      expect(resolveViewMode({ status: 'COMPLETED', journalOpen: false, dialogue: dialogueWith([]), holdOutcome: true }))
        .toBe('dialogue-cinematic');
    });

    it('lo retenido es cinemático aunque el diálogo traiga opciones y aunque la bitácora figure abierta', () => {
      expect(resolveViewMode({ status: 'COMPLETED', journalOpen: true, dialogue: dialogueWith([choice]), holdOutcome: true }))
        .toBe('dialogue-cinematic');
    });

    it('sin diálogo que retener el resultado se muestra igual', () => {
      expect(resolveViewMode({ status: 'COMPLETED', journalOpen: false, dialogue: null, holdOutcome: true }))
        .toBe('outcome');
    });

    it('sin holdOutcome, o con holdOutcome en falso, el resultado sigue por encima de todo', () => {
      expect(resolveViewMode({ status: 'COMPLETED', journalOpen: false, dialogue: dialogueWith([]) })).toBe('outcome');
      expect(resolveViewMode({ status: 'COMPLETED', journalOpen: false, dialogue: dialogueWith([]), holdOutcome: false })).toBe('outcome');
      expect(resolveViewMode({ status: 'SAFE_EXITED', journalOpen: false, dialogue: dialogueWith([]), holdOutcome: false })).toBe('outcome');
    });

    it('no altera el intento en curso: holdOutcome es irrelevante con IN_PROGRESS', () => {
      expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: dialogueWith([choice]), holdOutcome: true }))
        .toBe('dialogue-cinematic');
      expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: false, dialogue: dialogueWith([]), holdOutcome: true }))
        .toBe('dialogue-cinematic');
      expect(resolveViewMode({ status: 'IN_PROGRESS', journalOpen: true, dialogue: null, holdOutcome: true }))
        .toBe('journal');
    });
  });
});
