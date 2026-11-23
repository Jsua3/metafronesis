import { resolveCharacter } from './character-visual.resolver';
import { figureStyle, integerScale } from './kit-figure.util';
import { testKitBundle } from './testing/kit-testing';

const bundle = testKitBundle();
const valentina = resolveCharacter(bundle, { kind: 'receta', recipeId: 'valentina' });
const base = { view: 'down', sheet: 'idle', col: 0, scale: 2, portrait: null } as const;

describe('figureStyle', () => {
  it('reposo de frente a ×2: caja exacta y hoja entera escalada', () => {
    expect(figureStyle(valentina, base)).toEqual({
      width: '96px', height: '144px',
      'background-image': 'url("/assets/characters/kit/valentina/idle.png")',
      'background-size': '384px 1152px',
      'background-position': '0px 0px',
    });
  });

  it('caminata a la derecha, cuadro 3, a ×4', () => {
    expect(figureStyle(valentina, { ...base, sheet: 'walk', view: 'right', col: 3, scale: 4 })).toMatchObject({
      width: '192px', height: '288px', 'background-size': '1152px 2304px', 'background-position': '-576px -1728px',
    });
  });

  it('una diagonal usa su propia fila de la hoja de ocho', () => {
    expect(figureStyle(valentina, { ...base, view: 'down-left' })['background-position']).toBe('0px -144px');
    expect(figureStyle(valentina, { ...base, view: 'up-right' })['background-position']).toBe('0px -720px');
  });

  it('la escala siempre es entera', () => {
    expect(integerScale(2.6)).toBe(3);
    expect(integerScale(0)).toBe(1);
    expect(integerScale(Number.NaN)).toBe(1);
  });

  it('retrato a ×3; si la receta no tiene el estado, el neutral', () => {
    // Todas las recetas del kit publican los seis retratos (P4); el respaldo se prueba con una que solo trae el neutral.
    const soloNeutral = { ...valentina, portraits: { neutral: valentina.portraits.neutral } };
    expect(figureStyle(soloNeutral, { ...base, portrait: 'triste', scale: 3 })).toEqual({
      width: '96px', height: '96px',
      'background-image': 'url("/assets/characters/kit/valentina/portrait-neutral.png")',
      'background-size': '96px 96px',
    });
  });

  it('sin visual o sin URL (jsdom sin canvas) queda solo la caja', () => {
    expect(figureStyle(null, base)).toEqual({ width: '96px', height: '144px' });
    const custom = resolveCharacter(bundle, {
      kind: 'jugador',
      avatar: { schemaVersion: 2, mode: 'personalizado', complexion: 'b', skin: 'piel-6', hair: 'afro', hairColor: 'negro', accessories: [], bata: false },
    });
    expect(figureStyle(custom, base, () => null)).toEqual({ width: '96px', height: '144px' });
  });
});
