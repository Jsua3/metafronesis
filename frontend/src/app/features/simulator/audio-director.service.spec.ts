import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Howl } from 'howler';
import type { Mock } from 'vitest';
import { AudioDirectorService } from './audio-director.service';
import { FADE_EPSILON, FADE_SPEED, fadeStep } from './audio-fade.util';

vi.mock('howler', () => ({
  // function tradicional, no arrow: una arrow jamás es constructable (es una regla del propio
  // JS, no de Jest/Vitest), y a diferencia de jest.fn(), el mock de vi.fn() delega el `new` en
  // la implementación en sí ("... is not a constructor" si esa implementación es una arrow).
  Howl: vi.fn().mockImplementation(function () {
    return {
      volume: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      unload: vi.fn(),
      mute: vi.fn(),
      playing: vi.fn(() => false),
    };
  }),
  Howler: { volume: vi.fn() },
}));

describe('fadeStep', () => {
  it('recorre una fracción fija de la distancia al objetivo', () => {
    expect(fadeStep(0, 1)).toBeCloseTo(FADE_SPEED);
    expect(fadeStep(1, 0)).toBeCloseTo(1 - FADE_SPEED);
  });

  it('fija el objetivo cuando ya está a menos de FADE_EPSILON', () => {
    expect(fadeStep(0.5, 0.5 + FADE_EPSILON / 2)).toBe(0.5 + FADE_EPSILON / 2);
    expect(fadeStep(0.3, 0.3)).toBe(0.3);
  });
});

