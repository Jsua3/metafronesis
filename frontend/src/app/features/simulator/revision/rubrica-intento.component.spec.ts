import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { InstructorApi } from '../../../core/api/instructor.api';
import { NotificationService } from '../../../core/notifications/notification.service';
import {
  CompetencyEvidence, CompetencyLevelEntry, FormativeLevel, OwnerEvaluationEntry, RubricCriterionView,
  RubricEvaluationView, RubricLevelOption,
} from '../../../core/models/revision.model';
import { UiDialog } from '../../../shared/ui/dialog/ui-dialog';
import { RubricaIntentoComponent, VistaDelEstudianteHoja } from './rubrica-intento.component';

/**
 * La valoración de un intento (bloque R2 sobre la extracción de B5b). Se conservan TODOS los casos que B5b mudó de
 * `instructor-trace` (validación de niveles, guardado, error anunciado, RN-09, grupo con nombre, contrato con la
 * pantalla) con la misma intención; cambia la forma de elegir: la lista desplegable «Nivel logrado» pasó a un grupo
 * de botones de opción con ese nombre (EDITOR §5.4 y §6.2), así que se elige pulsando el nivel en vez de con `select`.
 * Lo nuevo de R2: teclado, «Guardar sin entregar» (RK-5), evidencia (RK-4), sistema tras guardar y «Ver cómo lo leerá».
 */
const criterion = (id: number, title: string, competency = 'ETICA_PROFESIONAL', extra: Partial<RubricCriterionView> = {}): RubricCriterionView => ({
  id, competency, title, description: `Descripción de ${title}`, weight: 50, displayOrder: id, ...extra,
});

const LEVELS: RubricLevelOption[] = [
  { value: 'EN_INICIO', label: 'En inicio', descriptor: 'Aún no muestra la conducta esperada.' },
  { value: 'EN_PROCESO', label: 'En proceso', descriptor: 'La muestra a veces y con apoyo.' },
  { value: 'LOGRADO', label: 'Logrado', descriptor: 'La muestra de forma sostenida.' },
  { value: 'DESTACADO', label: 'Destacado', descriptor: 'La muestra y además la fundamenta.' },
];

function rubricFixture(overrides: Partial<RubricEvaluationView> = {}): RubricEvaluationView {
  return {
    attemptId: 'a-1', rubricId: 7, rubricName: 'Rúbrica básica de desempeño', description: 'Evalúa el desempeño formativo.',
    criteria: [criterion(1, 'Ética profesional'), criterion(2, 'Ruta de atención', 'RUTA_DE_ATENCION')], scores: [], levels: LEVELS,
    overallLevel: null, comment: '', ...overrides,
  };
}

/** Un servidor con R0: cada criterio trae `levelDescriptors` (aunque sea `{}`), y con él, RK-5. */
const conR0 = (overrides: Partial<RubricEvaluationView> = {}) => rubricFixture({
  criteria: [
    criterion(1, 'Ética profesional', 'ETICA_PROFESIONAL', { levelDescriptors: { LOGRADO: 'Sostiene el encuadre ético.' } }),
    criterion(2, 'Ruta de atención', 'RUTA_DE_ATENCION', { levelDescriptors: {} }),
  ],
  ...overrides,
});

const EVIDENCIA: CompetencyEvidence[] = [{
  code: 'ETICA_PROFESIONAL', name: 'Intervención técnica y ética',
  items: [
    { order: 2, nodeTitle: 'Urgencias', optionText: 'Brindar contención emocional.', class: 'RECOMMENDED', atSeconds: 264 },
    { order: 5, nodeTitle: 'Sala de escucha', optionText: 'Aplicar la ruta.', class: 'ACCEPTABLE', atSeconds: null },
  ],
}];

/** La expresión regular que `docencia.e2e.ts` aplica a `.tr-rubric`: ninguna escala numérica ni porcentaje. */
const ESCALA_NUMERICA = /\b\d+\s*(?:\/|de)\s*5\b|\b1\s*(?:a|–|-)\s*5\b|%/;

