import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { SimulationService } from '../../core/api/simulation.service';
import { HintState } from '../../core/models/simulation.model';
import { DRAFT_COPY } from './draft-copy';
import { HINT_COOLDOWN_MS, SceneHintComponent } from './scene-hint.component';

const two: HintState = { available: 2, shown: [] };
const oneShown: HintState = { available: 1, shown: [{ id: 1, order: 1, text: 'Mira con calma lo que dice la abuela.' }] };
const allShown: HintState = {
  available: 0, reason: 'ALL_SHOWN',
  shown: [{ id: 1, order: 1, text: 'Mira con calma lo que dice la abuela.' }, { id: 2, order: 2, text: 'Piensa qué necesita la niña ahora.' }],
};
const none: HintState = { available: 0, reason: 'NONE_FOR_SCENE', shown: [] };

const failure = (status: number, code?: string) => throwError(() => ({ status, error: code ? { code } : null }));

interface Api {
  getHints: (attemptId: string, attemptToken: string) => Observable<HintState>;
  revealNextHint: (attemptId: string, attemptToken: string, requestId: string) => Observable<HintState>;
}

/**
 * Pistas de la escena (plan visual F10-2; RF-18, CU-09; contrato C9): «Ver pista» las pide una a una, con su contador y el
 * motivo cuando no hay más; pedirlas no cuesta puntaje. La pantalla pinta lo que el servidor devuelve y anuncia la pista
 * nueva por la región viva.
 */
