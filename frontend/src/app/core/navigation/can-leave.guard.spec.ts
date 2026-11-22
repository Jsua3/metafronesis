import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

import { canLeaveGuard } from './can-leave.guard';

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

// req: BLOQUE-H (aviso de cambios sin guardar, plan visual F5-4)
describe('canLeaveGuard', () => {
  it('le pregunta a la pantalla y respeta su respuesta (también asíncrona)', async () => {
    expect(canLeaveGuard({ canLeave: () => false }, route, state, state)).toBe(false);
    expect(await canLeaveGuard({ canLeave: () => Promise.resolve(true) }, route, state, state)).toBe(true);
  });

  it('una pantalla que no sabe de esto (o ninguna) deja salir', () => {
    expect(canLeaveGuard({}, route, state, state)).toBe(true);
    expect(canLeaveGuard(null, route, state, state)).toBe(true);
  });
});
