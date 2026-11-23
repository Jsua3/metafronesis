import type { Activation, Bond } from '../../core/models/simulation.model';
import { definitivePortrait, portraitStateForPersona } from './persona-portrait.util';

const SEIS = ['neutral', 'preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis'];
const CUATRO = ['neutral', 'preocupada', 'triste', 'alegre'];

describe('portraitStateForPersona', () => {
  // [vínculo, activación, cara definitiva, cara con el kit de cuatro estados]
  const TABLA: [Bond, Activation, string, string][] = [
    ['WITHDRAWN', 'CALM', 'triste', 'triste'],
    ['GUARDED', 'CALM', 'cautelosa', 'preocupada'],
    ['OPEN', 'CALM', 'alegre', 'alegre'],
    ['WITHDRAWN', 'TENSE', 'preocupada', 'preocupada'],
    ['GUARDED', 'TENSE', 'preocupada', 'preocupada'],
    ['OPEN', 'TENSE', 'preocupada', 'preocupada'],
    ['WITHDRAWN', 'CRISIS', 'en-crisis', 'triste'],
    ['GUARDED', 'CRISIS', 'en-crisis', 'triste'],
    ['OPEN', 'CRISIS', 'en-crisis', 'triste'],
  ];

  it.each(TABLA)('%s y %s: con el kit de seis estados es «%s»', (bond, activation, definitiva) => {
    expect(definitivePortrait({ bond, activation })).toBe(definitiva);
    expect(portraitStateForPersona({ bond, activation }, SEIS)).toBe(definitiva);
  });

  it.each(TABLA)('%s y %s: con el kit de cuatro estados cae a «%s» (cara cercana)', (bond, activation, _d, cuatro) => {
    expect(portraitStateForPersona({ bond, activation }, CUATRO)).toBe(cuatro);
  });

  it('sin ningún estado conocido en el kit queda en neutral', () => {
    expect(portraitStateForPersona({ bond: 'OPEN', activation: 'CRISIS' }, [])).toBe('neutral');
    expect(portraitStateForPersona({ bond: 'OPEN', activation: 'CRISIS' }, ['neutral'])).toBe('neutral');
  });

  it('la activación gana al vínculo salvo que esté serena', () => {
    expect(portraitStateForPersona({ bond: 'OPEN', activation: 'TENSE' }, SEIS)).toBe('preocupada');
    expect(portraitStateForPersona({ bond: 'OPEN', activation: 'CALM' }, SEIS)).toBe('alegre');
  });

  it('un valor desconocido no rompe: neutral', () => {
    expect(portraitStateForPersona({ bond: 'X', activation: 'Y' } as never, SEIS)).toBe('neutral');
  });
});
