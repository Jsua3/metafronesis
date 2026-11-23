import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: render a escala entera (spec §8.3)', () => {
  it('el lienzo trabaja en píxeles físicos y sigue al contenedor', () => {
    expect(source).toContain('scale: pixelScaleConfig(this.gameHost!.nativeElement)');
    expect(source).toContain('this.detachHostWatch = watchHostSize(this.phaserGame, this.gameHost!.nativeElement);');
    expect(source).not.toMatch(/Phaser\.Scale\.FIT|hostResizeObserver/);
  });

  it('la cámara usa el zoom entero y se recalcula al cambiar el lienzo', () => {
    // Bloque M1: el zoom entero lo decide `camara/camara.ts` (`zoomNormal` usa `integerZoom`); la escena pide un corte
    // al pintar una sala o cambiar el lienzo y aplica el resultado cada cuadro, sin el seguimiento de Phaser.
    expect(source).toMatch(/private applyPixelCamera\(roomWidth: number, roomHeight: number\): void \{[\s\S]*?this\.camCut = true;[\s\S]*?this\.stepCamera\(0\);/);
    expect(source).toMatch(/private stepCamera\(delta: number\): void \{[\s\S]*?objetivoCamara\([\s\S]*?avanzarCamara\(/);
    expect(source).toContain("this.scale.on('resize', () => this.refitCamera());");
    expect(source).not.toMatch(/startFollow\(/);
    expect(source.match(/\.setZoom\(/g) ?? []).toHaveLength(1);
  });

  // Revisión de la integración (Codex, hallazgo 3): con el plano o el diálogo abiertos el personaje no camina.
  it('con una capa abierta las teclas no mueven al jugador', () => {
    expect(source).toContain('const bloqueado = typing || this.motionPaused;');
    expect(source.match(/!bloqueado && \(this\.cursors\./g) ?? []).toHaveLength(4);
    expect(source).not.toMatch(/!typing && \(this\.cursors\./);
  });

  it('la viñeta de tono va al suelo; solo la de crisis queda por encima', () => {
    expect(source).toContain("this.addVignette('tone', tint, 0.12, 0.3, DEPTH.LIGHTING_FLOOR);");
    expect(source.match(/DEPTH\.LIGHTING\b/g) ?? []).toHaveLength(1);
    expect(source).toContain("DEPTH.LIGHTING + 1)");
  });
});
