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

import { LIVE_WRITE_DELAY_MS, LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { MapObjectState, SimulationAttemptState, SimulationWorldState } from '../../core/models/simulation.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { AudioDirectorService } from './audio-director.service';
import { ORIENTATION_COPY } from './orientation.config';
import { SimulationPlayComponent } from './simulation-play.component';

/**
 * Anuncios y avisos de la pantalla de juego (plan visual F6-12; H-08, H-09, H-10, H-23; VD-29): el juego ya no trae
 * una región viva propia —anuncia por las dos regiones persistentes de la app—; la barra de contexto anuncia solo la
 * interacción; los avisos ACCIONABLES (la puerta bloqueada, el error de una acción) van por el anfitrión de avisos
 * del sistema (`ui-toast-host`, colocación del juego: arriba a la izquierda, sin tapar «Salida segura», la cruceta ni
 * «Interactuar»), permanecen hasta cerrarse con «Cerrar» sin mover el foco y los anuncia ese anfitrión una vez; los
 * breves (sala, etapa, recogida) se anuncian y se retiran solos. Se pinta la plantilla de verdad (sin mundo: el
 * lienzo de Phaser no entra en jsdom).
 */
// req: BLOQUE-H (H-08, H-09, H-10, H-23), RNF-04
describe('SimulationPlayComponent: anuncios y avisos (F6-12)', () => {
  let fixture: ComponentFixture<SimulationPlayComponent>;
  let component: SimulationPlayComponent;
  let notifications: NotificationService;
  // Métodos privados del componente: el mismo recurso que usan los demás specs de la pantalla.
  const internals = () => component as any;
  const root = () => fixture.nativeElement as HTMLElement;
  const region = (politeness: 'polite' | 'assertive') =>
    document.querySelector<HTMLElement>(`[data-live-region="${politeness}"]`)!;
  const settle = () => { vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS); fixture.detectChanges(); };
  let visible: Array<{ id: number; type: string; text: string }> = [];
  const toasts = () => visible.map(({ type, text }) => ({ type, text }));

  const ATTEMPT = {
    attemptId: 'attempt-1', caseVersionId: 7, caseTitle: 'Caso demo', status: 'IN_PROGRESS',
    persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'hospital-urgencias', title: 'Urgencias', narrative: 'N', terminal: false, options: [] },
    completionReport: null,
  } as unknown as SimulationAttemptState;

  const nurse = {
    key: 'npc:enfermera', label: 'Enfermera de urgencias', type: 'PERSON', x: 100, y: 100, width: 20, height: 20,
    color: '#fff', icon: 'person', shortCode: 'ENF', collision: false, interactionPrompt: 'Hablar',
    interactionText: '', decisionOptionId: null, toolCode: null, dialogue: null,
  } as unknown as MapObjectState;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
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
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    TestBed.inject(LiveRegionAnnouncer); // las regiones existen antes de que nadie anuncie (AppComponent las monta)
    notifications = TestBed.inject(NotificationService);
    notifications.messages$.subscribe(messages => { visible = messages; });
    fixture = TestBed.createComponent(SimulationPlayComponent);
    component = fixture.componentInstance;
    component.attempt.set(ATTEMPT);
    component.worldStarted.set(true);
    component.loading.set(false);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('regiones vivas', () => {
    it('el juego no trae región viva propia: anuncia por las dos de la app y ninguna mezcla status con assertive', () => {
      expect(root().querySelector('[aria-live="assertive"]')).toBeNull();
      expect(document.querySelectorAll('[data-live-region]').length).toBe(2);
      expect(document.querySelector('[aria-live="assertive"][role="status"]')).toBeNull();
    });

    it('la barra de contexto no es una región viva: ni en reposo ni con la nota de «nada a tu alcance» dentro de una', () => {
      const bar = root().querySelector('.context-bar')!;
      expect(bar.hasAttribute('aria-live')).toBe(false);
      component.showNothingNearby();
      fixture.detectChanges();
      expect(root().querySelector('.context-bar__now')!.closest('[aria-live]')).toBeNull();
    });

    it('una interacción cercana se anuncia una vez, con cortesía, y volver al reposo no anuncia la línea de reposo', () => {
      component.nearbyInteraction.set(nurse);
      fixture.detectChanges();
      settle();
      const button = root().querySelector<HTMLButtonElement>('button.context-bar__interaction')!;
      expect(button.getAttribute('aria-label')).toBe('Interactuar: Hablar con Enfermera de urgencias');
      expect(region('polite').textContent).toBe('Interactuar: Hablar con Enfermera de urgencias');

      component.nearbyInteraction.set(null);
      fixture.detectChanges();
      settle();
      expect(root().querySelector('.context-bar__now')).toBeNull();
      expect(region('assertive').textContent).toBe('');
    });

    it('pedir interactuar sin nada cerca se anuncia (la persona lo pidió y la línea de reposo ya no se lee sola)', () => {
      component.showNothingNearby();
      settle();
      expect(region('polite').textContent).toBe(ORIENTATION_COPY.now.nothingNearby);
    });

    it('anunciar no mueve el foco', () => {
      const other = document.createElement('button');
      document.body.appendChild(other);
      other.focus();
      internals().announce('Intento reanudado. Continúas exactamente donde quedaste.');
      settle();
      expect(document.activeElement).toBe(other);
      other.remove();
    });
  });

  describe('avisos accionables: permanecen hasta descartarse (VD-29, WCAG 2.2.1)', () => {
    const DOOR = 'Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente).';

    it('el aviso de puerta es un aviso del sistema que permanece hasta cerrarse, no una región propia del juego', () => {
      internals().showDoorNotice(DOOR);
      fixture.detectChanges();

      expect(toasts()).toEqual([{ type: 'warning', text: DOOR }]);
      expect(component.doorNotice()).toBe(DOOR);
      expect(root().querySelector('.door-notice'), 'el juego ya no pinta su propio aviso de puerta').toBeNull();

      vi.advanceTimersByTime(60_000);
      expect(toasts()).toEqual([{ type: 'warning', text: DOOR }]);
      expect(component.doorNotice()).toBe(DOOR);
    });

    it('el juego no lo anuncia por su cuenta: lo anuncia el anfitrión de avisos, una sola vez', () => {
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      internals().showDoorNotice(DOOR);
      internals().showActionError('No pudimos usar la herramienta.');
      settle();

      expect(announce).not.toHaveBeenCalled();
    });

    it('cerrar el aviso desde el anfitrión lo retira del juego; un aviso de puerta nuevo reemplaza al anterior', () => {
      internals().showDoorNotice(DOOR);
      const [{ id }] = visible;

      notifications.dismiss(id);
      expect(component.doorNotice()).toBe('');

      internals().showDoorNotice(DOOR);
      internals().showDoorNotice('Da unos pasos dentro de la sala antes de volver a cruzar la puerta.');
      expect(toasts()).toEqual([{ type: 'warning', text: 'Da unos pasos dentro de la sala antes de volver a cruzar la puerta.' }]);
    });

    it('el mismo aviso de puerta pulsado dos veces no apila otro', () => {
      internals().showDoorNotice(DOOR);
      internals().showDoorNotice(DOOR);
      expect(toasts()).toEqual([{ type: 'warning', text: DOOR }]);
    });

    it('el error de una acción es un aviso de error que permanece hasta cerrarse', () => {
      internals().showActionError('No pudimos registrar tu decisión. Inténtalo de nuevo.');
      fixture.detectChanges();

      expect(toasts()).toEqual([{ type: 'error', text: 'No pudimos registrar tu decisión. Inténtalo de nuevo.' }]);
      expect(component.actionError()).toBe('No pudimos registrar tu decisión. Inténtalo de nuevo.');
      expect(root().querySelector('.action-toast'), 'el juego ya no pinta su propio aviso de error').toBeNull();

      vi.advanceTimersByTime(60_000);
      expect(component.actionError()).toBe('No pudimos registrar tu decisión. Inténtalo de nuevo.');
    });

    it('un error nuevo reemplaza al anterior y una petición nueva retira el que quedó', () => {
      internals().showActionError('No pudimos usar la herramienta.');
      internals().showActionError('No pudimos abrir la interacción.');
      expect(toasts()).toEqual([{ type: 'error', text: 'No pudimos abrir la interacción.' }]);
      expect(component.actionError()).toBe('No pudimos abrir la interacción.');

      component.busy.set(true); // sale otra petición: el error anterior ya no describe lo que está pasando
      fixture.detectChanges();
      expect(component.actionError()).toBe('');
      expect(toasts()).toEqual([]);
    });

    it('con movimiento reducido el comportamiento no cambia', () => {
      component.reduceMotion.set(true);
      internals().showDoorNotice(DOOR);
      internals().showActionError('No pudimos usar la herramienta.');
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      expect(component.doorNotice()).toBe(DOOR);
      expect(component.actionError()).toBe('No pudimos usar la herramienta.');
    });

    it('la pausa, un intento nuevo y un cambio de sala retiran el aviso de puerta (era de lo que se hacía)', () => {
      internals().showDoorNotice(DOOR);
      internals().resetNotices();
      expect(component.doorNotice()).toBe('');

      internals().showDoorNotice(DOOR);
      component.world.set({ map: { key: 'hospital-urgencias', title: 'Urgencias' }, objects: [] } as unknown as SimulationWorldState);
      internals().applyLoadedWorld({ map: { key: 'hospital-sala-escucha', title: 'Sala de escucha' }, objects: [] });
      expect(component.doorNotice()).toBe('');
    });

    it('al salir de la pantalla de juego no dejan avisos suyos en el resto de la app', () => {
      internals().showDoorNotice(DOOR);
      internals().showActionError('No pudimos usar la herramienta.');

      fixture.destroy();

      expect(toasts()).toEqual([]);
    });
  });

  // Revisión final · C3: «persona a atender» no puede vivir solo en la lista «Ir a…» y en el dibujo del lienzo.
  describe('la persona a atender (P6): se anuncia al entrar a la sala y cuando cambia', () => {
    const sala = (key: string, title: string, objects: unknown[]) =>
      ({ map: { key, title }, objects }) as unknown as SimulationWorldState;
    const persona = (key: string, label: string, clave: boolean) =>
      ({ ...nurse, key, label, metadata: clave ? { personaClave: true } : {} }) as unknown as MapObjectState;

    it('al entrar a una sala con persona a atender, la región viva dice su nombre y «persona a atender»', () => {
      internals().announceKeyPerson(sala('consultorio', 'Consultorio', [persona('madre', 'Marta', true), persona('otra', 'Otra', false)]));
      settle();
      expect(region('polite').textContent).toBe('Marta, persona a atender');
      expect(region('assertive').textContent).toBe('');
    });

    it('no la repite mientras sea la misma en la misma sala (cada acción vuelve a poner el mundo)', () => {
      const mundo = sala('consultorio', 'Consultorio', [persona('madre', 'Marta', true)]);
      internals().announceKeyPerson(mundo);
      settle();
      vi.advanceTimersByTime(60_000); // la región ya se vació sola
      expect(region('polite').textContent).toBe('');
      internals().announceKeyPerson(sala('consultorio', 'Consultorio', [persona('madre', 'Marta', true)]));
      settle();
      expect(region('polite').textContent).toBe('');
    });

    it('si la persona a atender cambia (otra persona, otro nombre de sala), se anuncia la nueva', () => {
      internals().announceKeyPerson(sala('consultorio', 'Consultorio', [persona('madre', 'Marta', true), persona('hijo', 'Luis', false)]));
      settle();
      vi.advanceTimersByTime(60_000);
      internals().announceKeyPerson(sala('consultorio', 'Consultorio', [persona('madre', 'Marta', false), persona('hijo', 'Luis', true)]));
      settle();
      expect(region('polite').textContent).toBe('Luis, persona a atender');
    });

    it('al volver a una sala con ella después de pasar por otra sin ella, se anuncia de nuevo', () => {
      const conClave = () => sala('consultorio', 'Consultorio', [persona('madre', 'Marta', true)]);
      internals().announceKeyPerson(conClave());
      internals().announceKeyPerson(sala('pasillo', 'Pasillo', [persona('otra', 'Otra', false)]));
      settle();
      vi.advanceTimersByTime(60_000);
      internals().announceKeyPerson(conClave());
      settle();
      expect(region('polite').textContent).toBe('Marta, persona a atender');
    });

    it('sin persona a atender (o sin mundo) no dice nada', () => {
      internals().announceKeyPerson(sala('pasillo', 'Pasillo', [persona('otra', 'Otra', false)]));
      internals().announceKeyPerson(null);
      internals().announceKeyPerson({ map: { key: 'x', title: 'X' } } as unknown as SimulationWorldState);
      settle();
      expect(region('polite').textContent).toBe('');
    });

    it('sale junto con «Entraste a …» en la misma lectura, sin pisarla', () => {
      const mundo = sala('consultorio', 'Consultorio', [persona('madre', 'Marta', true)]);
      internals().announceRoomChange(mundo);
      internals().announceKeyPerson(mundo);
      settle();
      expect(region('polite').textContent).toBe('Entraste a Consultorio. Marta, persona a atender');
    });
  });

  describe('avisos breves: se anuncian y se retiran solos (VD-29)', () => {
    it('la sala nueva se anuncia una vez, se muestra 2,2 s y no es una región viva', () => {
      const world = { map: { key: 'hospital-urgencias', title: 'Urgencias' }, objects: [] } as unknown as SimulationWorldState;
      internals().announceRoomChange(world);
      fixture.detectChanges();
      settle();

      const banner = root().querySelector<HTMLElement>('.room-banner')!;
      expect(banner.textContent).toContain('Urgencias');
      expect(banner.hasAttribute('role')).toBe(false);
      expect(region('polite').textContent).toBe('Entraste a Urgencias.');

      // `settle()` ya dejó pasar el retardo de escritura de la región (50 ms).
      vi.advanceTimersByTime(2200 - LIVE_WRITE_DELAY_MS - 1);
      expect(component.roomBanner()).toBe('Urgencias');
      vi.advanceTimersByTime(1);
      expect(component.roomBanner()).toBe('');
    });

    it('la escena nueva se anuncia con su título y se muestra 3 s', () => {
      internals().announceNewStage('Seguimiento');
      fixture.detectChanges();
      settle();
      expect(region('polite').textContent).toBe('Seguimiento');
      vi.advanceTimersByTime(3000 - LIVE_WRITE_DELAY_MS - 1);
      expect(component.roomBanner()).not.toBe('');
      vi.advanceTimersByTime(1);
      expect(component.roomBanner()).toBe('');
    });

    it('«Obtuviste: …» se anuncia, no es una región viva propia y se retira a los 4,2 s', () => {
      internals().showSoftNotice('Obtuviste: Kit PAP. Ya está en tu barra de herramientas.');
      fixture.detectChanges();
      settle();
      const notice = root().querySelector<HTMLElement>('.soft-notice')!;
      expect(notice.hasAttribute('role')).toBe(false);
      expect(region('polite').textContent).toBe('Obtuviste: Kit PAP. Ya está en tu barra de herramientas.');
      vi.advanceTimersByTime(4200);
      expect(component.softNotice()).toBe('');
    });

    it('la nota de transición del mapa se anuncia (no es una región que nace con su texto)', () => {
      const world = {
        map: { key: 'hospital-seguimiento', title: 'Seguimiento', ambient: { transitionText: 'Pasaron tres horas.' } },
        objects: [],
      } as unknown as SimulationWorldState;
      internals().announceRoomChange(world, true);
      fixture.detectChanges();
      settle();
      expect(root().querySelector('.transition-note')!.hasAttribute('role')).toBe(false);
      expect(region('polite').textContent).toBe('Pasaron tres horas.');
    });
  });
});
