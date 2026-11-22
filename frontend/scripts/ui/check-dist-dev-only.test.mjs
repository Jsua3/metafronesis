import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEV_ONLY_MARKERS, SECRET_MARKERS, findDevOnlyLeaks } from './check-dist-dev-only.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'check-dist-dev-only.mjs');

function distWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'dist-dev-only-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

test('los marcadores cubren la galería de desarrollo, el banco de la barra y el auditor axe del arranque', () => {
  assert.ok(DEV_ONLY_MARKERS.includes('Galería de componentes'));
  assert.ok(DEV_ONLY_MARKERS.includes('Banco de la barra'));
  assert.ok(DEV_ONLY_MARKERS.includes('[axe-core]'));
});

// RNF-01 / VD-22 (plan visual F4-2): «Usar demo» existe solo en desarrollo; sus credenciales no viajan a producción.
test('las credenciales de demostración son marcadores de solo desarrollo (contraseñas y correos)', () => {
  for (const secret of ['Estudiante123!', 'Profesor123!', 'Admin123!', 'estudiante@psychosim.edu.co', 'profesora@psychosim.edu.co', 'admin@psychosim.edu.co']) {
    assert.ok(DEV_ONLY_MARKERS.includes(secret), secret);
  }
  const root = distWith({ 'browser/chunk-login.js': 'demoPassword:"Estudiante123!"' });
  try {
    assert.deepEqual(findDevOnlyLeaks(root), [{ file: 'browser/chunk-login.js', marker: 'Estudiante123!' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findDevOnlyLeaks informa archivo y marcador cuando el dist contiene código de desarrollo', () => {
  const root = distWith({ 'browser/chunk-a.js': 'x="Galería de componentes"', 'browser/main.js': 'ok' });
  try {
    assert.deepEqual(findDevOnlyLeaks(root), [{ file: 'browser/chunk-a.js', marker: 'Galería de componentes' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('el CLI sale 1 con fugas y 0 con un dist limpio', () => {
  const dirty = distWith({ 'browser/main.js': 'console.group("[axe-core] Accessibility violations")' });
  const clean = distWith({ 'browser/main.js': 'bootstrap()' });
  try {
    assert.equal(spawnSync(process.execPath, [script, dirty], { encoding: 'utf8' }).status, 1);
    assert.equal(spawnSync(process.execPath, [script, clean], { encoding: 'utf8' }).status, 0);
  } finally {
    rmSync(dirty, { recursive: true, force: true });
    rmSync(clean, { recursive: true, force: true });
  }
});

// S7-1b (LS-3): ni una cadena de conexión ni el nombre de un secreto del servidor llegan al navegador.
// req: LS-3, RNF-002
test('los marcadores de secretos son las cadenas de conexión y los nombres de las variables del servidor', () => {
  assert.deepEqual(
    [...SECRET_MARKERS].sort(),
    ['DATABASE_URL', 'DJANGO_SECRET_KEY', 'JWT_SIGNING_KEY', 'REFLECTION_ENCRYPTION_KEY', 'REFLECTION_KEYS', 'SIEP_ADMIN_PASSWORD', 'postgres://', 'postgresql://'],
  );
});

test('no se prohíbe la palabra password: el formulario de entrada la usa', () => {
  for (const marker of [...DEV_ONLY_MARKERS, ...SECRET_MARKERS]) {
    assert.notEqual(marker.toLowerCase(), 'password');
    assert.ok(!'type="password" autocomplete="current-password" {email:e,password:p} passwordHash'.includes(marker), marker);
  }
});

test('cada marcador de secretos, solo, hace que findDevOnlyLeaks informe ese marcador en ese archivo', () => {
  for (const marker of SECRET_MARKERS) {
    const root = distWith({ 'browser/chunk-env.js': `const a="x";const b="${marker}";export{b}`, 'browser/main.js': 'bootstrap()' });
    try {
      assert.deepEqual(findDevOnlyLeaks(root), [{ file: 'browser/chunk-env.js', marker }], marker);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('control negativo: una carpeta con un marcador de CADA lista falla y dice cuál; una limpia pasa', () => {
  const every = [...DEV_ONLY_MARKERS, ...SECRET_MARKERS];
  const dirty = distWith(Object.fromEntries(every.map((marker, index) => [`browser/chunk-${index}.js`, `var x="${marker}";`])));
  const clean = distWith({
    'browser/main.js': 'bootstrap({type:"password",autocomplete:"current-password",body:{email:e,password:p},hash:"passwordHash"})',
    'browser/chunk-login.js': 'const labels={password:"Contraseña",email:"Correo"};export{labels}',
  });
  try {
    assert.deepEqual(findDevOnlyLeaks(dirty).map((leak) => leak.marker).sort(), [...every].sort());
    assert.deepEqual(findDevOnlyLeaks(clean), []);

    const failed = spawnSync(process.execPath, [script, dirty], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    for (const marker of every) assert.ok(failed.stderr.includes(`«${marker}»`), `el CLI no nombra ${marker}`);
    assert.match(failed.stderr, /cadena de conexión o nombre de un secreto del servidor en el bundle/);
    assert.match(failed.stderr, /código de solo desarrollo en producción/);

    const passed = spawnSync(process.execPath, [script, clean], { encoding: 'utf8' });
    assert.equal(passed.status, 0, passed.stderr);
    assert.match(passed.stdout, /dist sin código de solo desarrollo ni cadenas de conexión ni nombres de secretos/);
  } finally {
    rmSync(dirty, { recursive: true, force: true });
    rmSync(clean, { recursive: true, force: true });
  }
});

test('el CLI marca como secreto, y no como código de desarrollo, el marcador de secretos', () => {
  const dirty = distWith({ 'browser/main.js': 'const url="postgres://usuario@servidor/base"' });
  try {
    const run = spawnSync(process.execPath, [script, dirty], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /browser\/main\.js contiene «postgres:\/\/» \(cadena de conexión o nombre de un secreto del servidor en el bundle\)/);
    assert.doesNotMatch(run.stderr, /código de solo desarrollo/);
  } finally {
    rmSync(dirty, { recursive: true, force: true });
  }
});
