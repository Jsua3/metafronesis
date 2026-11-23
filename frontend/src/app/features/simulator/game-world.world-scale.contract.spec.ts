import { readFileSync } from 'fs';
import { join } from 'path';

// Fin de línea normalizado: el checkout de Windows trae CRLF y `body()` busca el cierre con \n.
const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** Cuerpo de un método de la escena (hasta su llave de cierre a 2 espacios). */
function body(signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`no encuentro ${signature}`);
  return source.slice(start, source.indexOf('\n  }\n', start));
}

describe('game-world: puertas, herramientas y objetos a escala 1 (spec §13.1, decisión 12)', () => {
  it('la puerta no se escala: se ancla por la base y solo se fuerza el tamaño si el PNG es viejo', () => {
    const door = body('private buildDoorSprite(object: MapObjectState): Phaser.GameObjects.Image | null {');
    expect(door).toContain('.setOrigin(0.5, 1)');
    expect(door).toContain('return this.atWorldScale(image);');
    expect(door).not.toMatch(/setScale/);
    expect(source).not.toContain('DOOR_SPRITE_SCALE');
  });

  it('un PNG con otro tamaño que la tabla (caché vieja tras un despliegue) se fuerza al tamaño de la tabla', () => {
    const guard = body('private atWorldScale<T extends Phaser.GameObjects.Image>(image: T): T {');
    expect(guard).toContain('worldSpriteForTexture(image.texture.key)');
    expect(guard).toContain('staleSpriteSize(spec, image.width, image.height)');
    expect(guard).toContain('image.setDisplaySize(stale.width, stale.height)');
  });

  it('el aviso de la puerta flota sobre su borde alto, sea cual sea su alto', () => {
    expect(source).toContain('doorHintY(object.y, doorSprite?.displayHeight ?? DOOR_FALLBACK_HEIGHT)');
    expect(source).not.toContain('object.y - 90');
  });

  it('las herramientas y los objetos de escenario no llevan escala', () => {
    expect(source).not.toContain('TOOL_SPRITE_SCALE');
    // Reposo y hoja de cercanía (cuadro 0 = reposo, mismas medidas): ni uno ni otro se escalan.
    // (con apoyo en los pies el arte se dibuja con la base en (x, y); sin él, 6 px arriba del centro: `artY`)
    expect(source).toContain('const image = this.add.image(0, artY, art.textureKey);');
    expect(source).toContain('return { sprite: this.atWorldScale(image), animation: null };');
    expect(source).toContain('const sprite = this.add.sprite(0, artY, sheet.textureKey, 0);');
  });

  it('un marcador con sprite de pixel art no se escala al acercarse ni al enfocarlo: el pulso va a su anillo', () => {
    expect(source).toContain("bag['__pixelSprite'] = pixelSprite;");
    expect(body('private refreshMarkerStates() {')).toContain("pixelSprite: bag['__pixelSprite'] === true");
    expect(body('focus(key: string) {')).toContain("bag['__kitSprite'] === true || bag['__pixelSprite'] === true ? bag['__pulse'] : m");
  });
});
