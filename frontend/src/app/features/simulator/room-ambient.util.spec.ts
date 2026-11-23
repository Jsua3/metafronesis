import { backgroundImage, walkableZone } from './room-ambient.util';

describe('room-ambient.util', () => {
  it('lee la imagen de fondo del ambiente de la sala', () => {
    expect(backgroundImage({ backgroundImage: 'a.png' })).toBe('a.png');
    expect(backgroundImage({ backgroundImage: 'a.png', encuadre: 2 })).toBe('a.png');
  });

  it('sin ambiente, sin fondo o con un valor que no es texto, no hay fondo', () => {
    expect(backgroundImage(null)).toBe('');
    expect(backgroundImage(undefined)).toBe('');
    expect(backgroundImage({})).toBe('');
    expect(backgroundImage({ backgroundImage: 42 })).toBe('');
  });
});

describe('room-ambient.util: la zona caminable del encuadre (revisión final · B1)', () => {
  it('cada encuadre del ambiente da la zona que el editor muestra y el servidor hace valer', () => {
    expect(walkableZone({ encuadre: 'tres-paredes' })).toEqual({ x: 96, y: 236, ancho: 768, alto: 250 });
    expect(walkableZone({ encuadre: 'una-pared', backgroundImage: 'a.png' })).toEqual({ x: 24, y: 236, ancho: 912, alto: 250 });
  });

  it('sin ambiente, sin encuadre o con uno que no existe, no hay zona (se usa toda la sala, como siempre)', () => {
    expect(walkableZone(null)).toBeNull();
    expect(walkableZone(undefined)).toBeNull();
    expect(walkableZone({})).toBeNull();
    expect(walkableZone({ encuadre: 2 })).toBeNull();
    expect(walkableZone({ encuadre: 'circular' })).toBeNull();
    expect(walkableZone({ encuadre: 'constructor' })).toBeNull();
  });
});
