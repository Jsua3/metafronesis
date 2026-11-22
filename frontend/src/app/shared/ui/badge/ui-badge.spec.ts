import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiBadge, UiBadgeTone } from './ui-badge';

/**
 * ui-badge (plan visual F2-3; VD-3 sin puntos de color): el estado se dice con TEXTO; el tono solo lo acompaña.
 */
// req: RNF-004 (la información no depende solo del color, WCAG 1.4.1)
@Component({
  imports: [UiBadge],
  template: `<ui-badge [tone]="tone()">Publicado</ui-badge><ui-badge>Borrador</ui-badge>`,
})
class Host {
  tone = signal<UiBadgeTone>('success');
}

describe('ui-badge', () => {
  it('lleva su texto y el tono como clase; neutro por defecto', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [published, draft] = [...(fixture.nativeElement as HTMLElement).querySelectorAll('ui-badge')];
    expect(published.textContent?.trim()).toBe('Publicado');
    expect(published.classList).toContain('ui-badge--success');
    expect(draft.classList).toContain('ui-badge--neutral');

    fixture.componentInstance.tone.set('danger');
    await fixture.whenStable();
    expect(published.classList).toContain('ui-badge--danger');
    expect(published.classList).not.toContain('ui-badge--success');
  });

  it('no pinta puntos ni iconos de color (VD-3)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('ui-badge')!;
    expect(badge.children.length).toBe(0);
  });
});
