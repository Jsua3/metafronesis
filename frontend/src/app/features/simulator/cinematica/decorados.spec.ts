import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';

import type { ManifiestoDePiezas } from '../sala/catalogo';
import type { Imagen } from '../sala/pintor';
import { GRADO_DE_TARDE, luzEn, pintarDecorado, rutasDelDecorado } from './decorados';
import type { ClaveDeDecorado } from './decorados';

/**
 * Los decorados se componen con la biblioteca de piezas DE VERDAD (los PNG del repositorio), como en el navegador: así
 * una pieza que cambia de nombre o un manifiesto que deja de cuadrar falla aquí y no en la pantalla de la estudiante.
 */
const BIBLIOTECA = join(__dirname, '../../../../assets/biblioteca/');
/** `pngjs` (de las herramientas del front) no trae tipos: se pide con `require` y se le da la forma que se usa. */
const { PNG } = createRequire(__filename)('pngjs') as { PNG: { sync: { read(b: Buffer): { width: number; height: number; data: Buffer } } } };
const manifiesto = JSON.parse(readFileSync(join(BIBLIOTECA, 'piezas/manifiesto.json'), 'utf-8')) as ManifiestoDePiezas;

function imagenes(clave: ClaveDeDecorado): Map<string, Imagen> {
  const mapa = new Map<string, Imagen>();
  for (const ruta of rutasDelDecorado(clave, manifiesto)) {
    const png = PNG.sync.read(readFileSync(join(BIBLIOTECA, ruta)));
    mapa.set(ruta, { ancho: png.width, alto: png.height, rgba: png.data });
  }
  return mapa;
}

const pixel = (img: Imagen, x: number, y: number) => Array.from(img.rgba.subarray((y * img.ancho + x) * 4, (y * img.ancho + x) * 4 + 3));
const brillo = (rgb: number[]) => rgb[0] + rgb[1] + rgb[2];

describe('cinematica/decorados (con la biblioteca de piezas real)', () => {
  let tarde: ReturnType<typeof pintarDecorado>;
  let noche: ReturnType<typeof pintarDecorado>;
  let urgencias: ReturnType<typeof pintarDecorado>;

  beforeAll(() => {
    tarde = pintarDecorado('calle:tarde', manifiesto, imagenes('calle:tarde'));
    noche = pintarDecorado('calle:noche', manifiesto, imagenes('calle:noche'));
    urgencias = pintarDecorado('urgencias:noche', manifiesto, imagenes('urgencias:noche'));
  }, 30_000);

  it('la calle de la tarde: dos fachadas seguidas, cielo cálido y la ventana de la casa con su cristal', () => {
    expect([tarde.ancho, tarde.alto]).toEqual([1920, 528]);
    // El cielo de la tarde: más rojo que azul cerca del horizonte (en la casa B, sin alero).
    const cielo = pixel(tarde.imagen, 1500, 70);
    expect(cielo[0]).toBeGreaterThan(cielo[2]);
    // El cristal de la ventana `corrediza-1`: dentro del marco y con una máscara que no está vacía.
    expect(tarde.vidrio).not.toBeNull();
    expect(tarde.vidrio!.x).toBeGreaterThan(150);
    expect(tarde.vidrio!.x + tarde.vidrio!.w).toBeLessThan(320);
    expect(tarde.vidrio!.mascara.some(Boolean)).toBe(true);
    expect(tarde.derrame).not.toBeNull();
    expect(tarde.grado).toEqual(GRADO_DE_TARDE);
  });

  it('de noche la ventana de la casa también tiene cristal (para encenderla y ver las siluetas)', () => {
    expect(noche.vidrio).not.toBeNull();
    expect(noche.vidrio!.mascara.some(Boolean)).toBe(true);
    expect(noche.derrame).not.toBeNull();
  });

  it('la calle de noche es más oscura que la de la tarde, y tiñe más a quien pisa el andén', () => {
    expect(brillo(pixel(noche.imagen, 600, 150))).toBeLessThan(brillo(pixel(tarde.imagen, 600, 150)));
    expect(brillo(luzEn(noche, 600, 270))).toBeLessThan(brillo(luzEn(tarde, 600, 270)));
  });

  it('la entrada de urgencias de noche, con sus tubos encendidos (más luz bajo un tubo que en la esquina)', () => {
    expect([urgencias.ancho, urgencias.alto]).toEqual([1200, 528]);
    expect(urgencias.vidrio).toBeNull();
    expect(brillo(luzEn(urgencias, 300, 300))).toBeGreaterThan(brillo(luzEn(urgencias, 60, 500)));
  });

  it('de noche, por fuera, las ventanas de las fachadas muestran un cuarto en penumbra, no el cielo', () => {
    const v = noche.vidrio!;
    let oscuros = 0, total = 0;
    for (let j = 0; j < v.h; j++) {
      for (let i = 0; i < v.w; i++) {
        if (!v.mascara[j * v.w + i]) continue;
        total++;
        if (brillo(pixel(noche.imagen, v.x + i, v.y + j)) < 3 * 90) oscuros++;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(oscuros / total).toBeGreaterThan(0.95);
  });

  it('el halo de la ventana encendida no cae sobre el cristal (las siluetas quedan negras a contraluz)', () => {
    const v = noche.vidrio!, d = noche.derrame!;
    for (let j = 0; j < v.h; j++) {
      for (let i = 0; i < v.w; i++) {
        if (v.mascara[j * v.w + i]) expect(d.rgba[((v.y + j) * d.ancho + v.x + i) * 4 + 3]).toBe(0);
      }
    }
  });
});
