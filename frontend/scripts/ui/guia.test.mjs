import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La guía de migración de shared/ui (plan visual F2-10) no se queda atrás: cada pieza que exporta la biblioteca
 * aparece en ella, y la tabla «clase heredada → componente nuevo» cubre las clases globales más usadas.
 */
const UI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'app', 'shared', 'ui');
const GUIDE = join(UI, 'GUIA.md');

test('existe shared/ui/GUIA.md', () => {
  assert.ok(existsSync(GUIDE));
});

test('cada componente, directiva y función pública de shared/ui aparece en la guía', () => {
  const index = readFileSync(join(UI, 'index.ts'), 'utf8');
  const exported = [...index.matchAll(/^export \{([^}]+)\}/gm)]
    .flatMap(([, names]) => names.split(',').map(name => name.trim()).filter(Boolean))
    .filter(name => /^(Ui[A-Z]|ui[A-Z]|loadingPhase|injectUiTooltip|describeHostWith|errorKindFromStatus)/.test(name));
  assert.ok(exported.length > 30, `exportaciones encontradas: ${exported.length}`);
  const guide = existsSync(GUIDE) ? readFileSync(GUIDE, 'utf8') : '';
  const missing = exported.filter(name => !guide.includes(name));
  assert.deepEqual(missing, []);
});

test('la tabla de migración cubre las clases heredadas y los componentes de Material más usados', () => {
  const guide = existsSync(GUIDE) ? readFileSync(GUIDE, 'utf8') : '';
  for (const legacy of [
    'psy-button', 'psy-icon-button', 'psy-eyebrow', 'psy-chip', 'psy-skeleton', 'siep-card', 'siep-notification',
    'mat-progress-bar', 'mat-form-field', 'mat-card', 'mat-table', 'mat-icon-button', 'app-confirm-dialog',
  ]) {
    assert.match(guide, new RegExp(`\`[^\`]*${legacy}[^\`]*\``), legacy);
  }
});
