import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import type { SalaPorPiezas } from '../../../simulator/sala/catalogo';
import { FABRICA_DE_JUEGO_DE_SALA, LienzoDeSalaComponent } from './lienzo-de-sala.component';

const sala: SalaPorPiezas = {
  encuadre: 'una-pared', estructura: { ancho: 960, acabados: { piso: 'p', muro: 'm', paleta: 'p' } },
};

describe('LienzoDeSalaComponent', () => {
  let crear: ReturnType<typeof vi.fn>;
  let destruir: ReturnType<typeof vi.fn>;
  let fallar: boolean;
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.useFakeTimers();
    fallar = false;
    destruir = vi.fn();
    crear = vi.fn(() => {
      if (fallar) throw new Error('fallo');
      return { destruir };
    });
    TestBed.configureTestingModule({ imports: [LienzoDeSalaComponent], providers: [
      { provide: FABRICA_DE_JUEGO_DE_SALA, useValue: crear },
      { provide: CatalogoDePiezas, useValue: { manifiesto: signal({}), error: signal(false) } },
    ] });
  });
  it('arma una vez al entrar y otra tras un cambio, no en cada cambio dentro de 200 ms', async () => {
    const f = TestBed.createComponent(LienzoDeSalaComponent);
    f.componentRef.setInput('sala', sala);
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    expect(crear).toHaveBeenCalledTimes(1);
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(199);
    expect(crear).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(crear).toHaveBeenCalledTimes(2);
    f.destroy();
  });
  it('destruye el juego al destruirse', async () => {
    const f = TestBed.createComponent(LienzoDeSalaComponent);
    f.componentRef.setInput('sala', sala);
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.destroy();
    expect(destruir).toHaveBeenCalledTimes(1);
  });
  it('un fallo de carga deja data-lienzo=fallo y el aviso', async () => {
    fallar = true;
    const f = TestBed.createComponent(LienzoDeSalaComponent);
    f.componentRef.setInput('sala', sala);
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    f.detectChanges();
    expect(f.nativeElement.dataset.lienzo).toBe('fallo');
    expect(f.nativeElement.textContent).toContain('No se pudo dibujar la sala. Puedes seguir moviendo las piezas.');
    f.destroy();
  });
});
