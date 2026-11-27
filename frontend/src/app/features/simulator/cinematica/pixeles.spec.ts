import { cuartoEncendido, escalon, hazDeBaliza, reflejoDeVidrio, resplandor, tramado, vinetaTramada } from './pixeles';
import type { Imagen } from '../sala/pintor';

/** Los colores distintos (RGB) de los píxeles opacos de una imagen. */
function colores(img: Imagen): Set<string> {
  const set = new Set<string>();
  for (let p = 0; p < img.rgba.length; p += 4) {
    if (img.rgba[p + 3] > 0) set.add(`${img.rgba[p]},${img.rgba[p + 1]},${img.rgba[p + 2]}`);
  }
  return set;
}

function alfas(img: Imagen): Set<number> {
  const set = new Set<number>();
  for (let p = 3; p < img.rgba.length; p += 4) set.add(img.rgba[p]);
  return set;
}

describe('cinematica/pixeles: luz por escalones, nunca degradados', () => {
  it('el tramado es el Bayer 4 × 4: 16 umbrales distintos entre 0 y 1', () => {
    const umbrales = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) umbrales.add(tramado(x, y));
    expect(umbrales.size).toBe(16);
    expect(Math.min(...umbrales)).toBeGreaterThan(0);
    expect(Math.max(...umbrales)).toBeLessThan(1);
  });

  it('el escalón cae siempre en 0 … n−1, también fuera de rango', () => {
    for (const v of [-1, 0, 0.3, 0.5, 0.99, 1, 7]) {
      const k = escalon(v, 5, 1, 2);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(4);
    }
    expect(escalon(0, 5, 0, 0)).toBe(0);
    expect(escalon(1, 5, 0, 0)).toBe(4);
  });

  it('el cuarto encendido es opaco y usa una paleta corta (la rampa, el mueble, el cuadro, el cable y el bombillo)', () => {
    for (const momento of ['tarde', 'noche'] as const) {
      const img = cuartoEncendido(54, 46, momento);
      expect(alfas(img)).toEqual(new Set([255]));
      // Un degradado liso daría cientos de colores; por escalones son pocas decenas como mucho.
      expect(colores(img).size).toBeLessThanOrEqual(24);
    }
  });

  it('de noche, el bombillo es el píxel más claro del cuarto', () => {
    const img = cuartoEncendido(60, 50, 'noche');
    let max = 0, donde = -1;
    for (let p = 0; p < img.rgba.length; p += 4) {
      const b = img.rgba[p] + img.rgba[p + 1] + img.rgba[p + 2];
      if (b > max) { max = b; donde = p / 4; }
    }
    const x = donde % img.ancho, y = Math.floor(donde / img.ancho);
    expect(Math.abs(x - Math.round(60 * 0.64))).toBeLessThanOrEqual(1);
    expect(y).toBeLessThan(50 * 0.3);
  });

  it('el reflejo del vidrio es de píxel duro: una sola transparencia fija', () => {
    const img = reflejoDeVidrio(40, 30);
    expect([...alfas(img)].sort((a, b) => a - b)).toEqual([0, 26]);
  });

  it('el haz de la baliza tiene cuatro niveles a lo sumo y se apaga en el andén, lejos de la pared', () => {
    const img = hazDeBaliza(60, 400, [255, 46, 58], 230);
    expect(colores(img).size).toBeLessThanOrEqual(4);
    const brillo = (x: number, y: number) => { const p = (y * img.ancho + x) * 4; return img.rgba[p] + img.rgba[p + 1] + img.rgba[p + 2]; };
    expect(brillo(30, 120)).toBeGreaterThan(0);
    expect(brillo(30, 399)).toBe(0);
  });

  it('el resplandor y la viñeta van por escalones (pocos colores o pocas transparencias)', () => {
    expect(colores(resplandor(40, [255, 40, 46])).size).toBeLessThanOrEqual(4);
    const vineta = vinetaTramada(120, 60);
    expect(alfas(vineta).size).toBeLessThanOrEqual(5);
    // El centro queda limpio.
    expect(vineta.rgba[(30 * 120 + 60) * 4 + 3]).toBe(0);
  });

  it('el recorte del resplandor calcula solo sus píxeles y respeta el radio y el tramado originales', () => {
    const color = [255, 40, 46] as const;
    const completo = resplandor(40, color);
    const recorte = resplandor(40, color, { x: 17, y: 31, ancho: 11, alto: 9 });
    expect(recorte.rgba.length).toBe(11 * 9 * 4);
    for (let y = 0; y < recorte.alto; y++) {
      const inicio = ((y + 31) * completo.ancho + 17) * 4;
      expect(recorte.rgba.subarray(y * 44, (y + 1) * 44)).toEqual(completo.rgba.subarray(inicio, inicio + 44));
    }
  });
});