describe('valoración de un intento (rubrica-intento, R2)', () => {
  let fixture: ComponentFixture<RubricaIntentoComponent>;
  let api: { saveRubric: ReturnType<typeof vi.fn> };
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;
  let dialog: { sheet: ReturnType<typeof vi.fn> };
  let saved: ReturnType<typeof vi.fn<() => void>>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const criteriaCards = () => [...host().querySelectorAll('.ri-criterio')];
  const radios = (index: number) => [...criteriaCards()[index].querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  const scale = (index: number) => criteriaCards()[index].querySelector('[role="radiogroup"]') as HTMLElement;
  const chosen = (index: number) => radios(index).find(radio => radio.checked)?.value ?? '';
  const ORDER: FormativeLevel[] = ['EN_INICIO', 'EN_PROCESO', 'LOGRADO', 'DESTACADO'];
  /** Elige un nivel pulsándolo, como lo haría la docente. Pulsar el elegido lo quita. */
  const pick = (index: number, level: FormativeLevel) => {
    radios(index)[ORDER.indexOf(level)].click();
    fixture.detectChanges();
  };
  const fillLevels = (first: FormativeLevel = 'LOGRADO', second: FormativeLevel = 'EN_PROCESO') => {
    pick(0, first);
    pick(1, second);
  };
  const key = (target: Element, init: KeyboardEventInit) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    fixture.detectChanges();
  };
  const buttonByLabel = (label: string) => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')).startsWith(label)) as HTMLButtonElement | undefined;
  const saveButton = () => buttonByLabel('Guardar evaluación') as HTMLButtonElement;
  const draftButton = () => buttonByLabel('Guardar sin entregar');

  async function render(
    evaluacion: RubricEvaluationView | null = rubricFixture(),
    save: () => Observable<RubricEvaluationView> = () => of(rubricFixture({ overallLevel: 'LOGRADO' })),
    inputs: Record<string, unknown> = {},
  ) {
    api = { saveRubric: vi.fn(save) };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    dialog = { sheet: vi.fn() };
    saved = vi.fn<() => void>();
    TestBed.configureTestingModule({
      imports: [RubricaIntentoComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: InstructorApi, useValue: api },
        { provide: NotificationService, useValue: notify },
        { provide: UiDialog, useValue: dialog },
      ],
    });
    fixture = TestBed.createComponent(RubricaIntentoComponent);
    fixture.componentRef.setInput('attemptId', 'a-1');
    fixture.componentRef.setInput('evaluacion', evaluacion);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.componentInstance.guardada.subscribe(() => saved());
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // req: SIEP-CU-04, RNF-04
  describe('rúbrica por niveles', () => {
    it('cada criterio pide un nivel con cuatro botones de opción (sin campo numérico) en un grupo «Nivel logrado»', async () => {
      await render();
      expect(criteriaCards()).toHaveLength(2);
      expect(host().querySelectorAll('input[type="number"], select, [min], [max], [step]')).toHaveLength(0);
      for (const index of [0, 1]) {
        expect([...criteriaCards()[index].querySelectorAll('.ri-nivel__nombre')].map(text))
          .toEqual(['En inicio', 'En proceso', 'Logrado', 'Destacado']);
        expect(radios(index).map(radio => radio.value)).toEqual(ORDER);
        expect(scale(index).getAttribute('aria-label')).toMatch(/^Nivel logrado: /);
      }
      expect(scale(1).getAttribute('aria-label')).toBe('Nivel logrado: Ruta de atención');
      expect(text(host())).not.toMatch(/total de|Calificación|Rango/);
    });

    it('los descriptores generales están a la vista y bajo el criterio se lee el del nivel elegido', async () => {
      await render();
      const descriptors = [...host().querySelectorAll('.ri-niveles__lista > div')]
        .map(item => `${text(item.querySelector('dt'))} ${text(item.querySelector('dd'))}`);
      expect(descriptors).toEqual([
        'En inicio Aún no muestra la conducta esperada.', 'En proceso La muestra a veces y con apoyo.',
        'Logrado La muestra de forma sostenida.', 'Destacado La muestra y además la fundamenta.',
      ]);
      const significado = () => text(criteriaCards()[0].querySelector('.ri-criterio__significado'));
      expect(significado()).toBe('Elige el nivel que mejor describe la evidencia de este criterio.');

      pick(0, 'LOGRADO');
      expect(significado()).toBe('Logrado. La muestra de forma sostenida.');
    });

    it('con RK-2, el significado es el propio del criterio; sin él, el general del nivel', async () => {
      await render(conR0());
      pick(0, 'LOGRADO');
      pick(1, 'LOGRADO');
      expect(text(criteriaCards()[0].querySelector('.ri-criterio__significado'))).toBe('Logrado. Sostiene el encuadre ético.');
      expect(text(criteriaCards()[1].querySelector('.ri-criterio__significado'))).toBe('Logrado. La muestra de forma sostenida.');
    });

    it('enfocar un nivel con el teclado muestra su significado antes de elegirlo', async () => {
      await render();
      radios(0)[3].dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();
      expect(text(criteriaCards()[0].querySelector('.ri-criterio__significado'))).toBe('Destacado. La muestra y además la fundamenta.');
      expect(chosen(0)).toBe('');
    });

    it('pulsar otra vez el nivel elegido lo quita («Sin calificar»), como en Canvas', async () => {
      await render();
      pick(0, 'LOGRADO');
      expect(chosen(0)).toBe('LOGRADO');
      pick(0, 'LOGRADO');
      expect(chosen(0)).toBe('');
      expect(fixture.componentInstance.levels()[1]).toBeNull();
    });

    it('guardar sin elegir un nivel en cada criterio no envía nada, lo dice sin la palabra «puntaje» y marca el criterio', async () => {
      await render();
      pick(0, 'LOGRADO');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.saveRubric).not.toHaveBeenCalled();
      expect(text(host().querySelector('.ri__mensaje'))).toBe('Elige un nivel en cada criterio para guardar la valoración.');
      expect(text(host().querySelector('.ri__mensaje'))).not.toMatch(/puntaje/i);
      expect(text(criteriaCards()[1].querySelector('.ui-field__message--error'))).toBe('Elige un nivel para este criterio.');
      expect(scale(1).getAttribute('aria-invalid')).toBe('true');
      expect(scale(1).getAttribute('aria-describedby')).toContain(criteriaCards()[1].querySelector('.ui-field__message--error')!.id);
      expect(criteriaCards()[0].querySelector('.ui-field__message--error')).toBeNull();
    });

    it('elegir el nivel que faltaba quita el error de ESE criterio', async () => {
      await render();
      saveButton().click();
      fixture.detectChanges();
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(2);

      pick(0, 'EN_INICIO');
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(1);
      pick(1, 'DESTACADO');
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(0);
      expect(host().querySelector('.ri__mensaje--error')).toBeNull();
    });

    it('la falta de un nivel se anuncia a quien usa lector de pantalla', async () => {
      await render();
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      saveButton().click();
      expect(announce).toHaveBeenCalledWith('Elige un nivel en cada criterio para guardar la valoración.', 'polite');
    });

    it('guardar envía por cada criterio {criterionId, level, comment}: nunca un número, y sin `deliver`', async () => {
      await render();
      fillLevels('DESTACADO', 'EN_INICIO');
      (criteriaCards()[0].querySelector('.ri-criterio__abrir') as HTMLButtonElement).click();
      fixture.detectChanges();
      const comment = criteriaCards()[0].querySelector<HTMLTextAreaElement>('textarea')!;
      comment.value = 'Validó sin juzgar.';
      comment.dispatchEvent(new Event('input'));
      saveButton().click();
      await fixture.whenStable();

      expect(api.saveRubric).toHaveBeenCalledTimes(1);
      const [attemptId, rubricId, , scores, opciones] = api.saveRubric.mock.calls[0];
      expect(attemptId).toBe('a-1');
      expect(rubricId).toBe(7);
      expect(scores).toEqual([
        { criterionId: 1, level: 'DESTACADO', comment: 'Validó sin juzgar.' },
        { criterionId: 2, level: 'EN_INICIO', comment: '' },
      ]);
      expect(opciones).toBeUndefined();
      for (const score of scores as object[]) expect(score).not.toHaveProperty('score');
    });

    it('los niveles y observaciones ya guardados parten elegidos; la observación con texto, abierta', async () => {
      await render(rubricFixture({
        scores: [
          { criterionId: 1, level: 'LOGRADO', comment: 'Bien.', evidence: {} },
          { criterionId: 2, level: 'EN_PROCESO', comment: null, evidence: {} },
        ],
        overallLevel: 'EN_PROCESO',
      }));
      expect(chosen(0)).toBe('LOGRADO');
      expect(chosen(1)).toBe('EN_PROCESO');
      expect(criteriaCards()[0].classList).toContain('ri-criterio--con-nivel');
      expect((criteriaCards()[0].querySelector('textarea') as HTMLTextAreaElement).value).toBe('Bien.');
      expect(criteriaCards()[1].querySelector('textarea')).toBeNull();
      expect(text(criteriaCards()[1].querySelector('.ri-criterio__abrir .ui-button__label'))).toBe('Observación');
    });

    it('una rúbrica sin criterios no envía una lista vacía: pide un nivel o una retroalimentación', async () => {
      await render(rubricFixture({ criteria: [] }));
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(api.saveRubric).not.toHaveBeenCalled();
      expect(text(host().querySelector('.ri__mensaje'))).toBe('Elige un nivel o escribe una retroalimentación para guardar.');

      const comment = host().querySelector<HTMLTextAreaElement>('.ri__general textarea')!;
      comment.value = 'Buen trabajo.';
      comment.dispatchEvent(new Event('input'));
      saveButton().click();
      await fixture.whenStable();
      expect(api.saveRubric).toHaveBeenCalledTimes(1);
      expect(api.saveRubric.mock.calls[0][2]).toBe('Buen trabajo.');
      expect(api.saveRubric.mock.calls[0][3]).toEqual([]);
    });

    it('si el servidor no manda los niveles con su descriptor, ofrece igual los cuatro nombres', async () => {
      await render(rubricFixture({ levels: undefined }));
      expect([...criteriaCards()[0].querySelectorAll('.ri-nivel__nombre')].map(text))
        .toEqual(['En inicio', 'En proceso', 'Logrado', 'Destacado']);
    });

    it('al guardar con éxito avisa con un aviso y le dice a la pantalla que recargue la traza', async () => {
      await render();
      fillLevels();
      saveButton().click();
      await fixture.whenStable();

      expect(notify.success).toHaveBeenCalledWith('Evaluación guardada correctamente.');
      expect(saved).toHaveBeenCalledTimes(1);
    });

    it('lo que la docente cambia mientras el guardado y la recarga van en camino no se pierde', async () => {
      const respuesta = new Subject<RubricEvaluationView>();
      await render(rubricFixture(), () => respuesta.asObservable());
      fillLevels('LOGRADO', 'EN_PROCESO');
      saveButton().click();
      fixture.detectChanges();
      // Con el guardado en camino, cambia el primer criterio.
      pick(0, 'DESTACADO');
      respuesta.next(rubricFixture());
      respuesta.complete();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(chosen(0)).toBe('DESTACADO');
      expect(chosen(1)).toBe('EN_PROCESO');

      // Llega la recarga con lo que se envió: lo cambiado después sigue ahí y cuenta como cambio sin guardar.
      fixture.componentRef.setInput('evaluacion', rubricFixture({ scores: [
        { criterionId: 1, level: 'LOGRADO', comment: '' }, { criterionId: 2, level: 'EN_PROCESO', comment: '' },
      ] } as Partial<RubricEvaluationView>));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(chosen(0)).toBe('DESTACADO');
      expect(chosen(1)).toBe('EN_PROCESO');
      expect(fixture.componentInstance.hayCambios()).toBe(true);
    });

    it('si el servidor rechaza el guardado, lo dice en línea junto al botón y no con un aviso de éxito', async () => {
      await render(rubricFixture(), () => throwError(() => new HttpErrorResponse({ status: 500 })));
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(host().querySelector('.ri__mensaje'))).toContain('No fue posible guardar la evaluación');
      expect(host().querySelector('.ri__pie')?.contains(host().querySelector('.ri__mensaje'))).toBe(true);
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('No fue posible guardar la evaluación'), 'assertive');
      expect(notify.success).not.toHaveBeenCalled();
      expect(saved).not.toHaveBeenCalled();
    });
  });

  // req: RN-09
  describe('valoración formativa (RN-09)', () => {
    it('rotula el total como «Valoración formativa» con el nivel que envía el servidor y ningún número', async () => {
      await render(rubricFixture({
        overallLevel: 'LOGRADO',
        scores: [{ criterionId: 1, level: 'LOGRADO', comment: null, evidence: {} }],
      }));
      const valuation = host().querySelector('.ri-valoracion')!;
      expect(text(valuation)).toContain('Valoración formativa');
      expect(text(valuation)).toContain('Logrado');
      expect(text(valuation)).not.toMatch(/\d/);
    });

    it('sin evaluación aún: «Pendiente»; nunca una suma local de lo que se elige', async () => {
      await render();
      expect(text(host().querySelector('.ri-valoracion'))).toContain('Pendiente');
      fillLevels('DESTACADO', 'DESTACADO');
      expect(text(host().querySelector('.ri-valoracion'))).toContain('Pendiente');
      expect(text(host().querySelector('.ri-valoracion'))).not.toMatch(/\d/);
    });

    it('ni el peso, ni una escala, ni cifras en los criterios ni en el avance; ninguna clave de sistema a la vista', async () => {
      await render(conR0(), undefined, { evidencia: EVIDENCIA });
      expect(text(host())).not.toMatch(ESCALA_NUMERICA);
      for (const card of criteriaCards()) {
        // Las fichas de evidencia llevan el minuto de la decisión (el mismo de la línea de tiempo): lo demás, sin cifras.
        const copia = card.cloneNode(true) as HTMLElement;
        copia.querySelectorAll('.ri-ficha__tiempo').forEach(node => node.remove());
        expect(text(copia)).not.toMatch(/\d/);
      }
      expect(text(host().querySelector('.ui-barra-acciones__nota'))).toBe('Faltan dos criterios por valorar.');
      expect(text(host())).not.toMatch(/ETICA_PROFESIONAL|RUTA_DE_ATENCION|[A-Z]{3,}_[A-Z]{3,}/);
    });
  });

  // req: SIEP-CU-04, RNF-04 (revisión de F7)
  it('cada criterio es un grupo con nombre que conserva las clases de las pruebas de extremo a extremo', async () => {
    await render();
    expect(host().classList).toContain('tr-rubric');
    const group = criteriaCards()[1];
    expect(group.classList).toContain('tr-criterion');
    expect(group.getAttribute('role')).toBe('group');
    const labelledBy = group.getAttribute('aria-labelledby')!;
    expect(text(host().querySelector('#' + labelledBy))).toBe('Ruta de atención');
    // `article` no admite role="group" (Axe: aria-allowed-role), ni `li`.
    expect(group.tagName).not.toBe('ARTICLE');
    expect(group.tagName).not.toBe('LI');
  });

  describe('teclado (EDITOR §5.4)', () => {
    it('cuatro criterios con cuatro teclas y Ctrl+Enter: cada cifra elige el nivel y pasa al siguiente', async () => {
      const cuatro = rubricFixture({
        criteria: [criterion(1, 'Uno'), criterion(2, 'Dos', 'B'), criterion(3, 'Tres', 'C'), criterion(4, 'Cuatro', 'D')],
      });
      await render(cuatro);
      radios(0)[0].focus();
      for (const [index, tecla] of ['3', '2', '4', '1'].entries()) {
        expect(criteriaCards()[index].contains(document.activeElement)).toBe(true);
        key(document.activeElement!, { key: tecla });
      }
      expect([0, 1, 2, 3].map(chosen)).toEqual(['LOGRADO', 'EN_PROCESO', 'DESTACADO', 'EN_INICIO']);
      // Tras el último criterio, el foco pasa a la retroalimentación.
      expect(document.activeElement).toBe(host().querySelector('.ri__general textarea'));

      key(document.activeElement!, { key: 'Enter', ctrlKey: true });
      await fixture.whenStable();
      expect(api.saveRubric).toHaveBeenCalledTimes(1);
      expect((api.saveRubric.mock.calls[0][3] as { level: string }[]).map(score => score.level))
        .toEqual(['LOGRADO', 'EN_PROCESO', 'DESTACADO', 'EN_INICIO']);
    });

    it('0 o Supr quitan el nivel; ↑ y ↓ cambian de criterio sin tocar el nivel; C abre la observación', async () => {
      await render();
      pick(0, 'LOGRADO');
      radios(0)[2].focus();
      key(radios(0)[2], { key: '0' });
      expect(chosen(0)).toBe('');

      pick(0, 'EN_PROCESO');
      radios(0)[1].focus();
      key(radios(0)[1], { key: 'ArrowDown' });
      expect(criteriaCards()[1].contains(document.activeElement)).toBe(true);
      key(document.activeElement!, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(radios(0)[1]);
      expect(chosen(0)).toBe('EN_PROCESO');

      key(radios(0)[1], { key: 'Delete' });
      expect(chosen(0)).toBe('');

      key(radios(0)[0], { key: 'c' });
      await fixture.whenStable();
      expect(criteriaCards()[0].querySelector('textarea')).not.toBeNull();
    });

    it('las cifras escritas en un campo de texto no eligen niveles, y con Ctrl no hacen nada', async () => {
      await render();
      const general = host().querySelector<HTMLTextAreaElement>('.ri__general textarea')!;
      key(general, { key: '3' });
      key(radios(0)[0], { key: '3', ctrlKey: true });
      expect(chosen(0)).toBe('');
      expect(chosen(1)).toBe('');
    });

    it('Ctrl+Enter con niveles faltantes no envía y lleva el foco al primer criterio marcado', async () => {
      await render();
      pick(0, 'LOGRADO');
      key(host().querySelector('.ri__general textarea')!, { key: 'Enter', ctrlKey: true });
      expect(api.saveRubric).not.toHaveBeenCalled();
      expect(criteriaCards()[1].contains(document.activeElement)).toBe(true);
    });
  });

  describe('guardar sin entregar (RK-5)', () => {
    it('no se ofrece con un servidor anterior a R0 (lo ignoraría y entregaría la valoración completa)', async () => {
      await render();
      expect(draftButton()).toBeUndefined();
    });

    it('con R0 guarda lo que haya, incompleto, con `deliver: false`, y avisa que el estudiante no la ve', async () => {
      await render(conR0());
      pick(0, 'LOGRADO');
      draftButton()!.click();
      await fixture.whenStable();

      expect(api.saveRubric).toHaveBeenCalledTimes(1);
      const [, , , scores, opciones] = api.saveRubric.mock.calls[0];
      expect(scores).toEqual([{ criterionId: 1, level: 'LOGRADO', comment: '' }]);
      expect(opciones).toEqual({ deliver: false });
      expect(notify.success).toHaveBeenCalledWith('Guardada sin entregar. Tu estudiante todavía no la ve.');
      expect(saved).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.hayCambios()).toBe(false);
    });

    it('una observación sin nivel no se pierde: pide el nivel antes de guardar el borrador', async () => {
      await render(conR0());
      (criteriaCards()[1].querySelector('.ri-criterio__abrir') as HTMLButtonElement).click();
      fixture.detectChanges();
      const comment = criteriaCards()[1].querySelector<HTMLTextAreaElement>('textarea')!;
      comment.value = 'Revisar la ruta.';
      comment.dispatchEvent(new Event('input'));
      draftButton()!.click();
      fixture.detectChanges();

      expect(api.saveRubric).not.toHaveBeenCalled();
      expect(text(criteriaCards()[1].querySelector('.ui-field__message--error'))).toBe('Elige un nivel para guardar esta observación.');
    });

    it('ya entregada: no hay borrador y la pantalla avisa que el estudiante verá la versión nueva', async () => {
      await render(conR0({
        status: 'EVALUATED', overallLevel: 'LOGRADO',
        scores: [
          { criterionId: 1, level: 'LOGRADO', comment: '', evidence: {} },
          { criterionId: 2, level: 'LOGRADO', comment: '', evidence: {} },
        ],
      }));
      expect(draftButton()).toBeUndefined();
      expect(text(host().querySelector('.ri__entrega'))).toBe('Ya la entregaste. Si guardas cambios, tu estudiante verá la versión nueva.');
    });

    it('sin entregar, la línea bajo el botón dice que el estudiante la verá al guardarla', async () => {
      await render(conR0());
      expect(text(host().querySelector('.ri__entrega'))).toBe('Al guardarla, tu estudiante la verá en el cierre del caso.');
    });

    it('el 409 EVALUATION_ALREADY_DELIVERED se dice en línea, assertive, sin perder lo escrito, y retira el borrador', async () => {
      await render(conR0(), () => throwError(() => new HttpErrorResponse({
        status: 409, error: { success: false, code: 'EVALUATION_ALREADY_DELIVERED', message: '…' },
      })));
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      pick(0, 'LOGRADO');
      draftButton()!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(host().querySelector('.ri__mensaje--error'))).toContain('ya se entregó');
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('ya se entregó'), 'assertive');
      expect(chosen(0)).toBe('LOGRADO');
      expect(fixture.componentInstance.hayCambios()).toBe(true);
      expect(draftButton()).toBeUndefined();
    });
  });

  describe('evidencia y valoración del sistema', () => {
    it('sin `evidenceByCompetency` el bloque de evidencia no se pinta', async () => {
      await render();
      expect(host().querySelector('.ri-evidencia')).toBeNull();
    });

    it('con RK-4, cada criterio muestra sus decisiones; pulsar una emite irADecision y enfocar emite criterioEnfocado', async () => {
      await render(rubricFixture(), undefined, { evidencia: EVIDENCIA });
      const enfocados: (string | null)[] = [];
      const destinos: number[] = [];
      fixture.componentInstance.criterioEnfocado.subscribe(code => enfocados.push(code));
      fixture.componentInstance.irADecision.subscribe(order => destinos.push(order));

      const fichas = [...criteriaCards()[0].querySelectorAll<HTMLButtonElement>('.ri-ficha')];
      expect(fichas.map(ficha => [...ficha.querySelectorAll('span')].map(text).filter(Boolean).join(' '))).toEqual(['04:24 Urgencias', 'Sala de escucha']);
      expect(fichas[0].getAttribute('aria-label')).toBe('Ir a la decisión en Urgencias, minuto 04:24: «Brindar contención emocional.»');
      expect(text(criteriaCards()[1].querySelector('.ri-evidencia'))).toContain('Ninguna decisión del intento tocó esta competencia.');

      criteriaCards()[0].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      criteriaCards()[0].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      criteriaCards()[1].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      fichas[1].click();
      expect(enfocados).toEqual(['ETICA_PROFESIONAL', 'RUTA_DE_ATENCION']);
      expect(destinos).toEqual([5]);
    });

    it('lo que calculó el sistema aparece bajo cada criterio solo cuando llega (después de guardar), en palabras', async () => {
      await render();
      expect(host().querySelector('.ri-criterio__sistema')).toBeNull();
      const sistema: CompetencyLevelEntry[] = [
        { code: 'ETICA_PROFESIONAL', name: 'Ética', level: 'LOGRADO', basis: '2 decisiones', evidence: [] },
        { code: 'RUTA_DE_ATENCION', name: 'Ruta', level: null, basis: null, evidence: [] },
      ];
      fixture.componentRef.setInput('sistema', sistema);
      fixture.detectChanges();
      expect(text(criteriaCards()[0].querySelector('.ri-criterio__sistema'))).toBe('El sistema lo leyó como «Logrado».');
      expect(text(criteriaCards()[1].querySelector('.ri-criterio__sistema'))).toBe('El sistema no encontró evidencia suficiente.');
    });
  });

  describe('contrato con la pantalla', () => {
    it('hayCambios() es falso al abrir, verdadero tras elegir o escribir, y vuelve a falso al guardar', async () => {
      await render();
      const form = fixture.componentInstance;
      expect(form.hayCambios()).toBe(false);
      pick(0, 'LOGRADO');
      expect(form.hayCambios()).toBe(true);
      pick(0, 'LOGRADO');
      expect(form.hayCambios()).toBe(false);

      const general = host().querySelector<HTMLTextAreaElement>('.ri__general textarea')!;
      general.value = 'Muy bien.';
      general.dispatchEvent(new Event('input'));
      expect(form.hayCambios()).toBe(true);

      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      expect(form.hayCambios()).toBe(false);
    });

    it('al llegar otra valoración (otro intento) el formulario parte de lo guardado y sin avisos', async () => {
      await render();
      saveButton().click();
      fixture.detectChanges();
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(2);

      fixture.componentRef.setInput('attemptId', 'a-2');
      fixture.componentRef.setInput('evaluacion', rubricFixture({
        attemptId: 'a-2', scores: [{ criterionId: 1, level: 'DESTACADO', comment: 'Otro.', evidence: {} }],
      }));
      fixture.detectChanges();
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(0);
      expect(host().querySelector('.ri__mensaje')).toBeNull();
      expect(chosen(0)).toBe('DESTACADO');
      expect(fixture.componentInstance.hayCambios()).toBe(false);
    });

    it('«Guardar evaluación» va en el pie fijo, que dice cuánto falta (en palabras) y que el estudiante la verá', async () => {
      await render();
      const pie = host().querySelector('.ri__pie')!;
      expect(pie.contains(saveButton())).toBe(true);
      expect(text(pie)).toContain('Faltan dos criterios por valorar.');
      expect(text(pie)).toContain('tu estudiante la verá en el cierre del caso');
      pick(0, 'LOGRADO');
      expect(text(pie)).toContain('Falta un criterio por valorar.');
      pick(1, 'LOGRADO');
      expect(text(pie)).toContain('Todos los criterios tienen nivel.');
    });

    it('tras entregar, y si hay otro por revisar, ofrece «Siguiente por revisar», que emite `siguiente`', async () => {
      await render(rubricFixture(), undefined, { haySiguiente: true });
      const siguientes = vi.fn();
      fixture.componentInstance.siguiente.subscribe(siguientes);
      expect(buttonByLabel('Siguiente por revisar')).toBeUndefined();
      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();
      buttonByLabel('Siguiente por revisar')!.click();
      expect(siguientes).toHaveBeenCalledTimes(1);
    });

    it('«Ver cómo lo leerá» abre la hoja con la pieza del estudiante y la forma armada desde el formulario', async () => {
      await render(conR0());
      pick(0, 'LOGRADO');
      buttonByLabel('Ver cómo lo leerá')!.click();
      expect(dialog.sheet).toHaveBeenCalledTimes(1);
      const [component, options] = dialog.sheet.mock.calls[0] as [unknown, { side: string; data: OwnerEvaluationEntry }];
      expect(component).toBe(VistaDelEstudianteHoja);
      expect(options.side).toBe('end');
      expect(options.data.origin).toBe('DOCENTE');
      expect(options.data.overallLevel).toBeNull();
      expect(options.data.criteria[0]).toEqual({
        criterionId: 1, title: 'Ética profesional', level: 'LOGRADO', comment: '', descriptor: 'Sostiene el encuadre ético.',
      });
      expect(options.data.criteria[1].level).toBeNull();
    });

    it('sin valoración no pinta nada (la pantalla dice por qué)', async () => {
      await render(null);
      expect(text(host())).toBe('');
      expect(fixture.componentInstance.hayCambios()).toBe(false);
    });
  });
});
