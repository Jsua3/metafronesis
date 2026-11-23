import { TestBed } from '@angular/core/testing';

import { PintorDeVistas, type SalaDeBiblioteca, encuadre, imagenAutocontenida } from './pintor-de-vistas.service';

/** Un cuarto de mentira: `techo` filas de un color oscuro parejo y el resto con un muro de dos tonos (como los ladrillos). */
function cuarto(ancho: number, alto: number, techo: number): CanvasRenderingContext2D {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const claro = y >= techo && x % 4 < 2;
      const color = y < techo ? 12 : claro ? 200 : 150;
      data.set([color, color, color, 255], i);
    }
  }
  return { getImageData: () => ({ data }) } as unknown as CanvasRenderingContext2D;
}

describe('PintorDeVistas · RF-05 · CU-04 la portada del Hospital sin la franja negra del techo', () => {
  it('quita el techo y, si sobra alto, recorta abajo en 16:9', () => {
    expect(encuadre(cuarto(320, 270, 40), 320, 270)).toEqual({ x: 0, y: 40, ancho: 320, alto: 180 });
  });

  it('si falta alto tras quitar el techo, recorta los lados por igual', () => {
    const r = encuadre(cuarto(480, 270, 84), 480, 270);
    expect(r.y).toBe(84);
    expect(r.alto).toBe(186);
    expect(r.ancho).toBe(331);
    expect(r.x).toBe(Math.round((480 - 331) / 2));
  });

  it('un cuarto sin techo se queda entero arriba', () => {
    expect(encuadre(cuarto(320, 180, 0), 320, 180)).toEqual({ x: 0, y: 0, ancho: 320, alto: 180 });
  });
});


describe('PintorDeVistas · RF-05 · recuperación de miniaturas', () => {
  it('reintenta una composición fallida y distingue cambios en la sala', async () => {
    TestBed.resetTestingModule();
    const pintor = TestBed.inject(PintorDeVistas);
    const componer = vi.spyOn(pintor as any, 'componer').mockResolvedValueOnce(null).mockResolvedValueOnce('blob:uno').mockResolvedValueOnce('blob:dos');
    const sala = { id: '1', estructura: { ancho: 3 }, muebles: [] } as unknown as SalaDeBiblioteca;
    expect(await pintor.vista('hospital', sala)).toBeNull();
    expect(await pintor.vista('hospital', sala)).toBe('blob:uno');
    expect(await pintor.vista('hospital', sala)).toBe('blob:uno');
    expect(await pintor.vista('hospital', { ...sala, muebles: [{ ref: 'silla', x: 1, y: 2 }] } as SalaDeBiblioteca)).toBe('blob:dos');
    expect(componer).toHaveBeenCalledTimes(3);
  });
});

describe('RF-05 · composición para la cámara', () => {
  it('separa en cach? la vista completa de la miniatura recortada', async () => {
    TestBed.resetTestingModule();
    const pintor = TestBed.inject(PintorDeVistas);
    const componer = vi.spyOn(pintor as any, 'componer').mockResolvedValueOnce('recortada').mockResolvedValueOnce('completa');
    const sala = { id: '1', estructura: { ancho: 960 } } as unknown as SalaDeBiblioteca;
    expect(await pintor.vista('hospital', sala)).toBe('recortada');
    expect(await pintor.vista('hospital', sala, true)).toBe('completa');
    expect(componer).toHaveBeenLastCalledWith('hospital', sala, true);
  });
});


describe('RF-05 · cach? de composiciones por sala y variante', () => {
  it('conserva solo la ?ltima solicitud y no confunde resultados pendientes fuera de orden', async () => {
    TestBed.resetTestingModule();
    const pintor = TestBed.inject(PintorDeVistas);
    let resolverAnterior!: (v: string | null) => void;
    let resolverNueva!: (v: string | null) => void;
    const componer = vi.spyOn(pintor as any, 'componer')
      .mockReturnValueOnce(new Promise((r) => { resolverAnterior = r; }))
      .mockReturnValueOnce(new Promise((r) => { resolverNueva = r; }))
      .mockResolvedValueOnce('data:completa');
    const sala = { id: '1', estructura: { ancho: 3 }, muebles: [] } as unknown as SalaDeBiblioteca;
    const nueva = { ...sala, muebles: [{ ref: 'silla', x: 1, y: 2 }] } as SalaDeBiblioteca;
    const anterior = pintor.vista('hospital', sala);
    expect(pintor.vista('hospital', sala)).toBe(anterior);
    const actual = pintor.vista('hospital', nueva);
    expect(await pintor.vista('hospital', nueva, true)).toBe('data:completa');
    resolverNueva('data:nueva');
    expect(await actual).toBe('data:nueva');
    resolverAnterior(null);
    expect(await anterior).toBeNull();
    expect(await pintor.vista('hospital', nueva)).toBe('data:nueva');
    expect(componer).toHaveBeenCalledTimes(3);
    expect((pintor as any).vistas.size).toBe(2);
  });
});

describe('RF-05 · vida de las imágenes compuestas', () => {
  it('produce una imagen autocontenida sin crear URL de objeto que pueda caducar', async () => {
    const lienzo = { toBlob: (listo: BlobCallback) => listo(new Blob(['sala'], { type: 'image/png' })) } as HTMLCanvasElement;
    const crear = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: crear }));
    try {
      expect(await imagenAutocontenida(lienzo)).toBe('data:image/png;base64,c2FsYQ==');
      expect(crear).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
