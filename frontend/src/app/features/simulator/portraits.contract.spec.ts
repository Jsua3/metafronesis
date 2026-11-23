import { readFileSync } from 'fs';
import { join } from 'path';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf-8').replace(/\r\n/g, '\n');
const dialogue = read('dialogue-panel.component.ts');
const outcome = read('attempt-outcome.component.ts');
const play = read('simulation-play.component.ts');

describe('retratos a escala entera (spec §8.2-8.3)', () => {
  it('el diálogo muestra el retrato a ×3 (96 px) sin object-fit que lo encoja', () => {
    expect(dialogue).toContain('<img class="portrait-img" [src]="src" alt="" width="96" height="96"');
    expect(dialogue).not.toMatch(/object-fit/);
    expect(dialogue).toContain('resolvePortraitAsset(this.kit.bundle(), {');
  });

  it('el diálogo de un NPC de escenario lleva su receta', () => {
    expect(play).toMatch(/key: `npc-\$\{npc\.key\}`,[\s\S]{0,80}recipeId: npc\.recipeId,/);
  });

  it('el resultado muestra el retrato neutral del jugador a ×3', () => {
    expect(outcome).toContain('<app-kit-figure [visual]="playerVisual()" portrait="neutral" [scale]="3" />');
    expect(outcome).not.toMatch(/app-avatar-figure|AvatarFigureComponent/);
  });
});
