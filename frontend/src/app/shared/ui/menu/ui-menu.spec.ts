import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiMenu, UiMenuItem } from './ui-menu';

/**
 * ui-menu (plan visual F2-6, sobre @angular/aria): botón con aria-haspopup/expanded que abre una lista role="menu";
 * flechas, Inicio y Fin recorren los ítems; Esc cierra y devuelve el foco al botón; elegir un ítem lo comunica,
 * cierra y devuelve el foco. El panel es hijo del componente (D9 de la barra de vidrio: el menú de cuenta vive
 * dentro de su módulo).
 */
// req: RNF-004 (menús operables con teclado)
@Component({
  imports: [UiMenu],
  template: `<ui-menu label="Cuenta" icon="account_circle" [items]="items" (itemSelected)="chosen.push($event)" />`,
})
class Host {
  items: UiMenuItem[] = [
    { value: 'perfil', label: 'Mi perfil', icon: 'person' },
    { value: 'personaje', label: 'Mi personaje', icon: 'face' },
    { value: 'salir', label: 'Cerrar sesión', icon: 'logout', tone: 'danger' },
  ];
  chosen: (string | undefined)[] = [];
}

describe('ui-menu', () => {
  let fixture: ComponentFixture<Host>;
  const root = () => fixture.nativeElement as HTMLElement;
  const trigger = () => root().querySelector<HTMLButtonElement>('.ui-menu__trigger')!;
  const panel = () => root().querySelector<HTMLElement>('.ui-menu__panel')!;
  const items = () => [...root().querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const key = async (target: Element, name: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => root().remove());

  it('el botón anuncia que abre un menú y está cerrado; el menú se nombra por el botón', () => {
    expect(trigger().getAttribute('aria-haspopup')).toBe('true');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().textContent).toContain('Cuenta');
    expect(panel().getAttribute('role')).toBe('menu');
    expect(panel().getAttribute('aria-labelledby')).toBe(trigger().id);
    expect(panel().dataset['visible']).toBe('false');
  });

  it('al abrir con el clic se expande y el foco va al primer ítem', async () => {
    trigger().click();
    await fixture.whenStable();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(panel().dataset['visible']).toBe('true');
    expect(items().map(item => item.querySelector('.ui-menu__label')?.textContent?.trim())).toEqual(['Mi perfil', 'Mi personaje', 'Cerrar sesión']);
    expect(document.activeElement).toBe(items()[0]);
  });

  it('flechas, Inicio y Fin recorren los ítems; Esc cierra y devuelve el foco al botón', async () => {
    trigger().focus();
    await key(trigger(), 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    await key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    await key(items()[1], 'End');
    expect(document.activeElement).toBe(items()[2]);
    await key(items()[2], 'Home');
    expect(document.activeElement).toBe(items()[0]);
    await key(items()[0], 'Escape');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('elegir un ítem lo comunica, cierra el menú y devuelve el foco al botón', async () => {
    trigger().focus();
    await key(trigger(), 'ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    await key(items()[2], 'Enter');
    expect(fixture.componentInstance.chosen).toEqual(['salir']);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('la búsqueda por letra usa el texto del ítem (no la ligadura del icono)', async () => {
    trigger().click();
    await fixture.whenStable();
    await key(items()[0], 'c');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('los iconos de los ítems son decorativos y el peligro se marca con clase', async () => {
    trigger().click();
    await fixture.whenStable();
    expect(items().every(item => item.querySelector('mat-icon')?.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(items()[2].classList).toContain('ui-menu__item--danger');
  });
});
