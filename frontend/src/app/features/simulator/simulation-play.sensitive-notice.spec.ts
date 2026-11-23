// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta (mismo doble que el resto
// de specs de instancia del juego): solo se evalúa `extends Phaser.Scene` al cargar el módulo.
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

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import { AudioDirectorService } from './audio-director.service';
import { SimulationPlayComponent } from './simulation-play.component';

/** Aviso del nodo sensible (ETH): el recordatorio que la franja bajo la cabecera muestra en todos los dispositivos. */
const WARNING = 'Este caso aborda violencia de género, tentativa de feminicidio y la muerte de una niña. Puedes usar la salida segura en cualquier momento.';

function attemptWith(node: Record<string, unknown>): SimulationAttemptState {
  return {
    attemptId: 'a1', caseVersionId: 7, status: 'IN_PROGRESS', persona: { bond: 'GUARDED', activation: 'TENSE', label: 'se muestra cautelosa y tensa' },
    currentNode: { id: 1, key: 'hospital-urgencias', title: 'T', narrative: 'N', terminal: false, options: [], ...node },
  } as unknown as SimulationAttemptState;
}

describe('SimulationPlayComponent: aviso del nodo sensible', () => {
  let component: SimulationPlayComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SimulationPlayComponent],
      providers: [
        { provide: SimulationService, useValue: { getActiveAttempt: vi.fn(() => of(null)) } },
        { provide: AudioDirectorService, useValue: { init: vi.fn(), dispose: vi.fn(), stopIntroLament: vi.fn(), isMusicMuted: vi.fn(() => false), isSfxMuted: vi.fn(() => false) } },
        { provide: AuthService, useValue: {} },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new SimulationPlayComponent());
  });

  afterEach(() => {
    component?.ngOnDestroy(); // cancela los temporizadores pendientes antes de que se desmonte el entorno
    TestBed.resetTestingModule();
  });

  it('sin intento no hay aviso', () => {
    expect(component.sensitiveNotice()).toBeNull();
  });

  it('un nodo sensible muestra la redacción del nodo sin cambiarla', () => {
    component.attempt.set(attemptWith({ sensitiveContent: true, warningMessage: WARNING }));

    expect(component.sensitiveNotice()).toBe(WARNING);
  });

  it('un nodo sin aviso ni salida segura obligatoria no muestra nada', () => {
    component.attempt.set(attemptWith({ sensitiveContent: false, warningMessage: null, safeExitRequired: false }));

    expect(component.sensitiveNotice()).toBeNull();
  });

  it('un nodo con salida segura obligatoria y sin texto propio usa la frase de respaldo, en español', () => {
    component.attempt.set(attemptWith({ warningMessage: null, safeExitRequired: true }));

    expect(component.sensitiveNotice()).toBe('Este momento permite salida segura: prioriza confidencialidad y rutas institucionales.');
  });

  it('mientras el personaje reacciona (escena anterior retenida), el aviso sigue siendo el de la escena anterior', () => {
    const previous = attemptWith({ id: 1, key: 'entrada', warningMessage: null, safeExitRequired: false }).currentNode;
    component.attempt.set(attemptWith({ id: 2, key: 'sala-espera', warningMessage: WARNING }));
    (component as unknown as { heldNode: { set(node: unknown): void } }).heldNode.set(previous);

    expect(component.sensitiveNotice(), 'el aviso de la escena siguiente no se adelanta a la reacción').toBeNull();

    (component as unknown as { heldNode: { set(node: unknown): void } }).heldNode.set(null);
    expect(component.sensitiveNotice(), 'al terminar la reacción llega el aviso de la escena nueva').toBe(WARNING);
  });

  it('el aviso cambia con el nodo: al pasar a una etapa sin aviso desaparece', () => {
    component.attempt.set(attemptWith({ warningMessage: WARNING }));
    expect(component.sensitiveNotice()).toBe(WARNING);

    component.attempt.set(attemptWith({ key: 'hospital-sala-escucha', warningMessage: null }));

    expect(component.sensitiveNotice()).toBeNull();
  });
});
