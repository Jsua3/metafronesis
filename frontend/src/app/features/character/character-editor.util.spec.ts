import { AvatarPersonalizado, defaultAvatarV2, defaultPersonalizado } from './kit/avatar-v2';
import { avatarSummary, chooseElenco, choosePersonalizado, toggleAccessory, withBata, withCustom } from './character-editor.util';

const custom: AvatarPersonalizado = { ...defaultPersonalizado(), hair: 'trenza', skin: 'piel-5' };

describe('character-editor.util', () => {
  it('la bata es un solo interruptor que sobrevive al cambio de modo (decisión 17)', () => {
    const conBata = withBata(defaultAvatarV2(), true);
    expect(chooseElenco(conBata, 'jorge')).toEqual({ schemaVersion: 2, mode: 'elenco', recipeId: 'jorge', bata: true });
    expect(choosePersonalizado(conBata, null)).toEqual({ ...defaultPersonalizado(), bata: true });
    expect(choosePersonalizado(withBata(defaultAvatarV2(), false), custom)).toEqual({ ...custom, bata: false });
  });

  it('pasar al personalizado estando en él no cambia nada', () => {
    expect(choosePersonalizado(custom, null)).toBe(custom);
  });

  it('los cambios del personalizado se validan', () => {
    expect(withCustom(custom, { hair: 'afro' }).hair).toBe('afro');
    expect(withCustom(custom, { hair: 'cresta' as never }).hair).toBe('corto-liso');
  });

  it('accesorios: se agregan y se quitan, en el orden del editor', () => {
    const conGafete = toggleAccessory(custom, 'gafete');
    expect(conGafete.accessories).toEqual(['gafete']);
    expect(toggleAccessory(conGafete, 'gafas').accessories).toEqual(['gafas', 'gafete']);
    expect(toggleAccessory(conGafete, 'gafete').accessories).toEqual([]);
  });

  it('resumen para lectores de pantalla', () => {
    const label = (id: string) => ({ jorge: 'Jorge' } as Record<string, string>)[id] ?? id;
    expect(avatarSummary({ schemaVersion: 2, mode: 'elenco', recipeId: 'jorge', bata: true }, label)).toBe('Jorge, del elenco, con bata.');
    expect(avatarSummary({ ...custom, bata: false }, label)).toBe('Avatar personalizado: complexión A, tono 5, trenza negro, sin bata.');
  });
});
