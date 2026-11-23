import { TestBed } from '@angular/core/testing';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { CamaraEscenaComponent, ubicarGlobo } from './camara-escena.component';

describe('EDITOR-PRO · cámara de la escena', () => {
  it('encuadra al hablante de la esquina, sigue la línea y permite ver toda la sala', async () => {
    const caso = copiarEscenarioAlCaso(universidad, ['sala-espera'], 'Caso');
    const sala = caso.salas[0];
    const escena = caso.escenas[0];
    const persona = sala.personajes[0];
    sala.personajes = [{ ...persona, x: 0, y: 0 }, { ...persona, ref: 'otra', x: 960, y: 528 }];
    escena.lineas = [
      { id: 'a', personajeId: persona.ref, texto: 'Hola', expresion: 'neutral', marcaIa: false },
      { id: 'b', personajeId: 'otra', texto: 'Hola', expresion: 'neutral', marcaIa: false },
    ];
    await TestBed.configureTestingModule({ imports: [CamaraEscenaComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CamaraEscenaComponent);
    fixture.componentRef.setInput('caso', caso);
    fixture.componentRef.setInput('escena', escena);
    fixture.componentRef.setInput('lineaEnfocada', 'a');
    fixture.detectChanges();
    const mundo = fixture.nativeElement.querySelector('.camara__mundo') as HTMLElement;
    expect(mundo.style.transform).toContain('translate(0%, 0%) scale(2)');
    fixture.componentRef.setInput('lineaEnfocada', 'b');
    fixture.detectChanges();
    expect(mundo.style.transform).toContain('translate(-100%, -100%) scale(2)');
    (fixture.nativeElement.querySelector('.camara__alternar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(mundo.style.transform).toContain('scale(1)');
  });
  it('RF-05 · sitúa actores sobre la composición completa de una sala estrecha', async () => {
    const caso = copiarEscenarioAlCaso(universidad, ['sala-espera'], 'Caso');
    const sala = caso.salas[0];
    sala.fondo = '';
    sala.estructura = { ancho: 640 } as typeof sala.estructura;
    sala.personajes = [{ ...sala.personajes[0], x: 320, y: 264 }];
    await TestBed.configureTestingModule({ imports: [CamaraEscenaComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CamaraEscenaComponent);
    fixture.componentRef.setInput('caso', caso);
    fixture.componentRef.setInput('escena', caso.escenas[0]);
    fixture.componentRef.setInput('miniatura', 'blob:completa');
    fixture.detectChanges();
    const cuadro = fixture.nativeElement.querySelector('.camara__cuadro') as HTMLElement;
    const actor = fixture.nativeElement.querySelector('.actor') as HTMLElement;
    expect(cuadro.style.aspectRatio).toBe('640 / 528');
    expect(actor.style.left).toBe('50%');
    expect(actor.style.top).toBe('50%');
  });
});


describe('RF-05 · ubicación del globo en la cámara', () => {
  it('usa el alto real: arriba cuando cabe y debajo cuando la línea larga no cabe', () => {
    expect(ubicarGlobo(480, 264, 200, 80, { x: 50, cabeza: 60, pies: 75, izquierda: false }))
      .toEqual({ x: 224, y: 78.4 });
    expect(ubicarGlobo(480, 264, 200, 100, { x: 50, cabeza: 20, pies: 35, izquierda: false }))
      .toEqual({ x: 224, y: 92.4 });
  });
  it('limita los dos ejes incluso en cuadros estrechos y con hablantes en los extremos', () => {
    expect(ubicarGlobo(120, 90, 120, 90, { x: 94, cabeza: -10, pies: 120, izquierda: true }))
      .toEqual({ x: 0, y: 0 });
    expect(ubicarGlobo(480, 264, 200, 100, { x: 94, cabeza: 5, pies: 90, izquierda: true }))
      .toEqual({ x: 267.2, y: 164 });
  });
});

  it('RF-05 · mide el globo renderizado y lo recoloca al cambiar el tamaño del cuadro', async () => {
    let avisar!: ResizeObserverCallback;
    class Observador {
      constructor(callback: ResizeObserverCallback) { avisar = callback; }
      observe() {} disconnect() {} unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', Observador);
    const caso = copiarEscenarioAlCaso(universidad, ['sala-espera'], 'Caso');
    const sala = caso.salas[0];
    const personaje = sala.personajes[0];
    sala.personajes = [{ ...personaje, x: 480, y: 80 }];
    const escena = caso.escenas[0];
    escena.lineas = [{ id: 'larga', personajeId: personaje.ref, texto: 'Una línea larga '.repeat(8), expresion: 'neutral', marcaIa: false }];
    try {
      const fixture = TestBed.createComponent(CamaraEscenaComponent);
      fixture.componentRef.setInput('caso', caso);
      fixture.componentRef.setInput('escena', escena);
      fixture.detectChanges();
      const cuadro = fixture.nativeElement.querySelector('.camara__cuadro') as HTMLElement;
      const globo = fixture.nativeElement.querySelector('.globo') as HTMLElement;
      Object.defineProperties(cuadro, { clientWidth: { value: 480 }, clientHeight: { value: 264 } });
      Object.defineProperties(globo, { offsetWidth: { value: 200 }, offsetHeight: { value: 100 } });
      await fixture.whenStable();
      avisar([], {} as ResizeObserver);
      fixture.detectChanges();
      expect(Number.parseFloat(globo.style.top)).toBeGreaterThan(0);
      expect(Number.parseFloat(globo.style.top) + 100).toBeLessThanOrEqual(264);
      expect(Number.parseFloat(globo.style.left) + 200).toBeLessThanOrEqual(480);
      fixture.destroy();
    } finally { vi.unstubAllGlobals(); }
  });
