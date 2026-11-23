import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { AvatarStore } from './avatar.store';
import { confirmLeaveEditor } from './leave-editor';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } as unknown as Storage;
}

/** Salir del editor con cambios sin guardar pregunta (plan visual F5-4); al salir sin guardar, el avatar vuelve a lo guardado. */
// req: BLOQUE-H
describe('confirmLeaveEditor', () => {
  let store: AvatarStore;
  let consequence: ReturnType<typeof vi.fn>;
  const leave = () => confirmLeaveEditor(store, { consequence } as unknown as UiDialog);

  beforeEach(() => {
    store = new AvatarStore(memoryStorage());
    consequence = vi.fn();
  });

  it('sin cambios deja salir sin preguntar', async () => {
    expect(await leave()).toBe(true);
    expect(consequence).not.toHaveBeenCalled();
  });

  it('con cambios pregunta nombrando lo que se pierde; «Seguir editando» se queda y conserva el cambio', async () => {
    store.set({ schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: true });
    consequence.mockResolvedValue('continue');
    expect(await leave()).toBe(false);
    expect(consequence).toHaveBeenCalledWith({
      title: 'Tienes cambios sin guardar',
      consequence: 'Si sales ahora, tu personaje vuelve a como lo guardaste.',
      continueLabel: 'Seguir editando',
      proceedLabel: 'Salir sin guardar',
    });
    expect(store.dirty()).toBe(true);
  });

  it('«Salir sin guardar» deja salir y el avatar vuelve a lo guardado (la sala no ve lo no guardado)', async () => {
    store.set({ schemaVersion: 2, mode: 'elenco', recipeId: 'luisa', bata: true });
    consequence.mockResolvedValue('proceed');
    expect(await leave()).toBe(true);
    expect(store.dirty()).toBe(false);
    expect(store.avatar()).toMatchObject({ recipeId: 'valentina' });
  });
});
