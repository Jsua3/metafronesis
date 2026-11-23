import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';

import { MINIMAPA_STORAGE_KEY, MinimapaComponent, PlanoCompletoComponent } from './minimapa.component';
import { normalizarLayout } from './plano';
import { LAYOUT_HOSPITAL } from './plano-ejemplo.testing';

const PLANO = normalizarLayout(LAYOUT_HOSPITAL)!;

function minimapa(plano = PLANO as typeof PLANO | null) {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(MinimapaComponent);
  fixture.componentRef.setInput('plano', plano);
  fixture.componentRef.setInput('actual', 'pasillo');
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function planoCompleto() {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(PlanoCompletoComponent);
  fixture.componentRef.setInput('plano', PLANO);
  fixture.componentRef.setInput('actual', 'pasillo');
  fixture.detectChanges();
  const cerrado = vi.fn();
  fixture.componentInstance.closed.subscribe(cerrado);
  return { fixture, el: fixture.nativeElement as HTMLElement, cerrado };
}

const tecla = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(event);
  return event;
};

describe('MinimapaComponent', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('sin plano (caso sin layout) no pinta el plano, pero sí el botón de la vista cercana', () => {
    const { el } = minimapa(null);
    expect(el.querySelector('[data-minimapa-abrir]')).toBeNull();
    expect(el.querySelector('[data-vista-cercana]')).not.toBeNull();
  });

  it('la vista cercana tiene botón (hallazgo 7): anuncia su estado y avisa al pulsarlo', () => {
    const { fixture, el } = minimapa();
    const alternar = vi.fn();
    fixture.componentInstance.alternarCercana.subscribe(alternar);
    const boton = el.querySelector<HTMLButtonElement>('[data-vista-cercana]')!;
    expect(boton.textContent!.trim()).toBe('Vista cercana (Z)');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    boton.click();
    expect(alternar).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('cercana', true);
    fixture.detectChanges();
    expect(boton.getAttribute('aria-pressed')).toBe('true');
  });

  it('el minimapa es un botón que abre el plano y dice dónde está el estudiante', () => {
    const { fixture, el } = minimapa();
    const abrir = vi.fn();
    fixture.componentInstance.abrir.subscribe(abrir);
    const boton = el.querySelector<HTMLButtonElement>('[data-minimapa-abrir]')!;
    expect(boton.getAttribute('aria-label')).toBe('Abrir plano (M). Estás en: Pasillo. Puertas: Triaje, Estación de enfermería, '
      + 'Sala de escucha, Oficina de trabajo social, Entrada de urgencias, Sala de espera y Habitación de recuperación.');
    expect(boton.querySelector('svg')).not.toBeNull();
    boton.click();
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('se puede ocultar y la preferencia se recuerda', () => {
    const { fixture, el } = minimapa();
    el.querySelector<HTMLButtonElement>('[data-minimapa-alternar]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-minimapa-abrir]')).toBeNull();
    expect(el.querySelector('[data-minimapa-alternar]')!.textContent!.trim()).toBe('Mostrar plano');
    expect(localStorage.getItem(MINIMAPA_STORAGE_KEY)).toBe('oculto');
    expect(minimapa().el.querySelector('[data-minimapa-abrir]')).toBeNull();
  });

  it('con el almacenamiento bloqueado se ve, sin error', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError'); });
    expect(minimapa().el.querySelector('[data-minimapa-abrir]')).not.toBeNull();
  });
});

describe('MinimapaComponent: el plano cabe en su marco', () => {
  it('un lugar más alto que ancho no se sale del botón: el plano toma el alto del marco 16:9 y el botón recorta', () => {
    const fuente = readFileSync(join(__dirname, 'minimapa.component.ts'), 'utf-8');
    expect(fuente).toMatch(/\.minimapa__abrir \{[^}]*aspect-ratio: 16 \/ 9;[^}]*overflow: hidden;/);
    expect(fuente).toContain('.minimapa__abrir app-plano-del-lugar { display: block; height: 100%; }');
  });
});

describe('PlanoCompletoComponent', () => {
  it('es un diálogo modal con título, el plano y su lista legible', () => {
    const { el } = planoCompleto();
    const dialogo = el.querySelector('[role="dialog"]')!;
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(el.querySelector('#plano-titulo')!.textContent).toBe('Plano del lugar');
    expect(el.querySelectorAll('ul.plano__lista li')).toHaveLength(8);
    expect(el.querySelector('app-safe-exit-button')).not.toBeNull();
  });

  it('Esc y M lo cierran y consumen la tecla; con Ctrl no', () => {
    const { cerrado } = planoCompleto();
    expect(tecla('Escape').defaultPrevented).toBe(true);
    expect(tecla('m').defaultPrevented).toBe(true);
    expect(cerrado).toHaveBeenCalledTimes(2);
    tecla('m', { ctrlKey: true });
    expect(cerrado).toHaveBeenCalledTimes(2);
  });
});
