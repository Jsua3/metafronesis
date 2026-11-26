vi.mock('phaser', () => {
  class Image {}
  class Sprite extends Image {}
  class Container {}
  return { default: { GameObjects: { Image, Sprite, Container, Arc: class {}, Rectangle: class {} } } };
});
import Phaser from 'phaser';
import { bordeDeUnPixel, ContornoDeDibujo, partesDelContorno } from './contorno';

describe('contorno de los dibujos de la sala', () => {
  it('dibuja solo el alfa exterior vecino a la unión de las partes, en tramos de un píxel', () => {
    const lleno = { x: 0, y: 0, ancho: 2, alto: 1, opaco: () => true };
    const cuerpo = { x: 1, y: 1, ancho: 1, alto: 1, opaco: () => true };
    expect(bordeDeUnPixel([lleno, cuerpo])).toEqual([
      [0, -1, 2], [-1, 0, 1], [2, 0, 1], [0, 1, 1], [2, 1, 1], [1, 2, 1],
    ]);
  });

  it('usa el cuadro vivo y el recorte de la cabeza, y sigue la posición sin repintar el mismo cuadro', () => {
    let fuente = '';
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: (imagen: { forma: string }) => { fuente = imagen.forma; },
      getImageData: () => ({ data: Uint8ClampedArray.from([...fuente].flatMap(px => [0, 0, 0, px === '#' ? 255 : 0])) }),
    } as unknown as CanvasRenderingContext2D);
    const base = Object.assign(new (Phaser.GameObjects.Container as unknown as new () => object)(),
      { x: 12, y: 30, scaleX: 1, scaleY: 1, depth: 7 });
    const anidado = Object.assign(new (Phaser.GameObjects.Container as unknown as new () => object)(), { x: 0, y: 0 });
    const cabeza = Object.assign(new (Phaser.GameObjects.Sprite as unknown as new () => object)(), {
      x: 0, y: 0, scaleX: 1, scaleY: 1, displayOriginX: 0, displayOriginY: 0,
      parentContainer: anidado, isCropped: true, _crop: { x: 0, y: 0, width: 2, height: 1 },
      frame: { name: 0, texture: { key: 'hoja' }, cutWidth: 2, cutHeight: 2, cutX: 0, cutY: 0, source: { image: { forma: '#..#' } } },
    });
    Object.assign(anidado, { list: [cabeza] });
    const grafico = {
      setVisible: vi.fn().mockReturnThis(), clear: vi.fn().mockReturnThis(), fillStyle: vi.fn().mockReturnThis(),
      fillRect: vi.fn().mockReturnThis(), setPosition: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(),
    };
    const escena = { add: { graphics: () => grafico } } as unknown as Phaser.Scene;
    const contorno = new ContornoDeDibujo(escena, partesDelContorno(anidado as Phaser.GameObjects.Container));
    contorno.actualizar(base as Phaser.GameObjects.Container);
    expect(grafico.fillRect.mock.calls).toEqual([[0, -1, 1, 1], [-1, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1]]);
    expect(grafico.fillStyle).toHaveBeenCalledWith(0xcdbcff);
    base.x += 2;
    contorno.actualizar(base as Phaser.GameObjects.Container);
    expect(grafico.clear).toHaveBeenCalledTimes(1);
    expect(grafico.setPosition).toHaveBeenLastCalledWith(14, 30);
    grafico.fillRect.mockClear();
    cabeza.frame = { ...cabeza.frame, name: 1, source: { image: { forma: '.##.' } } };
    contorno.actualizar(base as Phaser.GameObjects.Container);
    expect(grafico.fillRect.mock.calls).toEqual([[1, -1, 1, 1], [0, 0, 1, 1], [2, 0, 1, 1], [1, 1, 1, 1]]);
    canvas.mockRestore();
  });
});