// req: RF-18, CU-09, RF-11, RNF-04
describe('SceneHintComponent', () => {
  let fixture: ComponentFixture<SceneHintComponent>;
  let announce: ReturnType<typeof vi.fn>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"], [hidden]').forEach(node => node.remove());
    return text(copy);
  };
  const askButton = () => [...host().querySelectorAll('button')].find(el => spoken(el) === 'Ver pista') as HTMLButtonElement;
  const reasonOf = (button: HTMLElement) => text(document.getElementById(button.getAttribute('aria-describedby')!.split(' ')[0]));

  /** `configure` corre con el componente ya creado y ANTES de que pida nada (para escuchar sus salidas desde el primer fallo). */
  async function render(api: Partial<Api> = {}, configure?: (component: SceneHintComponent) => void): Promise<Api> {
    const service: Api = {
      getHints: vi.fn(() => of(two)),
      revealNextHint: vi.fn(() => of(oneShown)),
      ...api,
    };
    announce = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SimulationService, useValue: service },
        { provide: LiveRegionAnnouncer, useValue: { announce } },
        { provide: HINT_COOLDOWN_MS, useValue: 40 },
      ],
    });
    fixture = TestBed.createComponent(SceneHintComponent);
    configure?.(fixture.componentInstance);
    fixture.componentRef.setInput('attemptId', 'intento-1');
    await fixture.whenStable();
    return service;
  }

  it('al abrirse pide el estado del intento y ofrece «Ver pista» con cuántas quedan', async () => {
    const service = await render();
    expect(service.getHints).toHaveBeenCalledWith('intento-1');
    expect(askButton().getAttribute('aria-disabled')).not.toBe('true');
    expect(text(host().querySelector('.scene-hint__counter'))).toBe('2 pistas por ver · sin costo');
    expect(host().querySelector('.scene-hint__item')).toBeNull();
  });

  it('pedir una pista revela la siguiente, con una clave de idempotencia, y la anuncia', async () => {
    const service = await render();
    askButton().click();
    await fixture.whenStable();
    const [attemptId, requestId] = (service.revealNextHint as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(attemptId).toBe('intento-1');
    expect(requestId).toMatch(/^[A-Za-z0-9._:-]{8,64}$/);
    expect([...host().querySelectorAll('.scene-hint__item')].map(text)).toEqual(['Mira con calma lo que dice la abuela.']);
    expect(text(host().querySelector('.scene-hint__counter'))).toBe('1 pista por ver · sin costo');
    expect(announce).toHaveBeenCalledWith('Pista 1: Mira con calma lo que dice la abuela.', 'polite');
  });

  it('tras pedir una, espera un instante (la ventana de duplicado del servidor) antes de ofrecer la siguiente', async () => {
    await render();
    askButton().click();
    await fixture.whenStable();
    expect(askButton().getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(askButton())).toBe('Lee la pista antes de pedir la siguiente.');
    await new Promise(resolve => setTimeout(resolve, 80));
    await fixture.whenStable();
    expect(askButton().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('las pistas que el intento ya había pedido aparecen desde el principio', async () => {
    await render({ getHints: vi.fn(() => of(oneShown)) });
    expect([...host().querySelectorAll('.scene-hint__item')].map(text)).toEqual(['Mira con calma lo que dice la abuela.']);
    expect(text(host().querySelector('.scene-hint__counter'))).toBe('1 pista por ver · sin costo');
  });

  it('al pedir la última, el motivo es que ya no hay más y no el de esperar', async () => {
    await render({ getHints: vi.fn(() => of(oneShown)), revealNextHint: vi.fn(() => of(allShown)) });
    askButton().click();
    await fixture.whenStable();
    expect(reasonOf(askButton())).toBe('Ya viste todas las pistas de esta escena.');
  });

  it('con la última vista, «Ver pista» queda deshabilitado con su motivo y sin contador', async () => {
    await render({ getHints: vi.fn(() => of(allShown)) });
    const button = askButton();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(button)).toBe('Ya viste todas las pistas de esta escena.');
    expect(host().querySelector('.scene-hint__counter')).toBeNull();
    expect(host().querySelectorAll('.scene-hint__item')).toHaveLength(2);
  });

  it('una escena sin pistas lo dice y no ofrece nada que pedir', async () => {
    const service = await render({ getHints: vi.fn(() => of(none)) });
    const button = askButton();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(reasonOf(button)).toBe('En esta escena no hay pistas.');
    button.click();
    expect(service.revealNextHint).not.toHaveBeenCalled();
  });

  it('un doble clic pide una sola pista mientras la primera orden está en curso', async () => {
    const pending = new Subject<HintState>();
    const service = await render({ revealNextHint: vi.fn(() => pending.asObservable()) });
    askButton().click();
    askButton().click();
    expect(service.revealNextHint).toHaveBeenCalledTimes(1);
    pending.next(oneShown);
    pending.complete();
    await fixture.whenStable();
    expect(host().querySelectorAll('.scene-hint__item')).toHaveLength(1);
  });

  it('si el servidor dice que ya no hay más pistas, vuelve a leer el estado en vez de mostrar un error', async () => {
    let reads = 0;
    const service = await render({
      getHints: vi.fn(() => of(++reads === 1 ? two : allShown)),
      revealNextHint: vi.fn(() => failure(409, 'NO_MORE_HINTS')),
    });
    askButton().click();
    await fixture.whenStable();
    expect(service.getHints).toHaveBeenCalledTimes(2);
    expect(reasonOf(askButton())).toBe('Ya viste todas las pistas de esta escena.');
    expect(host().querySelector('.scene-hint__message')).toBeNull();
  });

  it('con el intento en pausa lo dice con palabras y deja volver a intentarlo', async () => {
    await render({ revealNextHint: vi.fn(() => failure(409, 'ATTEMPT_NOT_PLAYING')) });
    askButton().click();
    await fixture.whenStable();
    expect(text(host().querySelector('.scene-hint__message'))).toBe('El intento está en pausa: reanúdalo para pedir pistas.');
    expect(askButton().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('un fallo de red al pedir la pista se dice sin culpar al estudiante y no esconde el botón', async () => {
    await render({ revealNextHint: vi.fn(() => failure(500)) });
    askButton().click();
    await fixture.whenStable();
    expect(text(host().querySelector('.scene-hint__message'))).toBe('No pudimos pedir la pista. Inténtalo de nuevo.');
    expect(askButton().getAttribute('aria-disabled')).not.toBe('true');
  });

  it('si no se pudo leer el estado, lo dice y «Reintentar» lo vuelve a pedir', async () => {
    let reads = 0;
    const service = await render({ getHints: vi.fn(() => (++reads === 1 ? failure(500) : of(two))) });
    expect(text(host().querySelector('.scene-hint__message'))).toBe('No pudimos cargar las pistas.');
    expect(askButton().getAttribute('aria-disabled')).toBe('true');
    const retry = [...host().querySelectorAll('button')].find(el => spoken(el) === 'Reintentar') as HTMLButtonElement;
    retry.click();
    await fixture.whenStable();
    expect(service.getHints).toHaveBeenCalledTimes(2);
    expect(host().querySelector('.scene-hint__message')).toBeNull();
    expect(text(host().querySelector('.scene-hint__counter'))).toBe('2 pistas por ver · sin costo');
  });

  it('dice junto al contador que no cuesta, con el texto del registro de borradores, y no ocupa otra línea', async () => {
    await render();
    expect(DRAFT_COPY.hintNoCostNote.text).toBe('sin costo');
    expect(text(host().querySelector('.scene-hint__counter'))).toContain(DRAFT_COPY.hintNoCostNote.text);
    expect(host().querySelector('.scene-hint__note')).toBeNull();
  });

  // req: RF-18, CU-09, RNF-04 (revisión de F10)
  describe('anuncios y respuestas fuera de lugar', () => {
    it('un fallo al pedir la pista se anuncia a quien usa lector de pantalla (no solo se pinta)', async () => {
      await render({ revealNextHint: vi.fn(() => failure(500)) });
      askButton().click();
      await fixture.whenStable();

      expect(announce).toHaveBeenCalledWith('No pudimos pedir la pista. Inténtalo de nuevo.', 'assertive');
    });

    it('el intento en pausa y las pistas que no cargan también se anuncian', async () => {
      await render({ revealNextHint: vi.fn(() => failure(409, 'ATTEMPT_NOT_PLAYING')) });
      askButton().click();
      await fixture.whenStable();
      expect(announce).toHaveBeenCalledWith('El intento está en pausa: reanúdalo para pedir pistas.', 'assertive');
      TestBed.resetTestingModule();

      await render({ getHints: vi.fn(() => failure(500)) });
      expect(announce).toHaveBeenCalledWith('No pudimos cargar las pistas.', 'assertive');
    });

    it('una respuesta que llega cuando el panel ya se cerró no anuncia nada fuera de contexto', async () => {
      const pending = new Subject<HintState>();
      await render({ revealNextHint: vi.fn(() => pending) });
      askButton().click();
      await fixture.whenStable();

      fixture.destroy();
      pending.next(oneShown);
      pending.complete();

      expect(announce, 'el diálogo siguiente no debe oír la pista del anterior').not.toHaveBeenCalled();
    });

    it('si el servidor responde sin una pista nueva, lo dice y espera, en vez de parecer roto', async () => {
      await render({ getHints: vi.fn(() => of(oneShown)), revealNextHint: vi.fn(() => of(oneShown)) });
      askButton().click();
      await fixture.whenStable();

      expect(text(host().querySelector('.scene-hint__message'))).toBe('Esa pista ya estaba a la vista.');
      expect(announce).toHaveBeenCalledWith('Esa pista ya estaba a la vista.', 'polite');
      expect(askButton().getAttribute('aria-disabled')).toBe('true');
    });

    it('«Pista n» es el lugar entre las vistas, no el número de orden de la autoría (que puede ser 0 o 7)', async () => {
      const authored: HintState = { available: 0, reason: 'ALL_SHOWN', shown: [{ id: 3, order: 7, text: 'Primera que ve.' }] };
      await render({ getHints: vi.fn(() => of(two)), revealNextHint: vi.fn(() => of(authored)) });
      askButton().click();
      await fixture.whenStable();

      expect(announce).toHaveBeenCalledWith('Pista 1: Primera que ve.', 'polite');
    });
  });

  // req: ETH-01, SIEP-RF-05 (S3-2b: el servidor exige el consentimiento también a las pistas)
  describe('el servidor exige el consentimiento (403 CONSENT_REQUIRED)', () => {
    const consentLost = () => failure(403, 'CONSENT_REQUIRED');

    it('al leer el estado avisa a la pantalla de juego, que vuelve al aviso; no se anuncia un fallo de pistas', async () => {
      const lost = vi.fn();
      await render({ getHints: vi.fn(() => consentLost()) }, component => component.consentRequired.subscribe(lost));

      expect(lost).toHaveBeenCalledTimes(1);
      expect(announce, 'el aviso de contenido toma la pantalla: no se oye «No pudimos cargar las pistas»').not.toHaveBeenCalled();
    });

    it('al pedir una pista también lo avisa, y no se dice «No pudimos pedir la pista»', async () => {
      const lost = vi.fn();
      await render({ revealNextHint: vi.fn(() => consentLost()) }, component => component.consentRequired.subscribe(lost));
      askButton().click();
      await fixture.whenStable();

      expect(lost).toHaveBeenCalledTimes(1);
      expect(announce).not.toHaveBeenCalled();
      expect(host().querySelector('.scene-hint__message')).toBeNull();
    });

    it.each([
      ['otro 403', () => failure(403, 'FORBIDDEN')],
      ['un 409', () => failure(409, 'ATTEMPT_NOT_PLAYING')],
      ['un 500', () => failure(500)],
    ])('%s al pedir la pista no lo avisa: sigue su camino de siempre y se anuncia', async (_name, error) => {
      const lost = vi.fn();
      await render({ revealNextHint: vi.fn(error) }, component => component.consentRequired.subscribe(lost));
      askButton().click();
      await fixture.whenStable();

      expect(lost).not.toHaveBeenCalled();
      expect(announce).toHaveBeenCalled();
    });

    it('otro 403 al leer el estado tampoco lo avisa', async () => {
      const lost = vi.fn();
      await render({ getHints: vi.fn(() => failure(403, 'FORBIDDEN')) }, component => component.consentRequired.subscribe(lost));

      expect(lost).not.toHaveBeenCalled();
      expect(announce).toHaveBeenCalledWith('No pudimos cargar las pistas.', 'assertive');
    });
  });

  it('la lista de pistas vistas es una región con nombre y se puede recorrer con el teclado si crece', async () => {
    await render({ getHints: vi.fn(() => of(allShown)) });
    const list = host().querySelector('.scene-hint__list')!;
    expect(list.getAttribute('aria-label')).toBe('Pistas que ya viste');
    expect(list.getAttribute('tabindex')).toBe('0');
  });
});
