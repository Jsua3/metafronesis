import { readFileSync } from 'fs';
import { join } from 'path';

import { DRAFT_COPY, draftCopyList } from './draft-copy';

/**
 * Registro de textos en BORRADOR (plan visual §9: las decisiones marcadas «(Psicología)»: VD-19, VD-20, VD-23 y
 * VD-24). Mientras no estén validados no son texto definitivo: viven aquí, juntos, con su decisión y su responsable,
 * para poder listarlos al usuario y cambiarlos en un solo sitio.
 */
// req: BLOQUE-H, RNF-04 (decisiones de Psicología registradas y visibles)
describe('draft-copy: textos en borrador pendientes de Psicología', () => {
  it('cada borrador nombra su decisión, a quien debe fijarlo, dónde se usa y su texto', () => {
    const entries = draftCopyList();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.decision, entry.key).toMatch(/^(VD|RN|ETH|F6|F7|F10|P6|DSL|R1)-\d+$/);
      expect(entry.owner, entry.key).toBe('Psicología');
      expect(entry.where.trim(), entry.key).not.toBe('');
      expect(entry.text.trim(), entry.key).not.toBe('');
    }
  });

  // req: RNF-04, BLOQUE-H (VD-24)
  it('registra el vocabulario educativo del panel de diálogo y del dock: «Decisión» e «Inventario»', () => {
    expect(DRAFT_COPY.decisionLabel.text).toBe('Decisión');
    expect(DRAFT_COPY.decisionLabel.decision).toBe('VD-24');
    expect(DRAFT_COPY.inventoryLabel.text).toBe('Inventario');
    expect(DRAFT_COPY.inventoryLabel.decision).toBe('VD-24');
  });

  // req: BLOQUE-H, RNF-04 (revisión de F6: los microtextos nuevos también viven en el registro)
  it('registra los cinco microtextos nuevos de F6, para conocimiento de Psicología', () => {
    expect(DRAFT_COPY.consentSaving).toMatchObject({ text: 'Registrando tu consentimiento…', decision: 'ETH-01', review: 'conocimiento' });
    expect(DRAFT_COPY.journalSaveReason).toMatchObject({ text: 'Escribe tu reflexión para guardar', decision: 'F6-5', review: 'conocimiento' });
    expect(DRAFT_COPY.shortcutsSettingLabel).toMatchObject({ text: 'Atajos de una tecla', decision: 'VD-18', review: 'conocimiento' });
    expect(DRAFT_COPY.placesButtonLabel).toMatchObject({ text: 'Ir a… personas y puertas de la sala', decision: 'VD-19', review: 'conocimiento' });
  });

  it('cada borrador dice si Psicología debe validarlo o solo conocerlo; los de la hoja se validan', () => {
    const list = draftCopyList();
    for (const entry of list) expect(['validar', 'conocimiento'], entry.key).toContain(entry.review);
    expect(list.filter(entry => entry.review === 'conocimiento').map(entry => entry.key).sort()).toEqual(
      ['briefConsentError', 'briefConsentStale', 'briefPending', 'briefSound', 'commentBubbleLabel', 'consentSaving', 'hintNoCostNote', 'intentoCambio', 'journalSaveReason', 'placesButtonLabel', 'reactionSkipHint', 'rehearsalActivation', 'rehearsalActivationCalm', 'rehearsalActivationCrisis', 'rehearsalActivationTense', 'rehearsalBackToEditor', 'rehearsalBackToScript', 'rehearsalBanner', 'rehearsalBond', 'rehearsalBondGuarded', 'rehearsalBondOpen', 'rehearsalBondWithdrawn', 'rehearsalBroken', 'rehearsalCommentDue', 'rehearsalComments', 'rehearsalExplored', 'rehearsalGoTo', 'rehearsalGone', 'rehearsalHeldByCondition', 'rehearsalMilestones', 'rehearsalPanelTitle', 'rehearsalPersona', 'rehearsalReload', 'rehearsalRestart', 'rehearsalScene', 'rehearsalTools', 'rehearsalWarnings', 'rehearsalWhyHidden', 'shortcutsSettingLabel', 'umbralCareLine', 'umbralReady', 'umbralSlow', 'unknownPerson', 'unknownThing'],
    );
    // Los diez de F6, los ocho de F7-4 (tres de vocabulario VD-24, el rótulo de la valoración formativa y los cuatro
    // nombres de nivel: las claves las fijó ED-2, la redacción visible la elige Psicología) y la consecuencia del
    // reemplazo docente (F7b-7, RN-07), el aviso de contenido sensible de la ficha del caso (F10-1), el aviso de que el
    // aviso de contenido cambió de versión (S3-2b, ETH-01) y los del resultado con retroalimentación por decisión
    // (F10-4: «Tus decisiones», sus estados, las etiquetas y el marcador): son texto que ve la persona y se validan, no
    // solo se conocen; y los del cierre por hitos y competencias (VD-23: clases en palabras, hitos, competencias,
    // autoevaluación breve y últimos cierres del panel) y la nota «persona a atender» de la persona clave (P6-4); y los siete
    // de la ficha del objetivo (DSL-2: rótulo, respaldo, «En esta sala», las tres marcas y «Pedir una pista») y los cuatro de DSL-3 (los dos avisos
    // de exploración y los dos textos de la ayuda) el chip del aviso sensible (DSL-4) y los cinco de la tarjeta «Antes de comenzar» (DSL-5) y los cuatro de «Respuestas que no llegaste a ver» (DSL-6) y «Por ahora no hay nada que decidir» (DSL-7) y el
    // respaldo de la puerta bloqueada cuando el servidor no dice qué falta (DSL-8); del ensayo y su panel de autora, los que no están en el brief y los cuatro de error y aviso (DSL-10 y DSL-11: 11 + 4 = 15) y los cinco avisos de robustez del cliente (R1) y los cinco de la pausa local y el reenvío al volver la red (V3) y el aviso de la segunda oportunidad (V4). Los del brief (banner, ensayo perdido, reiniciar, volver al editor y el panel) solo se conocen.
    // B4b (rediseño 2026-11-21): sale la nota sensible de la ficha (ya no es verdad: el aviso va en la ficha) y entran
    // cuatro que se validan (el contrato de ficción, la rúbrica formativa, el apoyo pendiente y la frase junto a «Comenzar»):
    // 107 − 1 + 4. Los avisos de error del registro, el sonido y los tres del umbral solo se conocen.
    expect(list.filter(entry => entry.review === 'validar')).toHaveLength(110);
  });

  // req: ETH-01, SIEP-RF-05 (S3-2b)
  it('registra el texto de «hay una versión nueva del aviso», para validación de Psicología', () => {
    expect(DRAFT_COPY.consentNoticeStale).toMatchObject({ decision: 'ETH-01', owner: 'Psicología' });
    expect(draftCopyList().find(entry => entry.key === 'consentNoticeStale')!.review).toBe('validar');
    expect(DRAFT_COPY.consentNoticeStale.text).toContain('versión nueva del aviso');
    expect(DRAFT_COPY.consentNoticeStale.text).toContain('Recarga la página');
    // El texto vive aquí y la pantalla de juego lo lee del registro: no se repite.
    const play = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
    expect(play).toContain('DRAFT_COPY.consentNoticeStale.text');
    expect(play).not.toContain(DRAFT_COPY.consentNoticeStale.text);
  });

  // req: RN-07 (F7b-7, revisión)
  it('registra la consecuencia del reemplazo docente con el rótulo de estado que ve la lista', () => {
    expect(DRAFT_COPY.replaceAttemptConsequence).toMatchObject({ decision: 'RN-07', owner: 'Psicología' });
    expect(DRAFT_COPY.replaceAttemptConsequence.text).toContain('«Reemplazado por un intento nuevo»');
    expect(DRAFT_COPY.replaceAttemptConsequence.text).toContain('bitácora');
  });

  // req: RN-09, BLOQUE-H (F7-4)
  it('registra el vocabulario educativo de la traza docente (VD-24) y el rótulo de la valoración formativa (RN-09)', () => {
    expect(DRAFT_COPY.traceDecisionFallback).toMatchObject({ decision: 'VD-24', text: 'Revisar el contexto del escenario y la justificación de la decisión.' });
    expect(DRAFT_COPY.traceAdequateStep).toMatchObject({ decision: 'VD-24', text: 'Paso adecuado dentro del recorrido simulado.' });
    expect(DRAFT_COPY.traceNoDecisions).toMatchObject({ decision: 'VD-24', text: 'Este intento aún no tiene decisiones guardadas.' });
    expect(DRAFT_COPY.formativeValuationLabel).toMatchObject({ decision: 'RN-09', text: 'Valoración formativa' });
    expect(draftCopyList().filter(entry => /clínic/i.test(entry.text))).toEqual([]);
  });

  // req: RF-16, ETH-01 (F10-1; rediseño B4b). Antes la ficha decía «Antes de entrar verás un aviso» (briefSensitiveNote):
  // desde B4b el aviso validado va EN la ficha, antes del contexto, así que esa nota dejó de ser verdad y se retiró. La
  // intención se mantiene: los textos de la ficha que son borrador viven en el registro y la ficha los lee de allí.
  it('registra los textos de la ficha del caso, y la ficha los lee del registro (el aviso, de la constante validada)', () => {
    expect('briefSensitiveNote' in DRAFT_COPY).toBe(false);
    expect(DRAFT_COPY.briefPending).toMatchObject({ decision: 'F10-1', review: 'conocimiento' });
    for (const clave of ['briefFictionContract', 'briefFictionRubric', 'briefSound', 'supportResourcesPending'] as const) {
      expect(DRAFT_COPY[clave], clave).toMatchObject({ decision: 'F10-1', owner: 'Psicología' });
    }
    const ts = readFileSync(join(__dirname, 'case-brief.component.ts'), 'utf-8');
    const html = readFileSync(join(__dirname, 'case-brief.component.html'), 'utf-8');
    expect(ts).toContain('protected readonly copy = DRAFT_COPY;');
    expect(ts).toContain('CONTENT_NOTICE_TEXT');
    for (const uso of ['copy.briefPending.text', 'copy.briefFictionContract.text', 'copy.supportResourcesPending.text']) expect(html).toContain(uso);
    expect(ts).toContain('DRAFT_COPY.briefSound.text');
  });

  // req: RF-18, CU-09 (F10-2)
  it('registra la nota de las pistas (sin costo), y las pistas la leen del registro', () => {
    expect(DRAFT_COPY.hintNoCostNote).toMatchObject({ decision: 'F10-2', review: 'conocimiento' });
    expect(DRAFT_COPY.hintNoCostNote.text).toBe('sin costo');
    const hint = readFileSync(join(__dirname, 'scene-hint.component.ts'), 'utf-8');
    expect(hint).toContain('DRAFT_COPY.hintNoCostNote.text');
  });

  it('la nota de ayuda nombra el ajuste con la misma palabra del registro (una sola fuente)', () => {
    expect(DRAFT_COPY.shortcutsHelpNote.text).toContain(`«${DRAFT_COPY.shortcutsSettingLabel.text}»`);
  });

  it('los componentes leen esos textos del registro y no los repiten', () => {
    const read = (file: string) => readFileSync(join(__dirname, file), 'utf-8');
    const play = read('simulation-play.component.ts');
    expect(play).toContain('this.announce(DRAFT_COPY.consentSaving.text);');
    expect(play).not.toContain("this.announce('Registrando tu consentimiento…')");
    const journal = read('journal-panel.component.ts');
    expect(journal).toContain('DRAFT_COPY.journalSaveReason.text');
    expect(journal).not.toContain("'Escribe tu reflexión para guardar'");
    const hud = read('simulation-hud.component.ts');
    expect(hud).toContain('DRAFT_COPY.shortcutsSettingLabel.text');
    expect(hud).toContain('DRAFT_COPY.placesButtonLabel.text');
    expect(hud).not.toContain('aria-label="Ir a… personas y puertas de la sala"');
    expect(hud).not.toContain('<span>Atajos de una tecla</span>');
  });

  it('la barra en reposo ya no repite las teclas: viven en la sección «Teclas» de la ayuda', () => {
    const template = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
    expect(template).not.toContain('<p class="context-bar__hint"');
    expect(template).not.toContain('Flechas mover');
  });

  it('las claves del registro son únicas y la lista las recorre todas', () => {
    const keys = draftCopyList().map(entry => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(DRAFT_COPY).sort());
  });
});
