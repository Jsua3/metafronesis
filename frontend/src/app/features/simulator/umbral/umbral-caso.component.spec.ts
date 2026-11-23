import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { DRAFT_COPY } from '../draft-copy';
import { PASOS_UMBRAL, UMBRAL_TEXTO_MS, UmbralCasoComponent } from './umbral-caso.component';

/**
 * El umbral del juego (DISENO §4.4, DP-09): una sola pantalla entre la ficha y el mundo, con la portada, el título, la
 * línea de cuidado que nombra la salida segura y el progreso honesto de tres píxeles. Sin «Reintentar» mientras algo
 * esté en curso: en lento solo «Volver a la ficha».
 */
// req: DP-09, REGLA-004, ETH-01, RNF-004
describe('app-umbral-caso', () => {
  let fixture: ComponentFixture<UmbralCasoComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  /** Dispara a mano el reloj de 1 s del componente (los temporizadores falsos cuelgan `whenStable` sin zonas). */
  let pasaUnSegundo: () => void = () => undefined;

  async function crear(inputs: Record<string, unknown> = {}) {
    const original = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      if (ms === UMBRAL_TEXTO_MS) { pasaUnSegundo = fn; return 0; }
      return original(fn, ms);
    }) as typeof window.setTimeout);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(UmbralCasoComponent);
    for (const [clave, valor] of Object.entries({ titulo: 'Primer contacto', ...inputs })) fixture.componentRef.setInput(clave, valor);
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('pinta desde el primer cuadro la portada que viajó, el título y la línea de cuidado que nombra la salida', async () => {
    await crear({ portada: '/media/sala.png' });
    expect(host().querySelector('ui-portada-caso')?.classList).toContain('vt-portada');
    expect(text(host().querySelector('h2'))).toBe('Primer contacto');
    expect(text(host())).toContain(DRAFT_COPY.umbralCareLine.text);
    expect(host().getAttribute('aria-busy')).toBe('true');
  });

  it('sin título todavía (URL directa) no inventa uno: espera al intento', async () => {
    await crear({ titulo: null });
    expect(host().querySelector('h2')).toBeNull();
    expect(text(host())).toContain(DRAFT_COPY.umbralCareLine.text);
  });

  it('un píxel por fase real y, pasado 1 s, el paso en texto (antes, solo los píxeles)', async () => {
    await crear({ fase: 'sala' });
    const progreso = host().querySelector('app-firma-progreso')!;
    expect(progreso.getAttribute('aria-valuenow')).toBe('1');
    expect(text(host().querySelector('.umbral-caso__paso'))).toBe('');
    pasaUnSegundo();
    await fixture.whenStable();
    expect(text(host().querySelector('.umbral-caso__paso'))).toBe(PASOS_UMBRAL.sala);
    fixture.componentRef.setInput('fase', 'escena');
    await fixture.whenStable();
    expect(progreso.getAttribute('aria-valuenow')).toBe('2');
    expect(text(host().querySelector('.umbral-caso__paso'))).toBe(PASOS_UMBRAL.escena);
  });

  it('con una tarjeta a la vista no dice «Preparando…»: espera a la persona, no carga', async () => {
    await crear({ fase: 'intento', conTarjeta: true });
    pasaUnSegundo();
    await fixture.whenStable();
    expect(text(host().querySelector('.umbral-caso__paso'))).toBe('');
    expect(host().classList).toContain('umbral-caso--con-tarjeta');
  });

  // Criterio (13) de B4b: en lento no hay «Reintentar» (lo que está en curso sigue; nada se lanza dos veces).
  it('lento: dice que tarda y ofrece SOLO volver a la ficha', async () => {
    await crear({ fase: 'sala', lento: true });
    expect(text(host())).toContain(DRAFT_COPY.umbralSlow.text);
    const botones = [...host().querySelectorAll('button')].map(text);
    expect(botones.some(nombre => nombre.includes('Volver a la ficha'))).toBe(true);
    expect(botones.some(nombre => /reintentar/i.test(nombre))).toBe(false);
    const volver = vi.fn();
    fixture.componentInstance.volver.subscribe(volver);
    ([...host().querySelectorAll('button')].find(b => text(b).includes('Volver a la ficha')) as HTMLButtonElement).click();
    expect(volver).toHaveBeenCalledTimes(1);
  });

  it('en ensayo, lo lento vuelve al editor', async () => {
    await crear({ fase: 'sala', lento: true, modo: 'rehearsal' });
    expect([...host().querySelectorAll('button')].map(text).some(nombre => nombre.includes('Volver al editor'))).toBe(true);
  });

  it('con un intento en curso ofrece la salida segura, que se pide con un toque (REGLA-004)', async () => {
    await crear({ fase: 'escena', salida: true });
    const salida = host().querySelector('app-safe-exit-button button') as HTMLButtonElement;
    expect(text(salida)).toContain('Salida segura');
    const pedir = vi.fn();
    fixture.componentInstance.salidaSegura.subscribe(pedir);
    salida.click();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('sin intento en curso no hay salida que ofrecer (el aviso de contenido sale por «Volver al catálogo», ETH-01)', async () => {
    await crear({ fase: 'intento', salida: false });
    expect(host().querySelector('app-safe-exit-button')).toBeNull();
  });

  it('el bloque del progreso lleva la clase del indicador de arranque de siempre mientras el juego lo muestra', async () => {
    await crear({ arrancando: true });
    expect(host().querySelectorAll('.game-boot')).toHaveLength(1);
    fixture.componentRef.setInput('arrancando', false);
    await fixture.whenStable();
    expect(host().querySelectorAll('.game-boot')).toHaveLength(0);
  });

  it('al retirarse deja de recibir el puntero (el velo se funde)', async () => {
    await crear({ fase: 'listo', saliendo: true });
    expect(host().classList).toContain('umbral-caso--saliendo');
    expect(host().getAttribute('aria-busy')).toBeNull();
  });

  describe('la hoja de estilos', () => {
    const css = readFileSync(join(__dirname, 'umbral-caso.component.scss'), 'utf-8');

    it('se retira solo con opacidad (sin desplazar nada) y con la duración del velo', () => {
      expect(css).toMatch(/transition: opacity var\(--ds-dur-revelar\)/);
      expect(css).not.toMatch(/animation:[^;]*infinite/);
    });

    it('queda por encima del pie que sube por los velos y por debajo de las tarjetas, con tokens', () => {
      expect(css).toMatch(/z-index: calc\(var\(--ds-z-modal\)/);
    });
  });
});
