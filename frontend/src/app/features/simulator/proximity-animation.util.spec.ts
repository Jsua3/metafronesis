import { type ProximityAnimation, proximityReport } from './proximity-animation.util';

const animacion = (frame: number | undefined, playing: boolean): ProximityAnimation => ({
  sprite: { play: vi.fn(), stop: vi.fn(), setFrame: vi.fn(), ...(frame === undefined ? {} : { frame: { name: frame } }) },
  animationKey: 'cerca:hoja@6',
  playing,
});

describe('proximityReport: lo que el juego publica para la prueba de extremo a extremo', () => {
  it('sin objetos con hoja de cercanía no hay nada que publicar', () => {
    expect(proximityReport(new Map())).toEqual({ playing: null, frames: {} });
  });

  it('en reposo ningún objeto anima y todos muestran el cuadro 0', () => {
    const report = proximityReport(new Map([['lampara', animacion(0, false)], ['archivo', animacion(0, false)]]));
    expect(report).toEqual({ playing: null, frames: { lampara: 0, archivo: 0 } });
  });

  it('el objeto que anima se nombra y su cuadro avanza', () => {
    const lampara = animacion(0, true);
    const mapa = new Map([['lampara', lampara], ['archivo', animacion(0, false)]]);
    expect(proximityReport(mapa)).toEqual({ playing: 'lampara', frames: { lampara: 0, archivo: 0 } });
    lampara.sprite.frame = { name: 3 };
    expect(proximityReport(mapa)).toEqual({ playing: 'lampara', frames: { lampara: 3, archivo: 0 } });
  });

  it('un sprite sin cuadro conocido cuenta como el cuadro 0', () => {
    expect(proximityReport(new Map([['lampara', animacion(undefined, false)]]))).toEqual({ playing: null, frames: { lampara: 0 } });
  });
});
