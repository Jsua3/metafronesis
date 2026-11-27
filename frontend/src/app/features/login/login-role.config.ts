export type LoginRole = 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN';

export interface LoginRoleOption {
  id: LoginRole;
  label: string;
  icon: string;
  emailPlaceholder: string;
  hint: string;
  narrative: string;
  /** Retrato del kit del simulador: el mismo que la tarjeta de este rol en la portada («Roles en el sistema»). */
  avatar: string;
}

const RETRATO = (ruta: string) => `assets/characters/kit/${ruta}/portrait-alegre.png`;

export const LOGIN_ROLES: LoginRoleOption[] = [
  {
    id: 'ESTUDIANTE',
    label: 'Estudiante',
    icon: 'school',
    emailPlaceholder: 'estudiante@institucion.edu.co',
    hint: 'Revisa las invitaciones de tus docentes y entra a sus grupos.',
    narrative:
      'Entrena decisiones en casos de VBG, feminicidio, NNA y rutas de protección con retroalimentación formativa.',
    avatar: RETRATO('camila/bata'),
  },
  {
    id: 'PROFESOR',
    label: 'Docente',
    icon: 'co_present',
    emailPlaceholder: 'docente@institucion.edu.co',
    hint: 'Crea grupos e invita a tus estudiantes, uno a uno o desde Excel.',
    narrative:
      'Supervisa intentos, evalúa competencias y acompaña el aprendizaje con evidencia clínica trazable.',
    avatar: RETRATO('sebas'),
  },
  {
    id: 'ADMIN',
    label: 'Administrador',
    icon: 'admin_panel_settings',
    emailPlaceholder: 'admin@institucion.edu.co',
    hint: 'Administra las cuentas, aprueba las solicitudes de acceso y asigna roles.',
    narrative:
      'Configura la plataforma, publica versiones de casos y garantiza el acceso seguro por rol.',
    avatar: RETRATO('funcionaria-recepcion'),
  },
];

export function findLoginRole(id: LoginRole): LoginRoleOption {
  return LOGIN_ROLES.find(role => role.id === id) ?? LOGIN_ROLES[0];
}
