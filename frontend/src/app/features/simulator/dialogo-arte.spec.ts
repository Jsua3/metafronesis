import { existsSync } from 'fs';
import { join } from 'path';
import { LETRAS, letraDe, variablesDeArte } from './dialogo-arte';

const SRC = join(__dirname, '..', '..', '..');

describe('arte de la interfaz de diálogo', () => {
  it('las opciones se nombran A a D', () => {
    expect(LETRAS).toEqual(['A', 'B', 'C', 'D']);
    expect(letraDe(0)).toBe('A');
    expect(letraDe(3)).toBe('D');
    expect(letraDe(4)).toBe('5');
  });

  it('cada momento del día trae sus marcos, tramas y letras', () => {
    for (const momento of ['noche', 'dia'] as const) {
      const vars = variablesDeArte(momento);
      expect(vars['--marco-placa']).toBe(`url(assets/game/dialogo/marco-placa-${momento}.png)`);
      expect(vars['--trama-ficha-elegida']).toBe(`url(assets/game/dialogo/trama-ficha-elegida-${momento}.png)`);
      expect(vars['--letra-C-clara']).toBe('url(assets/game/dialogo/letra-C-clara.png)');
      expect(vars['--luz']).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(variablesDeArte('noche')['--luz']).not.toBe(variablesDeArte('dia')['--luz']);
  });

  it('todo lo que nombra existe en assets', () => {
    for (const valor of Object.values(variablesDeArte('noche')).concat(Object.values(variablesDeArte('dia')))) {
      const ruta = /^url\((.+)\)$/.exec(valor)?.[1];
      if (ruta) expect(existsSync(join(SRC, ruta)), ruta).toBe(true);
    }
  });
});
