import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { mapAgregarEstudianteError, mapGrupoError } from './grupo-error.utils';
import { GrupoService } from './grupo.service';

describe('contrato de errores de grupos', () => {
  it('traduce la falta de permiso comunicada como validación', () => {
    expect(mapAgregarEstudianteError({ status: 400, error: { code: 'VALIDATION_ERROR', message: 'No tiene permiso sobre este grupo' } })).toBe('No tienes permisos para modificar este grupo.');
  });
  it('prioriza el código y conserva otras validaciones', () => {
    expect(mapGrupoError({ status: 400, error: { code: 'NOT_FOUND', message: 'Otro texto' } }, 'Error')).toBe('El grupo ya no existe.');
    expect(mapAgregarEstudianteError({ status: 400, error: { code: 'VALIDATION_ERROR', message: 'Correo inválido' } })).toBe('Correo inválido');
  });
  it('no interpreta 409 como pertenencia al grupo', () => {
    expect(mapAgregarEstudianteError({ status: 409, error: {} })).toBe('No fue posible enviar la invitación. Intenta nuevamente.');
  });
});

describe('GrupoService', () => {
  it('conserva el grupo y el mensaje del servidor al invitar', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const grupo = { id: 1, nombre: 'A', codigo: 'A', totalEstudiantes: 0 };
    let result: unknown;
    TestBed.inject(GrupoService).agregarEstudiante(1, 'a@example.com').subscribe(value => result = value);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/grupos/1/estudiantes').flush({ success: true, data: grupo, message: 'Mensaje del servidor' });
    expect(result).toEqual({ grupo, message: 'Mensaje del servidor' });
    http.verify();
  });
});
