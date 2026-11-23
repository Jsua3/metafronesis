import { signal } from '@angular/core';

import { AuthService } from '../../../core/auth/auth.service';
import type { User } from '../../../core/models/user.model';

/** La docente de las pruebas del editor: la barra del marco muestra su nombre y su rol junto al menú de la cuenta. */
export const DOCENTE_DE_PRUEBA = { id: 7, nombre: 'Marta', apellido: 'Ríos', email: 'marta@example.test', role: 'PROFESOR' } as User;

/** Reemplaza al servicio de sesión (que pide HttpClient) en las pruebas que montan el marco del editor. */
export const cuentaDePrueba = { provide: AuthService, useValue: { currentUser: signal(DOCENTE_DE_PRUEBA), logout: () => undefined } };
