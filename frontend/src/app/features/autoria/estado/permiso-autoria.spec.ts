import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { mensajeDeCarga, mensajeDeFallo } from './caso.store';
describe('permiso de autoría', () => {
  it('explica cómo solicitar el permiso cuando el servidor lo exige', () => {
    const error = new HttpErrorResponse({ status: 403, error: { code: 'AUTHORING_NOT_ALLOWED' } });
    expect(mensajeDeCarga(error)).toContain('Pídeselo a la administración');
    expect(mensajeDeFallo(error, 'guardar')).toContain('Pídeselo a la administración');
  });
});
