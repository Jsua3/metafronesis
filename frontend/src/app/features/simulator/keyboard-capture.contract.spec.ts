import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Phaser 3.90 captura las teclas de juego en `window` con `preventDefault` mientras la escena
 * vive. Eso rompía el teclado de TODA la pantalla: botones enfocados que no se activaban con
 * Enter/Espacio y un textarea (la bitácora) donde no se podía escribir w, a, s, d, e, espacio ni
 * salto de línea. El juego ya no captura: lee las teclas y decide por cuadro según el foco.
 * Estos contratos de fuente fijan cada pieza de esa receta (los .ts se leen tal cual; el árbol
 * es CRLF, de ahí los `\s*`).
 */
const sources = {
  'game-world.component.ts': readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8'),
  'game-menu.component.ts': readFileSync(join(__dirname, 'game-menu.component.ts'), 'utf-8'),
};

describe.each(Object.entries(sources))('%s: teclado sin captura de Phaser', (_name, source) => {
  it('registra las teclas de juego sin captura', () => {
    expect(source).toMatch(/addKeys\(\s*'[A-Z,]+'\s*,\s*false\s*\)/);
    expect(source).not.toMatch(/addKeys\(\s*'[A-Z,]+'\s*\)/);
  });

  it('desactiva la captura global que createCursorKeys activa por su cuenta', () => {
    expect(source).toMatch(/createCursorKeys\(\)[\s\S]*?disableGlobalCapture\(\)/);
  });

  it('decide por cuadro según el elemento con foco', () => {
    expect(source).toMatch(/document\.activeElement/);
    expect(source).toMatch(/isTextEntryTarget\(/);
    expect(source).toMatch(/resolveInteractPress\(/);
  });

  it('lee JustDown de E, Espacio y Enter en cada cuadro, sin cortocircuito', () => {
    // La E se lee SIEMPRE en su propia línea y después se enmascara con «letters» (los atajos de una tecla pueden estar
    // apagados, F6-10); las tres lecturas ocurren cada cuadro. Un `||` dejaría teclas latentes.
    expect(source).toMatch(/const justE = Phaser\.Input\.Keyboard\.JustDown\(this\.keys\['E'\]\);/);
    expect(source).toMatch(
      /resolveInteractPress\(\s*focus\s*,\s*\{\s*e:\s*justE\s*&&\s*letters\s*,\s*space:\s*Phaser\.Input\.Keyboard\.JustDown\(this\.keys\['SPACE'\]\)\s*,\s*enter:\s*Phaser\.Input\.Keyboard\.JustDown\(this\.keys\['ENTER'\]\)\s*,?\s*\}\s*\)/,
    );
    expect(source).not.toMatch(/JustDown\(this\.keys\['E'\]\)\s*\|\|/);
  });

  it('cancela el desplazamiento de página fuera de Angular y lo retira al destruirse', () => {
    expect(source).toMatch(/attachScrollKeyGuard\(this\.zone\)/);
    expect(source).toMatch(/ngOnDestroy\(\)\s*\{[\s\S]*?this\.detachScrollKeyGuard\?\.\(\)/);
  });

  it('arma el bloqueo DESPUÉS de crear el juego: Phaser ignora los eventos ya cancelados', () => {
    // Si el oyente propio corriera antes que el de Phaser, `event.defaultPrevented` dejaría
    // sin leer las flechas y Espacio, y el jugador no se movería.
    expect(source).toMatch(/new Phaser\.Game\([\s\S]*?attachScrollKeyGuard\(this\.zone\)/);
  });
});

describe('keyboard-focus.util: bloqueo de desplazamiento', () => {
  const util = readFileSync(join(__dirname, 'keyboard-focus.util.ts'), 'utf-8');

  it('el oyente vive en window y se registra fuera de la zona de Angular', () => {
    expect(util).toMatch(/zone\.runOutsideAngular\(\s*\(\)\s*=>\s*target\.addEventListener\('keydown'/);
    expect(util).toMatch(/target\.removeEventListener\('keydown'/);
  });
});
