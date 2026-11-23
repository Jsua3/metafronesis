import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { MUSIC_CUES, MUSIC_FILES } from './music-cues.config';

const root = join(__dirname, '../../../');
const bytes = (file: string) => statSync(join(root, file)).size;

/**
 * Reparto de la música (music-cues.config.ts): cada pista del reparto existe, es un MP3 y cabe en el mismo presupuesto que
 * las pistas largas anteriores (menos de 2,8 MB: se transmiten con HTML5 y, en iOS, se decodifican enteras).
 */
describe('música: reparto de las cinco piezas', () => {
  it('el reparto usa las cinco piezas, cada una una sola vez', () => {
    expect(MUSIC_FILES).toHaveLength(5);
    expect(new Set(MUSIC_FILES).size).toBe(5);
    expect(MUSIC_CUES.ambient.length).toBeGreaterThan(1);
    expect(MUSIC_CUES.ambient).not.toContain(MUSIC_CUES.intro);
    expect(MUSIC_CUES.ambient).not.toContain(MUSIC_CUES.resolution);
  });

  it.each(MUSIC_FILES)('%s existe, es un MP3 y pesa menos de 2,8 MB (112 kbps)', file => {
    expect(existsSync(join(root, file))).toBe(true);
    expect(file.endsWith('.mp3')).toBe(true);
    expect(bytes(file)).toBeLessThan(2_800_000);
    // Una pista de 3 minutos a 112 kbps pesa ~2,5 MB: mucho menos sería otra pista, mucho más rompe el presupuesto.
    expect(bytes(file)).toBeGreaterThan(2_000_000);
    const head = readFileSync(join(root, file)).subarray(0, 3);
    const isId3 = head.toString('latin1') === 'ID3';
    const isFrameSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
    expect(isId3 || isFrameSync).toBe(true);
  });

  it('el director usa el reparto y ya no apunta a las pistas anteriores', () => {
    const source = readFileSync(join(__dirname, 'audio-director.service.ts'), 'utf-8');
    expect(source).toContain("from './music-cues.config'");
    expect(source).not.toMatch(/Musica_PsicoGame|PsicoLament\.mp3/);
  });
});
