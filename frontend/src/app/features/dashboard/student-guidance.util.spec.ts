import { Invitation } from '../../core/api/invitations.api';
import { CatalogItem } from '../../core/models/simulation.model';
import { SiguientePaso } from './student-dashboard.util';
import { confirmacionIngreso, guiaSinCasos, loSiguiente, motivoSinCasos } from './student-guidance.util';

const grupo = (extra: Partial<Invitation> = {}): Invitation => ({
  id: 1, groupId: 1, groupName: 'Grupo A', teacherName: 'Paula Ríos', invitedAt: null, status: 'ACTIVE', casesCount: 0, ...extra,
});
const pendiente = (extra: Partial<Invitation> = {}) => grupo({ status: 'INVITED', casesCount: null, ...extra });
const caso = (id = 1): CatalogItem => ({ caseVersionId: id, code: `C${id}`, title: `Caso ${id}`, description: '', order: id, unlocked: true, completed: false, locked: false });

describe('motivoSinCasos: por qué una persona no ve casos', () => {
  it('sin grupo y sin invitaciones: no está en ningún grupo', () => {
    expect(motivoSinCasos([])).toBe('sin-grupo');
  });

  it('una invitación rechazada no cuenta como grupo ni como pendiente', () => {
    expect(motivoSinCasos([grupo({ status: 'DECLINED', casesCount: null })])).toBe('sin-grupo');
  });

  it('con una invitación pendiente y sin casos en sus grupos: la invitación primero', () => {
    expect(motivoSinCasos([pendiente()])).toBe('invitacion-pendiente');
    expect(motivoSinCasos([pendiente(), grupo({ groupId: 2, id: 2 })])).toBe('invitacion-pendiente');
  });

  it('en un grupo del que el servidor dice que no tiene casos: grupo sin casos', () => {
    expect(motivoSinCasos([grupo()])).toBe('grupo-sin-casos');
    expect(motivoSinCasos([grupo(), grupo({ groupId: 2, id: 2, groupName: 'B' })])).toBe('grupo-sin-casos');
  });

  it('un dato que falta no se toma por cero: sin `casesCount` no se afirma que el grupo esté vacío', () => {
    expect(motivoSinCasos([grupo({ casesCount: undefined })])).toBe('sin-saber');
    expect(motivoSinCasos([grupo(), grupo({ groupId: 2, id: 2, casesCount: null })])).toBe('sin-saber');
  });

  it('un grupo con casos que no llegan al catálogo es «sin saber», no «grupo sin casos»', () => {
    expect(motivoSinCasos([grupo({ casesCount: 3 })])).toBe('sin-saber');
  });

  it('si las invitaciones no cargaron: sin saber', () => {
    expect(motivoSinCasos(null)).toBe('sin-saber');
  });
});

describe('guiaSinCasos: qué pasa, por qué y qué hacer', () => {
  it('sin grupo: explica que el docente asigna a su grupo y cómo conseguir la invitación', () => {
    const guia = guiaSinCasos([]);
    expect(guia.titulo).toBe('Todavía no estás en ningún grupo');
    expect(guia.texto).toContain('Los casos los asigna tu docente a tu grupo');
    expect(guia.texto).toContain('Pídele que te invite con tu correo');
    expect(guia.accion).toBe('Ir a Grupos');
  });

  it('una invitación pendiente se nombra con el docente y el grupo', () => {
    const guia = guiaSinCasos([pendiente()]);
    expect(guia.titulo).toBe('Tienes una invitación esperando');
    expect(guia.texto).toContain('Paula Ríos te invitó al grupo «Grupo A».');
    expect(guia.texto).toContain('acepta la invitación');
    expect(guia.accion).toBe('Ver la invitación');
  });

  it('varias invitaciones se cuentan y no se inventa un docente', () => {
    const guia = guiaSinCasos([pendiente(), pendiente({ groupId: 2, id: 2, teacherName: '' })]);
    expect(guia.titulo).toBe('Tienes 2 invitaciones esperando');
    expect(guia.texto).not.toContain('te invitó');
    expect(guia.accion).toBe('Ver las invitaciones');
  });

  it('una invitación sin nombre de docente no deja un hueco', () => {
    expect(guiaSinCasos([pendiente({ teacherName: '' })]).texto).toMatch(/^Los casos los asigna/);
  });

  it('grupo sin casos: nombra el grupo y al docente, dice cuándo aparecerán y a quién avisar', () => {
    const guia = guiaSinCasos([grupo()]);
    expect(guia.titulo).toBe('Tu grupo todavía no tiene casos');
    expect(guia.texto).toBe('«Grupo A» aún no tiene casos asignados. Los asigna tu docente, Paula Ríos, y aparecerán aquí cuando los abra. Si ya debería haber uno, avísale.');
  });

  it('varios grupos sin casos: los nombra todos, y con muchos los cuenta', () => {
    const dos = guiaSinCasos([grupo(), grupo({ groupId: 2, id: 2, groupName: 'Grupo B' })]);
    expect(dos.titulo).toBe('Tus grupos todavía no tienen casos');
    expect(dos.texto).toContain('«Grupo A» y «Grupo B» aún no tienen casos asignados.');
    const cuatro = guiaSinCasos([1, 2, 3, 4].map(n => grupo({ groupId: n, id: n, groupName: `G${n}` })));
    expect(cuatro.texto).toContain('Tus 4 grupos aún no tienen casos asignados.');
  });

  it('sin saber: no afirma el motivo, pero sí dice qué hacer', () => {
    const guia = guiaSinCasos(null);
    expect(guia.titulo).toBe('Aún no tienes casos asignados');
    expect(guia.texto).toContain('Si ya debería haber uno, avísale');
    expect(guia.texto).toContain('acéptala en Grupos');
  });

  it('ningún texto usa jerga ni dice lo que no sabe (sesión, cola, error, null)', () => {
    const todos = [[], [pendiente()], [grupo()], null].map(entrada => JSON.stringify(guiaSinCasos(entrada as Invitation[] | null)));
    for (const texto of todos) expect(texto).not.toMatch(/null|undefined|sesión|sesion|error|NaN/i);
  });
});

