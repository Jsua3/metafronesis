import {
  furnitureSpriteSpecs,
  furnitureTextureKey,
  resolveFurnitureTextureKey,
} from './furniture-sprite.util';

describe('furniture-sprite.util', () => {
  it('resolveFurnitureTextureKey mapea cada tipo de mueble a su textura', () => {
    expect(resolveFurnitureTextureKey('counter')).toBe('furniture-counter');
    expect(resolveFurnitureTextureKey('gurney')).toBe('furniture-gurney');
    expect(resolveFurnitureTextureKey('waiting_chairs')).toBe('furniture-waiting_chairs');
    expect(resolveFurnitureTextureKey('desk')).toBe('furniture-desk');
  });

  it('devuelve null para un tipo desconocido o nulo (→ fallback vectorial)', () => {
    expect(resolveFurnitureTextureKey('trono')).toBeNull();
    expect(resolveFurnitureTextureKey('')).toBeNull();
    expect(resolveFurnitureTextureKey(null)).toBeNull();
    expect(resolveFurnitureTextureKey(undefined)).toBeNull();
  });

  it('furnitureTextureKey prefija con furniture- para no chocar con otras texturas', () => {
    expect(furnitureTextureKey('gurney')).toBe('furniture-gurney');
  });

  it('furnitureSpriteSpecs lista los 10 muebles con su ruta de asset', () => {
    const specs = furnitureSpriteSpecs();
    expect(specs).toHaveLength(10);
    expect(specs).toContainEqual({
      textureKey: 'furniture-counter',
      assetPath: '/assets/game/furniture/counter.png',
    });
    expect(specs).toContainEqual({
      textureKey: 'furniture-file_cabinet',
      assetPath: '/assets/game/furniture/file_cabinet.png',
    });
  });
});
