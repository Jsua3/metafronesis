import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { of } from 'rxjs';

import { EstudianteSugerido, GrupoService } from '../../core/api/grupo.service';
import {
  CampoInvitarEstudianteComponent, SUGERENCIAS_DEBOUNCE_MS, correoOUsuario,
} from './campo-invitar-estudiante.component';

const ana: EstudianteSugerido = { nombre: 'Ana Rojas', usuario: 'arojas', email: 'arojas@uni.edu' };
const angel: EstudianteSugerido = { nombre: 'Emerson Ángel', usuario: 'eangel', email: 'eangel@uni.edu' };

@Component({
  imports: [CampoInvitarEstudianteComponent],
  template: `<gl-campo-invitar [control]="control" [grupoId]="7" />`,
})
class Anfitrion {
  control = new FormControl<string | null>('');
}

describe('CampoInvitarEstudianteComponent: sugerencias al invitar (combobox)', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let sugerir: ReturnType<typeof vi.fn>;

  const input = () => fixture.nativeElement.querySelector('input[role=combobox]') as HTMLInputElement;
  const lista = () => fixture.nativeElement.querySelector('[role=listbox]') as HTMLUListElement;
  const opciones = () => [...fixture.nativeElement.querySelectorAll('[role=option]')] as HTMLLIElement[];

  function escribir(valor: string) {
    input().dispatchEvent(new Event('focus'));
    input().value = valor;
    input().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(SUGERENCIAS_DEBOUNCE_MS);
    fixture.detectChanges();
  }

  function tecla(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
    input().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sugerir = vi.fn(() => of([ana, angel]));
    TestBed.configureTestingModule({
      imports: [Anfitrion],
      providers: [provideZonelessChangeDetection(), { provide: GrupoService, useValue: { sugerirEstudiantes: sugerir } }],
    });
    fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('la etiqueta dice que acepta correo o nombre de usuario y el campo es un combobox cerrado', () => {
    expect(fixture.nativeElement.querySelector('label').textContent).toContain('Correo o nombre de usuario');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-controls')).toBe(lista().id);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(lista().hidden).toBe(true);
  });

  it('con menos de 2 caracteres no pregunta; con 2 o más pregunta una sola vez tras la pausa', () => {
    escribir('e');
    expect(sugerir).not.toHaveBeenCalled();

    input().value = 'ea';
    input().dispatchEvent(new Event('input'));
    input().value = 'eang';
    input().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(SUGERENCIAS_DEBOUNCE_MS);
    fixture.detectChanges();

    expect(sugerir).toHaveBeenCalledTimes(1);
    expect(sugerir).toHaveBeenCalledWith(7, 'eang');
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(opciones().map(o => o.textContent)).toEqual([
      expect.stringContaining('arojas · arojas@uni.edu'), expect.stringContaining('eangel · eangel@uni.edu'),
    ]);
  });

  it('las flechas mueven la opción activa con aria-activedescendant y dan la vuelta', () => {
    escribir('uni');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);

    expect(tecla('ArrowDown').defaultPrevented).toBe(true);
    expect(input().getAttribute('aria-activedescendant')).toBe(opciones()[0].id);
    expect(opciones()[0].getAttribute('aria-selected')).toBe('true');

    tecla('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(opciones()[1].id);
    tecla('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(opciones()[0].id);
    tecla('ArrowUp');
    expect(input().getAttribute('aria-activedescendant')).toBe(opciones()[1].id);
  });

  it('Enter elige la opción activa: llena el campo con su correo y cierra la lista', () => {
    escribir('uni');
    tecla('ArrowDown');
    tecla('ArrowDown');

    expect(tecla('Enter').defaultPrevented).toBe(true);

    expect(fixture.componentInstance.control.value).toBe('eangel@uni.edu');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('sin opción activa, Enter no se intercepta (envía el formulario)', () => {
    escribir('uni');
    expect(tecla('Enter').defaultPrevented).toBe(false);
  });

  it('un clic en una sugerencia también llena el campo', () => {
    escribir('uni');
    opciones()[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe('arojas@uni.edu');
    expect(lista().hidden).toBe(true);
  });

  it('Escape cierra la lista sin cambiar lo escrito; la flecha la vuelve a abrir', () => {
    escribir('uni');
    tecla('ArrowDown');

    expect(tecla('Escape').defaultPrevented).toBe(true);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().value).toBe('uni');

    tecla('ArrowDown');
    expect(input().getAttribute('aria-expanded')).toBe('true');
  });

  it('si el servidor falla o no hay coincidencias, la lista no se abre', () => {
    sugerir.mockReturnValueOnce(of([]));
    escribir('zz');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('correoOUsuario', () => {
  const error = (valor: string) => correoOUsuario(new FormControl(valor));

  it('acepta un correo o un nombre de usuario', () => {
    expect(error('eangel@uni.edu')).toBeNull();
    expect(error('eangel')).toBeNull();
    expect(error('e.angel+1')).toBeNull();
    expect(error('')).toBeNull();
  });

  it('rechaza un usuario con espacios y un correo mal formado', () => {
    expect(error('e angel')).toEqual({ correoOUsuario: true });
    expect(error('eangel@')).not.toBeNull();
  });
});
