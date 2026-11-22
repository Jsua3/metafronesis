import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SCOPE_NOTICE_DRAFT_TEXT, UiScopeNotice } from './ui-scope-notice';

/**
 * ui-scope-notice (plan visual F2-11; RN-01, VD-23, decisión 17): el aviso de alcance lleva la frase de la regla
 * —con fines educativos; no realiza diagnósticos clínicos— MARCADA como borrador, visible y legible para lectores de
 * pantalla, hasta que Psicología fije el texto. Es una nota con nombre, no una alerta.
 */
// req: RN-01 (alcance educativo, sin diagnóstico; texto en borrador)
describe('ui-scope-notice', () => {
  const render = async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiScopeNotice);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('lleva la frase de la regla', async () => {
    const notice = await render();
    expect(SCOPE_NOTICE_DRAFT_TEXT).toContain('con fines educativos; no realiza diagnósticos clínicos');
    expect(notice.querySelector('.ui-scope-notice__text')?.textContent?.trim()).toBe(SCOPE_NOTICE_DRAFT_TEXT);
  });

  it('está marcada como borrador de forma visible y para el lector', async () => {
    const notice = await render();
    expect(notice.dataset['draft']).toBe('true');
    const badge = notice.querySelector('ui-badge')!;
    expect(badge.textContent?.trim()).toBe('Borrador');
    expect(notice.textContent).toContain('pendiente de validación por Psicología');
  });

  it('es una nota con nombre (role="note"), no una alerta', async () => {
    const notice = await render();
    expect(notice.getAttribute('role')).toBe('note');
    expect(notice.getAttribute('aria-label')).toBe('Alcance del simulador');
  });
});
