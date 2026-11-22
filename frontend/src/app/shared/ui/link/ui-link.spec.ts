import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { UiLink } from './ui-link';

/**
 * ui-link (plan visual F2-1): enlace de texto del lenguaje visual. Un enlace externo abre otra pestaña sin dar
 * acceso a la página de origen (`rel`) y lo avisa también a quien no ve el icono.
 */
// req: RNF-004 (el cambio de contexto se anuncia)
@Component({
  imports: [UiLink],
  template: `
    <a ui-link href="/ayuda">Ayuda</a>
    <a ui-link external href="https://www.minsalud.gov.co">Línea 106</a>
  `,
})
class Host {}

describe('ui-link', () => {
  const links = async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture.debugElement.queryAll(By.css('a[ui-link]')).map(el => el.nativeElement as HTMLAnchorElement);
  };

  it('un enlace interno no abre otra pestaña ni añade texto', async () => {
    const [internal] = await links();
    expect(internal.classList).toContain('ui-link');
    expect(internal.hasAttribute('target')).toBe(false);
    expect(internal.hasAttribute('rel')).toBe(false);
    expect(internal.textContent?.trim()).toBe('Ayuda');
  });

  it('un enlace externo abre otra pestaña con rel seguro y lo anuncia en texto oculto', async () => {
    const [, external] = await links();
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');
    const hint = external.querySelector('.ds-sr-only');
    expect(hint?.textContent?.trim()).toBe('(se abre en una pestaña nueva)');
    const icon = external.querySelector('mat-icon');
    expect(icon?.textContent?.trim()).toBe('open_in_new');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });
});
