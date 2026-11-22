import { readFileSync } from 'fs';
import { join } from 'path';

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf-8');
}

describe('portal: feedback de acciones', () => {
  const users = source('users.component.ts');
  // La plantilla vive en su propio archivo desde F7-2: el contrato mira la clase y la plantilla juntas.
  const grupos = source('../grupos/grupo-list.component.ts') + source('../grupos/grupo-list.component.html');

  it('Usuarios avisa el éxito con un aviso que no se borra', () => {
    expect(users).toContain("this.notify.success(selected ? 'La información se guardó correctamente.' : 'Usuario creado correctamente.');");
    expect(users).not.toContain("this.message.set(selected ? 'La información se guardó correctamente.'");
  });

  it('Usuarios confirma el cambio de estado con el diálogo de la biblioteca y avisa si falla', () => {
    expect(users).not.toContain('app-confirm-dialog');
    expect(users).not.toContain('statusConfirmTarget');
    expect(users).toContain('this.dialog.confirm({');
    expect(users).toContain("apiErrorMessage(err, 'No fue posible actualizar el estado del usuario.')");
  });

  it('Grupos ya no usa window.confirm ni el diálogo antiguo: confirma con el diálogo de la biblioteca', () => {
    expect(grupos).not.toMatch(/\bconfirm\(`/);
    expect(grupos).not.toContain('app-confirm-dialog');
    expect(grupos).not.toContain('pendingConfirm');
    expect(grupos).toContain('this.dialog.confirm(options)');
    expect(grupos).toContain("tone: 'danger'");
  });

  it('Usuarios avisa el resultado de descartar una solicitud', () => {
    expect(users).toContain("this.notify.success('Solicitud descartada.');");
    expect(users).not.toContain("this.message.set('Solicitud descartada.')");
    expect(users).toContain("apiErrorMessage(err, 'No fue posible actualizar la solicitud.')");
  });

  it('Grupos avisa crear, editar, borrar y copiar', () => {
    for (const text of ['Grupo creado.', 'Grupo actualizado.', 'Grupo eliminado.']) {
      expect(grupos).toContain(`this.notify.success('${text}')`);
    }
    expect(grupos).toContain('this.notify.success(`Código ${grupo.codigo} copiado al portapapeles.`)');
  });


});
