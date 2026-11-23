import { readFileSync } from 'fs';
import { join } from 'path';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf-8');

/** Cuerpo de la PRIMERA regla cuyo selector es exactamente `selector`. */
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector}`);
  return match[2];
}

describe('paneles del juego sin desenfoque caro', () => {
  const opaque: Array<[string, string]> = [
    ['simulation-play.component.ts', '.objective-card'],
    ['simulation-play.component.ts', '.case-intro-overlay'],
    ['dialogue-panel.component.ts', '.dialogue-strip'],
    ['journal-panel.component.ts', '.journal-modal'],
    ['simulation-hud.component.ts', '.hud-shell'],
    ['simulation-hud.component.ts', '.settings-menu'],
    ['game-help.component.ts', '.help-card'],
    ['game-help.component.ts', '.help-screen'],
  ];

  it.each(opaque)('%s %s no desenfoca lo que tiene detrás', (file, selector) => {
    expect(ruleBody(read(file), selector)).not.toMatch(/backdrop-filter/);
  });

  // Bloque U1: el HUD es una placa de pixel opaca (penumbra y trama de la hoja común), no un degradado translúcido.
  it('el HUD es una placa opaca de la hoja común', () => {
    expect(read('simulation-hud.component.ts')).toContain('<div class="hud-strip u-placa u-sombra">');
  });

  it('se conservan los vidrios translúcidos a propósito', () => {
    const play = read('simulation-play.component.ts');
    expect(ruleBody(play, '.right-panel')).toContain('backdrop-filter: blur(18px) saturate(120%);');
    expect(ruleBody(play, '.overlay-backdrop')).toContain('backdrop-filter: blur(3px);');
  });
});
