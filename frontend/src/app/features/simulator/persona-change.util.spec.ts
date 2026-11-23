import { personaChangeAnnouncement } from './persona-change.util';

const p = (bond: 'WITHDRAWN' | 'GUARDED' | 'OPEN', activation: 'CALM' | 'TENSE' | 'CRISIS') => ({ bond, activation });

describe('personaChangeAnnouncement', () => {
  it('sin estado anterior (primera carga) no dice nada', () => {
    expect(personaChangeAnnouncement(null, p('GUARDED', 'TENSE'))).toBeNull();
    expect(personaChangeAnnouncement(undefined, p('GUARDED', 'TENSE'))).toBeNull();
    expect(personaChangeAnnouncement(p('GUARDED', 'TENSE'), undefined)).toBeNull();
  });

  it('sin cambio no dice nada', () => {
    expect(personaChangeAnnouncement(p('GUARDED', 'TENSE'), p('GUARDED', 'TENSE'))).toBeNull();
  });

  it('la activación baja: más tranquila; sube: más tensa', () => {
    expect(personaChangeAnnouncement(p('GUARDED', 'TENSE'), p('GUARDED', 'CALM'))).toBe('La persona se muestra más tranquila.');
    expect(personaChangeAnnouncement(p('GUARDED', 'CRISIS'), p('GUARDED', 'TENSE'))).toBe('La persona se muestra más tranquila.');
    expect(personaChangeAnnouncement(p('GUARDED', 'TENSE'), p('GUARDED', 'CRISIS'))).toBe('La persona se muestra más tensa.');
  });

  it('el vínculo mejora: se abre un poco más; empeora: se cierra', () => {
    expect(personaChangeAnnouncement(p('GUARDED', 'TENSE'), p('OPEN', 'TENSE'))).toBe('La persona se abre un poco más.');
    expect(personaChangeAnnouncement(p('GUARDED', 'TENSE'), p('WITHDRAWN', 'TENSE'))).toBe('La persona se cierra.');
  });

  it('si cambian las dos cosas, las dice en una sola frase', () => {
    expect(personaChangeAnnouncement(p('GUARDED', 'TENSE'), p('OPEN', 'CALM')))
      .toBe('La persona se muestra más tranquila y se abre un poco más.');
    expect(personaChangeAnnouncement(p('GUARDED', 'TENSE'), p('WITHDRAWN', 'CRISIS')))
      .toBe('La persona se muestra más tensa y se cierra.');
  });

  it('el texto no lleva cifras', () => {
    const frase = personaChangeAnnouncement(p('GUARDED', 'TENSE'), p('OPEN', 'CALM'))!;
    expect(frase).not.toMatch(/\d/);
  });
});
