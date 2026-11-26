import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { CinematicaCasoComponent, type FinDeCinematica } from './cinematica-caso.component';
import { leerCinematica } from './lectura';
import type { CinematicaLeida } from './lectura';

const CINEMATICA = leerCinematica({
  cinematica: {
    id: 'demo',
    planos: [
      { escena: 'barrio', subtitulo: 'Viernes, 4 de la tarde.', duracionMs: 4000 },
      { escena: 'negro', duracionMs: 2000 },
      { escena: 'titulo', subtitulo: 'Eres {nombre}, del equipo.', duracionMs: 4000 },
    ],
  },
}) as CinematicaLeida;

describe('CinematicaCasoComponent', () => {
  let fixture: ComponentFixture<CinematicaCasoComponent>;
  let component: CinematicaCasoComponent;
  let anuncios: string[];
  const fines: FinDeCinematica[] = [];
  let salidas = 0;
  const silencios: boolean[] = [];

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    anuncios = [];
    fines.length = 0;
    silencios.length = 0;
    salidas = 0;
    TestBed.configureTestingModule({
      imports: [CinematicaCasoComponent],
      providers: [{ provide: LiveRegionAnnouncer, useValue: { announce: (t: string) => anuncios.push(t) } }],
    });
    fixture = TestBed.createComponent(CinematicaCasoComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('cinematica', CINEMATICA);
    fixture.componentRef.setInput('nombre', 'Ana María');
    component.terminada.subscribe(f => fines.push(f));
    component.salidaSegura.subscribe(() => salidas++);
    component.silencio.subscribe(s => silencios.push(s));
    fixture.detectChanges();
    // Sin contexto 2D (jsdom) no hay arte que preparar: arranca en cuanto se monta.
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  const tecla = (key: string, opciones: KeyboardEventInit = {}) => {
    const evento = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opciones });
    document.dispatchEvent(evento);
    fixture.detectChanges();
    return evento;
  };
  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('es un diálogo modal con «Saltar», pausa y «Salida segura»', () => {
    const el = fixture.nativeElement as HTMLElement;
    const dialogo = el.querySelector('[role="dialog"]');
    expect(dialogo?.getAttribute('aria-modal')).toBe('true');
    expect(dialogo?.getAttribute('aria-label')).toBe('Cinemática del caso');
    const botones = Array.from(el.querySelectorAll('button')).map(b => b.textContent?.trim());
    expect(botones).toEqual(expect.arrayContaining(['Pausa', 'Saltar']));
    const salida = dialogo?.querySelector<HTMLButtonElement>('app-safe-exit-button button');
    expect(salida?.querySelector('.safe-exit-btn__label')?.textContent?.trim()).toBe('Salida segura');
    salida!.click();
    expect(salidas).toBe(1);
  });

  it('muestra y anuncia el subtítulo del plano', () => {
    expect(texto()).toContain('Viernes, 4 de la tarde.');
    expect(anuncios).toContain('Viernes, 4 de la tarde.');
  });

  it('Enter pasa de plano; el negro pide silencio y el título lleva el nombre de pila', () => {
    tecla('Enter');
    expect(component.indice()).toBe(1);
    expect(silencios).toEqual([true]);
    tecla('ArrowRight');
    expect(component.indice()).toBe(2);
    expect(silencios).toEqual([true, false]);
    vi.advanceTimersByTime(400);
    fixture.detectChanges();
    expect(texto()).toContain('Eres');
    expect(texto()).toContain('Ana,');
    expect(texto()).not.toContain('{nombre}');
    expect(anuncios).toContain('Eres Ana, del equipo.');
  });

  it('← vuelve al plano anterior', () => {
    tecla('Enter');
    tecla('ArrowLeft');
    expect(component.indice()).toBe(0);
  });

  it('Enter en el último plano termina con un fundido a negro', () => {
    tecla('Enter');
    tecla('Enter');
    tecla('Enter');
    expect(fines).toEqual([]);
    expect(component.cerrando()).toBe(true);
    vi.advanceTimersByTime(700);
    expect(fines).toEqual(['fin']);
  });

  it('Esc no saca de una vez: la primera detiene la cinemática y la segunda es la salida segura', () => {
    const primera = tecla('Escape');
    expect(primera.defaultPrevented).toBe(true);
    expect(component.pausada()).toBe(true);
    expect(salidas).toBe(0);
    expect(texto()).toContain('En pausa');
    tecla('Escape');
    expect(salidas).toBe(1);
  });

  it('Espacio pausa y sigue; con el foco en un botón, el botón se activa solo', () => {
    tecla(' ');
    expect(component.pausada()).toBe(true);
    tecla(' ');
    expect(component.pausada()).toBe(false);
    const boton = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    const evento = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    boton.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    expect(component.indice()).toBe(0);
  });

  it('«Saltar» termina en el acto', () => {
    const saltar = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.trim() === 'Saltar')!;
    saltar.click();
    expect(fines).toEqual(['saltada']);
    // Ya terminada, las teclas no hacen nada.
    tecla('Enter');
    expect(fines).toEqual(['saltada']);
  });

  it('con movimiento reducido el subtítulo aparece entero, sin palabra a palabra', () => {
    fixture.componentRef.setInput('reduceMotion', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).classList.contains('cine--reducida')).toBe(true);
    expect(component.retrasoDe(5)).toBe(0);
  });

  it('si se destruye antes de que el arte termine de prepararse, no arranca el reloj ni pide cuadros', async () => {
    const otra = TestBed.createComponent(CinematicaCasoComponent);
    otra.componentRef.setInput('cinematica', CINEMATICA);
    const pedidos = vi.spyOn(window, 'requestAnimationFrame');
    pedidos.mockClear();
    otra.detectChanges();
    otra.destroy();
    // La preparación (sin lienzo en jsdom) se resuelve en una microtarea y el respaldo, a los 2,5 s.
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);
    expect(pedidos).not.toHaveBeenCalled();
    pedidos.mockRestore();
  });
});
