import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { resolveCharacter } from './character-visual.resolver';
import { KitFigureComponent } from './kit-figure.component';
import { testKitBundle } from './testing/kit-testing';

describe('KitFigureComponent: preferencia de movimiento', () => {
  it('detiene la animacion y vuelve al primer cuadro al activar la preferencia', async () => {
    const original = window.matchMedia;
    const query = new EventTarget() as MediaQueryList;
    Object.defineProperty(query, 'matches', { configurable: true, value: false });
    window.matchMedia = () => query;
    try {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const fixture = TestBed.createComponent(KitFigureComponent);
      fixture.componentRef.setInput('visual', resolveCharacter(testKitBundle(), { kind: 'receta', recipeId: 'valentina' }));
      fixture.componentRef.setInput('animated', true);
      await fixture.whenStable();
      await new Promise(resolve => setTimeout(resolve, 320));
      await fixture.whenStable();
      expect(fixture.componentInstance.style()['background-position']).not.toBe('0px 0px');
      Object.defineProperty(query, 'matches', { configurable: true, value: true });
      query.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      expect(fixture.componentInstance.style()['background-position']).toBe('0px 0px');
      fixture.destroy();
    } finally { window.matchMedia = original; }
  });
});
