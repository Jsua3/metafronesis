import { focusFirstInvalid } from './focus-first-invalid.util';

describe('focusFirstInvalid', () => {
  afterEach(() => document.body.replaceChildren());

  function mount(html: string): HTMLElement {
    const root = document.createElement('form');
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it('enfoca el primer control inválido en orden del documento', () => {
    const root = mount(`
      <input id="ok" class="ng-valid">
      <textarea id="bad-1" class="ng-invalid"></textarea>
      <input id="bad-2" class="ng-invalid">
    `);
    expect(focusFirstInvalid(root)).toBe(true);
    expect(document.activeElement?.id).toBe('bad-1');
  });

  it('también enfoca un mat-select inválido', () => {
    const root = mount(`<mat-select id="sel" class="ng-invalid" tabindex="0"></mat-select>`);
    expect(focusFirstInvalid(root)).toBe(true);
    expect(document.activeElement?.id).toBe('sel');
  });

  it('devuelve false si no hay campos inválidos', () => {
    const root = mount(`<input class="ng-valid">`);
    expect(focusFirstInvalid(root)).toBe(false);
  });
});