describe('AudioDirectorService: bucle de fundido', () => {
  let service: AudioDirectorService;
  /** El primer Howl que crea init() es el stem 'ambient'. */
  const ambientHowl = () => (Howl as unknown as Mock).mock.results[0].value;

  beforeAll(() => {
    // jsdom no implementa matchMedia; el servicio lo lee al construirse.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    (Howl as unknown as Mock).mockClear();
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  it('init no deja ningún temporizador corriendo', () => {
    expect(vi.getTimerCount()).toBe(0);
  });

  it('arranca fuera de la zona de Angular al fijar un objetivo', () => {
    const outside = vi.spyOn(TestBed.inject(NgZone), 'runOutsideAngular');
    service.setScene('LOW', 'CALM');
    expect(outside).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('se detiene solo al llegar al volumen objetivo', () => {
    service.setScene('LOW', 'CALM');
    vi.advanceTimersByTime(20_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(ambientHowl().volume).toHaveBeenLastCalledWith(0.42);
  });

  it('vuelve a arrancar después de stopAll', () => {
    service.setScene('LOW', 'CALM');
    service.stopAll();
    expect(vi.getTimerCount()).toBe(0);
    service.setScene('HIGH', 'TENSE');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('silenciar la música corta el volumen y termina el fundido', () => {
    service.setScene('LOW', 'CALM');
    vi.advanceTimersByTime(1_000);
    service.setMusicMuted(true);
    vi.advanceTimersByTime(100);
    expect(vi.getTimerCount()).toBe(0);
    expect(ambientHowl().volume).toHaveBeenLastCalledWith(0);
  });
});

describe('AudioDirectorService: pistas largas y silencio', () => {
  let service: AudioDirectorService;
  const howlOptions = () =>
    (Howl as unknown as Mock).mock.calls.map(([options]) => options as { src: string[]; html5?: boolean });
  const howlFor = (src: string) => {
    const index = howlOptions().findIndex(options => options.src[0] === src);
    return (Howl as unknown as Mock).mock.results[index].value;
  };

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    (Howl as unknown as Mock).mockClear();
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
  });

  afterEach(() => service.dispose());

  it('la música del mapa y el tema de la intro se transmiten con HTML5', () => {
    service.playIntroLament();
    const long = howlOptions().filter(options => options.src[0].endsWith('.mp3'));
    expect(long.map(options => options.src[0])).toEqual([
      'assets/game/audio/Musica_PsicoGame.mp3',
      'assets/game/audio/PsicoLament.mp3',
    ]);
    for (const options of long) expect(options.html5).toBe(true);
  });

  it('los efectos cortos siguen en Web Audio', () => {
    const sfx = howlOptions().filter(options => options.src[0].endsWith('.ogg'));
    expect(sfx.length).toBeGreaterThan(0);
    for (const options of sfx) expect(options.html5).toBeUndefined();
  });

  it('silenciar la música también silencia el tema de la intro', () => {
    service.playIntroLament();
    const lament = howlFor('assets/game/audio/PsicoLament.mp3');
    service.setMusicMuted(true);
    expect(lament.mute).toHaveBeenLastCalledWith(true);
    service.setMusicMuted(false);
    expect(lament.mute).toHaveBeenLastCalledWith(false);
  });

  const STEM = 'assets/game/audio/Musica_PsicoGame.mp3';
  const lastOrder = (fn: Mock) => fn.mock.invocationCallOrder[fn.mock.invocationCallOrder.length - 1];

  it('silenciar la música también silencia los stems, sin depender de volume', () => {
    const stem = howlFor(STEM);
    service.setMusicMuted(true);
    expect(stem.mute).toHaveBeenLastCalledWith(true);
    service.setMusicMuted(false);
    expect(stem.mute).toHaveBeenLastCalledWith(false);
  });

  it('al silenciar fija volume(0) antes de mute(true): en HTML5 volume() ignora un nodo silenciado', () => {
    const stem = howlFor(STEM);
    service.setMusicMuted(true);
    expect(stem.volume).toHaveBeenLastCalledWith(0);
    expect(lastOrder(stem.volume)).toBeLessThan(lastOrder(stem.mute));
  });

  it('al quitar el silencio, mute(false) llega antes del fundido que sigue', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const stem = howlFor(STEM);
      service.setMusicMuted(true);
      service.setMusicMuted(false);
      service.setScene('LOW', 'CALM');
      vi.advanceTimersByTime(20_000);
      expect(stem.volume).toHaveBeenLastCalledWith(0.42);
      expect(lastOrder(stem.mute)).toBeLessThan(lastOrder(stem.volume));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AudioDirectorService: piso de música con una sola capa (T13.1)', () => {
  let service: AudioDirectorService;
  const STEM = 'assets/game/audio/Musica_PsicoGame.mp3';
  /** Volumen de la música (0,42) por la fracción pedida a la capa. */
  const MUSIC_VOLUME = 0.42;
  const FLOOR = 0.6 * MUSIC_VOLUME;
  const ambientHowl = () => {
    const index = (Howl as unknown as Mock).mock.calls.findIndex(([options]) => options.src[0] === STEM);
    return (Howl as unknown as Mock).mock.results[index].value;
  };
  const volumes = (howl: { volume: Mock }) => howl.volume.mock.calls.map(([v]) => v as number);

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    (Howl as unknown as Mock).mockClear();
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  it('solo existe la capa ambient (el piso depende de ello)', () => {
    expect((service as unknown as { stems: Map<string, unknown> }).stems.size).toBe(1);
  });

  it.each([
    ['MEDIUM', 'TENSE'], ['HIGH', 'TENSE'], ['HIGH', 'CRISIS'], ['LOW', 'CRISIS'],
  ] as const)('con la escena %s y la persona %s la única capa no baja de 0,6 ni se apaga', (intensity, activation) => {
    service.setScene('LOW', 'CALM');
    vi.advanceTimersByTime(20_000);
    ambientHowl().volume.mockClear();

    service.setScene(intensity, activation);
    vi.advanceTimersByTime(20_000);

    const calls = volumes(ambientHowl());
    for (const v of calls) expect(v).toBeGreaterThan(0);
    if (intensity === 'HIGH' || activation === 'CRISIS') {
      // Tramos en que antes se bajaba a 0,2 o a 0: ahora se queda en el piso.
      expect(calls[calls.length - 1]).toBeCloseTo(FLOOR, 5);
      for (const v of calls) expect(v).toBeGreaterThanOrEqual(FLOOR - 1e-9);
    }
  });

  it('en calma sigue al volumen completo de la música', () => {
    service.setScene('LOW', 'CALM');
    vi.advanceTimersByTime(20_000);
    expect(ambientHowl().volume).toHaveBeenLastCalledWith(MUSIC_VOLUME);
  });

  it('con más de una capa cargada el piso no se aplica (el resto de capas toma el relevo)', () => {
    const stems = (service as unknown as { stems: Map<string, unknown> }).stems;
    stems.set('crisis', { howl: new Howl({ src: ['x.ogg'] }), volume: 0, targetVolume: 0 });
    service.setScene('LOW', 'CALM');
    vi.advanceTimersByTime(20_000);
    ambientHowl().volume.mockClear();

    service.setScene('HIGH', 'CRISIS');
    vi.advanceTimersByTime(20_000);

    expect(ambientHowl().volume).toHaveBeenLastCalledWith(0);
  });

  it('la resolución final tampoco deja la música por debajo del piso', () => {
    service.setScene('LOW', 'CALM');
    vi.advanceTimersByTime(20_000);
    ambientHowl().volume.mockClear();

    service.playResolution();
    vi.advanceTimersByTime(20_000);

    const calls = volumes(ambientHowl());
    expect(calls[calls.length - 1]).toBeCloseTo(FLOOR, 5);
  });

  it('las capas siguen a la intensidad de la escena y a la activación, no a cifras', () => {
    const source = readFileSync(join(__dirname, 'audio-director.service.ts'), 'utf-8');
    expect(source).not.toMatch(/setStressLevel|stressTier|STRESS_TIER/);
    expect(source).toMatch(/setScene\(intensity: Intensity, activation: Activation\)/);
  });
});

describe('AudioDirectorService: efectos nuevos (T13.2)', () => {
  let service: AudioDirectorService;
  const sfxOptions = () =>
    (Howl as unknown as Mock).mock.calls.map(([options]) => options as { src: string[]; volume?: number });
  const howlsFor = (src: string) =>
    (Howl as unknown as Mock).mock.results
      .map((result, index) => ({ howl: result.value, src: sfxOptions()[index].src[0] }))
      .filter(entry => entry.src === src)
      .map(entry => entry.howl);
  const PICKUP = 'assets/game/kenney/ui-audio/Audio/rollover5.ogg';
  const DOOR = 'assets/game/kenney/ui-audio/Audio/switch3.ogg';

  function useMatchMedia(reducedMotion: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: reducedMotion, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  }

  function boot(reducedMotion: boolean): void {
    useMatchMedia(reducedMotion);
    (Howl as unknown as Mock).mockClear();
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
  }

  afterEach(() => service.dispose());

  it('item_pickup reutiliza un OGG de Kenney ya incluido y suena una vez', () => {
    boot(false);
    expect(existsSync(join(__dirname, '../../../', PICKUP))).toBe(true);
    const [howl] = howlsFor(PICKUP);
    service.playSfx('item_pickup');
    expect(howl.play).toHaveBeenCalledTimes(1);
  });

  it('door_open apunta a un archivo que existe y suena una vez', () => {
    boot(false);
    expect(existsSync(join(__dirname, '../../../', DOOR))).toBe(true);
    const [howl] = howlsFor(DOOR);
    service.playSfx('door_open');
    expect(howl.play).toHaveBeenCalledTimes(1);
  });

  it('el recogido es más suave que el resto de efectos de interfaz', () => {
    boot(false);
    const pickup = sfxOptions().find(options => options.src[0] === PICKUP);
    const door = sfxOptions().find(options => options.src[0] === DOOR);
    expect(pickup?.volume).toBeLessThan(door?.volume ?? 0);
    expect(pickup?.volume).toBeGreaterThan(0);
  });

  it('con movimiento reducido ambos efectos suenan igual: el audio no depende de esa preferencia', () => {
    boot(true);
    service.playSfx('item_pickup');
    service.playSfx('door_open');
    expect(howlsFor(PICKUP)[0].play).toHaveBeenCalledTimes(1);
    expect(howlsFor(DOOR)[0].play).toHaveBeenCalledTimes(1);
  });

  it('con los efectos silenciados no suenan', () => {
    boot(false);
    service.setSfxMuted(true);
    service.playSfx('item_pickup');
    service.playSfx('door_open');
    expect(howlsFor(PICKUP)[0].play).not.toHaveBeenCalled();
    expect(howlsFor(DOOR)[0].play).not.toHaveBeenCalled();
  });

  it('todos los efectos apuntan a archivos que existen', () => {
    boot(false);
    const files = sfxOptions().map(options => options.src[0]).filter(src => src.endsWith('.ogg'));
    expect(files.length).toBeGreaterThanOrEqual(10); // los diez efectos declarados (sin stress_high)
    for (const src of files) {
      expect({ src, exists: existsSync(join(__dirname, '../../../', src)) }).toEqual({ src, exists: true });
    }
  });

  it('subir la tensión de la escena NO dispara crisis_start (sin sonido de «fin de partida»)', () => {
    boot(false);
    service.setScene('MEDIUM', 'TENSE');
    service.setScene('HIGH', 'CRISIS');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      vi.advanceTimersByTime(20_000);
    } finally {
      vi.useRealTimers();
    }
    const alarm = howlsFor('assets/game/kenney/ui-audio/Audio/switch13.ogg');
    expect(alarm).toHaveLength(1); // solo ``crisis_start``: ``stress_high`` se retiró con el estrés como índice
    for (const howl of alarm) expect(howl.play).not.toHaveBeenCalled();
  });
});

describe('AudioDirectorService: capas según la escena y la persona', () => {
  let service: AudioDirectorService;
  type Stem = { targetVolume: number };
  const stems = () => (service as unknown as { stems: Map<string, Stem> }).stems;
  const target = (layer: string) => stems().get(layer)!.targetVolume / 0.42;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    TestBed.resetTestingModule();
    service = TestBed.inject(AudioDirectorService);
    service.init();
    // Cuatro capas para ver el reparto real (con una sola, el piso de la ambiental lo disimula).
    for (const layer of ['tension', 'resolution', 'crisis'] as const) {
      stems().set(layer, { howl: new Howl({ src: ['x.ogg'] }), volume: 0, targetVolume: 0 } as never);
    }
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  it('LOW: solo la capa de calma', () => {
    service.setScene('LOW', 'CALM');
    expect([target('ambient'), target('tension'), target('crisis')]).toEqual([1, 0, 0]);
  });

  it('MEDIUM: la tensión a medias', () => {
    service.setScene('MEDIUM', 'CALM');
    expect(target('tension')).toBeCloseTo(0.5, 5);
    expect(target('crisis')).toBe(0);
  });

  it('HIGH: la tensión completa y la calma casi apagada', () => {
    service.setScene('HIGH', 'TENSE');
    expect(target('tension')).toBeCloseTo(1, 5);
    expect(target('ambient')).toBeLessThan(0.5);
    expect(target('crisis')).toBe(0);
  });

  it('una persona en crisis suma la capa de crisis, con cualquier intensidad', () => {
    for (const intensity of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      service.setScene(intensity, 'CRISIS');
      expect(target('crisis')).toBeCloseTo(1, 5);
      expect(target('ambient')).toBe(0);
    }
  });

  it('tensa o serena no encienden la capa de crisis', () => {
    service.setScene('HIGH', 'TENSE');
    expect(target('crisis')).toBe(0);
    service.setScene('HIGH', 'CALM');
    expect(target('crisis')).toBe(0);
  });
});

describe('AudioDirectorService: navegadores que ignoran el volumen de HTML5 (iOS)', () => {
  // HTML5_VOLUME_WORKS se detectaba antes al cargar el módulo: para simular otro navegador el
  // test original recargaba todo el módulo (jest.isolateModules). Vitest trata cualquier
  // import() dinámico en un archivo con vi.mock() como una llamada de mock fuera del alcance de
  // nivel superior y rechaza el archivo entero ("was defined outside of the module's top level
  // scope"), así que audio-director.service.ts expone ahora `detectHtml5VolumeWorks` y la
  // detección es un campo por instancia (igual que `reducedMotion`, ya existente): fijar
  // `window.Audio` antes de pedir el servicio a TestBed alcanza, sin recargar nada.
  let service: AudioDirectorService | undefined;

  /** iOS/iPadOS: la asignación se ignora y volume siempre lee 1. */
  class AudioIos {
    get volume(): number { return 1; }
    set volume(_value: number) { /* iOS ignora la asignación */ }
  }
  class AudioQueRespetaVolume { volume = 1; }
  class AudioQueFalla { constructor() { throw new Error('Audio no disponible'); } }

  /** Opciones de los Howl de las pistas largas (los .mp3) tras iniciar el servicio y la intro. */
  const longTrackOptions = (audio: unknown) => {
    const original = window.Audio;
    Object.defineProperty(window, 'Audio', { configurable: true, writable: true, value: audio });
    try {
      (Howl as unknown as Mock).mockClear(); // el mock de howler se comparte con los demás describe
      service = TestBed.inject(AudioDirectorService);
      service.init();
      service.playIntroLament();
      return (Howl as unknown as Mock).mock.calls
        .map(([options]) => options as { src: string[]; html5?: boolean })
        .filter(options => options.src[0].endsWith('.mp3'));
    } finally {
      Object.defineProperty(window, 'Audio', { configurable: true, writable: true, value: original });
    }
  };

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  });

  beforeEach(() => {
    service = undefined;
    TestBed.resetTestingModule();
  });

  afterEach(() => service?.dispose());

  it('donde Audio respeta volume, las pistas largas usan HTML5', () => {
    const long = longTrackOptions(AudioQueRespetaVolume);
    expect(long).toHaveLength(2);
    for (const options of long) expect(options.html5).toBe(true);
  });

  it('en iOS (Audio ignora volume) las pistas largas se quedan en Web Audio', () => {
    const long = longTrackOptions(AudioIos);
    expect(long.map(options => options.src[0])).toEqual([
      'assets/game/audio/Musica_PsicoGame.mp3',
      'assets/game/audio/PsicoLament.mp3',
    ]);
    for (const options of long) expect(options.html5).toBe(false);
  });

  it('si Audio no se puede crear, las pistas largas tampoco usan HTML5', () => {
    const long = longTrackOptions(AudioQueFalla);
    expect(long).toHaveLength(2);
    for (const options of long) expect(options.html5).toBe(false);
  });
});
