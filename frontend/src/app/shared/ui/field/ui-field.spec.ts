import { readFileSync } from 'fs';
import { join } from 'path';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { UiControl, UiField } from './ui-field';

/**
 * ui-field + uiControl (plan visual F2-2; §2.6 «campo de texto»): la etiqueta visible siempre está asociada al
 * control; la ayuda y el error se leen por aria-describedby; el error reemplaza a la ayuda en el mismo sitio; el
 * requerido y el inválido se exponen por ARIA. Los controles siguen siendo nativos.
 */
// req: RNF-004 (etiquetas, ayuda y errores asociados a su control)
@Component({
  imports: [UiField, UiControl],
  template: `
    <form>
      <ui-field label="Correo institucional" [hint]="hint()" [error]="error()" [required]="required()">
        <input uiControl type="email" name="email" />
      </ui-field>
      <ui-field label="Usuario">
        <input uiControl id="usuario-propio" />
      </ui-field>
      <ui-field label="Comentario" hint="Máximo 500 caracteres">
        <textarea uiControl></textarea>
      </ui-field>
      <ui-field label="Rol">
        <select uiControl><option>Docente</option></select>
      </ui-field>
      <ui-field label="Contraseña" revealable>
        <input uiControl type="password" />
      </ui-field>
    </form>
  `,
})
class Host {
  hint = signal<string | null>('El de la universidad');
  error = signal<string | null>(null);
  required = signal(false);
}

describe('ui-field', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const fields = () => fixture.debugElement.queryAll(By.css('ui-field')).map(el => el.nativeElement as HTMLElement);
  const control = (index: number) => fields()[index].querySelector('.ui-control') as HTMLInputElement;
  const describedText = (element: HTMLElement) =>
    (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent?.trim());

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('la etiqueta visible está asociada al control (for/id) y da su nombre', () => {
    const email = control(0);
    const label = fields()[0].querySelector('label')!;
    expect(email.id).not.toBe('');
    expect(label.htmlFor).toBe(email.id);
    expect(label.textContent).toContain('Correo institucional');
    expect(email.labels?.[0]).toBe(label);
  });

  it('respeta el id que trae el control', () => {
    const user = control(1);
    expect(user.id).toBe('usuario-propio');
    expect(fields()[1].querySelector('label')!.htmlFor).toBe('usuario-propio');
  });

  it('cada campo tiene un id distinto', () => {
    const ids = fields().map((_, index) => control(index).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la ayuda se lee por aria-describedby', () => {
    expect(describedText(control(0))).toEqual(['El de la universidad']);
    expect(control(0).hasAttribute('aria-invalid')).toBe(false);
  });

  it('el error reemplaza a la ayuda en el mismo sitio, marca aria-invalid y se lee en su lugar', async () => {
    const slotBefore = fields()[0].querySelector('.ui-field__message');
    host.error.set('Escribe un correo que termine en @unal.edu.co');
    await fixture.whenStable();
    const slots = fields()[0].querySelectorAll('.ui-field__message');
    expect(slots.length).toBe(1);
    expect(slots[0]).toBe(slotBefore);
    expect(slots[0].classList).toContain('ui-field__message--error');
    expect(control(0).getAttribute('aria-invalid')).toBe('true');
    expect(describedText(control(0))).toEqual(['Escribe un correo que termine en @unal.edu.co']);

    host.error.set(null);
    await fixture.whenStable();
    expect(control(0).hasAttribute('aria-invalid')).toBe(false);
    expect(describedText(control(0))).toEqual(['El de la universidad']);
  });

  it('sin ayuda ni error no hay aria-describedby (ni ids rotos)', async () => {
    host.hint.set(null);
    await fixture.whenStable();
    expect(control(0).hasAttribute('aria-describedby')).toBe(false);
  });

  it('requerido: aria-required en el control y una marca visual que el lector no repite', async () => {
    host.required.set(true);
    await fixture.whenStable();
    expect(control(0).getAttribute('aria-required')).toBe('true');
    const mark = fields()[0].querySelector('.ui-field__required')!;
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(control(0).required).toBe(false);
  });

  it('textarea y select reciben la misma asociación', () => {
    const textarea = control(2) as unknown as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(fields()[2].querySelector('label')!.htmlFor).toBe(textarea.id);
    expect(describedText(textarea)).toEqual(['Máximo 500 caracteres']);
    const select = control(3) as unknown as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(fields()[3].querySelector('label')!.htmlFor).toBe(select.id);
  });

  it('contraseña revelable: alterna el tipo con aria-pressed, sin enviar el formulario y sin perder el foco', async () => {
    const field = fields()[4];
    const password = control(4);
    const toggle = field.querySelector<HTMLButtonElement>('button[ui-icon-button]')!;
    expect(password.type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Mostrar contraseña');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.type).toBe('button');

    toggle.focus();
    toggle.click();
    await fixture.whenStable();
    expect(password.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(toggle);

    toggle.click();
    await fixture.whenStable();
    expect(password.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });
});

@Component({
  imports: [UiField, UiControl],
  template: `<p id="formato">Formato: AAAA-MM-DD</p>
    <ui-field label="Fecha" [error]="error()"><input uiControl aria-describedby="formato" /></ui-field>`,
})
class DescribedHost {
  error = signal<string | null>(null);
}

describe('uiControl con otras descripciones', () => {
  it('suma el mensaje del campo a aria-describedby sin borrar las ajenas', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(DescribedHost);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    const ids = () => (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids()).toEqual(['formato']);
    fixture.componentInstance.error.set('Fecha inválida');
    await fixture.whenStable();
    expect(ids()).toContain('formato');
    expect(ids().length).toBe(2);
    fixture.componentInstance.error.set(null);
    await fixture.whenStable();
    expect(ids()).toEqual(['formato']);
  });
  // req: RNF-004
  it('un control ancho (un select con opciones largas) no ensancha el campo ni desborda la pantalla: la pista es minmax(0, 1fr)', () => {
    // Hallado en un teléfono (F7-3): un <select> de casos con títulos largos medía 454 px y arrastraba etiqueta y
    // mensaje, porque la pista `auto` del campo toma el ancho mínimo de su contenido.
    const scss = readFileSync(join(__dirname, 'ui-field.scss'), 'utf-8');
    expect(scss).toMatch(/\.ui-field \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  });
});
