export interface AgregarEstudianteHttpError {
  status: number;
  error?: { code?: string; message?: string } | null;
}

export function mapGrupoError(err: AgregarEstudianteHttpError, fallback: string): string {
  const code = err.error?.code;
  const message = typeof err.error?.message === 'string' ? err.error.message.trim() : '';
  if (code === 'FORBIDDEN' || (!code && err.status === 403)) return 'No tienes permisos para modificar este grupo.';
  if (code === 'NOT_FOUND' || (!code && err.status === 404)) return 'El grupo ya no existe.';
  if ((code === 'VALIDATION_ERROR' || (!code && err.status === 400)) && message === 'No tiene permiso sobre este grupo') {
    return 'No tienes permisos para modificar este grupo.';
  }
  if (err.status === 400 && message) return message;
  return fallback;
}

export function mapAgregarEstudianteError(err: AgregarEstudianteHttpError): string {
  return mapGrupoError(err, 'No fue posible enviar la invitación. Intenta nuevamente.');
}
