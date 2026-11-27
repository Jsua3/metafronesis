import { findLoginRole, LOGIN_ROLES } from './login-role.config';

describe('textos de acceso', () => {
  it('describe las funciones disponibles para cada rol', () => {
    expect(findLoginRole('ESTUDIANTE').hint).toBe('Revisa las invitaciones de tus docentes y entra a sus grupos.');
    expect(findLoginRole('PROFESOR').hint).toBe('Crea grupos e invita a tus estudiantes, uno a uno o desde Excel.');
    expect(findLoginRole('ADMIN').hint).toBe('Administra las cuentas, aprueba las solicitudes de acceso y asigna roles.');
  });
  it('los roles ya no definen escenas de vista previa', () => {
    for (const rol of LOGIN_ROLES) {
      expect(rol).not.toHaveProperty('previewCase');
      expect(rol).not.toHaveProperty('previewScene');
    }
  });

});
