/** Solo para specs: el paquete real del kit leído de disco y un KitService que ya lo tiene. */
import { signal } from '@angular/core';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

import type { KitBundle } from '../kit-engine';
import type { KitService } from '../kit.service';

const KIT_RELATIVE = ['src', 'assets', 'characters', 'kit'];

/**
 * Carpeta del kit, buscada subiendo desde `from`. Bajo el runner de Vitest de Angular `__dirname` no es el
 * de este archivo (es el del spec que lo importa, o la raíz de la compilación si el módulo cae en un trozo
 * compartido), así que una ruta relativa a él se rompe según quién lo importe.
 */
function findKitDir(from: string): string {
  let dir = from;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, ...KIT_RELATIVE, 'kit.json'))) return join(dir, ...KIT_RELATIVE);
    dir = dirname(dir);
  }
  throw new Error(`No se encontró ${KIT_RELATIVE.join('/')}/kit.json subiendo desde ${from}`);
}

let cached: KitBundle | null = null;

export function testKitBundle(): KitBundle {
  cached ??= JSON.parse(readFileSync(join(findKitDir(__dirname), 'kit.json'), 'utf8')) as KitBundle;
  return cached;
}

export function fakeKitService(bundle: KitBundle = testKitBundle()): KitService {
  return { bundle: signal(bundle).asReadonly(), load: () => Promise.resolve(bundle) } as unknown as KitService;
}
