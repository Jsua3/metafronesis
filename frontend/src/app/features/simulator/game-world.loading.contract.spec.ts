import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: carga de la escena', () => {
  it('la escena informa el progreso y los fallos esenciales de la precarga', () => {
    expect(source).toMatch(/onLoadProgress:\s*\(percent: number\) => void;/);
    expect(source).toMatch(/onLoadComplete:\s*\(criticalFailures: string\[\]\) => void;/);
    expect(source).toContain("this.load.on('progress', (value: number) => {");
    expect(source).toMatch(/if \(!this\.assetsLoaded && isCriticalAsset\(file\.key\)\) criticalFailures\.push\(file\.key\);/);
    expect(source).toMatch(/this\.assetsLoaded = true;\s*this\.callbacks\.onLoadComplete\(criticalFailures\);/);
  });

  it('la capa de carga muestra el porcentaje real', () => {
    // F6-1: con `showLoader` en false el anfitrión (el juego) ya pinta UN indicador y la del mundo se oculta.
    expect(source).toContain('@if (!assetsReady() && showLoader()) {');
    expect(source).toContain('[attr.aria-valuenow]="loadPercent()"');
    expect(source).toContain("[style.transform]=\"'scaleX(' + loadPercent() / 100 + ')'\"");
  });

  it('la capa y el aviso se anclan al área del juego, no a un ancestro lejano', () => {
    // Sin esto, en la vista previa del editor (host sin posición propia) la capa
    // cubriría toda la pestaña. En la partida gana `.game-surface { position: absolute }`.
    expect(source).toMatch(/:host \{[^}]*position: relative;[^}]*\}/);
    // En la vista previa el host mide lo que el canvas (altura automática) y, mientras
    // carga, el canvas aún no existe: sin altura mínima la capa quedaría aplastada.
    expect(source).toMatch(/\.world-loading \{[^}]*min-height: 240px;[^}]*\}/);
  });

  it('un fallo esencial ofrece reintentar o seguir', () => {
    expect(source).toContain('@if (criticalLoadFailed()) {');
    expect(source).toContain('(click)="retryLoad()"');
    expect(source).toContain('(click)="dismissLoadWarning()"');
  });

  it('reintentar reinicia Phaser desde cero sin recargar la página', () => {
    expect(source).toMatch(/retryLoad\(\): void \{[\s\S]*?this\.phaserGame\?\.destroy\(true\);[\s\S]*?this\.phaserGame = undefined;[\s\S]*?this\.boot\(\);/);
    expect(source).not.toContain('location.reload()');
  });
});
