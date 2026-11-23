import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SensitiveNoticeComponent } from './sensitive-notice.component';

@Component({
  standalone: true,
  imports: [SensitiveNoticeComponent],
  template: `<app-sensitive-notice [text]="text()" [sceneKey]="sceneKey()" [reduceMotion]="reduceMotion()" />`,
})
class HostComponent {
  readonly text = signal<string | null>(null);
  readonly sceneKey = signal<string | null>(null);
  readonly reduceMotion = signal(false);
}

describe('SensitiveNoticeComponent', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  function montar() {
    const fixture = TestBed.createComponent(HostComponent);
    const el = fixture.nativeElement as HTMLElement;
    const entrar = (key: string, text: string | null) => {
      fixture.componentInstance.text.set(text);
      fixture.componentInstance.sceneKey.set(key);
      fixture.detectChanges();
      TestBed.tick();
      fixture.detectChanges();
    };
    return { fixture, el, entrar };
  }

  it('al entrar a una escena sensible la franja se ve completa y a los 8 s se pliega a un chip', () => {
    const { fixture, el, entrar } = montar();
    entrar('escena-1', 'Este caso aborda violencia.');
    expect(el.querySelector('.sensitive-strip')!.textContent).toContain('Este caso aborda violencia.');
    expect(el.querySelector('.sensitive-strip--folded')).toBeNull();
    vi.advanceTimersByTime(8000);
    fixture.detectChanges();
    const chip = el.querySelector('button')!;
    expect(chip.textContent).toContain('Contenido sensible');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.sensitive-strip--folded')).not.toBeNull();
  });

  it('no se pliega antes de los 8 s', () => {
    const { fixture, el, entrar } = montar();
    entrar('escena-1', 'Este caso aborda violencia.');
    vi.advanceTimersByTime(7999);
    fixture.detectChanges();
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('el chip vuelve a desplegar el aviso; el texto siempre está para lectores de pantalla', () => {
    const { fixture, el, entrar } = montar();
    entrar('escena-1', 'Este caso aborda violencia.');
    vi.advanceTimersByTime(8000);
    fixture.detectChanges();
    expect(el.textContent).toContain('Este caso aborda violencia.');
    expect(el.querySelector('.sensitive-strip__text')!.classList.contains('sr-only')).toBe(true);
    el.querySelector('button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.sensitive-strip__text')!.classList.contains('sr-only')).toBe(false);
  });

  it('el botón apunta al texto que despliega', () => {
    const { el, entrar } = montar();
    entrar('escena-1', 'Este caso aborda violencia.');
    const id = el.querySelector('button')!.getAttribute('aria-controls')!;
    expect(el.querySelector(`#${id}`)).toBe(el.querySelector('.sensitive-strip__text'));
  });

  it('una escena sin aviso no muestra nada', () => {
    const { el, entrar } = montar();
    entrar('escena-2', null);
    expect(el.textContent!.trim()).toBe('');
    expect(el.querySelector('button')).toBeNull();
  });

  it('una escena nueva con aviso vuelve a mostrarlo completo y reinicia los 8 s', () => {
    const { fixture, el, entrar } = montar();
    entrar('escena-1', 'Primero.');
    vi.advanceTimersByTime(8000);
    fixture.detectChanges();
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    entrar('escena-3', 'Segundo.');
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('con movimiento reducido el pliegue no se anima', () => {
    const { fixture, el, entrar } = montar();
    fixture.componentInstance.reduceMotion.set(true);
    entrar('escena-1', 'Este caso aborda violencia.');
    expect(el.querySelector('.sensitive-strip')!.classList.contains('sensitive-strip--still')).toBe(true);
  });
});
