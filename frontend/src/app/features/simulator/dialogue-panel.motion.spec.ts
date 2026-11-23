import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');

// Bloque I1: el pixel art se mueve por pasos enteros (contrato de calidad visual, regla 6). La ficha pulsada se hunde
// un píxel de mundo en vez de encogerse, y la entrada va por pasos. Se conserva lo que ya pedía el B: la entrada no
// congela el estado final, el hover solo existe con puntero fino y el movimiento reducido quita entrada y hundimiento.
describe('opciones del diálogo: movimiento', () => {
  it('la entrada escalonada va por pasos y no congela opacity ni transform al terminar', () => {
    expect(source).toContain('animation: choice-in 150ms steps(3, jump-none) backwards;');
    expect(source).not.toMatch(/animation: choice-in[^;]*\bboth;/);
    expect(source).not.toMatch(/animation: choice-confirm[^;]*\bboth;/);
  });

  it('al presionar la ficha se hunde un píxel de mundo y el hover solo existe con puntero fino', () => {
    expect(source).toMatch(/\.choice-btn:active \{ transform: translateY\(var\(--px\)\);/);
    expect(source).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.choice-btn:hover \{/);
    expect(source).not.toMatch(/scale\(/);
  });

  it('transiciona solo propiedades explícitas, por pasos lo que es de pixel', () => {
    expect(source).toContain(
      'transition: border-color 150ms ease, background-color 150ms ease, opacity 240ms steps(3), transform 120ms steps(2);',
    );
  });

  it('con movimiento reducido quita entrada y hundimiento, pero no el atenuado', () => {
    expect(source).toMatch(/\.choice-btn:active \{ transform: none; \}/);
    expect(source).toContain('.strip--quieto .choice-btn:active { transform: none; }');
    expect(source).toContain('.choices--locked .choice-btn:not(.choice-btn--chosen) { opacity: .45; }');
  });
});
