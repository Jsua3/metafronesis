import { TestBed } from '@angular/core/testing';

import type { Linea } from '../../modelo/caso';
import { LineaComponent } from './linea.component';

/** Una línea del libreto (EDITOR.md §3.4, punto 3): el retrato es el selector de personaje y la cara se elige mirando. */
const linea: Linea = { id: 'l1', personajeId: 'laura', texto: 'Hola.', expresion: 'neutral', marcaIa: false };
const personajes = [{ id: 'laura', nombre: 'Laura', recipeId: 'estudiante' }, { id: 'ana', nombre: 'Ana', recipeId: 'psicologa-hospitalaria' }];

async function montar(cambios: Partial<Linea> = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [LineaComponent] }).compileComponents();
  const fixture = TestBed.createComponent(LineaComponent);
  fixture.componentRef.setInput('linea', { ...linea, ...cambios });
  fixture.componentRef.setInput('indice', 0);
  fixture.componentRef.setInput('total', 2);
  fixture.componentRef.setInput('personajes', personajes);
  await fixture.whenStable();
  const raiz = fixture.nativeElement as HTMLElement;
  const emitido: unknown[] = [];
  fixture.componentInstance.editar.subscribe((c) => emitido.push(c));
  return { fixture, raiz, emitido, listo: () => fixture.whenStable() };
}

describe('LineaComponent', () => {
  it('el retrato abre los personajes con su retrato; elegir uno lo cambia y cierra el menú', async () => {
    const { raiz, emitido, listo } = await montar();
    const retrato = raiz.querySelector<HTMLButtonElement>('#lp0')!;
    expect(retrato.getAttribute('aria-label')).toBe('Personaje de la línea 1: Laura');
    retrato.click();
    await listo();
    expect(retrato.getAttribute('aria-expanded')).toBe('true');
    const opciones = [...raiz.querySelectorAll<HTMLButtonElement>('#lp-panel-0 button')];
    expect(opciones.map((o) => o.textContent!.trim())).toEqual(['Laura', 'Ana']);
    expect(opciones[0].getAttribute('aria-pressed')).toBe('true');
    opciones[1].click();
    await listo();
    expect(emitido).toEqual([{ personajeId: 'ana' }]);
    expect(raiz.querySelector('#lp-panel-0')).toBeNull();
  });

  it('Esc cierra el desplegable de caras sin cambiar nada', async () => {
    const { raiz, emitido, listo } = await montar();
    raiz.querySelector<HTMLButtonElement>('#le0')!.click();
    await listo();
    expect(raiz.querySelectorAll('#le-panel-0 button')).toHaveLength(6);
    raiz.querySelector('#le-panel-0 button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await listo();
    expect(raiz.querySelector('#le-panel-0')).toBeNull();
    expect(emitido).toEqual([]);
  });

  it('el texto se nombra «Lo que dice, línea N» y una línea vacía dice por qué importa', async () => {
    const { raiz } = await montar({ texto: '' });
    const campo = raiz.querySelector<HTMLTextAreaElement>('#lt0')!;
    expect(campo.labels?.[0].textContent).toContain('Lo que dice, línea 1');
    expect(raiz.textContent).toContain('sin texto, el estudiante no verá nada en este turno');
  });

  it('lo sugerido por la IA se acepta o se descarta con botones a la vista', async () => {
    const { fixture, raiz } = await montar({ marcaIa: true });
    let aceptada = false;
    fixture.componentInstance.aceptar.subscribe(() => (aceptada = true));
    expect(raiz.textContent).toContain('Sugerido por la IA');
    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Aceptar línea')!.click();
    expect(aceptada).toBe(true);
  });
});
