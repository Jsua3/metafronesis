import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { provideRouter } from '@angular/router';
import { AttemptOutcomeComponent } from './attempt-outcome.component';
import { AttemptCompletionReport } from '../../core/models/simulation.model';
import { KitFigureComponent } from '../character/kit/kit-figure.component';
import { AvatarStore } from '../character/avatar.store';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { SimulationService } from '../../core/api/simulation.service';
import { DecisionReviewItem, MissedOption } from '../../core/models/simulation.model';
import { RECONSIDERED_LABEL } from './reconsidered.util';

/** El único servicio que la pantalla de resultado llama: «Tus decisiones» lee el reporte congelado del dueño (C2). */
const simulation = { studentReport: vi.fn() };

function makeReport(overrides: Partial<AttemptCompletionReport> = {}): AttemptCompletionReport {
  return {
    attemptId: 'a1',
    caseTitle: 'Caso',
    status: 'COMPLETED',
    schemaVersion: 3,
    totalDurationSeconds: 125,
    phaseDurations: [],
    toolsUsed: 2,
    reflectionsCount: 1,
    safeExitUsed: false,
    visitedNodeTitles: ['Escena 1', 'Escena 2'],
    recommendations: ['Sigue así'],
    summaryMessage: 'Buen trabajo',
    ending: {
      key: 'protectora', title: 'Cierre protector', message: 'Acompañaste con cuidado a la persona usuaria.', tone: 'positive',
      reason: ['Recomendaste medidas de protección.', 'Ninguna de tus respuestas fue contraindicada.'],
    },
    persona: { bond: 'OPEN', activation: 'CALM', label: 'se muestra abierta y serena' },
    milestones: {
      done: [
        { key: 'escucha', label: 'Escuchar sin juzgar', decisive: false },
        { key: 'proteccion', label: 'Recomendar medidas de protección', decisive: true },
      ],
      missing: [{ key: 'remision', label: 'Remitir a la ruta institucional', decisive: true }],
    },
    competencyLevels: [
      {
        code: 'C1', name: 'Escucha activa', level: 'LOGRADO', basis: null,
        evidence: [{ order: 1, nodeTitle: 'Sala de escucha', optionText: 'Escuchar sin juzgar', class: 'RECOMMENDED', level: 'LOGRADO' }],
      },
      { code: 'C2', name: 'Manejo de la crisis', level: null, basis: null, evidence: [] },
    ],
    ...overrides,
  };
}

// Plain ts-jest (no jest-preset-angular) cannot wire signal inputs / render
// templates in TestBed, so — like the other simulator specs — we exercise the
// component's pure presentation helpers. `TestBed.createComponent` is only used
// to get an instance inside an injection context (the component injects AvatarStore).
// Template rendering is covered by `ng build` type-checking + manual smoke.
describe('AttemptOutcomeComponent', () => {
  let component: AttemptOutcomeComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      // `new AvatarStore()` sidesteps JIT reflection of its optional `Storage`
      // constructor param (NG0202 in ts-jest); it falls back to jsdom localStorage.
      providers: [
        provideRouter([]),
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: fakeKitService() },
        { provide: SimulationService, useValue: simulation },
      ],
    });
    component = TestBed.createComponent(AttemptOutcomeComponent).componentInstance;
  });

  it('el encabezado muestra al jugador con el retrato neutral de su receta del kit', () => {
    const visual = component.playerVisual();
    expect(visual?.recipeId).toBe('valentina');
    expect(visual?.portraits.neutral).toEqual({ kind: 'url', url: '/assets/characters/kit/valentina/portrait-neutral.png' });
  });

  it('al crearse pide el kit: sin él el jugador del encabezado no se dibuja', () => {
    TestBed.resetTestingModule();
    const kit = fakeKitService();
    const load = vi.spyOn(kit, 'load');
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      providers: [
        provideRouter([]),
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: kit },
        { provide: SimulationService, useValue: simulation },
      ],
    });
    TestBed.createComponent(AttemptOutcomeComponent);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('la pausa habla de reanudar y el cierre terminal no finge pausa (ETH-02 A)', () => {
    expect(component.eyebrow('PAUSED')).toBe('Pausa segura activa');
    expect(component.headline('PAUSED')).toContain('retomarlo');
    expect(component.eyebrow('SAFE_EXITED')).toBe('Salida segura registrada');
    expect(component.headline('SAFE_EXITED')).toContain('cerrado');
    expect(component.headline('SAFE_EXITED')).not.toMatch(/pausa/i);
    expect(component.eyebrow('COMPLETED')).toBe('¡Simulación completada!');
  });

  it('el intento reemplazado no se presenta como salida segura', () => {
    expect(component.eyebrow('REPLACED')).toBe('Intento reemplazado');
    expect(component.headline('REPLACED')).toContain('nuevo');
    expect(component.headline('REPLACED')).not.toMatch(/salida segura|sin penalización/i);
  });

  it('timelineTone: prohibida pisa la clase; sin clase = evento', () => {
    const base = { atSeconds: 10, time: '00:10', type: 'DECISION_SELECTED', label: 'x' };
    expect(component.timelineTone({ ...base, class: 'RECOMMENDED', prohibited: false })).toBe('RECOMMENDED');
    expect(component.timelineTone({ ...base, class: 'CONTRAINDICATED', prohibited: true })).toBe('PROHIBITED');
    expect(component.timelineTone({ ...base, type: 'ROOM_ENTERED', class: null, prohibited: false })).toBe('EVENT');
  });

  it('el reporte acepta una línea de tiempo opcional (contrato aditivo)', () => {
    const report = makeReport({
      timeline: [{
        atSeconds: 135, time: '02:15', type: 'DECISION_SELECTED',
        class: 'RECOMMENDED', prohibited: false,
        label: 'Aplicar Primeros Auxilios Psicológicos',
      }],
    });
    expect(report.timeline![0].time).toBe('02:15');
    expect(makeReport().timeline).toBeUndefined();
  });
});

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

