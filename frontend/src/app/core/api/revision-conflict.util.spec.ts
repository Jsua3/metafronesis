import { HttpErrorResponse } from '@angular/common/http';

import { revisionConflictOf } from './revision-conflict.util';

/**
 * El 409 de la autoría (E2-6): `{ success: false, code: 'REVISION_CONFLICT', message, revision, current }` con la
 * revisión actual del servidor y el editor completo (`current`) para mostrar qué cambió y recargar sin otra petición.
 * Es el MISMO para el editor de casos y para el guardado del mundo.
 */
// req: RNF-08, REGLA-011, SIEP-RN-05
describe('revisionConflictOf', () => {
  const conflict = (error: unknown, status = 409) => new HttpErrorResponse({ status, error });

  it('reconoce el 409 REVISION_CONFLICT y trae la revisión actual y el editor vigente', () => {
    const current = { caseVersionId: 9, revision: 12, title: 'Caso' };
    const found = revisionConflictOf(conflict({
      success: false, code: 'REVISION_CONFLICT', message: 'Este caso fue modificado en otra sesión.', revision: 12, current,
    }));
    expect(found).toEqual({ revision: 12, current, message: 'Este caso fue modificado en otra sesión.' });
  });

  it('sin `current` (un cliente viejo o un cuerpo recortado) sigue siendo un conflicto, con el editor en null', () => {
    const found = revisionConflictOf(conflict({ code: 'REVISION_CONFLICT', message: 'x', revision: 3 }));
    expect(found).toEqual({ revision: 3, current: null, message: 'x' });
  });

  it('un 409 de otra cosa (INVALID_TRANSITION, ATTEMPT_ALREADY_OPEN…) no es un conflicto de revisión', () => {
    expect(revisionConflictOf(conflict({ code: 'INVALID_TRANSITION', message: 'x' }))).toBeNull();
    expect(revisionConflictOf(conflict({ message: 'sin código' }))).toBeNull();
  });

  it('otros estados y lo que no es una respuesta HTTP no son conflictos', () => {
    expect(revisionConflictOf(conflict({ code: 'REVISION_CONFLICT' }, 400))).toBeNull();
    expect(revisionConflictOf(conflict({ code: 'REVISION_CONFLICT' }, 500))).toBeNull();
    expect(revisionConflictOf(new Error('x'))).toBeNull();
    expect(revisionConflictOf(null)).toBeNull();
    expect(revisionConflictOf({ status: 409, error: { code: 'REVISION_CONFLICT' } })).toBeNull();
  });

  it('un cuerpo que no es un objeto no rompe la lectura', () => {
    expect(revisionConflictOf(conflict('texto', 409))).toBeNull();
    expect(revisionConflictOf(conflict(null, 409))).toBeNull();
  });
});
