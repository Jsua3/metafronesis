import {
  evaluationStatusLabel, invitationLabel, membershipLabel, objectTypeLabel, plural, roleLabel, statusLabel, statusTone,
} from './labels';

/** Plan visual §2.10: una sola tabla de etiquetas; nunca un enum crudo ni una clave técnica en pantalla. */
describe('labels: etiquetas humanas', () => {
  it('traduce los roles a su nombre en español', () => {
    expect(roleLabel('ADMIN')).toBe('Administrador');
    expect(roleLabel('PROFESOR')).toBe('Docente');
    expect(roleLabel('ESTUDIANTE')).toBe('Estudiante');
    expect(roleLabel(undefined)).toBe('Sin rol');
  });

  it('traduce los estados de caso y de intento con los textos que ya ven las personas', () => {
    expect(statusLabel('PUBLISHED')).toBe('Publicado');
    expect(statusLabel('DRAFT')).toBe('Borrador');
    expect(statusLabel('IN_REVIEW')).toBe('En revisión');
    expect(statusLabel('ARCHIVED')).toBe('Archivado');
    expect(statusLabel('COMPLETED')).toBe('Finalizado');
    expect(statusLabel('PAUSED')).toBe('En pausa (reanudable)');
    expect(statusLabel('SAFE_EXITED')).toBe('Cerrado con salida segura');
    expect(statusLabel('REPLACED')).toBe('Reemplazado por un intento nuevo');
    expect(statusLabel('IN_PROGRESS')).toBe('En curso');
    expect(statusLabel('PENDING')).toBe('Pendiente');
    expect(statusLabel('in_progress')).toBe('En curso');
  });

  it('un estado vacío dice «Sin estado» y uno desconocido no se muestra como enum crudo', () => {
    expect(statusLabel(null)).toBe('Sin estado');
    expect(statusLabel('')).toBe('Sin estado');
    expect(statusLabel('WAITING_FOR_REVIEW')).toBe('Waiting for review');
  });

  it('traduce los tipos de objeto del mundo', () => {
    expect(objectTypeLabel('PERSON')).toBe('Persona');
    expect(objectTypeLabel('EXIT')).toBe('Salida');
    expect(objectTypeLabel('TOOL')).toBe('Herramienta');
    expect(objectTypeLabel('TOOL_TARGET')).toBe('Objetivo de herramienta');
    expect(objectTypeLabel('OBJECT')).toBe('Objeto');
  });

  // req: SIEP-RF-04, D-14 (E2-10: membresías por invitación)
  it('traduce el estado de una membresía: como lo ve el docente y como lo ve el estudiante en su bandeja', () => {
    expect(membershipLabel('INVITED')).toBe('Invitación pendiente');
    expect(membershipLabel('ACTIVE')).toBe('Miembro');
    expect(membershipLabel('DECLINED')).toBe('Rechazó la invitación');
    expect(membershipLabel('REMOVED')).toBe('Retirado del grupo');
    expect(invitationLabel('INVITED')).toBe('Pendiente');
    expect(invitationLabel('ACTIVE')).toBe('Miembro');
    expect(invitationLabel('DECLINED')).toBe('Rechazada');
    expect(invitationLabel('REMOVED')).toBe('Saliste del grupo');
    expect(membershipLabel(undefined)).toBe('Sin estado');
  });

  it('plural concuerda con la cantidad', () => {
    expect(plural(1, 'nodo')).toBe('1 nodo');
    expect(plural(2, 'nodo')).toBe('2 nodos');
    expect(plural(0, 'error', 'errores')).toBe('0 errores');
    expect(plural(1, 'advertencia')).toBe('1 advertencia');
  });

  // req: DISENO BK-3 y B5a (la bandeja «Por revisar» de la docente)
  it('traduce si un intento ya tiene valoración docente, sin claves en mayúsculas', () => {
    expect(evaluationStatusLabel('PENDIENTE')).toBe('Por revisar');
    expect(evaluationStatusLabel('APLICADA')).toBe('Revisado');
    expect(evaluationStatusLabel('NO_APLICA')).toBe('Sin valoración');
    expect(evaluationStatusLabel(null)).toBe('Sin valoración');
  });

  it('da a cada estado el tono de su insignia, y neutro al que no conoce', () => {
    expect(statusTone('PUBLISHED')).toBe('success');
    expect(statusTone('in_review')).toBe('info');
    expect(statusTone('SAFE_EXITED')).toBe('warning');
    expect(statusTone('DRAFT')).toBe('neutral');
    expect(statusTone('ALGO_NUEVO')).toBe('neutral');
    expect(statusTone(undefined)).toBe('neutral');
  });
});
