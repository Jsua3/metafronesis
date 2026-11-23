import { statSync } from 'fs';
import { join } from 'path';

const audioBytes = (name: string) =>
  statSync(join(__dirname, '../../../assets/game/audio', name)).size;

describe('presupuesto del audio largo', () => {
  it.each(['PsicoLament.mp3', 'Musica_PsicoGame.mp3'])('%s pesa menos de 2,8 MB (128 kbps)', name => {
    expect(audioBytes(name)).toBeLessThan(2_800_000);
  });
});
