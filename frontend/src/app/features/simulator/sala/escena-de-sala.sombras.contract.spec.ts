import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const fuente = readFileSync(join(__dirname, 'escena-de-sala.ts'), 'utf-8');

/**
 * La sombra con silueta de cada figura vive en un lienzo propio (`sala:sombra:<id>`). Cuando la sombra crece, el lienzo
 * se rehace con el mismo nombre: la imagen que ya la mostraba tiene que pasar a la textura nueva. Si se compara por
 * clave, la clave es la misma y la imagen se queda con la textura destruida; Phaser la dibuja y falla en
 * `TexturerImage.run` («Cannot read properties of null (reading 'resolution')»), y el mundo se detiene (R1, V4).
 */
describe('escena de sala: la sombra no se queda con una textura destruida', () => {
  it('al rehacer el lienzo de la sombra, la imagen existente se reapunta comparando el objeto de la textura', () => {
    expect(fuente).toContain('if (textura) this.escena.textures.remove(nombre);');
    expect(fuente).toMatch(/\} else if \(sombraImagen\.texture !== textura\) \{[^}]*sombraImagen\.setTexture\(nombre\);/);
    expect(fuente).not.toContain('sombraImagen.texture.key !== nombre');
  });
});
