import { LoginRole } from './login-role.config';

export interface DemoCredentials {
  email: string;
  password: string;
}

/**
 * Credenciales de la semilla de desarrollo (`bootstrap_dev_db`) para «Usar demo». SOLO DESARROLLO (RNF-01, VD-22;
 * plan visual F4-2): el acceso lo carga con `import()` dentro de `ngDevMode`, que el build de producción pliega a
 * `false`, así que este módulo no se emite; `check-dist-dev-only` falla si alguna de estas cadenas llega al dist.
 */
export const LOGIN_DEMO_CREDENTIALS: Readonly<Record<LoginRole, DemoCredentials>> = {
  ESTUDIANTE: { email: 'estudiante@psychosim.edu.co', password: 'Estudiante123!' },
  PROFESOR: { email: 'profesora@psychosim.edu.co', password: 'Profesor123!' },
  ADMIN: { email: 'admin@psychosim.edu.co', password: 'Admin123!' },
};
