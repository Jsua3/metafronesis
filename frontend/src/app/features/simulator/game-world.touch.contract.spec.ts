import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: controles táctiles', () => {
  // req: BLOQUE-H, RNF-04 (VD-5: la cruceta se decide por la entrada real)
  it('aparecen por la entrada real (toque o ratón), no por ancho de ventana ni solo por (pointer: coarse)', () => {
    expect(source).toContain(":host(.touch-input) .touch-controls { display: grid; }");
    expect(source).toContain("'[class.touch-input]': 'touchInput()'");
    expect(source).not.toContain('@media (pointer: coarse) { .touch-controls { display: grid; } }');
    expect(source).not.toContain('@media (max-width: 900px) { .touch-controls');
  });

  it('la entrada real se lee de los eventos del puntero, fuera de Angular y con un ratón solo si hay puntero fino', () => {
    expect(source).toMatch(/document\.addEventListener\('pointerdown', this\.onPointerKind, \{ capture: true, passive: true \}\);/);
    expect(source).toMatch(/document\.addEventListener\('pointermove', this\.onPointerKind, \{ capture: true, passive: true \}\);/);
    expect(source).toContain("matchesMedia('(any-pointer: fine)')");
    expect(source).toMatch(/document\.removeEventListener\('pointerdown', this\.onPointerKind, true\);/);
  });

  it('cada flecha camina mientras se mantiene y el teclado conserva el paso único', () => {
    for (const dir of ['up', 'left', 'right', 'down']) {
      expect(source).toContain(`(pointerdown)="holdDirection($event, '${dir}')"`);
      expect(source).toContain(`(click)="keyboardNudge($event, '${dir}')"`);
    }
    expect(source.match(/\(pointerup\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
    expect(source.match(/\(pointercancel\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
    expect(source.match(/\(lostpointercapture\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
  });

  it('el paso va antes de la captura del puntero y una captura fallida no lo pierde', () => {
    // Con un pointerId ya inactivo setPointerCapture lanza: si iba primero, el toque se perdía.
    expect(source).toMatch(
      /holdDirection\(event: PointerEvent, direction: PlayerDirection\) \{[\s\S]*?this\.scene\?\.nudge\(direction\);[\s\S]*?this\.scene\?\.setHeldDirection\(direction\);[\s\S]*?try \{\s*\(event\.currentTarget as HTMLElement \| null\)\?\.setPointerCapture\?\.\(event\.pointerId\);\s*\} catch \{/,
    );
  });

  it('la escena suma la dirección mantenida a la entrada de movimiento', () => {
    expect(source).toMatch(/const keyInput: PlayerMotionInput = heldInput\(\{/);
    expect(source).toMatch(/\}, this\.heldDirection, this\.time\.now - this\.heldSince\);/);
  });

  it('un overlay que congela el mundo suelta la dirección mantenida', () => {
    expect(source).toMatch(/setMotionPaused\(paused: boolean\) \{\s*this\.motionPaused = paused;\s*if \(paused\) \{\s*this\.setHeldDirection\(null\);/);
  });

  it('la cruceta es una cruz de 3x3 de 48 px abajo a la izquierda y «Interactuar» abajo a la derecha, sin tapar el piso', () => {
    // El contenedor ocupa el ancho del mundo pegado abajo y NO recibe toques: solo los controles.
    // V4: la banda va 8 px sobre el pie de la pantalla del juego (--alto-pie): sin él, la ficha táctil tapaba la puerta.
    expect(source).toMatch(/\.touch-controls \{\s*display: none;\s*position: absolute;\s*left: 8px;\s*right: 8px;\s*(\/\*[\s\S]*?\*\/\s*)?bottom: calc\(8px \+ var\(--alto-pie, 0px\)\);/);
    expect(source).toMatch(/justify-content: space-between;[\s\S]*?pointer-events: none;/);
    expect(source).toMatch(/\.touch-dpad, \.touch-interact \{ pointer-events: auto; \}/);
    expect(source).toMatch(/\.touch-dpad \{\s*display: grid;\s*grid-template-columns: repeat\(3, 48px\);\s*grid-template-rows: repeat\(3, 48px\);/);
    expect(source).toContain('.touch-btn--up { grid-area: 1 / 2; }');
    expect(source).toContain('.touch-btn--left { grid-area: 2 / 1; }');
    expect(source).toContain('.touch-btn--right { grid-area: 2 / 3; }');
    expect(source).toContain('.touch-btn--down { grid-area: 3 / 2; }');
    // las cuatro flechas viven dentro de la cruz y ya no se centran sobre el piso
    expect(source).toMatch(/<div class="touch-dpad">[\s\S]*?touch-btn--down[\s\S]*?<\/div>\s*<!--/);
    expect(source).not.toMatch(/bottom: 92px/);
    expect(source).not.toMatch(/\.touch-controls \{[^}]*translateX\(-50%\)/);
  });

  it('«Interactuar» conserva su clase para el e2e y dice con qué va a interactuar', () => {
    expect(source).toContain('class="psy-button psy-button--glass touch-interact"');
    expect(source).toMatch(/\[attr\.aria-label\]="'Interactuar: ' \+ \(interactLabel\(\) \?\? 'Acércate a algo'\)"/);
    expect(source).toContain("{{ interactLabel() ?? 'Acércate a algo' }}");
    // sin nada cerca se atenúa pero se puede tocar (la escena avisa): nunca `disabled`
    expect(source).toContain('[class.touch-interact--idle]="!interactLabel()"');
    // ni `disabled` ni `aria-disabled`: Playwright los toma por «no habilitado» y el e2e táctil esperaría para siempre
    expect(source).not.toMatch(/touch-interact[^>]*\[disabled\]/);
    expect(source).not.toMatch(/touch-interact[\s\S]{0,400}\[attr\.aria-disabled\]/);
    // el icono no es parte del nombre accesible
    expect(source).toContain('<mat-icon aria-hidden="true">touch_app</mat-icon>');
  });

  it('en anchos cortos (< 700 px) los controles se hacen semitransparentes sobre el mundo', () => {
    expect(source).toMatch(/@media \(max-width: 699px\) \{\s*:host\(\.touch-input\) \.touch-btn \{ background: rgba\(8,12,18,\.45\);/);
  });
});
