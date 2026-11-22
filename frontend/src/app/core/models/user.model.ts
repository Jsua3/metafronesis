export interface User {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  role: 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE';
  activo?: boolean;
  /** E2-9: entró con una contraseña temporal y el servidor le niega todo hasta cambiarla. */
  mustChangePassword?: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}
