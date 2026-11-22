#!/usr/bin/env node
// Trinquete `ui:lint` (plan visual F0-2). Uso, desde `frontend`:
//   node scripts/ui/ui-lint.mjs              compara con ui-lint.baseline.json; sale 1 si algún contador sube
//   node scripts/ui/ui-lint.mjs --update     reescribe el baseline (se niega si algún contador sube)
//   node scripts/ui/ui-lint.mjs --details X  lista ruta:línea de la métrica X
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { METRICS, compareToBaseline, scanSourceTree } from './ui-lint-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'src');
const BASELINE = join(here, 'ui-lint.baseline.json');

const args = process.argv.slice(2);
const { counts, details } = scanSourceTree(SRC);

const detailsAt = args.indexOf('--details');
if (detailsAt >= 0) {
  const metric = args[detailsAt + 1];
  if (!METRICS.includes(metric)) {
    console.error(`Métrica desconocida «${metric}». Opciones: ${METRICS.join(', ')}`);
    process.exit(2);
  }
  for (const item of details[metric]) console.log(`${item.at}  ${item.text}`);
  console.log(`\n${metric}: ${counts[metric]}`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
const verdict = compareToBaseline(counts, baseline);
const width = Math.max(...METRICS.map(metric => metric.length));
for (const metric of METRICS) {
  const before = baseline?.counts?.[metric];
  const mark = before === undefined ? 'nuevo' : counts[metric] > before ? 'SUBE' : counts[metric] < before ? 'baja' : '=';
  console.log(`${metric.padEnd(width)}  ${String(counts[metric]).padStart(5)}  (baseline ${before ?? '—'}) ${mark}`);
}

if (args.includes('--update')) {
  if (verdict.rises.length) {
    console.error(`\nNo se reescribe el baseline: suben ${verdict.rises.map(r => r.metric).join(', ')}.`);
    process.exit(1);
  }
  writeFileSync(BASELINE, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString().slice(0, 10), counts }, null, 2)}\n`);
  console.log('\nBaseline reescrito.');
  process.exit(0);
}

if (!verdict.ok) {
  for (const r of verdict.rises) console.error(`\n✖ ${r.metric} subió de ${r.before} a ${r.now}. Detalle: node scripts/ui/ui-lint.mjs --details ${r.metric}`);
  if (verdict.missing.length) console.error(`\n✖ Sin baseline para: ${verdict.missing.join(', ')}. Ejecuta con --update.`);
  process.exit(1);
}
if (verdict.drops.length) console.log(`\nBajaron ${verdict.drops.map(d => d.metric).join(', ')}: actualiza el baseline con --update.`);
console.log('\nui:lint OK');
