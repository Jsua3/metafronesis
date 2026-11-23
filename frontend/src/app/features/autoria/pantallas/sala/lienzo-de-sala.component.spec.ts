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
  it('tras un cambio, la sala anterior sigue a la vista hasta que la nueva está lista (sin parpadeo en negro)', async () => {
    const juegos: { destruir: ReturnType<typeof vi.fn>; listo: () => void; contenedor: HTMLElement }[] = [];
    crear.mockImplementation((op: { contenedor: HTMLElement; listo: (plan: unknown) => void }) => {
      const juego = { destruir: vi.fn(), listo: () => op.listo({}), contenedor: op.contenedor };
      juegos.push(juego);
      return juego;
    });
    const f = TestBed.createComponent(LienzoDeSalaComponent);
    f.componentRef.setInput('sala', sala);
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    juegos[0].listo();
    const vieja = juegos[0].contenedor;
    expect(vieja.isConnected).toBe(true);

    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(200);
    expect(juegos).toHaveLength(2);
    // Mientras la nueva carga, la vieja sigue entera y a la vista; la nueva se arma detrás, sin verse.
    expect(juegos[0].destruir).not.toHaveBeenCalled();
    expect(vieja.isConnected).toBe(true);
    expect(juegos[1].contenedor.style.opacity).toBe('0');

    juegos[1].listo();
    expect(juegos[0].destruir).toHaveBeenCalledTimes(1);
    expect(vieja.isConnected).toBe(false);
    expect(juegos[1].contenedor.style.opacity).toBe('');
    f.destroy();
    expect(juegos[1].destruir).toHaveBeenCalledTimes(1);
  });
  it('un cambio que llega mientras la nueva sala carga descarta esa carga y no la vieja', async () => {
    const juegos: { destruir: ReturnType<typeof vi.fn>; listo: () => void }[] = [];
    crear.mockImplementation((op: { listo: (plan: unknown) => void }) => {
      const juego = { destruir: vi.fn(), listo: () => op.listo({}) };
      juegos.push(juego);
      return juego;
    });
    const f = TestBed.createComponent(LienzoDeSalaComponent);
    f.componentRef.setInput('sala', sala);
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    juegos[0].listo();
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(200);
    f.componentRef.setInput('actores', []);
    f.detectChanges();
    await vi.advanceTimersByTimeAsync(200);
    expect(juegos).toHaveLength(3);
    expect(juegos[1].destruir).toHaveBeenCalledTimes(1);
    expect(juegos[0].destruir).not.toHaveBeenCalled();
    juegos[1].listo(); // llega tarde: ya no cuenta
    expect(juegos[0].destruir).not.toHaveBeenCalled();
    juegos[2].listo();
    expect(juegos[0].destruir).toHaveBeenCalledTimes(1);
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
