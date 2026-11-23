import { CaseAccess, CatalogItem } from '../../core/models/simulation.model';
import { blockedNotice, lockLabel, lockReason } from './case-lock.util';

function item(caseVersionId: number, order: number, unlocked: boolean, access?: CaseAccess): CatalogItem {
  return { caseVersionId, code: `C${caseVersionId}`, title: `Caso ${caseVersionId}`, description: '', order, unlocked, completed: false, locked: !unlocked, ...(access ? { access } : {}) };
}

/** Caso bloqueado con motivo (plan visual F5-5; gancho de SIEP-RF-12: desbloqueo lineal). */
// req: SIEP-RF-12 (gancho de interfaz), BLOQUE-H
describe('case-lock.util', () => {
  const catalog = [item(30, 3, false), item(10, 1, true), item(20, 2, false)];

  it('lockReason nombra el caso anterior en el orden del catálogo (no en el de la lista)', () => {
    expect(lockReason(catalog, 20)).toBe('Completa «Caso 10» para abrirlo.');
    expect(lockReason(catalog, 30)).toBe('Completa «Caso 20» para abrirlo.');
  });

  it('lockReason es null para un caso abierto o que no está en el catálogo', () => {
    expect(lockReason(catalog, 10)).toBeNull();
    expect(lockReason(catalog, 99)).toBeNull();
  });

  it('sin caso anterior conocido, el motivo genérico', () => {
    expect(lockReason([item(5, 1, false)], 5)).toBe('Completa el caso anterior para abrirlo.');
  });

  // req: RN-04, RF-15, RF-14 (F10-5: la ventana de la asignación)
  it('una ventana que aún no abre dice cuándo abre, no manda a completar otro caso', () => {
    const scheduled = [item(10, 1, true), item(20, 2, false, { allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-10-20T08:00:00-05:00' })];
    const reason = lockReason(scheduled, 20)!;
    expect(reason).toContain('Aún no abre');
    expect(reason).toMatch(/20 de oct/);
    expect(reason).not.toContain('Completa');
  });

  it('una ventana cerrada lo dice con su fecha', () => {
    const closed = [item(10, 1, false, { allowed: false, reason: 'CLOSED', closesAt: '2026-10-05T23:59:00-05:00' })];
    const reason = lockReason(closed, 10)!;
    expect(reason).toContain('Ya cerró');
    expect(reason).toMatch(/5 de oct/);
  });

  it('bloqueado por la secuencia, con su «access», sigue nombrando el caso anterior', () => {
    const sequence = [item(10, 1, true), item(20, 2, false, { allowed: false, reason: 'LOCKED_BY_SEQUENCE' })];
    expect(lockReason(sequence, 20)).toBe('Completa «Caso 10» para abrirlo.');
  });

  it('lockLabel rotula el bloqueo según su causa: la ventana de la asignación o la secuencia', () => {
    const catalogWithWindows = [
      item(1, 1, true),
      item(2, 2, false, { allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-10-20T08:00:00-05:00' }),
      item(3, 3, false, { allowed: false, reason: 'CLOSED' }),
      item(4, 4, false, { allowed: false, reason: 'LOCKED_BY_SEQUENCE' }),
      item(5, 5, false),
    ];
    expect(['2', '3', '4', '5'].map(id => lockLabel(catalogWithWindows, Number(id)))).toEqual(['Aún no abre', 'Ya cerró', 'Bloqueado', 'Bloqueado']);
  });

  it('blockedNotice de una ventana nombra el caso y dice lo que le pasa, sin «todavía está bloqueado: aún no abre»', () => {
    const scheduled = [item(20, 2, false, { allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-10-20T08:00:00-05:00' })];
    const notice = blockedNotice(scheduled, 20)!;
    expect(notice.startsWith('«Caso 20»: Aún no abre')).toBe(true);
  });

  it('blockedNotice explica por qué no se abrió el caso pedido por dirección', () => {
    expect(blockedNotice(catalog, 20)).toBe('«Caso 20» todavía está bloqueado: completa «Caso 10» para abrirlo.');
    expect(blockedNotice(catalog, 10)).toBeNull();
  });
});
