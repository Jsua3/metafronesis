import * as fs from 'fs';
import * as path from 'path';

/**
 * Límite de producto 1 (evaluación formativa): nada de la orientación puede revelar cuál opción de una
 * decisión es la adecuada ANTES de elegir. Por construcción, el código nuevo de orientación solo ve ids de
 * opciones, nunca la clasificación ni la conducta prohibida. Este spec falla si algún archivo de orientación
 * (nuevo) lee alguno de esos campos, aunque sea en un comentario.
 */
const FORBIDDEN = ['classification', 'prohibitedConduct', 'isRecommended', 'isProhibited'] as const;
const LEAK = new RegExp(`\\b(${FORBIDDEN.join('|')})\\b`, 'g');

/**
 * Prefijos de los archivos de orientación (F§9.1). Se vigilan los archivos de código y los ayudantes de
 * prueba; los `.spec.ts` quedan fuera porque son los que afirman la AUSENCIA de estos campos (con una
 * expresión regular que los nombra).
 */
const OWNED_PREFIXES = [
  'orientation', 'place-hint', 'evidence-copy', 'door-status',
  'dialogue-decoration', 'interaction-verb', 'help-memory', 'evidence-gating',
  // El panel de opciones (F6-4, DM-5.8): ni su plantilla ni su código leen la clasificación antes de decidir.
  'dialogue-panel',
  // El ratón en el mundo (F6-7): la caminata y el resaltado solo conocen claves y distancias.
  'world-walk', 'world-hover', 'vignette-texture', 'world-typography',
];
/** Los escriben otras pistas: se vigilan si existen, pero no se exige que existan. */
const OPTIONAL_PREFIXES = ['game-help', 'safe-exit-button'];

const THIS_FILE = path.basename(__filename);

export function leaksIn(source: string): string[] {
  return [...source.matchAll(LEAK)].map(match => match[1]);
}

function filesWithPrefix(prefix: string): string[] {
  return fs.readdirSync(__dirname)
    .filter(name => name.startsWith(prefix) && name.endsWith('.ts') && !name.endsWith('.spec.ts') && name !== THIS_FILE)
    .sort();
}

describe('no-classification-leak', () => {
  it('el detector reconoce los cuatro campos (también como clave de objeto o de texto) y nada más', () => {
    expect(leaksIn('const x = option.classification;')).toEqual(['classification']);
    expect(leaksIn("o['prohibitedConduct'] && c.isRecommended || c.isProhibited")).toEqual(['prohibitedConduct', 'isRecommended', 'isProhibited']);
    expect(leaksIn('// classification: ADEQUATE')).toEqual(['classification']);
    expect(leaksIn('reclassification classifications optionId nodeOptionIds')).toEqual([]);
    expect(leaksIn('Elige con calma; ninguna opción está marcada.')).toEqual([]);
  });

  it('no vigila los specs: ellos son quienes afirman la ausencia', () => {
    const names = OWNED_PREFIXES.flatMap(filesWithPrefix);
    expect(names.some(name => name.endsWith('.spec.ts'))).toBe(false);
    expect(names).toContain('evidence-gating.config.ts');
    expect(names).toContain('dialogue-decoration.util.ts');
  });

  it.each(OWNED_PREFIXES)('hay archivos «%s*» que vigilar (si no, el spec pasaría por vacío)', prefix => {
    expect(filesWithPrefix(prefix).length).toBeGreaterThan(0);
  });

  it('ningún archivo de orientación lee classification, prohibitedConduct, isRecommended ni isProhibited', () => {
    const scanned: string[] = [];
    const leaks: Record<string, string[]> = {};
    for (const prefix of [...OWNED_PREFIXES, ...OPTIONAL_PREFIXES]) {
      for (const file of filesWithPrefix(prefix)) {
        scanned.push(file);
        const found = leaksIn(fs.readFileSync(path.join(__dirname, file), 'utf-8'));
        if (found.length) leaks[file] = [...new Set(found)];
      }
    }
    expect(scanned.length).toBeGreaterThan(10);
    expect(leaks).toEqual({});
  });
});
