import { readFileSync } from 'fs';
import { join } from 'path';

import { PERSONA_ICON_KINDS, personaIconImage, personaIconKey, personaIconKind, personaIconView } from './persona-icon.util';

const palette = new Set<string>(JSON.parse(readFileSync(join(__dirname, '../../../../character-kit/palette.v2.json'), 'utf8')).masterColors);
const hex = (rgba: Uint8Array, i: number) => `#${[0, 1, 2].map(k => rgba[i + k]!.toString(16).padStart(2, '0')).join('')}`;

describe('icono de la persona (decisión 13)', () => {
  it.each([
    [{ bond: 'OPEN', activation: 'CRISIS' }, 'crisis'],
    [{ bond: 'WITHDRAWN', activation: 'CRISIS' }, 'crisis'],
    [{ bond: 'OPEN', activation: 'CALM' }, 'confianza'],
    [{ bond: 'WITHDRAWN', activation: 'CALM' }, 'decaida'],
    [{ bond: 'WITHDRAWN', activation: 'TENSE' }, 'decaida'],
    [{ bond: 'GUARDED', activation: 'TENSE' }, null],
    [{ bond: 'GUARDED', activation: 'CALM' }, null],
    [{ bond: 'OPEN', activation: 'TENSE' }, null],
  ] as const)('%j → %s', (persona, expected) => {
    expect(personaIconKind(persona)).toBe(expected);
  });

  it('la vista del icono al crearlo: oculto sin estado o sin señal; visible con la textura de su tipo', () => {
    expect(personaIconView(null)).toEqual({ visible: false, key: 'patient-icon-crisis' });
    expect(personaIconView({ bond: 'GUARDED', activation: 'TENSE' })).toEqual({ visible: false, key: 'patient-icon-crisis' });
    expect(personaIconView({ bond: 'GUARDED', activation: 'CRISIS' })).toEqual({ visible: true, key: 'patient-icon-crisis' });
    expect(personaIconView({ bond: 'OPEN', activation: 'CALM' })).toEqual({ visible: true, key: 'patient-icon-confianza' });
    expect(personaIconView({ bond: 'WITHDRAWN', activation: 'CALM' })).toEqual({ visible: true, key: 'patient-icon-decaida' });
  });

  it('pixel art del kit: alfa binario, colores de palette.v2 y mismo tamaño', () => {
    const images = PERSONA_ICON_KINDS.map(personaIconImage);
    for (const image of images) {
      expect([image.width, image.height]).toEqual([7, 8]);
      for (let i = 0; i < image.rgba.length; i += 4) {
        expect([0, 255]).toContain(image.rgba[i + 3]);
        if (image.rgba[i + 3]) expect(palette.has(hex(image.rgba, i))).toBe(true);
      }
    }
    expect(new Set(images.map(image => image.rgba.join(','))).size).toBe(3);
    expect(personaIconKey('crisis')).toBe('patient-icon-crisis');
  });
});