const source = readFileSync(join(__dirname, 'attempt-outcome.component.ts'), 'utf-8');

/** La figura real exige entradas `input.required` que el TestBed no registra: se sustituye por un doble. */
@Component({ selector: 'app-kit-figure', standalone: true, changeDetection: ChangeDetectionStrategy.Eager,
 template: '' })
class KitFigureStubComponent {
  @Input() visual: unknown;
  @Input() portrait: unknown;
  @Input() scale: unknown;
}

describe('AttemptOutcomeComponent: pausa calmada renderizada (T12.1, AC-7)', () => {
  let fixture: ComponentFixture<AttemptOutcomeComponent>;
  let component: AttemptOutcomeComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  function render(status: 'PAUSED' | 'COMPLETED' | 'SAFE_EXITED' | 'REPLACED' | 'IN_PROGRESS', options: { report?: AttemptCompletionReport | null; resources?: string[]; pauseNote?: string | null } = {}): void {
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      providers: [
        provideRouter([]),
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: fakeKitService() },
        { provide: SimulationService, useValue: simulation },
      ],
    });
    TestBed.overrideComponent(AttemptOutcomeComponent, {
      remove: { imports: [KitFigureComponent] },
      add: { imports: [KitFigureStubComponent] },
    });
    fixture = TestBed.createComponent(AttemptOutcomeComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.status, status);
    writeInputSignal(component.report, options.report === undefined ? makeReport({ status: status as AttemptCompletionReport['status'] }) : options.report);
    if (options.resources) writeInputSignal(component.supportResources, options.resources);
    if (options.pauseNote !== undefined) writeInputSignal(component.pauseNote, options.pauseNote);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('el título es «Tu caso está en pausa», dentro de un alertdialog nombrado por él', () => {
    render('PAUSED', { report: makeReport({ summaryMessage: 'Buen trabajo' }) });
    const dialog = host().querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-labelledby')).toBe('outcome-title');
    const title = host().querySelector('#outcome-title');
    expect(text(title)).toBe('Tu caso está en pausa');
    expect(text(title)).toMatch(/pausa/i);
    // El resumen del servidor no pisa el título de la pausa.
    expect(host().textContent).not.toContain('Buen trabajo');
  });

  it('muestra el texto tranquilizador exacto y ninguna clave interna', () => {
    render('PAUSED');
    expect(text(host().querySelector('.oc-pause-copy')))
      .toBe('Tu avance quedó guardado exactamente donde estabas. No hay penalización: puedes retomarlo cuando quieras.');
  });

  it('con la pausa aún sin registrar, una línea discreta con role="status" lo dice, justo bajo el texto tranquilizador; sin nota no hay línea', () => {
    render('PAUSED', { pauseNote: 'Saliste del caso. Registraremos la pausa cuando vuelva la conexión.' });
    const note = host().querySelector('.oc-pause-note') as HTMLElement;
    expect(note.getAttribute('role')).toBe('status');
    expect(text(note)).toBe('Saliste del caso. Registraremos la pausa cuando vuelva la conexión.');
    expect(note.previousElementSibling?.classList.contains('oc-pause-copy')).toBe(true);
    fixture.destroy();
    TestBed.resetTestingModule();
    render('PAUSED', { pauseNote: null });
    expect(host().querySelector('.oc-pause-note')).toBeNull();
  });

  it('«Reanudar este intento» es la primera acción y «Volver al catálogo» la segunda', () => {
    render('PAUSED');
    const actions = Array.from(host().querySelectorAll('button, a')).filter(el => !el.closest('details'));
    expect(text(actions[0])).toBe('Reanudar este intento');
    expect(actions[0].tagName).toBe('BUTTON');
    expect(text(actions[1])).toBe('Volver al catálogo');
    expect(actions).toHaveLength(2);
  });

  it('«Reanudar este intento» emite resume y es el elemento con foco inicial', () => {
    render('PAUSED');
    const resume = vi.fn();
    component.resume.subscribe(resume);
    const button = host().querySelector('button.oc-btn--go') as HTMLButtonElement;
    expect(button.hasAttribute('cdkFocusInitial')).toBe(true);
    button.click();
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('la pausa captura el foco: el elemento activo es «Reanudar este intento»', async () => {
    render('PAUSED');
    await fixture.whenStable();
    expect(document.activeElement).toBe(host().querySelector('button.oc-btn--go'));
  });

  it('el final del caso solo aparece dentro del details cerrado «Ver mi seguimiento»', () => {
    render('PAUSED');
    const details = host().querySelector('details') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(text(details.querySelector('summary'))).toBe('Ver mi seguimiento');
    expect(text(details)).toContain('Cierre protector');
    const outside = Array.from(host().querySelectorAll('section > :not(details)')).map(el => el.textContent).join(' ');
    expect(outside).not.toContain('Cierre protector');
  });

  it('las acciones van antes que los recursos y que el tablero (visibles sin desplazarse)', () => {
    render('PAUSED', { resources: ['Línea 155 de orientación'] });
    const order = Array.from(host().querySelectorAll('.oc-pause-copy, .oc-actions--pause, .oc-support, details')).map(el => el.className || el.tagName);
    expect(order).toEqual(['oc-pause-copy', 'oc-actions oc-actions--pause', 'oc-block oc-support', 'oc-details']);
    expect(source).toMatch(/\.oc-actions--pause \{ justify-content: flex-start; margin-top: 0;/);
  });

  it('los recursos de apoyo solo se muestran si el intento los trae', () => {
    render('PAUSED', { resources: ['Línea 155 de orientación', 'Comisaría de Familia'] });
    expect(Array.from(host().querySelectorAll('.oc-support li')).map(li => text(li)))
      .toEqual(['Línea 155 de orientación', 'Comisaría de Familia']);
    fixture.destroy();
    TestBed.resetTestingModule();
    render('PAUSED');
    expect(host().querySelector('.oc-support')).toBeNull();
  });

  it('sin informe no hay details y la pausa sigue ofreciendo reanudar', () => {
    render('PAUSED', { report: null });
    expect(host().querySelector('details')).toBeNull();
    expect(text(host().querySelector('button.oc-btn--go'))).toBe('Reanudar este intento');
  });

  it('el resto de estados conserva su tablero y sus acciones', () => {
    render('COMPLETED');
    expect(host().querySelector('details')).toBeNull();
    expect(host().textContent).toContain('Cierre protector');
    expect(Array.from(host().querySelectorAll('footer button, footer a')).map(el => text(el)))
      .toEqual(['Reintentar caso', 'Volver al simulador', 'Volver al portal']);
    expect(host().querySelector('[role="alertdialog"]')?.classList).not.toContain('outcome--pause');
    fixture.destroy();
    TestBed.resetTestingModule();
    render('SAFE_EXITED');
    expect(Array.from(host().querySelectorAll('footer button, footer a')).map(el => text(el)))
      .toEqual(['Iniciar un nuevo intento', 'Volver al catálogo', 'Volver al portal']);
    fixture.destroy();
    TestBed.resetTestingModule();
    render('REPLACED');
    expect(Array.from(host().querySelectorAll('footer button, footer a')).map(el => text(el)))
      .toEqual(['Volver al catálogo', 'Volver al portal']);
  });

  it('si «Cómo llegaste aquí» ya nombra a la persona (el final depende de ella), su línea no se repite encima', () => {
    // V4, SIM-VBG-002 «La ruta se abandona»: la persona salía dos veces seguidas en el cierre.
    const base = makeReport({ status: 'COMPLETED' });
    render('COMPLETED', { report: { ...base, ending: { ...base.ending!, reason: ['Cumpliste: Valorar el riesgo', 'La persona usuaria se muestra abierta y serena'] } } });
    const ending = host().querySelector('.oc-ending') as HTMLElement;
    expect(ending.querySelector('.oc-ending__persona')).toBeNull();
    expect(Array.from(ending.querySelectorAll('.oc-ending__reasons li')).map(el => text(el)))
      .toEqual(['Cumpliste: Valorar el riesgo', 'La persona usuaria se muestra abierta y serena']);
  });

  it('con el intento en curso no se pinta nada', () => {
    render('IN_PROGRESS');
    expect(host().querySelector('section')).toBeNull();
  });

  // F6-6 (H-05, WCAG 4.1.3 y 2.4.3; RN-01 en borrador): el resultado es un diálogo modal de verdad.
  describe('resultado accesible (F6-6)', () => {
    // req: BLOQUE-H (H-05), REGLA-004, RNF-04
    it('es modal en todos los estados: aria-modal y trampa de foco (no solo en la pausa)', async () => {
      for (const status of ['COMPLETED', 'SAFE_EXITED', 'REPLACED', 'PAUSED'] as const) {
        render(status);
        await fixture.whenStable();
        const dialog = host().querySelector('[role="alertdialog"]') as HTMLElement;
        expect(dialog.getAttribute('aria-modal'), status).toBe('true');
        expect(host().querySelectorAll('.cdk-focus-trap-anchor').length, `${status}: trampa de foco`).toBe(2);
        fixture.destroy();
        TestBed.resetTestingModule();
      }
    });

    it('el foco inicial va al título (que lleva tabindex −1) cuando el intento terminó', async () => {
      render('COMPLETED');
      await fixture.whenStable();
      const title = host().querySelector('#outcome-title') as HTMLElement;
      expect(title.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(title);
      // Nunca a un botón: un Enter mantenido al cerrar la supervisión activaría «Reintentar caso».
      expect((document.activeElement as HTMLElement).tagName).not.toBe('BUTTON');
    });

    it('en pausa el foco sigue en «Reanudar este intento»: lo primero es poder volver', async () => {
      render('PAUSED');
      await fixture.whenStable();
      expect(document.activeElement).toBe(host().querySelector('button.oc-btn--go'));
    });

    it('al reanudar el foco vuelve a donde estaba antes de la pausa, y si ese elemento ya no está, al juego', async () => {
      const before = document.createElement('button');
      before.textContent = 'Salida segura';
      document.body.appendChild(before);
      before.focus();
      render('PAUSED');
      await fixture.whenStable();
      expect(document.activeElement).not.toBe(before);

      writeInputSignal(component.status, 'IN_PROGRESS');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(before);

      // El elemento desapareció (p. ej. el pie se repintó): el foco cae a un elemento visible del juego, nunca a <body>.
      // El mundo (#game-area) es un contenedor sin tabindex: no puede recibirlo y se sigue con #main-content.
      const area = document.createElement('div');
      area.id = 'game-area';
      document.body.appendChild(area);
      const container = document.createElement('div');
      container.id = 'main-content';
      container.tabIndex = -1;
      document.body.appendChild(container);
      before.remove();
      const gone = document.createElement('button');
      document.body.appendChild(gone);
      gone.focus();
      writeInputSignal(component.status, 'PAUSED');
      fixture.detectChanges();
      await fixture.whenStable();
      gone.remove();
      writeInputSignal(component.status, 'IN_PROGRESS');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(container);
      container.remove();
      area.remove();
    });

    it('lleva el aviso de alcance (RN-01, borrador) fuera de los textos validados y no en la pausa calmada', () => {
      render('COMPLETED');
      expect(host().querySelector('ui-scope-notice')).not.toBeNull();
      expect(host().querySelector('ui-scope-notice')!.closest('.oc-ending, .oc-pause-copy, .oc-actions')).toBeNull();
      fixture.destroy();
      TestBed.resetTestingModule();
      render('PAUSED');
      // En la pausa solo está dentro del seguimiento plegado: lo primero a la vista son las acciones.
      expect(host().querySelector('section > ui-scope-notice')).toBeNull();
    });

    it('los textos congelados no cambian', () => {
      render('COMPLETED');
      expect(component.eyebrow('COMPLETED')).toBe('¡Simulación completada!');
      expect(host().textContent).toContain('Cierre protector');
      fixture.destroy();
      TestBed.resetTestingModule();
      render('PAUSED');
      expect(text(host().querySelector('#outcome-title'))).toBe('Tu caso está en pausa');
      expect(component.pauseMessage)
        .toBe('Tu avance quedó guardado exactamente donde estabas. No hay penalización: puedes retomarlo cuando quieras.');
      expect(text(host().querySelector('button.oc-btn--go'))).toBe('Reanudar este intento');
    });
  });

  describe('forma (F6-6)', () => {
    const rule = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return source.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    };
    const rem = (selector: string) => Number(/font-size:\s*([0-9.]+)rem/.exec(rule(selector))?.[1]);

    it('las acciones tienen hover protegido para híbridos y estilo de pulsado', () => {
      expect(source).not.toMatch(/\n {4}\.oc-btn[^{]*:hover/); // a nivel de hoja, sin la consulta
      expect(source).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.oc-btn:hover \{/);
      expect(source).toMatch(/\.oc-btn:active \{ transform: translateY\(1px\); \}/);
    });

    it('ningún rótulo del resultado baja de 12 px', () => {
      for (const selector of ['.oc-label', '.oc-eyebrow', '.oc-chip, .oc-tag']) {
        const size = selector === '.oc-chip, .oc-tag'
          ? Number(/font-size:\s*([0-9.]+)rem/.exec(source.match(/\.oc-chip, \.oc-tag \{([^}]*)\}/)?.[1] ?? '')?.[1])
          : rem(selector);
        expect(size * 16, selector).toBeGreaterThanOrEqual(12);
      }
    });

    it('a 360 px los hitos y la línea de tiempo caben en una columna útil (sin desplazamiento horizontal)', () => {
      const narrow = source.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
      expect(narrow).toMatch(/\.oc-milestones \{[^}]*grid-template-columns: minmax\(0, ?1fr\)/);
      expect(narrow).toMatch(/\.oc-tl \{[^}]*grid-template-columns: \d+px minmax\(0, ?1fr\)/);
      expect(narrow).toMatch(/\.oc-actions \{[^}]*flex-direction: column/);
    });
  });

  describe('respuestas reconsideradas (L-03)', () => {
    const chips = () => Array.from(host().querySelectorAll('.oc-chip')).map(el => text(el));

    it('con reintentos el cierre muestra el chip «Reconsideradas: N» junto a los de decisiones', () => {
      render('COMPLETED', { report: makeReport({ retries: 6 }) });
      expect(chips()).toContain('Reconsideradas: 6');
    });

    it('no son decisiones: no cambian el final ni los hitos ni agregan alertas éticas', () => {
      render('COMPLETED', { report: makeReport({ retries: 2, prohibitedRetries: 1 }) });
      expect(chips().some(chip => /alertas éticas/i.test(chip))).toBe(false);
      expect(text(host().querySelector('.oc-ending__title'))).toBe('Cierre protector');
      expect(host().querySelectorAll('.oc-milestones__list li')).toHaveLength(3);
    });

    it('sin reintentos (0 o ausente) no aparece el chip', () => {
      render('COMPLETED', { report: makeReport({ retries: 0 }) });
      expect(chips().some(chip => /reconsideradas/i.test(chip))).toBe(false);
      fixture.destroy();
      TestBed.resetTestingModule();
      render('COMPLETED', { report: makeReport() });
      expect(chips().some(chip => /reconsideradas/i.test(chip))).toBe(false);
    });

    it('la recomendación del servidor sobre lo reconsiderado llega tal cual a «Retroalimentación del sistema»', () => {
      render('COMPLETED', {
        report: makeReport({ retries: 1, recommendations: ['Reconsideraste 1 respuesta antes de decidir; revísala con tu docente.'] }),
      });
      expect(host().querySelector('.oc-feedback')?.textContent).toContain('Reconsideraste 1 respuesta antes de decidir; revísala con tu docente.');
    });
  });
});

// req: RN-08, RF-23, CU-13, RF-10 (F10-4: la retroalimentación pedagógica y su fundamento se leen al cierre, por C2)
describe('AttemptOutcomeComponent: tus decisiones y marcador (F10-4, C2)', () => {
  let fixture: ComponentFixture<AttemptOutcomeComponent>;
  let component: AttemptOutcomeComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const decision = (overrides: Partial<DecisionReviewItem> = {}): DecisionReviewItem => ({
    order: 1,
    nodeId: 4,
    nodeTitle: 'Sala de escucha',
    chosen: { optionId: 9, text: 'Escuchar sin juzgar' },
    consequence: 'La estudiante continúa la conversación.',
    feedback: { explanation: 'Validar antes de indagar protege la confianza.', theoryBasis: 'Primeros auxilios psicológicos' },
    class: 'RECOMMENDED',
    prohibited: false,
    ...overrides,
  });

  /** Renderiza el resultado con el reporte del dueño (C2) que devuelve el servicio, o con su error. */
  function render(options: {
    status?: 'COMPLETED' | 'PAUSED';
    items?: DecisionReviewItem[];
    error?: unknown;
    reviewAttemptId?: string | null;
    /** La respuesta de decidir ya trae el reporte con sus decisiones (la ruta normal) o no (la de respaldo). */
    reportHasDecisions?: boolean;
    mode?: 'student' | 'rehearsal';
    caseVersionId?: number | null;
    /** V5: el informe dice si el caso declara competencias (sin el campo, como antes). */
    competenciesDeclared?: boolean;
  } = {}): void {
    TestBed.configureTestingModule({
      imports: [AttemptOutcomeComponent],
      providers: [
        provideRouter([]),
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: fakeKitService() },
        { provide: SimulationService, useValue: simulation },
      ],
    });
    TestBed.overrideComponent(AttemptOutcomeComponent, {
      remove: { imports: [KitFigureComponent] },
      add: { imports: [KitFigureStubComponent] },
    });
    const items = options.items ?? [decision()];
    simulation.studentReport.mockReset();
    simulation.studentReport.mockReturnValue(options.error
      ? throwError(() => options.error)
      : of(makeReport({ status: 'COMPLETED', decisionReview: items })));
    fixture = TestBed.createComponent(AttemptOutcomeComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.status, options.status ?? 'COMPLETED');
    const declara = options.competenciesDeclared === undefined ? {} : { competenciesDeclared: options.competenciesDeclared };
    writeInputSignal(component.report, options.reportHasDecisions
      ? makeReport({ status: 'COMPLETED', decisionReview: items, ...declara })
      : makeReport({ status: 'COMPLETED', ...declara }));
    writeInputSignal(component.reviewAttemptId, options.reviewAttemptId === undefined ? 'a1' : options.reviewAttemptId);
    if (options.mode) writeInputSignal(component.mode, options.mode);
    if (options.caseVersionId !== undefined) writeInputSignal(component.caseVersionId, options.caseVersionId);
    fixture.detectChanges();
  }

  /** Deja que la carga del reporte llegue y se pinte. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('«Tus decisiones» aparece al completar y pide el reporte del dueño', async () => {
    render();
    await settle();

    expect(simulation.studentReport).toHaveBeenCalledWith('a1');
    expect(text(host().querySelector('#oc-decisions-title'))).toBe('Tus decisiones');
  });

  it('si la respuesta de decidir ya trae las decisiones, no se pide nada más al cerrar (una petición menos)', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();

    expect(simulation.studentReport).not.toHaveBeenCalled();
    expect(host().querySelectorAll('.oc-decision')).toHaveLength(1);
  });

  it('sin pedirlo (pausa) no se pide el reporte ni aparece la sección', async () => {
    render({ status: 'PAUSED', reviewAttemptId: null });
    await settle();

    expect(simulation.studentReport).not.toHaveBeenCalled();
    expect(host().querySelector('.oc-decisions')).toBeNull();
  });

  it('cada decisión lleva la elección, la consecuencia, la explicación, el fundamento y su etiqueta formativa', async () => {
    render({ items: [decision()] });
    await settle();

    const item = host().querySelector('.oc-decision') as HTMLElement;
    expect(text(item)).toContain('Escuchar sin juzgar');
    expect(text(item)).toContain('La estudiante continúa la conversación.');
    expect(text(item)).toContain('Validar antes de indagar protege la confianza.');
    expect(text(item)).toContain('Primeros auxilios psicológicos');
    expect(text(item.querySelector('.oc-decision__tone'))).toBe('Recomendada');
  });

  it('la etiqueta de cada decisión es cualitativa: nunca un puntaje', async () => {
    render({ items: [decision({ class: 'ACCEPTABLE' }), decision({ order: 2, class: 'RISKY' }), decision({ order: 3, class: 'CONTRAINDICATED' })] });
    await settle();

    const labels = Array.from(host().querySelectorAll('.oc-decision__tone')).map(el => text(el));
    expect(labels).toEqual(['Aceptable', 'Con riesgo', 'Contraindicada']);
    expect(text(host().querySelector('.oc-decisions'))).not.toMatch(/\d+\s*pts|puntos/i);
  });

  it('una decisión sin explicación muestra su estado vacío y el resto de la lista sigue', async () => {
    render({ items: [decision({ feedback: { explanation: '' } }), decision({ order: 2 })] });
    await settle();

    const items = host().querySelectorAll('.oc-decision');
    expect(items).toHaveLength(2);
    expect(text(items[0].querySelector('.oc-decision__empty'))).toBe('El caso no trae una explicación para esta decisión.');
    expect(items[1].querySelector('.oc-decision__empty')).toBeNull();
  });

  it('con la primera respuesta no aplicada lo dice con la etiqueta congelada y la opción de entonces', async () => {
    render({ items: [decision({ reconsidered: { firstOptionId: 7, firstOptionText: 'Dar un consejo de inmediato' } })] });
    await settle();

    expect(text(host().querySelector('.oc-decision__first'))).toBe(`${RECONSIDERED_LABEL}: Dar un consejo de inmediato`);
  });

  it('una conducta prohibida se señala con la nota ética, sin alarma de puntaje', async () => {
    render({ items: [decision({ class: 'CONTRAINDICATED', prohibited: true })] });
    await settle();

    expect(text(host().querySelector('.oc-decision__note'))).toBe('Alerta ética: esta respuesta puede aumentar el riesgo de revictimización.');
  });

  it('sin decisiones que mostrar, el estado vacío lo dice y no hay error a la vez', async () => {
    render({ items: [] });
    await settle();

    expect(text(host().querySelector('.oc-decisions ui-empty-state'))).toContain('Este intento no tiene decisiones registradas para revisar.');
    // El texto por defecto del tipo «sin resultados» (filtros de búsqueda) no puede aparecer aquí.
    expect(text(host().querySelector('.oc-decisions ui-empty-state'))).not.toContain('Ningún elemento');
    expect(host().querySelector('.oc-decisions ui-error-state')).toBeNull();
  });

  it('un fallo al cargar muestra el error con «Reintentar», y reintentar vuelve a pedir el reporte', async () => {
    render({ error: new HttpErrorResponse({ status: 500 }) });
    await settle();

    const section = host().querySelector('.oc-decisions') as HTMLElement;
    expect(section.querySelector('ui-error-state')).not.toBeNull();
    expect(section.querySelector('.oc-decisions__list')).toBeNull();
    const retry = Array.from(section.querySelectorAll('button')).find(button => /reintentar/i.test(button.textContent ?? ''));
    expect(retry).toBeDefined();

    simulation.studentReport.mockReturnValue(of(makeReport({ status: 'COMPLETED', decisionReview: [decision()] })));
    retry!.click();
    await settle();

    expect(simulation.studentReport).toHaveBeenCalledTimes(2);
    expect(host().querySelectorAll('.oc-decision')).toHaveLength(1);
  });

  it('«Elegiste:» muestra el texto corto del botón que se pulsó si el caso lo trae; si no, el de la opción (V4)', async () => {
    render({ reportHasDecisions: true, items: [
      { ...decision(), chosen: { optionId: 9, text: 'Escuchar sin juzgar, con todo el detalle del protocolo', label: 'Escuchar sin juzgar' } },
      { ...decision(), order: 2, chosen: { optionId: 10, text: 'Derivar a la ruta' } },
    ] });
    await settle();

    const chosen = Array.from(host().querySelectorAll('.oc-decision__chosen')).map(el => text(el));
    expect(chosen).toEqual(['Elegiste: Escuchar sin juzgar', 'Elegiste: Derivar a la ruta']);
  });

  it('si el caso no declara competencias, el cierre no muestra el bloque (V5); si las declara, «Sin evidencia» sigue', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();
    const conBloque = !!host().querySelector('.oc-competencies');
    fixture.destroy();
    TestBed.resetTestingModule();

    render({ reportHasDecisions: true, items: [decision()], competenciesDeclared: false });
    await settle();
    expect(host().querySelector('.oc-competencies')).toBeNull();
    expect(host().querySelector('.oc-ending')).not.toBeNull();
    expect(host().querySelector('.oc-decisions')).not.toBeNull();
    expect(conBloque).toBe(true);
  });

  it('el cierre completo no muestra puntaje, estrés, desempeño ni porcentajes', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();

    expect(text(host())).not.toMatch(/puntaje|estrés|desempeño|\d+\s?%/i);
    expect(host().querySelector('.oc-metrics, .oc-bars, .oc-bar')).toBeNull();
  });

  it('el orden del cierre: final, autoevaluación, hitos, competencias y revisión decisión por decisión', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();

    const order = Array.from(host().querySelectorAll('.oc-ending, .oc-selfcheck, .oc-milestones, .oc-competencies, .oc-decisions'))
      .map(el => ['oc-ending', 'oc-selfcheck', 'oc-milestones', 'oc-competencies', 'oc-decisions'].find(name => el.classList.contains(name)));
    expect(order).toEqual(['oc-ending', 'oc-selfcheck', 'oc-milestones', 'oc-competencies', 'oc-decisions']);
  });

  it('el final lleva su título, su mensaje, la persona en palabras y «Cómo llegaste aquí» con cada razón', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();

    const ending = host().querySelector('.oc-ending') as HTMLElement;
    // R-18: el tono del final (positive/warning/critical) no se pinta al estudiante: sin `data-tone`, un solo color.
    expect(ending.hasAttribute('data-tone')).toBe(false);
    expect(text(ending.querySelector('.oc-ending__title'))).toBe('Cierre protector');
    expect(text(ending.querySelector('.oc-ending__persona'))).toBe('La persona usuaria se muestra abierta y serena.');
    expect(text(ending.querySelector('.oc-ending__how'))).toBe('Cómo llegaste aquí');
    expect(Array.from(ending.querySelectorAll('.oc-ending__reasons li')).map(text))
      .toEqual(['Recomendaste medidas de protección.', 'Ninguna de tus respuestas fue contraindicada.']);
    expect(ending.querySelector('.oc-chip')).toBeNull();
  });

  it('la autoevaluación (¿qué salió bien? / ¿qué cambiarías?) va antes de la revisión y es local', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();

    const selfcheck = host().querySelector('.oc-selfcheck') as HTMLElement;
    const review = host().querySelector('.oc-decisions') as HTMLElement;
    expect(selfcheck.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(selfcheck.querySelectorAll('label')).map(text)).toEqual(['¿Qué salió bien?', '¿Qué cambiarías?']);
    expect(selfcheck.querySelectorAll('textarea')).toHaveLength(2);
    expect(text(selfcheck)).toContain('se queda solo en este dispositivo');
  });

  it('la autoevaluación se recoge al pulsar «Listo» u «Omitir por ahora», sin pedir nada al servidor', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();
    const buttons = () => Array.from(host().querySelectorAll('.oc-selfcheck button')) as HTMLButtonElement[];

    const good = host().querySelector('#oc-self-good') as HTMLTextAreaElement;
    good.value = 'Escuché sin interrumpir';
    good.dispatchEvent(new Event('input'));
    buttons().find(button => text(button) === 'Listo')!.click();
    fixture.detectChanges();
    expect(host().querySelector('.oc-selfcheck textarea')).toBeNull();
    expect(text(host().querySelector('.oc-selfcheck'))).toContain('No se guardó nada: lo que escribiste solo vive en esta pantalla.');

    buttons().find(button => text(button) === 'Editar mis notas')!.click();
    fixture.detectChanges();
    expect((host().querySelector('#oc-self-good') as HTMLTextAreaElement).value).toBe('Escuché sin interrumpir');
    buttons().find(button => text(button) === 'Omitir por ahora')!.click();
    fixture.detectChanges();
    expect(host().querySelector('.oc-selfcheck textarea')).toBeNull();
    expect(simulation.studentReport).not.toHaveBeenCalled();
  });

  it('el foco no se pierde al plegar la autoevaluación: va a «Editar mis notas», y al reabrirla, a la primera caja', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();
    const button = (name: string) => Array.from(host().querySelectorAll('.oc-selfcheck button'))
      .find(candidate => text(candidate) === name) as HTMLButtonElement;

    button('Listo').focus();
    button('Listo').click();
    await settle();
    expect(document.activeElement).toBe(button('Editar mis notas'));

    button('Editar mis notas').click();
    await settle();
    expect(document.activeElement).toBe(host().querySelector('#oc-self-good'));

    button('Omitir por ahora').focus();
    button('Omitir por ahora').click();
    await settle();
    expect(document.activeElement).toBe(button('Editar mis notas'));
  });

  it('una decisión de un reporte antiguo (sin clase, solo `classification`) no pinta una etiqueta vacía', async () => {
    const legacy = { ...decision(), class: undefined, classification: 'ADEQUATE' } as unknown as DecisionReviewItem;
    render({ items: [legacy] });
    await settle();

    expect(host().querySelectorAll('.oc-decision')).toHaveLength(1);
    expect(host().querySelector('.oc-decision__tone')).toBeNull();
  });

  it('«Lo que hiciste» y «Lo que faltó» salen de los hitos, con la palabra «clave» en los decisivos', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();

    const done = host().querySelector('.oc-milestones__col--done') as HTMLElement;
    const missing = host().querySelector('.oc-milestones__col--missing') as HTMLElement;
    expect(text(done.querySelector('.oc-label'))).toBe('Lo que hiciste');
    expect(text(missing.querySelector('.oc-label'))).toBe('Lo que faltó');
    expect(Array.from(done.querySelectorAll('li')).map(text)).toEqual(['Escuchar sin juzgar', 'Recomendar medidas de protección clave']);
    expect(Array.from(missing.querySelectorAll('li')).map(text)).toEqual(['Remitir a la ruta institucional clave']);
    expect(done.querySelectorAll('.oc-tag--key')).toHaveLength(1);
  });

  it('las competencias salen en palabras con las decisiones que las sustentan, y «Sin evidencia» si no hay nivel', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    await settle();

    const rows = Array.from(host().querySelectorAll('.oc-competency')) as HTMLElement[];
    expect(rows).toHaveLength(2);
    expect(text(rows[0].querySelector('.oc-competency__name'))).toBe('Escucha activa');
    expect(text(rows[0].querySelector('.oc-competency__level'))).toBe('Logrado');
    expect(Array.from(rows[0].querySelectorAll('.oc-competency__evidence li')).map(text)).toEqual(['Sala de escucha: Escuchar sin juzgar']);
    expect(text(rows[1].querySelector('.oc-competency__level'))).toBe('Sin evidencia');
    expect(rows[1].querySelector('.oc-competency__evidence')).toBeNull();
  });

  it('con un reporte anterior (sin final, hitos ni competencias) el cierre no inventa bloques', async () => {
    render({ reportHasDecisions: true, items: [decision()] });
    writeInputSignal(component.report, makeReport({
      ending: null, persona: undefined, milestones: undefined, competencyLevels: undefined, decisionReview: [decision()],
    }));
    fixture.detectChanges();
    await settle();

    expect(host().querySelector('.oc-ending, .oc-milestones, .oc-competencies')).toBeNull();
    expect(host().querySelector('.oc-decisions')).not.toBeNull();
  });

  it('las variantes de pausa y salida segura siguen mostrando su apoyo y no la autoevaluación', async () => {
    render({ status: 'PAUSED', reviewAttemptId: null });
    writeInputSignal(component.supportResources, ['Línea 155 de orientación']);
    fixture.detectChanges();
    await settle();

    expect(text(host().querySelector('.oc-support'))).toContain('Línea 155 de orientación');
    expect(host().querySelector('.oc-selfcheck')).toBeNull();
  });


  describe('«Respuestas que no llegaste a ver» (DSL-6)', () => {
    const missed = (overrides: Partial<MissedOption> = {}): MissedOption => ({
      optionId: 41, text: 'Quedarse y explicar', class: 'RECOMMENDED',
      missing: [
        { kind: 'talked', key: 'enfermera', label: 'Enfermera de urgencias' },
        { kind: 'used', key: 'PAP', label: 'Primeros auxilios psicológicos' },
      ],
      ...overrides,
    });

    it('lista por decisión las respuestas no vistas con lo que faltó explorar', async () => {
      render({ items: [decision({ missed: [missed()] })] });
      await settle();

      const bloque = host().querySelector('.oc-decision .oc-missed')!;
      expect(text(bloque)).toContain('Respuestas que no llegaste a ver');
      expect(text(bloque)).toContain('Aparecían si conocías algo más de la sala.');
      expect(text(bloque)).toContain('Quedarse y explicar');
      expect(text(bloque)).toContain('Recomendada');
      expect(text(bloque)).toContain('Te faltó: hablar con Enfermera de urgencias y usar Primeros auxilios psicológicos');
    });

    it('una respuesta retenida sin hechos de exploración lo dice sin inventar', async () => {
      render({ items: [decision({ missed: [missed({ optionId: 42, text: 'Otra', class: 'RISKY', missing: [] })] })] });
      await settle();

      const bloque = host().querySelector('.oc-missed')!;
      expect(text(bloque)).toContain('Dependía de cómo iba el caso hasta ese momento.');
      expect(text(bloque)).not.toContain('Te faltó');
    });

    it('sin respuestas no vistas, o con un informe v3, no hay bloque', async () => {
      render({ items: [decision({ missed: [] })] });
      await settle();
      expect(host().querySelector('.oc-missed')).toBeNull();
      fixture.destroy();
      TestBed.resetTestingModule();

      render({ items: [decision()] });
      await settle();
      expect(host().querySelector('.oc-missed')).toBeNull();
    });

    it('el bloque vive dentro de su decisión y las opciones se leen como lista', async () => {
      render({ items: [decision({ missed: [missed(), missed({ optionId: 43, text: 'Esperar', class: 'ACCEPTABLE', missing: [{ kind: 'has', key: 'k', label: 'Informe' }] })] })] });
      await settle();

      const bloque = host().querySelector('.oc-decision .oc-missed')!;
      expect(bloque.querySelectorAll('li')).toHaveLength(2);
      expect(text(bloque)).toContain('Te faltó: tener Informe');
    });
  });

describe('modo ensayo (DSL-10)', () => {
    it('el final de un ensayo ofrece empezar de nuevo y volver al editor, sin pedir el informe del estudiante ni la autoevaluación', async () => {
      // El reporte no trae decisionReview y hay id de intento: en modo estudiante eso pediría el informe congelado.
      render({ mode: 'rehearsal', caseVersionId: 9 });
      await settle();

      const botones = Array.from(host().querySelectorAll('footer.oc-actions button, footer.oc-actions a')).map(el => text(el));
      expect(botones).toEqual(['Empezar de nuevo', 'Volver al editor']);
      expect(host().querySelector('footer.oc-actions a')!.getAttribute('href')).toBe('/portal/casos/9/editor');
      expect(simulation.studentReport).not.toHaveBeenCalled();
      expect(host().querySelector('.oc-selfcheck')).toBeNull();
    });

    it('«Empezar de nuevo» emite retry', async () => {
      render({ mode: 'rehearsal', caseVersionId: 9 });
      const reintentos: unknown[] = [];
      component.retry.subscribe(() => reintentos.push(1));
      (host().querySelector('footer.oc-actions button') as HTMLButtonElement).click();
      expect(reintentos).toHaveLength(1);
    });

    it('sin id de caso el enlace lleva a la lista de casos (nunca un href roto)', async () => {
      render({ mode: 'rehearsal', caseVersionId: null });
      expect(host().querySelector('footer.oc-actions a')!.getAttribute('href')).toBe('/portal/casos');
    });

    it('en pausa, el ensayo ofrece volver al editor en lugar del catálogo de estudiantes', async () => {
      render({ mode: 'rehearsal', caseVersionId: 9, status: 'PAUSED', reviewAttemptId: null });
      const enlaces = Array.from(host().querySelectorAll('a')).map(el => el.getAttribute('href'));
      expect(enlaces).toContain('/portal/casos/9/editor');
      expect(enlaces).not.toContain('/portal/simulador');
    });

    it('el modo estudiante no cambia: reintentar y volver al simulador', async () => {
      render({ reviewAttemptId: null });
      const botones = Array.from(host().querySelectorAll('footer.oc-actions button, footer.oc-actions a')).map(el => text(el));
      expect(botones).toEqual(['Reintentar caso', 'Volver al simulador', 'Volver al portal']);
    });
  });
});