describe('confirmacionIngreso: tras aceptar una invitación', () => {
  it('con casos, dice cuántos y marca que ya hay algo que ver', () => {
    expect(confirmacionIngreso({ groupName: 'Grupo A', teacherName: 'Paula Ríos', casesCount: 3 })).toEqual({
      titulo: 'Ya estás en «Grupo A»',
      texto: 'Tu docente ya le asignó 3 casos a este grupo. Ya puedes verlos.',
      conCasos: true,
    });
  });

  it('sin casos, explica por qué y quién los asigna', () => {
    const c = confirmacionIngreso({ groupName: 'Grupo A', teacherName: 'Paula Ríos', casesCount: 0 });
    expect(c.conCasos).toBe(false);
    expect(c.texto).toBe('Este grupo todavía no tiene casos. Los asigna tu docente, Paula Ríos, y aparecerán en Casos cuando los abra. Si ya debería haber uno, avísale.');
  });

  it('sin el dato, no afirma que esté vacío', () => {
    for (const casesCount of [undefined, null]) {
      const c = confirmacionIngreso({ groupName: 'Grupo A', teacherName: 'Paula Ríos', casesCount });
      expect(c.conCasos).toBe(false);
      expect(c.texto).toBe('Los casos que tu docente asigne a este grupo aparecerán en Casos.');
    }
  });

  it('sin nombre de docente, la frase no deja comas sueltas', () => {
    expect(confirmacionIngreso({ groupName: 'G', teacherName: '  ', casesCount: 0 }).texto).toContain('Los asigna tu docente y aparecerán');
  });
});

describe('loSiguiente: la frase de arriba de Inicio', () => {
  const base = { escena: null, invitaciones: [] as Invitation[], pendientes: 0 };
  const paso = (tipo: SiguientePaso['tipo']): SiguientePaso => {
    const c = caso();
    const intento = { attemptId: 'a', caseVersionId: 1, caseTitle: 'Caso 1', status: 'PAUSED' as const, totalDurationSeconds: null, activeDurationSeconds: null, startedAt: '2026-09-01T10:00:00Z', endedAt: null };
    switch (tipo) {
      case 'continuar': return { tipo, caso: c, intento };
      case 'terminado': return { tipo, caso: c, intento: null };
      default: return { tipo, caso: c };
    }
  };

  it('continuar lo abierto, con la escena si se conoce', () => {
    expect(loSiguiente({ ...base, paso: paso('continuar'), escena: 'La sala' })).toEqual({ tipo: 'continuar', frase: 'Continúa «Caso 1». Retomas en La sala.' });
    expect(loSiguiente({ ...base, paso: paso('continuar') }).frase).toBe('Continúa «Caso 1». Retomas donde lo dejaste.');
  });

  it('empezar el caso listo', () => {
    expect(loSiguiente({ ...base, paso: paso('ficha') })).toEqual({ tipo: 'empezar', frase: 'Empieza «Caso 1»: es tu siguiente caso y ya está abierto.' });
  });

  it('una invitación pendiente no tapa lo que ya se puede trabajar', () => {
    expect(loSiguiente({ ...base, paso: paso('continuar'), pendientes: 1 }).tipo).toBe('continuar');
    expect(loSiguiente({ ...base, paso: paso('ficha'), pendientes: 2 }).tipo).toBe('empezar');
  });

  it('con nada que jugar, la invitación pendiente es lo siguiente (singular y plural)', () => {
    expect(loSiguiente({ ...base, paso: null, pendientes: 1 })).toEqual({ tipo: 'invitacion', frase: 'Acepta la invitación de tu docente para ver los casos de tu grupo.' });
    expect(loSiguiente({ ...base, paso: paso('espera'), pendientes: 2 }).frase).toBe('Acepta las invitaciones de tus docentes para ver los casos de tus grupos.');
    expect(loSiguiente({ ...base, paso: paso('terminado'), pendientes: 1 }).tipo).toBe('invitacion');
  });

  it('un caso que aún no está disponible: nada pendiente, sin decir por qué (eso lo dice la tarjeta)', () => {
    const { tipo, frase } = loSiguiente({ ...base, paso: paso('espera') });
    expect(tipo).toBe('esperar');
    expect(frase).toBe('Por ahora no tienes nada pendiente: «Caso 1» todavía no está disponible. Aquí verás cuándo se abre.');
  });

  it('todo terminado: nada pendiente', () => {
    expect(loSiguiente({ ...base, paso: paso('terminado') })).toEqual({ tipo: 'terminado', frase: 'Terminaste los casos asignados. Cuando tu docente asigne otro, aparecerá aquí.' });
  });

  it('sin casos, la frase cambia con el motivo', () => {
    expect(loSiguiente({ ...base, paso: null }).frase).toBe('Todavía no tienes casos: primero necesitas estar en un grupo de tu docente.');
    expect(loSiguiente({ ...base, paso: null, invitaciones: [grupo()] }).frase).toBe('Todavía no tienes casos: tu docente aún no los asigna a tu grupo.');
    expect(loSiguiente({ ...base, paso: null, invitaciones: null }).frase).toBe('Todavía no tienes casos asignados. Los asigna tu docente a tu grupo.');
  });
});
