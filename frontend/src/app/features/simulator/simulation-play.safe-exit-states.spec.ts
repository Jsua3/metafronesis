// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto
// de specs de la pantalla de juego): solo se evalúa `extends Phaser.Scene` al cargar el módulo.
vi.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class {},
    AUTO: 0,
    Scale: { FIT: 0, CENTER_BOTH: 0 },
    Math: { Clamp: (value: number) => value },
    Input: { Keyboard: { JustDown: () => false } },
  },
}));

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { EMPTY } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogueState, SimulationAttemptState } from '../../core/models/simulation.model';
import { AvatarStore } from '../character/avatar.store';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { AudioDirectorService } from './audio-director.service';
import { SimulationPlayComponent } from './simulation-play.component';

/**
 * Una sola implementación de «Salida segura» y exactamente UN botón operable por estado (plan visual F6-6; REGLA-004):
 * el pie y las superposiciones comparten `app-safe-exit-button`; bajo una superposición el pie queda inerte y la
 * superposición trae el suyo. Con una pausa pedida el MISMO botón dice «Pausando…» (aria-busy). Los dos avisos de
 * contenido (consentimiento y reanudar) no tienen pausa por diseño (ETH-01): su salida es «Volver al catálogo».
 * Se pinta la plantilla de verdad (sin mundo: el lienzo de Phaser no entra en jsdom).
 */
// req: REGLA-004, BLOQUE-H, RNF-04
describe('SimulationPlayComponent: una sola «Salida segura» operable por estado (F6-6)', () => {
  let fixture: ComponentFixture<SimulationPlayComponent>;
  let component: SimulationPlayComponent;
  const root = () => fixture.nativeElement as HTMLElement;

  const ATTEMPT = {
    attemptId: 'attempt-1', caseVersionId: 7, caseTitle: 'Caso demo', status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'hospital-urgencias', title: 'Urgencias', narrative: 'N', terminal: false, options: [] },
    completionReport: null,
  } as unknown as SimulationAttemptState;

  const dialogue = (withChoices: boolean) => ({
    key: 'd', speakerName: 'Enfermera', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Enfermera', text: 'Primera línea.', emotion: 'neutral' }],
    choices: withChoices
      ? [{ key: 'o', text: 'Responder', decisionOptionId: 101, requiredToolCode: null, effect: {} }]
      : [],
  }) as unknown as DialogueState;

  /** Botones de salida segura que la persona puede pulsar: ni dentro de [inert] ni de aria-hidden. */
  const operableExits = () => [...root().querySelectorAll<HTMLButtonElement>('button')]
    .filter(button => /salida segura|pausando/i.test(button.textContent ?? ''))
    .filter(button => !button.closest('[inert], [aria-hidden="true"]'));

  beforeEach(() => {
    sessionStorage.clear();
    const sim = {
      getActiveAttempt: vi.fn(() => EMPTY),
      getProgressMap: vi.fn(() => EMPTY),
      getWorld: vi.fn(() => EMPTY),
      safeExit: vi.fn(() => EMPTY),
      startAttempt: vi.fn(() => EMPTY),
    };
    const audio = {
      init: vi.fn(), setScene: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false),
      dispose: vi.fn(), stopIntroLament: vi.fn(), playIntroLament: vi.fn(), playSfx: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: sim },
        { provide: AudioDirectorService, useValue: audio },
        { provide: AuthService, useValue: {} },
        { provide: KitService, useValue: fakeKitService() },
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    fixture = TestBed.createComponent(SimulationPlayComponent);
    component = fixture.componentInstance;
    component.attempt.set(ATTEMPT);
    component.worldStarted.set(true);
    // El mundo ya pintó su primer cuadro: sin esto el umbral (B4b) seguiría a la vista y su salida segura sería la única
    // operable. Estas pruebas miran los estados JUGABLES; la salida del umbral la prueba umbral-caso.component.spec.
    component.worldRendered.set(true);
    component.loading.set(false);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('el pie usa el componente compartido y ya no trae un botón propio', () => {
    expect(root().querySelector('footer.bottom-zone app-safe-exit-button')).not.toBeNull();
    expect(root().querySelector('button.safe-exit')).toBeNull();
    expect(operableExits().length).toBe(1);
  });

  it('mundo libre: un solo botón, el del pie', () => {
    expect(operableExits()).toHaveLength(1);
    expect(operableExits()[0].closest('footer.bottom-zone')).not.toBeNull();
  });

  it('introducción: la tarjeta trae el suyo y el pie, inerte, no cuenta', () => {
    component.showCaseIntro.set(true);
    fixture.detectChanges();
    expect(operableExits()).toHaveLength(1);
    expect(operableExits()[0].closest('.case-intro-card')).not.toBeNull();
  });

  it('diálogo con opciones (panel lateral) y sin opciones (franja): el del panel; el pie queda inerte', () => {
    component.dialogue.set(dialogue(true));
    fixture.detectChanges();
    expect(operableExits()).toHaveLength(1);
    expect(operableExits()[0].closest('app-dialogue-panel')).not.toBeNull();

    component.dialogue.set(dialogue(false));
    fixture.detectChanges();
    expect(operableExits()).toHaveLength(1);
    expect(operableExits()[0].closest('app-dialogue-panel')).not.toBeNull();
  });

  it('bitácora abierta: el de la bitácora; cerrada, ni ella ni sus botones cuentan', () => {
    component.journalOpen.set(true);
    fixture.detectChanges();
    expect(operableExits()).toHaveLength(1);
    expect(operableExits()[0].closest('app-journal-panel')).not.toBeNull();

    component.journalOpen.set(false);
    fixture.detectChanges();
    expect(operableExits()).toHaveLength(1);
    expect(operableExits()[0].closest('footer.bottom-zone')).not.toBeNull();
  });

  it('ayuda «Cómo se juega» abierta: el pie sigue operable y es el único', () => {
    component.helpOpen.set(true);
    fixture.detectChanges();
    expect(operableExits()).toHaveLength(1);
    expect(operableExits()[0].closest('footer.bottom-zone')).not.toBeNull();
  });

  it('pausa pedida: el MISMO botón dice «Pausando…» con aria-busy y sigue siendo uno', () => {
    component.pausing.set(true);
    fixture.detectChanges();
    const buttons = operableExits();
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toContain('Pausando…');
    expect(buttons[0].getAttribute('aria-busy')).toBe('true');
    expect(buttons[0].disabled, 'el toque se acepta y la pausa queda en cola: nunca disabled').toBe(false);

    component.pausing.set(false);
    fixture.detectChanges();
    expect(operableExits()[0].textContent).toContain('Salida segura');
    expect(operableExits()[0].hasAttribute('aria-busy')).toBe(false);
  });

  it('en la superposición también dice «Pausando…» mientras la pausa espera', () => {
    component.journalOpen.set(true);
    component.pausing.set(true);
    fixture.detectChanges();
    const buttons = operableExits();
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest('app-journal-panel')).not.toBeNull();
    expect(buttons[0].textContent).toContain('Pausando…');
  });

  it('un toque en «Salida segura» pide la pausa (con una petición en curso sale igual, en el acto)', () => {
    component.busy.set(true);
    operableExits()[0].click();
    fixture.detectChanges();
    expect(component.pausing()).toBe(true);
  });

  it('los avisos de contenido no ofrecen pausa: su salida es «Volver al catálogo» (ETH-01)', () => {
    component.worldStarted.set(false);
    component.showContentWarning.set(true);
    fixture.detectChanges();
    expect(operableExits()).toHaveLength(0);
    expect(root().textContent).toContain('Volver al catálogo');
  });
});
