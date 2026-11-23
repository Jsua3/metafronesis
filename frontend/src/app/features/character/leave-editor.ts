import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { AvatarStore } from './avatar.store';

/**
 * Salir del editor con cambios sin guardar (plan visual F5-4): se pregunta nombrando lo que se pierde, con «Seguir
 * editando» como acción segura por defecto. Al salir sin guardar, el avatar vuelve a lo guardado: la sala y el juego
 * nunca ven un personaje que no se guardó. Vive con el editor (perezoso): la ruta solo lleva `canLeaveGuard`.
 */
export async function confirmLeaveEditor(store: AvatarStore, dialog: UiDialog): Promise<boolean> {
  if (!store.dirty()) return true;
  const answer = await dialog.consequence({
    title: 'Tienes cambios sin guardar',
    consequence: 'Si sales ahora, tu personaje vuelve a como lo guardaste.',
    continueLabel: 'Seguir editando',
    proceedLabel: 'Salir sin guardar',
  });
  if (answer !== 'proceed') return false;
  store.revert();
  return true;
}
