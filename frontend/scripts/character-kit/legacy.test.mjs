/**
 * «Sin legado» (spec §6.7): lo que el spec §10 borra no puede volver. Falla si existen
 * las carpetas o módulos viejos, o si el código de la app usa rutas viejas, cuadros de
 * personaje de Kenney, deformación de sprites o tintes en tiempo de ejecución.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { FRONTEND_ROOT } from './bundle.mjs';

export const LEGACY_PATHS = Object.freeze([
  'src/assets/characters/cast',
  'src/assets/characters/modular',
  'src/assets/characters/modular-legacy',
  'src/assets/characters/portraits',
  'src/assets/characters/v1',
  'src/app/features/simulator/baked-cast.util.ts',
  'src/app/features/simulator/phaser-avatar-renderer.ts',
  'src/app/features/simulator/npc-avatar-presets.ts',
  'src/app/features/simulator/v1-avatar.util.ts',
  'src/app/features/simulator/character-motion.util.ts',
  'src/app/features/character/avatar-render-plan.util.ts',
  'src/app/features/character/avatar-render-plan.model.ts',
  'src/app/features/character/actor-render-plan.util.ts',
  'src/app/features/character/actor-render-plan.model.ts',
  'src/app/features/character/character-manifest.model.ts',
  'src/app/features/character/clinical-emotion-portrait.util.ts',
  'src/app/features/character/avatar.model.ts',
  'src/app/features/character/avatar-config.util.ts',
  'src/app/features/character/avatar-figure.component.ts',
  'src/app/features/character/editor-preview.util.ts',
  'scripts/character-manifest-lib.mjs',
  'scripts/validate-character-manifest.mjs',
  'scripts/render-premium-contact-sheets.mjs',
  '../tools/cast-assets',
  '../tools/character-assets',
]);

export const LEGACY_PATTERNS = Object.freeze([
  [/characters\/(cast|modular|modular-legacy|portraits|v1)\//, 'ruta de personajes vieja'],
  [/KenneyCharFrames/, 'cuadros de personaje de Kenney'],
  [/character-motion/, 'deformación de sprites (character-motion)'],
  [/\.setTint\(/, 'tinte en tiempo de ejecución'],
  [/baked-cast|phaser-avatar-renderer|npc-avatar-presets|v1-avatar\.util|avatar-config\.util|avatar\.model|avatar-figure\.component/, 'módulo de personajes borrado'],
]);

/** Código de la app (sin specs: los contratos citan los patrones prohibidos para negarlos). */
function appSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...appSources(full));
    else if (/\.(ts|html|scss)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

export function legacyFindings(root = FRONTEND_ROOT) {
  const findings = [];
  for (const rel of LEGACY_PATHS) if (existsSync(path.join(root, rel))) findings.push(`existe ${rel}`);
  const app = path.join(root, 'src', 'app');
  if (existsSync(app)) {
    for (const file of appSources(app)) {
      const text = readFileSync(file, 'utf8');
      for (const [pattern, what] of LEGACY_PATTERNS) {
        if (pattern.test(text)) findings.push(`${path.relative(root, file).replace(/\\/g, '/')}: ${what}`);
      }
    }
  }
  return findings;
}

test('sin legado de personajes (spec §6.7, §10)', () => {
  assert.deepEqual(legacyFindings(), []);
});

test('el detector ve una carpeta borrada, una ruta vieja y un tinte', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'legado-'));
  try {
    mkdirSync(path.join(root, 'src', 'assets', 'characters', 'v1'), { recursive: true });
    mkdirSync(path.join(root, 'src', 'app'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'app', 'x.ts'), "const a = '/assets/characters/cast/x.png'; sprite.setTint(0xff0000);");
    writeFileSync(path.join(root, 'src', 'app', 'x.spec.ts'), "expect(source).not.toContain('.setTint(');");
    assert.deepEqual(legacyFindings(root), [
      'existe src/assets/characters/v1',
      'src/app/x.ts: ruta de personajes vieja',
      'src/app/x.ts: tinte en tiempo de ejecución',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
