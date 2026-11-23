import { MIN_ROOM_FRACTION, cameraBounds, integerZoom, physicalSize } from './pixel-scale.util';

const ROOM = { w: 960, h: 528 };

describe('pixel-scale.util', () => {
  it.each([
    ['1920×1080 (contenedor 1696×954, dpr 1)', 1696, 954, 1, 2],
    ['1366×768 (contenedor 1200×650, dpr 1)', 1200, 650, 1, 1],
    ['portátil a 125 % (contenedor 1360×760 CSS)', 1360, 760, 1.25, 2],
    ['4K a dpr 2 (contenedor 1696×954 CSS)', 1696, 954, 2, 4],
    ['móvil en vertical', 390, 700, 3, 1],
    ['1920×1080 en pantalla completa (contenedor 1894×954)', 1894, 954, 1, 2],
    ['1920×1080 con el navegador maximizado (contenedor 1894×819)', 1894, 819, 1, 2],
    ['1366×768 (contenedor 1340×642)', 1340, 642, 1, 1],
    ['1440×900 (contenedor 1414×774): aún ×1', 1414, 774, 1, 1],
    ['1536×864 a 125 % (contenedor 1510×738 CSS)', 1510.390625, 737.59375, 1.25, 2],
  ])('zoom entero: %s', (_name, cssW, cssH, dpr, expected) => {
    const size = physicalSize(cssW, cssH, dpr);
    expect(integerZoom(size.width, size.height, ROOM.w, ROOM.h)).toBe(expected);
  });

  it('el umbral es el 75 % de la sala (decisión del usuario, plan 3 tarea 10)', () => {
    expect(MIN_ROOM_FRACTION).toBe(0.75);
  });

  it('el zoom deja ver al menos el 75 % de la sala en los dos ejes', () => {
    for (const [w, h] of [[1700, 950], [3392, 1908], [2560, 1300], [800, 2000], [1894, 819]]) {
      const k = integerZoom(w, h, ROOM.w, ROOM.h);
      expect(Number.isInteger(k)).toBe(true);
      if (k > 1) {
        expect(w / k).toBeGreaterThanOrEqual(MIN_ROOM_FRACTION * ROOM.w);
        expect(h / k).toBeGreaterThanOrEqual(MIN_ROOM_FRACTION * ROOM.h);
      }
    }
  });

  it('tamaño físico: redondea, nunca baja de 1 px y tolera dpr inválidos', () => {
    expect(physicalSize(1360, 760, 1.25)).toEqual({ width: 1700, height: 950, dpr: 1.25 });
    expect(physicalSize(0, 0, 1)).toEqual({ width: 1, height: 1, dpr: 1 });
    expect(physicalSize(800, 450, Number.NaN)).toEqual({ width: 800, height: 450, dpr: 1 });
    expect(physicalSize(-5, 10, 0)).toEqual({ width: 1, height: 10, dpr: 1 });
    expect(integerZoom(1, 1, ROOM.w, ROOM.h)).toBe(1);
    expect(integerZoom(1000, 1000, 0, 0)).toBe(1);
  });

  it('límites de cámara: los de la sala; si la vista es mayor, centrados', () => {
    expect(cameraBounds(960, 528, 848, 477)).toEqual({ x: 0, y: 0, width: 960, height: 528 });
    expect(cameraBounds(960, 528, 1280, 720)).toEqual({ x: -160, y: -96, width: 1280, height: 720 });
    expect(cameraBounds(960, 528, 1281, 400)).toEqual({ x: -161, y: 0, width: 1281, height: 528 });
  });
});
