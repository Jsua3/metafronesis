import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-menu.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('lobby: kit, píxeles físicos y zoom entero (spec §8.2-8.3)', () => {
  it('el avatar del lobby es el del kit, a escala 1 y sin espejo', () => {
    expect(source).toContain("resolveCharacter(bundle, { kind: 'jugador', avatar })");
    expect(source).toContain('queueCharacterSheets(this, this.visual)');
    expect(source).toContain('.setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)');
    expect(source).not.toMatch(/setScale\(|setFlipX\(|phaser-avatar-renderer|LOBBY_AVATAR_SCALE|lobbyAvatarPlan/);
  });

  it('el lienzo en píxeles físicos y el zoom entero, como en el mundo', () => {
    expect(source).toContain('scale: pixelScaleConfig(this.host!.nativeElement)');
    expect(source).toContain('integerZoom(cam.width, cam.height, LOBBY_ROOM.width, LOBBY_ROOM.height)');
    expect(source).not.toContain('Phaser.Scale.FIT');
  });

  it('la fachada llena la vista: ninguna franja se pinta con el ancho justo de la sala', () => {
    expect(source).toContain('const band = lobbyFacadeBand(W);');
    expect(source).not.toMatch(/\.rectangle\(0, [^)]*\bW\b/);
  });

  it('si el kit no carga o no se puede resolver el avatar, el lobby arranca igual con el marcador geométrico', () => {
    expect(source).toMatch(/\.then\(bundle => resolveCharacter\(bundle, \{ kind: 'jugador', avatar \}\)\)\s*\.catch\(\(\) => null\)\s*\.then\(visual => \{/);
  });

  it('los rótulos fijos viven en el DOM (el zoom de cámara no los saca de la vista)', () => {
    expect(source).not.toMatch(/setScrollFactor\(0\)/);
    expect(source).toContain('<div class="lobby-sign" aria-hidden="true">CLÍNICA · SIEP</div>');
  });
});
