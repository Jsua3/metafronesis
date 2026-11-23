import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { RehearsalGoneComponent } from './rehearsal-gone.component';

/** El aviso del ensayo descartado o cerrado (7.4): dice qué pasó, ofrece empezar de nuevo y volver al editor. */
describe('RehearsalGoneComponent', () => {
  function montar(motivo: 'gone' | 'closed') {
    TestBed.configureTestingModule({ imports: [RehearsalGoneComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(RehearsalGoneComponent);
    fixture.componentRef.setInput('motivo', motivo);
    fixture.componentRef.setInput('caseVersionId', 9);
    const reinicios: number[] = [];
    fixture.componentInstance.restart.subscribe(() => reinicios.push(1));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, reinicios };
  }
  afterEach(() => TestBed.resetTestingModule());

  it('descartado: dice que ya no existe, ofrece empezar de nuevo y volver al editor', () => {
    const { el, reinicios } = montar('gone');
    expect(el.textContent).toContain('Este ensayo ya no existe: el caso cambió mientras ensayabas.');
    (el.querySelector('button.restart') as HTMLButtonElement).click();
    expect(reinicios).toHaveLength(1);
    expect(el.querySelector('a[href="/portal/casos/9/editor"]')).not.toBeNull();
  });

  it('cerrado: dice que ya terminó', () => {
    const { el } = montar('closed');
    expect(el.textContent).toContain('Este ensayo ya terminó');
    expect(el.textContent).not.toContain('ya no existe');
  });

  it('el texto recibe el foco al aparecer y no hay role="alert" (lo anuncia el anunciador de la app)', async () => {
    const { fixture, el } = montar('gone');
    await fixture.whenStable();
    expect(document.activeElement).toBe(el.querySelector('p'));
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.getAttribute('role')).toBeNull();
  });
});
