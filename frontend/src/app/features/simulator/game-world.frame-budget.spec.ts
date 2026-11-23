import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: trabajo por cuadro', () => {
  it('cada reconstrucción de sala mata los tweens antes de destruir los objetos', () => {
    const rebuilds = source.match(/this\.children\.removeAll\(true\);/g) ?? [];
    const guarded = source.match(/this\.tweens\.killAll\(\);\s*this\.children\.removeAll\(true\);/g) ?? [];
    expect(rebuilds.length).toBe(2);
    expect(guarded.length).toBe(rebuilds.length);
  });

  it('la posición sale por un único punto limitado y se vacía al detenerse', () => {
    expect(source.match(/this\.callbacks\.onPosition\(/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/private emitPosition\(force = false\): void \{[\s\S]*?this\.callbacks\.onPosition\(x, y\);/);
    expect(source).toMatch(/private flushPosition\(\): void \{\s*if \(this\.positionDirty\) this\.emitPosition\(true\);\s*\}/);
    // Bloqueado contra una pared y quieto: ambas ramas vacían la posición pendiente.
    expect(source).toMatch(/this\.flushPosition\(\);\s*this\.applyPlayerPose\(this\.mirada\.actual, false\);/);
    expect(source).toMatch(/this\.flushPosition\(\);\s*this\.applyPlayerPose\(this\.mirada\.actual, false\);/);
  });

  it('data-player-x/y (contrato del e2e) se escribe en cada cuadro, directo en el DOM y sin Angular', () => {
    // La escena manda la posición del cuadro ANTES de decidir si avisa a Angular.
    expect(source).toMatch(/private emitPosition\(force = false\): void \{[\s\S]*?this\.callbacks\.onPositionFrame\(x, y\);[\s\S]*?shouldEmitPosition\(/);
    expect(source).toMatch(/onPositionFrame:\s*\(x: number, y: number\) => void;/);
    expect(source).toContain('onPositionFrame: (x, y) => this.writePlayerPosition({ x, y }),');
    expect(source).toContain("host.setAttribute('data-player-x', String(position.x));");
    expect(source).toContain("host.setAttribute('data-player-y', String(position.y));");
    // Ni binding de plantilla ni señal: cada cambio dispararía detección de cambios.
    expect(source).not.toContain('[attr.data-player-x]');
    expect(source).not.toMatch(/readonly playerPosition = signal/);
    expect(source).toContain('this.writePlayerPosition(this.scene?.playerPosition() ?? null);');
  });

  it('el componente expone la posición viva de la escena para las acciones validadas', () => {
    // simulation-play la pide antes de persistir: positionChange llega hasta 125 ms atrás.
    expect(source).toMatch(/\n  playerPosition\(\): \{ x: number; y: number \} \| null \{\s*return this\.scene\?\.playerPosition\(\) \?\? null;\s*\}/);
  });
});
