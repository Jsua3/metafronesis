import { existsSync } from 'fs';
import { join } from 'path';

import { testKitBundle } from '../character/kit/testing/kit-testing';
import { isSystemVoice, resolvePortraitAsset, type DialoguePortraitKeys } from './portrait-resolver.util';

const bundle = testKitBundle();
const png = (path: string) => `/assets/characters/kit/${path}.png`;
const KIT_DIR = join(__dirname, '../../../assets/characters/kit');

describe('resolvePortraitAsset (kit)', () => {
  it.each([
    ['hablante del seed', { speakerName: 'Abuela de la niña', emotion: 'neutral' }, png('abuela-familia/portrait-neutral')],
    ['la emoción vulnerable es preocupada', { speakerName: 'Sobreviviente (22 años)', emotion: 'vulnerable' }, png('sobreviviente/portrait-preocupada')],
    ['un portraitKey legado', { portraitKey: 'escucha-segura', emotion: 'danger' }, png('sobreviviente/portrait-triste')],
    ['una voz sin cuerpo no tiene retrato', { speakerName: 'Supervisión clínica', emotion: 'danger' }, null],
    ['un NPC de escenario que se llama como una voz', { recipeId: 'supervisor-clinico', speakerName: 'Supervisión clínica', emotion: 'positive' }, png('supervisor-clinico/portrait-alegre')],
    ['un hablante desconocido', { speakerName: 'Nadie' }, null],
  ])('%s', (_name, keys, expected) => {
    expect(resolvePortraitAsset(bundle, keys)).toBe(expected);
  });

  it('sin paquete del kit todavía, la silueta', () => {
    expect(resolvePortraitAsset(null, { speakerName: 'Abuela de la niña' })).toBeNull();
  });
});

describe('resolvePortraitAsset: solo retratos que existen y sin sonrisa en el duelo (T4.6, F§7.11)', () => {
  /**
   * Las personas en duelo del caso y cada ruta por la que el juego llega a su retrato: el nombre del hablante, la clave
   * del NPC o del retrato del diálogo y la receta. Son la Abuela, la Sobreviviente y los tres familiares de los
   * escenarios de Urgencias y Comisaría («Madre de la consultante», «Madre de la sobreviviente», «Familiar de la
   * víctima»), que comparten la receta `madre-acompanante`.
   */
  const GRIEVING: ReadonlyArray<{ recipe: string; keys: DialoguePortraitKeys }> = [
    { recipe: 'abuela-familia', keys: { speakerName: 'Abuela de la niña' } },
    { recipe: 'abuela-familia', keys: { portraitKey: 'familia-crisis' } },
    { recipe: 'abuela-familia', keys: { portraitKey: 'familia-duelo' } },
    { recipe: 'abuela-familia', keys: { recipeId: 'abuela-familia' } },
    { recipe: 'sobreviviente', keys: { speakerName: 'Sobreviviente (22 años)' } },
    { recipe: 'sobreviviente', keys: { speakerName: 'Consultante' } },
    { recipe: 'sobreviviente', keys: { portraitKey: 'escucha-segura' } },
    { recipe: 'sobreviviente', keys: { portraitKey: 'sobreviviente-consulta' } },
    { recipe: 'sobreviviente', keys: { portraitKey: 'sobreviviente-espera' } },
    { recipe: 'sobreviviente', keys: { recipeId: 'sobreviviente' } },
    { recipe: 'madre-acompanante', keys: { portraitKey: 'madre-acompanante' } },
    { recipe: 'madre-acompanante', keys: { recipeId: 'madre-acompanante' } },
  ];
  const EMOTIONS = [
    'neutral', 'vulnerable', 'concerned', 'danger', 'positive', 'anxious', 'negative',
    'sad', 'relieved', 'calm', 'worried', 'receptive', 'closed', 'happy', 'alerta', '', 'algo-raro', null, undefined,
  ];

  it('todo retrato devuelto existe en frontend/src/assets/characters/kit/', () => {
    const people: DialoguePortraitKeys[] = [
      ...GRIEVING.map(route => route.keys),
      { speakerName: 'Psicóloga hospitalaria' },
      { speakerName: 'Funcionaria de recepción' },
    ];
    for (const keys of people) {
      for (const emotion of EMOTIONS) {
        const asset = resolvePortraitAsset(bundle, { ...keys, emotion });
        expect(asset).not.toBeNull();
        expect(existsSync(join(KIT_DIR, asset!.replace('/assets/characters/kit/', '')))).toBe(true);
      }
    }
  });

  it('alias de F§7.11 y emociones de consecuencias futuras: anxious y worried → preocupada, negative y sad → triste, el resto → neutral', () => {
    const faces = (emotion: string) => resolvePortraitAsset(bundle, { speakerName: 'Psicóloga hospitalaria', emotion });
    expect(faces('anxious')).toBe(png('psicologa-hospitalaria/portrait-preocupada'));
    expect(faces('worried')).toBe(png('psicologa-hospitalaria/portrait-preocupada'));
    expect(faces('negative')).toBe(png('psicologa-hospitalaria/portrait-triste'));
    expect(faces('sad')).toBe(png('psicologa-hospitalaria/portrait-triste'));
    for (const calm of ['relieved', 'calm', 'receptive', 'closed']) {
      expect(faces(calm)).toBe(png('psicologa-hospitalaria/portrait-neutral'));
    }
  });

  it('positive y happy nunca sonríen a la familia ni a la Sobreviviente, por ninguna de las rutas que llevan a ellas (sin sonrisa en el duelo)', () => {
    for (const { recipe, keys } of GRIEVING) {
      for (const emotion of EMOTIONS) {
        expect(resolvePortraitAsset(bundle, { ...keys, emotion }), `${JSON.stringify(keys)} con «${emotion}»`)
          .not.toMatch(/portrait-alegre/);
      }
      for (const emotion of ['positive', 'happy']) {
        expect(resolvePortraitAsset(bundle, { ...keys, emotion }), `${JSON.stringify(keys)} con «${emotion}»`)
          .toBe(png(`${recipe}/portrait-neutral`));
      }
    }
  });

  it('la sonrisa de la Psicóloga hospitalaria (positive → alegre) se conserva', () => {
    expect(resolvePortraitAsset(bundle, { speakerName: 'Psicóloga hospitalaria', emotion: 'positive' }))
      .toBe(png('psicologa-hospitalaria/portrait-alegre'));
  });
});

describe('isSystemVoice: solo las voces del sistema conservan la señal de emoción (T4.6)', () => {
  it('Supervisión clínica, Criterio profesional y Herramienta profesional son voces de sistema', () => {
    expect(isSystemVoice('Supervisión clínica')).toBe(true);
    expect(isSystemVoice('Criterio profesional')).toBe(true);
    expect(isSystemVoice('Herramienta profesional')).toBe(true);
    expect(isSystemVoice('Intervención')).toBe(true);
    expect(isSystemVoice('')).toBe(true);
    expect(isSystemVoice(null)).toBe(true);
  });

  it('las personas (con o sin retrato) no son voces de sistema', () => {
    for (const person of ['Abuela de la niña', 'Consultante', 'Enfermera de urgencias', 'Psicóloga hospitalaria', 'Profesional psicosocial']) {
      expect(isSystemVoice(person)).toBe(false);
    }
  });
});

