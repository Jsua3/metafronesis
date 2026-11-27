import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AccesoTomasComponent } from './acceso-tomas.component';
import { LOGIN_TOMAS } from './login-tomas.config';

describe('ventana de tomas del acceso', () => {
  let fixture: ComponentFixture<AccesoTomasComponent>;
  let entrar: (entries: Partial<IntersectionObserverEntry>[]) => void;
  let reposo: () => void;
  let desconectar: () => void;
  let reducir = false;
  let reducirDatos = false;
  let conexion: EventTarget & { saveData: boolean; effectiveType: string };
  const host = () => fixture.nativeElement as HTMLElement;
  const pintar = async () => { fixture.detectChanges(); await fixture.whenStable(); };
  const activar = async () => { await pintar(); entrar([{ isIntersecting: true, intersectionRatio: 1 }]); reposo(); await pintar(); };

  beforeEach(() => {
    reducir = false; reducirDatos = false; desconectar = vi.fn();
    conexion = Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' });
    Object.defineProperty(navigator, 'connection', { configurable: true, value: conexion });
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta.includes('reduced-motion') ? reducir : reducirDatos, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof entrar) { entrar = callback; }
      observe() {} disconnect() { desconectar(); }
    });
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { reposo = callback; return 1; });
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(AccesoTomasComponent);
  });
  afterEach(() => { fixture.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); delete (navigator as Navigator & { connection?: unknown }).connection; });

  it('muestra pósteres ordenados y accesibles antes de crear videos', async () => {
    await pintar();
    const imgs = [...host().querySelectorAll('img')];
    expect(imgs.map(img => img.alt)).toEqual(LOGIN_TOMAS.map(t => t.alt));
    expect(imgs[0].getAttribute('loading')).not.toBe('lazy');
    // Solo se pide el póster que se ve: los demás no tienen dirección hasta que les toca.
    expect(imgs.map(img => img.getAttribute('src'))).toEqual(['assets/login/tomas/llegada.webp', null, null, null, null]);
    expect(host().querySelectorAll('video')).toHaveLength(0);
    expect(host().querySelectorAll('.capa[aria-hidden="true"]')).toHaveLength(4);
    expect(host().querySelector('[aria-live]')).toBeNull();
  });
  it('crea solo el video activo y el siguiente después del reposo y al entrar en pantalla', async () => {
    await activar();
    const videos = [...host().querySelectorAll('video')];
    expect(videos).toHaveLength(2);
    expect(videos[0].muted).toBe(true);
    expect(videos[0].defaultMuted).toBe(true);
    expect(videos[0].hasAttribute('playsinline')).toBe(true);
    expect(videos[0].hasAttribute('autoplay')).toBe(false);
    expect([...videos[0].querySelectorAll('source')].map(s => s.type)).toEqual(['video/webm; codecs="av01.0.08M.08"', 'video/mp4']);
  });
  it('los segmentos permiten elegir, indican el activo y ended da la vuelta', async () => {
    await activar();
    let botones = host().querySelectorAll<HTMLButtonElement>('.segmento');
    expect(botones[1].getAttribute('aria-label')).toBe('Toma 2 de 5: Escuchas a la familia');
    botones[4].click(); await pintar();
    expect(botones[4].getAttribute('aria-current')).toBe('true');
    host().querySelector<HTMLVideoElement>('video[data-indice="4"]')!.dispatchEvent(new Event('ended'));
    await pintar(); botones = host().querySelectorAll('.segmento');
    expect(botones[0].getAttribute('aria-current')).toBe('true');
  });
  it('el segmento activo refleja el tiempo real del video', async () => {
    await activar();
    const video = host().querySelector<HTMLVideoElement>('video[data-indice="0"]')!;
    Object.defineProperty(video, 'duration', { configurable: true, value: 8 });
    video.currentTime = 4;
    video.dispatchEvent(new Event('timeupdate')); await pintar();
    expect(host().querySelector<HTMLElement>('.segmento.actual')!.style.getPropertyValue('--avance')).toBe('0.5');
  });
  it('respeta la pausa de la persona al ocultar y recuperar la pestaña', async () => {
    await activar();
    const boton = host().querySelector<HTMLButtonElement>('.pausa')!;
    boton.click(); await pintar();
    expect(boton.textContent).toContain('Reproducir las tomas');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); await pintar();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); await pintar();
    expect(boton.textContent).toContain('Reproducir las tomas');
    boton.click(); await pintar();
    expect(boton.textContent).toContain('Pausar las tomas');
  });
  it.each(['motion', 'data', 'saveData', 'slow-2g', '2g', '3g'])('usa pósteres con %s', async preferencia => {
    if (preferencia === 'motion') reducir = true;
    if (preferencia === 'data') reducirDatos = true;
    if (preferencia === 'saveData') conexion.saveData = true;
    if (preferencia === 'slow-2g' || preferencia === '2g' || preferencia === '3g') conexion.effectiveType = preferencia;
    fixture.destroy(); fixture = TestBed.createComponent(AccesoTomasComponent);
    await activar();
    expect(host().querySelector('video, .pausa')).toBeNull();
    host().querySelectorAll<HTMLButtonElement>('.segmento')[2].click(); await pintar();
    expect(host().querySelectorAll('.segmento')[2].getAttribute('aria-current')).toBe('true');
  });
  it('detiene y reanuda por entrada, visibilidad e intersección sin perder el video', async () => {
    await activar();
    const video = host().querySelector<HTMLVideoElement>('video')!;
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    fixture.componentRef.setInput('detenido', true); await pintar();
    expect(pause).toHaveBeenCalled();
    fixture.componentRef.setInput('detenido', false); await pintar();
    expect(play).toHaveBeenCalled();
    entrar([{ isIntersecting: false, intersectionRatio: 0 }]); await pintar();
    expect(host().querySelector('video')).toBe(video);
    entrar([{ isIntersecting: true, intersectionRatio: 1 }]); await pintar();
    pause.mockClear();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); await pintar();
    expect(pause).toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange'));
    entrar([{ isIntersecting: true, intersectionRatio: 1 }]); await pintar();
    expect(host().querySelector('video')).toBe(video);
  });
  it('ofrece reproducir cuando el navegador rechaza play por política', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('bloqueado', 'NotAllowedError'));
    await activar(); await pintar();
    expect(host().querySelector('.pausa')?.textContent).toContain('Reproducir las tomas');
  });
  it('un AbortError no cambia a modo póster ni bloquea el control', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('interrumpido', 'AbortError'));
    await activar(); await pintar();
    expect(host().querySelector('.pausa')?.textContent).toContain('Pausar las tomas');
    expect(host().querySelector('video')).not.toBeNull();
  });
  it('sin observador de intersección conserva solo los pósteres', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    fixture.destroy(); fixture = TestBed.createComponent(AccesoTomasComponent);
    await pintar(); reposo(); await pintar();
    expect(host().querySelector('video, .pausa')).toBeNull();
  });
  it('reacciona a cambios de movimiento reducido con la página abierta', async () => {
    const media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('matchMedia', (consulta: string) => consulta.includes('reduced-motion') ? media : Object.assign(new EventTarget(), { matches: false }));
    fixture.destroy(); fixture = TestBed.createComponent(AccesoTomasComponent);
    await activar();
    expect(host().querySelector('video')).not.toBeNull();
    media.matches = true; media.dispatchEvent(new Event('change')); await pintar();
    expect(host().querySelector('video, .pausa')).toBeNull();
    media.matches = false; media.dispatchEvent(new Event('change')); await pintar();
    expect(host().querySelector('.pausa')).not.toBeNull();
  });
  it('el fundido espera el primer cuadro de la toma que entra: mientras tanto sigue la que sale', async () => {
    await activar();
    const capas = () => [...host().querySelectorAll('.capa')];
    expect(capas()[0].classList).toContain('activa');
    host().querySelectorAll<HTMLButtonElement>('.segmento')[2].click(); await pintar();
    expect(capas()[2].classList).not.toContain('activa');
    expect(capas()[0].classList).toContain('saliente');
    const entra = host().querySelector<HTMLVideoElement>('video[data-indice="2"]')!;
    expect(entra.getAttribute('preload')).toBe('auto');
    entra.dispatchEvent(new Event('loadeddata')); await pintar();
    expect(capas()[2].classList).toContain('activa');
    expect(entra.classList).toContain('reproduciendo');
  });
  it('si la toma que entra no llega a tiempo, entra igual con su póster', async () => {
    vi.useFakeTimers();
    try {
      fixture.detectChanges(); entrar([{ isIntersecting: true, intersectionRatio: 1 }]); reposo(); fixture.detectChanges();
      host().querySelectorAll<HTMLButtonElement>('.segmento')[2].click(); fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(2600); fixture.detectChanges();
      expect(host().querySelectorAll('.capa')[2].classList).toContain('activa');
    } finally { vi.useRealTimers(); }
  });
  it('la siguiente toma ya cargada entra con su fundido sin esperar', async () => {
    await activar();
    host().querySelector<HTMLVideoElement>('video[data-indice="1"]')!.dispatchEvent(new Event('loadeddata'));
    host().querySelector<HTMLVideoElement>('video[data-indice="0"]')!.dispatchEvent(new Event('ended'));
    await pintar();
    expect(host().querySelectorAll('.capa')[1].classList).toContain('activa');
  });
  it('tras un rechazo por política, «Reproducir» llama a play dentro del mismo clic', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockRejectedValue(new DOMException('bloqueado', 'NotAllowedError'));
    await activar(); await pintar();
    play.mockClear(); play.mockResolvedValue();
    host().querySelector<HTMLButtonElement>('.pausa')!.click();
    expect(play).toHaveBeenCalled();
  });
  it('desconecta la escucha de visibilidad al destruir', async () => {
    await activar();
    const quitar = vi.spyOn(document, 'removeEventListener');
    fixture.destroy();
    expect(quitar).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(desconectar).toHaveBeenCalledOnce();
  });
  it('vuelve a intentar mp4 al visitar una toma cuyo video se había desmontado', async () => {
    await activar();
    host().querySelector<HTMLVideoElement>('video[data-indice="0"]')!.dispatchEvent(new Event('error'));
    const botones = host().querySelectorAll<HTMLButtonElement>('.segmento');
    botones[2].click(); await pintar();
    botones[3].click(); await pintar();
    botones[0].click(); await pintar();
    const nuevo = host().querySelector<HTMLVideoElement>('video[data-indice="0"]')!;
    nuevo.dispatchEvent(new Event('error')); await pintar();
    expect(nuevo.src).toContain('llegada.mp4');
    expect(host().querySelector('.pausa')).not.toBeNull();
  });
  it('prueba mp4 tras un fallo y se queda en pósteres si vuelve a fallar', async () => {
    await activar();
    const video = host().querySelector<HTMLVideoElement>('video')!;
    video.dispatchEvent(new Event('error')); await pintar();
    expect(video.src).toContain('llegada.mp4');
    video.dispatchEvent(new Event('error')); await pintar();
    expect(host().querySelector('video, .pausa')).toBeNull();
  });
});
