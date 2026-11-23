import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

describe('simulation-play: game feel del bloque B', () => {
  it('el mundo recibe la activación de la persona y la intensidad de la escena', () => {
    expect(source).toContain("[activation]=\"attempt()?.persona?.activation ?? 'CALM'\"");
    expect(source).toContain("[intensity]=\"attempt()?.currentNode?.intensity ?? 'MEDIUM'\"");
    expect(source).not.toMatch(/stressLevel|stressIndex/);
  });

  it('el destello de sala espera a que el fundido de escena deje ver el mundo, sin clasificación (RN-08)', () => {
    expect(source).not.toContain('pendingDecisionImpact');
    expect(source).toMatch(/window\.setTimeout\(\(\) => \{\s*this\.fadeActive\.set\(false\);\s*this\.scheduleRevealEffects\(\);\s*\}, WORLD_REVEAL_DELAY_MS\);/);
    expect(source).toContain('const WORLD_REVEAL_DELAY_MS = 80;');
    expect(source).toMatch(/private scheduleRevealEffects\(\): void \{\s*window\.setTimeout\(\(\) => this\.playRevealEffects\(\), SCENE_FADE_MS\);\s*\}/);
    expect(source).toMatch(/private playRevealEffects\(\): void \{\s*this\.gameWorld\?\.playRevealEffects\(\);\s*\}/);
  });

  it('la espera coincide con la transición CSS del fundido de escena', () => {
    expect(source).toContain('const SCENE_FADE_MS = 320;');
    expect(source).toMatch(/\.scene-fade \{[^}]*transition: opacity 320ms ease;/);
  });

  it('la consecuencia se abre al terminar la reacción (sin la espera de 400 ms) y lo que se lee sale de la consecuencia, no del feedback', () => {
    expect(source).toContain('if (consequence) this.dialogue.set(consequence);');
    expect(source).not.toContain('SUPERVISION_DELAY_MS');
    expect(source).not.toContain('updated.feedback');
  });

  it('la espera del fundido tiene su propia constante y no reutiliza la transición CSS', () => {
    expect(source).toContain('const FADE_OUT_MS = 340;');
    expect(source).toContain('window.setTimeout(callback, FADE_OUT_MS);');
    expect(source).not.toContain('window.setTimeout(callback, SCENE_FADE_MS);');
  });
});
