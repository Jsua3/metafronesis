import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { CasoStore } from '../../estado/caso.store';
import { CASO_HOSPITAL } from '../../testing/hospital';
import { PiezasDelMuroComponent } from './piezas-del-muro.component';

async function montar() {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [PiezasDelMuroComponent], providers: [
    { provide: CatalogoDePiezas, useValue: { manifiesto: signal(null) } },
  ] }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(structuredClone(CASO_HOSPITAL));
  const fixture = TestBed.createComponent(PiezasDelMuroComponent);
  const actualizar = () => {
    fixture.componentRef.setInput('sala', store.caso()!.salas[0]);
    fixture.componentRef.setInput('plan', null);
    fixture.componentRef.setInput('faltas', []);
    fixture.componentRef.setInput('escala', 1);
    fixture.detectChanges();
  };
  actualizar();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, store, actualizar, raiz: fixture.nativeElement as HTMLElement };
}

const tecla = (el: Element, key: string, extra: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));
const puntero = (el: Element, tipo: string, x: number, y: number) =>
  el.dispatchEvent(new PointerEvent(tipo, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y }));

describe('PiezasDelMuroComponent', () => {
  it('Tab recorre las piezas en orden de muro y pos', async () => {
    const { raiz } = await montar();
    const botones = [...raiz.querySelectorAll<HTMLButtonElement>('[data-pieza]')];
    expect(botones.map(b => b.dataset['muro'])).toEqual([
      'fondo', 'fondo', 'fondo', 'fondo', 'fondo', 'izquierda', 'derecha', 'camara', 'suelo',
    ]);
    expect(botones.slice(0, 5).map(b => Number(b.dataset['pos']))).toEqual([520, 720, 856, 1000, 1136]);
  });

  it('ArrowRight mueve 8 px, guarda un paso y conserva el foco', async () => {
    const { raiz, store, actualizar } = await montar();
    const boton = raiz.querySelector<HTMLButtonElement>('[data-pieza="v1"]')!;
    boton.focus(); tecla(boton, 'ArrowRight'); actualizar();
    await new Promise(resolve => setTimeout(resolve));
    expect(store.caso()!.salas[0].estructura!.piezas![0].pos).toBe(528);
    expect(document.activeElement).toBe(boton);
    store.deshacer();
    expect(store.caso()!.salas[0].estructura!.piezas![0].pos).toBe(520);
  });

  it('en la esquina la pieza salta de muro y el foco la sigue', async () => {
    const { raiz, store, actualizar } = await montar();
    store.moverPiezaDeMuro('sala-espera', 'v1', { muro: 'fondo', pos: 0 }); actualizar();
    const boton = raiz.querySelector<HTMLButtonElement>('[data-pieza="v1"]')!;
    boton.focus(); tecla(boton, 'ArrowLeft'); actualizar();
    await new Promise(resolve => setTimeout(resolve));
    expect(store.caso()!.salas[0].estructura!.piezas![0].muro).toBe('izquierda');
    expect(document.activeElement).toBe(boton);
  });

  it('Supr quita la pieza y Ctrl+Z la devuelve', async () => {
    const { raiz, store, actualizar } = await montar();
    tecla(raiz.querySelector('[data-pieza="v1"]')!, 'Delete'); actualizar();
    expect(store.caso()!.salas[0].estructura!.piezas!.some(p => p.id === 'v1')).toBe(false);
    tecla(raiz, 'z', { ctrlKey: true }); actualizar();
    expect(store.caso()!.salas[0].estructura!.piezas!.some(p => p.id === 'v1')).toBe(true);
  });

  it('arrastrar con el puntero cambia el store una sola vez al soltar', async () => {
    const { raiz, store } = await montar();
    const mover = vi.spyOn(store, 'moverPiezaDeMuro');
    const boton = raiz.querySelector<HTMLButtonElement>('[data-pieza="v1"]')!;
    boton.setPointerCapture = vi.fn();
    puntero(boton, 'pointerdown', 520, 100); puntero(boton, 'pointermove', 560, 100);
    expect(mover).not.toHaveBeenCalled();
    puntero(boton, 'pointerup', 560, 100);
    expect(mover).toHaveBeenCalledTimes(1);
  });

  it('pointercancel no cambia nada', async () => {
    const { raiz, store } = await montar();
    const mover = vi.spyOn(store, 'moverPiezaDeMuro');
    const boton = raiz.querySelector<HTMLButtonElement>('[data-pieza="v1"]')!;
    boton.setPointerCapture = vi.fn();
    puntero(boton, 'pointerdown', 520, 100); puntero(boton, 'pointermove', 560, 100);
    puntero(boton, 'pointercancel', 560, 100);
    expect(mover).not.toHaveBeenCalled();
  });

  it('una pieza que incumple OCL-14 lleva data-incumple, borde marcado y su texto', async () => {
    const { raiz, fixture } = await montar();
    fixture.componentRef.setInput('faltas', [{ regla: 'OCL-14', mensaje: 'Hay un obstáculo',
      elemento: { tipo: 'pieza', id: 'v1' } }]);
    fixture.detectChanges();
    const boton = raiz.querySelector('[data-pieza="v1"]')!;
    expect(boton.getAttribute('data-incumple')).toContain('OCL-14');
    expect(boton.classList.contains('incumple')).toBe(true);
    expect(boton.getAttribute('aria-label')).toContain('Hay un obstáculo');
  });

  it('al corregirla, la marca desaparece', async () => {
    const { raiz, fixture } = await montar();
    fixture.componentRef.setInput('faltas', [{ regla: 'OCL-14', mensaje: 'Hay un obstáculo',
      elemento: { tipo: 'pieza', id: 'v1' } }]);
    fixture.detectChanges();
    fixture.componentRef.setInput('faltas', []); fixture.detectChanges();
    expect(raiz.querySelector('[data-pieza="v1"]')!.hasAttribute('data-incumple')).toBe(false);
  });
  it('Esc suelta la pieza elegida', async () => {
    const { raiz, fixture } = await montar();
    const boton = raiz.querySelector<HTMLButtonElement>('[data-pieza="v1"]')!;
    boton.click(); fixture.detectChanges();
    expect(boton.classList.contains('elegida')).toBe(true);
    tecla(boton, 'Escape'); fixture.detectChanges();
    expect(boton.classList.contains('elegida')).toBe(false);
  });

  it('la falta queda enlazada con aria-describedby', async () => {
    const { raiz, fixture } = await montar();
    fixture.componentRef.setInput('faltas', [{ regla: 'OCL-14', mensaje: 'Hay un obstáculo',
      elemento: { tipo: 'pieza', id: 'v1' } }]);
    fixture.detectChanges();
    expect(raiz.querySelector('[data-pieza="v1"]')!.getAttribute('aria-describedby')).toBe('falta-sala-espera-0');
  });

});
