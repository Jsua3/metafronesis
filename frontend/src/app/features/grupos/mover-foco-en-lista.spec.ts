import { afterEach, describe, expect, it } from 'vitest';
import { moverFocoEnLista } from './mover-foco-en-lista';

// req: RNF-04 (operable con teclado: WCAG 2.1.1) · CU de revisión del docente (bandeja de intentos)
describe('RNF-04 · recorrer una lista de herramienta con el teclado', () => {
  afterEach(() => document.body.replaceChildren());

  const montar = () => {
    document.body.innerHTML = `
      <ul class="lista">
        <li><button class="fila">A</button></li>
        <li><button class="fila">B</button></li>
        <li><button class="fila">C</button></li>
      </ul>`;
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.fila'));
  };
  const pulsar = (en: HTMLElement, key: string, extra: KeyboardEventInit = {}) => {
    en.focus();
    const evento = new KeyboardEvent('keydown', { key, cancelable: true, ...extra });
    Object.defineProperty(evento, 'target', { value: en });
    return { movio: moverFocoEnLista(evento, '.lista', '.fila'), evento };
  };

  it('↓ y ↑ pasan a la fila siguiente o anterior y se detienen en los bordes', () => {
    const [a, b, c] = montar();
    expect(pulsar(a, 'ArrowDown').movio).toBe(true);
    expect(document.activeElement).toBe(b);
    pulsar(c, 'ArrowDown');
    expect(document.activeElement).toBe(c);
    pulsar(a, 'ArrowUp');
    expect(document.activeElement).toBe(a);
  });

  it('Inicio y Fin saltan a la primera y la última, y evitan que la página se desplace', () => {
    const [a, b, c] = montar();
    const { evento } = pulsar(b, 'End');
    expect(document.activeElement).toBe(c);
    expect(evento.defaultPrevented).toBe(true);
    pulsar(c, 'Home');
    expect(document.activeElement).toBe(a);
  });

  it('no toca otras teclas ni combinaciones con Ctrl (atajos del navegador)', () => {
    const [a] = montar();
    expect(pulsar(a, 'Enter').movio).toBe(false);
    expect(pulsar(a, 'ArrowDown', { ctrlKey: true }).movio).toBe(false);
    expect(document.activeElement).toBe(a);
  });
});
