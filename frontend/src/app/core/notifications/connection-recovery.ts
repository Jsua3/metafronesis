import { CONNECTION_MESSAGE } from '../auth/http-error-chain';
import { NotificationService } from './notification.service';

/**
 * Retira el aviso «No fue posible conectar…» en cuanto el navegador dice que volvió la red (evento `online`), sin
 * esperar a que una petición lo confirme. Devuelve la función que quita la escucha. La otra vía de retiro es la primera
 * respuesta correcta, en `jwtInterceptor`.
 */
export function watchConnectionRecovery(
  notifications: Pick<NotificationService, 'dismissMatching'>,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onOnline = () => notifications.dismissMatching('error', CONNECTION_MESSAGE);
  target.addEventListener('online', onOnline);
  return () => target.removeEventListener('online', onOnline);
}
