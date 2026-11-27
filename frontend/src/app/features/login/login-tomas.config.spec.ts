import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { LOGIN_TOMAS } from './login-tomas.config';

describe('configuración de tomas', () => {
  it('declara identificadores únicos, pilares válidos y archivos dentro del presupuesto', () => {
    expect(new Set(LOGIN_TOMAS.map(t => t.id)).size).toBe(5);
    expect(LOGIN_TOMAS.map(t => t.id)).toEqual(['llegada', 'escucha', 'decision', 'cruce', 'supervision']);
    for (const toma of LOGIN_TOMAS) {
      expect(toma.pilares.length).toBeGreaterThan(0);
      for (const pilar of toma.pilares) expect(['simula', 'decide', 'evalua', 'aprende']).toContain(pilar);
      for (const ext of ['webm', 'mp4', 'webp']) {
        const ruta = join(__dirname, '../../../assets/login/tomas', `${toma.id}.${ext}`);
        expect(existsSync(ruta)).toBe(true);
        expect(statSync(ruta).size).toBeLessThan(ext === 'webp' ? 150_000 : 2_000_000);
      }
    }
  });
});
