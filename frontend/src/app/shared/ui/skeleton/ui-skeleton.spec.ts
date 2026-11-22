import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiSkeleton, UiSkeletonShape } from './ui-skeleton';

/**
 * ui-skeleton (plan visual §2.5, F2-4): la FORMA final del contenido mientras carga. Es decorativo: quien carga
 * anuncia el estado (aria-busy en su región); el esqueleto no se lee.
 */
describe('ui-skeleton', () => {
  const render = async (shape: UiSkeletonShape, lines?: number) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiSkeleton);
    fixture.componentRef.setInput('shape', shape);
    if (lines !== undefined) fixture.componentRef.setInput('lines', lines);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('es decorativo: oculto al lector y sin texto', async () => {
    const skeleton = await render('card');
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton.textContent?.trim()).toBe('');
    expect(skeleton.classList).toContain('ds-motion');
  });

  it('cada forma lleva su clase y sus huesos', async () => {
    const shapes: UiSkeletonShape[] = ['line', 'text', 'card', 'stat', 'row', 'chart', 'avatar'];
    for (const shape of shapes) {
      TestBed.resetTestingModule();
      const skeleton = await render(shape);
      expect(skeleton.classList).toContain(`ui-skeleton--${shape}`);
      expect(skeleton.querySelectorAll('.ui-skeleton__bone').length).toBeGreaterThan(0);
    }
  });

  it('el texto tiene tantas líneas como se pidan y la última más corta', async () => {
    const skeleton = await render('text', 4);
    const bones = skeleton.querySelectorAll('.ui-skeleton__bone');
    expect(bones.length).toBe(4);
    expect(bones[3].classList).toContain('ui-skeleton__bone--short');
    expect(bones[0].classList).not.toContain('ui-skeleton__bone--short');
  });
});
