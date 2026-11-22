import { readFileSync } from 'fs';
import { join } from 'path';

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf-8');
}

describe('formularios: validar al enviar — Usuarios', () => {
  // Desde F7-6 el formulario vive en una hoja (`user-form-sheet`); la pantalla es dueña de su validación y de guardar.
  const users = source('users.component.ts');
  const sheet = source('user-form-sheet.component.ts');

  it('el botón solo se bloquea mientras guarda (y lo dice con «Guardando…»)', () => {
    expect(users + sheet).not.toContain('[disabled]="form.invalid || saving()"');
    expect(sheet).toContain('type="submit" icon="save" [loading]="host.saving()"');
  });

  it('cada campo explica su error', () => {
    for (const text of ['Escribe el nombre.', 'Escribe el apellido.', 'Escribe el correo.', 'Escribe un correo válido.', 'Elige un rol.', 'La contraseña es obligatoria al crear un usuario.', 'Usa al menos 10 caracteres.']) {
      expect(sheet).toContain(text);
    }
    expect(sheet).toContain('hint="Mínimo 10 caracteres."');
  });

  it('la contraseña se valida con validadores según crear/editar', () => {
    expect(users).toContain('private setPasswordRules(creating: boolean): void {');
    expect(users).not.toContain("this.error.set('La contraseña es obligatoria al crear usuarios.');");
    expect(users).toContain('focusFirstInvalid(this.sheetElement() ?? this.host.nativeElement);');
  });
});

