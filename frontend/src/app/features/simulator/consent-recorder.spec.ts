import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/user.model';
import {
  CONSENT_RECORDER,
  CONTENT_NOTICE_VERSION,
  ConsentNoticeStaleError,
  ConsentRecorder,
  ServerConsentRecorder,
  SessionConsentRecorder,
  consentStorageKey,
  parseConsentStorageKey,
} from './consent-recorder';

/**
 * Registro local del consentimiento (plan visual F6-2; ETH-01): detrás de una interfaz (`ConsentRecorder`) para que el
 * registro en servidor (F10-8†) solo cambie la implementación. Lo esencial: un almacenamiento que falla NUNCA da el
 * consentimiento por registrado, y una lectura que falla es «sin consentimiento» (se vuelve a pedir).
 */
// req: ETH-01, SIEP-RF-05 (parte de interfaz)
describe('SessionConsentRecorder', () => {
  const KEY = 'siep_case_consent_7_attempt-1';

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('registra y lo lee de vuelta', async () => {
    const recorder = new SessionConsentRecorder();
    expect(recorder.isGiven(KEY)).toBe(false);
    await recorder.record(KEY);
    expect(recorder.isGiven(KEY)).toBe(true);
  });

  it('una lectura que lanza se trata como «sin consentimiento»', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('almacenamiento bloqueado'); });
    expect(new SessionConsentRecorder().isGiven(KEY)).toBe(false);
  });

  it('una escritura que lanza rechaza y no deja nada registrado', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cuota agotada'); });
    const recorder = new SessionConsentRecorder();
    await expect(recorder.record(KEY)).rejects.toThrow();
    expect(recorder.isGiven(KEY)).toBe(false);
  });

  it('una escritura que se pierde en silencio (no queda al leerla) también rechaza', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    await expect(new SessionConsentRecorder().record(KEY)).rejects.toThrow();
  });

  it('un almacenamiento al que ni se puede acceder rechaza sin lanzar fuera de la promesa', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('SecurityError'); });
    const recorder = new SessionConsentRecorder();
    expect(recorder.isGiven(KEY)).toBe(false);
    await expect(recorder.record(KEY)).rejects.toThrow();
  });
});

/**
 * La clave del consentimiento de un intento (`siep_case_consent_<caseVersionId>_<attemptId>`): la pantalla de juego la
 * arma y el registro en servidor la lee para saber de qué versión del caso es. Se prueba que armar y leer son inversas.
 */
// req: ETH-01, SIEP-RF-05
describe('clave del consentimiento de un intento', () => {
  it('conserva la forma de siempre (la pantalla de juego y las pruebas existentes dependen de ella)', () => {
    expect(consentStorageKey(7, 'attempt-1')).toBe('siep_case_consent_7_attempt-1');
  });

  it.each([
    [7, 'attempt-1'],
    [1, '8f14e45f-ceea-467a-9575-1b8f8f6c6e7a'],
    [123456, 'con_guion_bajo_y-guion'],
  ])('leer lo armado devuelve lo mismo (%i, %s)', (caseVersionId, attemptId) => {
    expect(parseConsentStorageKey(consentStorageKey(caseVersionId, attemptId))).toEqual({ caseVersionId, attemptId });
  });

  it.each([
    '',
    'otra_clave',
    'siep_case_intro_7_attempt-1',
    'siep_case_consent_',
    'siep_case_consent_7',
    'siep_case_consent_7_',
    'siep_case_consent__attempt-1',
    'siep_case_consent_x_attempt-1',
    'siep_case_consent_0_attempt-1',
    'siep_case_consent_007_attempt-1',
    'siep_case_consent_-3_attempt-1',
    'xsiep_case_consent_7_attempt-1',
  ])('una clave que no es de un intento no se lee: «%s»', key => {
    expect(parseConsentStorageKey(key)).toBeNull();
  });
});

/**
 * Registro del consentimiento EN EL SERVIDOR (S3-2b, F10-8†; ETH-01, SIEP-RF-05). Las reglas que no se negocian siguen
 * siendo las de la interfaz: una red que falla NUNCA da el consentimiento por registrado y una lectura que falla es «sin
 * consentimiento». `isGiven` es síncrona: consulta lo que el servidor dijo (en memoria) y, si no sabe, la marca de la pestaña.
 */
// req: ETH-01, SIEP-RF-05
describe('ServerConsentRecorder', () => {
  const CASE_ID = 7;
  const KEY = consentStorageKey(CASE_ID, 'attempt-1');
  const OTHER_ATTEMPT_KEY = consentStorageKey(CASE_ID, 'attempt-2');
  const OTHER_CASE_KEY = consentStorageKey(8, 'attempt-1');
  const URL = `/api/simulation/cases/${CASE_ID}/consent`;
  let http: HttpTestingController;
  let recorder: ServerConsentRecorder;

  const state = (accepted: unknown) => ({
    data: { required: true, noticeVersion: CONTENT_NOTICE_VERSION, accepted, acceptedAt: accepted === true ? '2026-10-18T10:00:00' : null },
  });
  const recordBody = () => ({
    data: { caseVersionId: CASE_ID, acceptedAt: '2026-10-18T10:00:00', noticeVersion: CONTENT_NOTICE_VERSION },
  });
  const staleBody = { success: false, code: 'NOTICE_VERSION_STALE', message: 'El aviso cambió.', noticeVersion: 'aviso-vigente-otro' };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    recorder = new ServerConsentRecorder(TestBed.inject(SimulationService));
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('la versión del aviso que envía es la constante del cliente', () => {
    expect(CONTENT_NOTICE_VERSION).toMatch(/^\S{1,40}$/);
  });

  describe('isGiven (síncrona)', () => {
    it('sin nada que lo respalde es «no» y no pide nada a la red', () => {
      expect(recorder.isGiven(KEY)).toBe(false);
      http.expectNone(URL);
    });

    it('una clave que no es de un intento es «no»', () => {
      expect(recorder.isGiven('otra_clave')).toBe(false);
    });

    it('si el servidor no se pudo consultar, vale la marca de la pestaña de ESE intento', () => {
      sessionStorage.setItem(KEY, 'given');
      expect(recorder.isGiven(KEY)).toBe(true);
      expect(recorder.isGiven(OTHER_ATTEMPT_KEY)).toBe(false);
      expect(recorder.isGiven(OTHER_CASE_KEY)).toBe(false);
    });

    it('un almacenamiento al que ni se puede acceder es «no», sin lanzar', () => {
      vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('SecurityError'); });
      expect(recorder.isGiven(KEY)).toBe(false);
    });
  });

  describe('record: aceptar el aviso', () => {
    it.each([201, 200])('el servidor responde %i: queda registrado, en la memoria y en la pestaña', async status => {
      const done = recorder.record(KEY);
      const request = http.expectOne(URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ noticeVersion: CONTENT_NOTICE_VERSION });
      request.flush(recordBody(), { status, statusText: 'OK' });

      await expect(done).resolves.toBeUndefined();
      expect(recorder.isGiven(KEY)).toBe(true);
      expect(sessionStorage.getItem(KEY)).toBe('given');
      // El consentimiento es de la persona y del caso, no de un intento: otro intento del mismo caso también lo tiene.
      expect(recorder.isGiven(OTHER_ATTEMPT_KEY)).toBe(true);
      expect(recorder.isGiven(OTHER_CASE_KEY)).toBe(false);
    });

    // Control negativo (mutación: marcar antes de esperar la respuesta): mientras el servidor no responde NO hay consentimiento.
    it('no se marca nada mientras el servidor no responde', async () => {
      const done = recorder.record(KEY);
      const request = http.expectOne(URL);

      expect(recorder.isGiven(KEY)).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();

      request.flush(recordBody(), { status: 201, statusText: 'Created' });
      await done;
      expect(recorder.isGiven(KEY)).toBe(true);
    });

    // Control negativo (mutación: tragarse el 409): una versión vieja del aviso NO es un consentimiento.
    it('un 409 NOTICE_VERSION_STALE rechaza con el error de «hay una versión nueva del aviso» y no marca nada', async () => {
      const done = recorder.record(KEY);
      http.expectOne(URL).flush(staleBody, { status: 409, statusText: 'Conflict' });

      const error = await done.then(() => null, (cause: unknown) => cause);
      expect(error).toBeInstanceOf(ConsentNoticeStaleError);
      expect((error as ConsentNoticeStaleError).currentNoticeVersion).toBe('aviso-vigente-otro');
      expect(recorder.isGiven(KEY)).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('un 409 sin la versión vigente también es «aviso nuevo»', async () => {
      const done = recorder.record(KEY);
      http.expectOne(URL).flush({ success: false, code: 'NOTICE_VERSION_STALE', message: 'x' }, { status: 409, statusText: 'Conflict' });

      const error = await done.then(() => null, (cause: unknown) => cause);
      expect(error).toBeInstanceOf(ConsentNoticeStaleError);
      expect((error as ConsentNoticeStaleError).currentNoticeVersion).toBeNull();
    });

    it('recordForCase (la ficha): un 409 también es «aviso nuevo» y el caso no queda aceptado', async () => {
      const done = recorder.recordForCase(CASE_ID);
      http.expectOne(URL).flush(staleBody, { status: 409, statusText: 'Conflict' });

      const error = await done.then(() => null, (cause: unknown) => cause);
      expect(error).toBeInstanceOf(ConsentNoticeStaleError);
      expect(recorder.isGivenForCase(CASE_ID)).toBe(false);
    });

    it('recordForCase registra la versión del caso sin intento: el juego, después, no vuelve a pedir el aviso', async () => {
      expect(recorder.isGivenForCase(CASE_ID)).toBe(false);
      const done = recorder.recordForCase(CASE_ID);
      const request = http.expectOne(URL);
      expect(request.request.method).toBe('POST');
      request.flush(recordBody(), { status: 201, statusText: 'Created' });
      await done;
      expect(recorder.isGivenForCase(CASE_ID)).toBe(true);
      expect(recorder.isGiven(KEY)).toBe(true);
    });

    it('un 409 con otro código es un fallo cualquiera, no «aviso nuevo»', async () => {
      const done = recorder.record(KEY);
      http.expectOne(URL).flush({ success: false, code: 'OTRO_CONFLICTO', message: 'x' }, { status: 409, statusText: 'Conflict' });

      const error = await done.then(() => null, (cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ConsentNoticeStaleError);
      expect(recorder.isGiven(KEY)).toBe(false);
    });

    it('una red caída rechaza y NO deja nada registrado', async () => {
      const done = recorder.record(KEY);
      http.expectOne(URL).error(new ProgressEvent('error'));

      await expect(done).rejects.toThrow();
      expect(recorder.isGiven(KEY)).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it.each([400, 403, 404, 429, 500, 503])('el servidor responde %i: rechaza y NO deja nada registrado', async status => {
      const done = recorder.record(KEY);
      http.expectOne(URL).flush({ success: false, code: 'X', message: 'x' }, { status, statusText: 'Error' });

      const error = await done.then(() => null, (cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(ConsentNoticeStaleError);
      expect(recorder.isGiven(KEY)).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('«Reintentar» tras un fallo vuelve a pedir el registro y, si sale bien, queda registrado', async () => {
      const first = recorder.record(KEY);
      http.expectOne(URL).error(new ProgressEvent('error'));
      await expect(first).rejects.toThrow();

      const second = recorder.record(KEY);
      http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
      await second;
      expect(recorder.isGiven(KEY)).toBe(true);
    });

    it('si la pestaña no deja guardar su marca, el registro del servidor vale igual', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cuota agotada'); });
      const done = recorder.record(KEY);
      http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });

      await expect(done).resolves.toBeUndefined();
      expect(recorder.isGiven(KEY)).toBe(true);
    });

    it('una clave que no es de un intento rechaza sin pedir nada al servidor', async () => {
      await expect(recorder.record('otra_clave')).rejects.toThrow();
      http.expectNone(URL);
    });
  });

  describe('prime: preguntar al servidor ANTES de pedir el aviso', () => {
    it('aceptado en el servidor: isGiven lo sabe de forma síncrona para cualquier intento de ese caso, sin marca de la pestaña', async () => {
      const done = recorder.prime(CASE_ID);
      const request = http.expectOne(URL);
      expect(request.request.method).toBe('GET');
      expect(recorder.isGiven(KEY)).toBe(false); // hasta que responde, no se sabe
      request.flush(state(true));
      await done;

      expect(recorder.isGiven(KEY)).toBe(true);
      expect(recorder.isGiven(OTHER_ATTEMPT_KEY)).toBe(true);
      expect(recorder.isGiven(OTHER_CASE_KEY)).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('no aceptado en el servidor: sigue siendo «no» y manda sobre una marca vieja de la pestaña', async () => {
      sessionStorage.setItem(KEY, 'given');
      const done = recorder.prime(CASE_ID);
      http.expectOne(URL).flush(state(false));
      await done;

      expect(recorder.isGiven(KEY)).toBe(false);
    });

    it.each([undefined, null, 'si', 1, 'true'])('solo un `true` estricto cuenta como aceptado (%s)', async accepted => {
      const done = recorder.prime(CASE_ID);
      http.expectOne(URL).flush(state(accepted));
      await done;

      expect(recorder.isGiven(KEY)).toBe(false);
    });

    it('un GET que falla es «sin consentimiento»: no se rechaza (la pantalla no muestra error) y se pide el aviso', async () => {
      const done = recorder.prime(CASE_ID);
      http.expectOne(URL).error(new ProgressEvent('error'));

      await expect(done).resolves.toBeUndefined();
      expect(recorder.isGiven(KEY)).toBe(false);
    });

    it.each([401, 403, 404, 500])('el GET responde %i: tampoco se rechaza', async status => {
      const done = recorder.prime(CASE_ID);
      http.expectOne(URL).flush({ success: false, code: 'X', message: 'x' }, { status, statusText: 'Error' });

      await expect(done).resolves.toBeUndefined();
      expect(recorder.isGiven(KEY)).toBe(false);
    });

    it('si el GET falla, la marca de la pestaña evita pedir el aviso dos veces en la misma sesión', async () => {
      sessionStorage.setItem(KEY, 'given');
      const done = recorder.prime(CASE_ID);
      http.expectOne(URL).error(new ProgressEvent('error'));
      await done;

      expect(recorder.isGiven(KEY)).toBe(true);
    });

    it('una respuesta mal formada no rompe: es «sin consentimiento»', async () => {
      const done = recorder.prime(CASE_ID);
      http.expectOne(URL).flush(null);
      await expect(done).resolves.toBeUndefined();
      expect(recorder.isGiven(KEY)).toBe(false);
    });

    it('lo que lance el servicio antes de pedir nada tampoco rechaza', async () => {
      const broken = new ServerConsentRecorder({
        getConsent: () => { throw new TypeError('no hay red'); },
        acceptConsent: () => { throw new TypeError('no hay red'); },
        withdrawConsent: () => { throw new TypeError('no hay red'); },
      } as unknown as SimulationService);

      await expect(broken.prime(CASE_ID)).resolves.toBeUndefined();
      expect(broken.isGiven(KEY)).toBe(false);
    });
  });

  /**
   * S7-2 · El registro es UNO por pestaña y `logout()` navega sin recargar: lo que A aceptó no puede valerle a B si el
   * GET de B falla o tarda. `prime` olvida lo de ESE caso antes de preguntar, y al cambiar de persona se olvida todo.
   */
  describe('lo que se sabía de otra persona no sobrevive (S7-2)', () => {
    const recorded = { caseVersionId: CASE_ID, acceptedAt: '2026-10-18T10:00:00', noticeVersion: CONTENT_NOTICE_VERSION };
    /** El intento de la otra persona (A): su clave no es la del intento que abre B. */
    const A_ATTEMPT_KEY = KEY;
    const B_ATTEMPT_KEY = OTHER_ATTEMPT_KEY;

    async function acceptAsA(): Promise<void> {
      const accepted = recorder.record(A_ATTEMPT_KEY);
      http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
      await accepted;
    }

    describe('prime borra lo que se sabía de ESE caso antes de preguntar', () => {
      // Control negativo (mutación: quitar el `delete` de `prime`): el `true` de A sobrevive al GET que falla y B arranca sin aviso.
      it('un GET que falla deja «no se sabe» y se pide el aviso', async () => {
        await acceptAsA();
        expect(recorder.isGiven(B_ATTEMPT_KEY)).toBe(true); // lo que dejó A

        const done = recorder.prime(CASE_ID); // B abre el mismo caso en la misma pestaña
        const whilePending = recorder.isGiven(B_ATTEMPT_KEY); // ya antes de que responda: el borrado no espera a la red
        http.expectOne(URL).error(new ProgressEvent('error'));
        await done;

        expect(whilePending).toBe(false);
        expect(recorder.isGiven(B_ATTEMPT_KEY)).toBe(false);
      });

      // Control negativo (mutación: borrar solo al responder): con un GET colgado el `true` de A seguiría valiendo hasta el plazo de 3 s.
      it('un GET que nunca responde también deja «no se sabe» (la pantalla decide con su plazo)', async () => {
        const never = new Subject<unknown>(); // un GET colgado: no emite jamás
        const api = {
          getConsent: vi.fn(() => never),
          acceptConsent: vi.fn(() => of(recorded)),
          withdrawConsent: vi.fn(),
        };
        const slow = new ServerConsentRecorder(api as unknown as SimulationService);
        await slow.record(A_ATTEMPT_KEY);
        expect(slow.isGiven(B_ATTEMPT_KEY)).toBe(true);

        const pending = slow.prime(CASE_ID);

        expect(api.getConsent).toHaveBeenCalledWith(CASE_ID);
        expect(slow.isGiven(B_ATTEMPT_KEY)).toBe(false);
        never.complete(); // sin respuesta útil: el registro no se rechaza ni vuelve a creer lo de A
        await expect(pending).resolves.toBeUndefined();
        expect(slow.isGiven(B_ATTEMPT_KEY)).toBe(false);
      });

      it('un GET que sí responde manda sobre lo que había: aceptado o no', async () => {
        await acceptAsA();

        const notAccepted = recorder.prime(CASE_ID);
        http.expectOne(URL).flush(state(false));
        await notAccepted;
        expect(recorder.isGiven(B_ATTEMPT_KEY)).toBe(false);

        const accepted = recorder.prime(CASE_ID);
        http.expectOne(URL).flush(state(true));
        await accepted;
        expect(recorder.isGiven(B_ATTEMPT_KEY)).toBe(true);
      });

      it('solo borra el caso que pregunta: lo que se sabe de otro caso sigue en pie', async () => {
        const other = recorder.prime(8);
        http.expectOne('/api/simulation/cases/8/consent').flush(state(true));
        await other;

        const done = recorder.prime(CASE_ID);
        http.expectOne(URL).error(new ProgressEvent('error'));
        await done;

        expect(recorder.isGiven(OTHER_CASE_KEY)).toBe(true);
      });
    });

    describe('reset: olvidar todo lo que se sabía', () => {
      // Control negativo (mutación: `reset` que no vacía el mapa): el `true` de los dos casos seguiría valiendo.
      it('vacía lo de todos los casos', async () => {
        const first = recorder.prime(CASE_ID);
        http.expectOne(URL).flush(state(true));
        await first;
        const second = recorder.prime(8);
        http.expectOne('/api/simulation/cases/8/consent').flush(state(true));
        await second;
        expect(recorder.isGiven(KEY)).toBe(true);
        expect(recorder.isGiven(OTHER_CASE_KEY)).toBe(true);

        recorder.reset();

        expect(recorder.isGiven(KEY)).toBe(false);
        expect(recorder.isGiven(OTHER_ATTEMPT_KEY)).toBe(false);
        expect(recorder.isGiven(OTHER_CASE_KEY)).toBe(false);
      });

      it('no toca lo que no es memoria: la marca de la pestaña de un intento sigue ahí', async () => {
        await acceptAsA();

        recorder.reset();

        expect(sessionStorage.getItem(A_ATTEMPT_KEY)).toBe('given');
        expect(recorder.isGiven(B_ATTEMPT_KEY)).toBe(false);
      });

      // Control negativo (mutación: `reset` que no descarta lo que viene en camino): la respuesta tardía de A llenaría lo olvidado.
      it('una respuesta que estaba en camino al vaciar no vuelve a llenar lo olvidado', async () => {
        const inFlight = recorder.prime(CASE_ID);
        const request = http.expectOne(URL);

        recorder.reset();
        request.flush(state(true));
        await inFlight;

        expect(recorder.isGiven(B_ATTEMPT_KEY)).toBe(false);
      });

      // Antes se cumplía («el servidor sí lo registró para quien lo pidió»); desde B4b `record` se apoya en `recordForCase`,
      // que rechaza si en el camino se olvidó todo: quien lo pidió ve «Reintentar» en vez de entrar con un registro que ya
      // no es de quien mira. La intención (no dejar el caso aceptado en memoria) se mantiene.
      it('un registro que termina después de vaciar se rechaza y no deja el caso aceptado en memoria', async () => {
        const inFlight = recorder.record(A_ATTEMPT_KEY);
        const request = http.expectOne(URL);

        recorder.reset();
        request.flush(recordBody(), { status: 201, statusText: 'Created' });

        await expect(inFlight).rejects.toThrow();
        expect(recorder.isGiven(B_ATTEMPT_KEY)).toBe(false);
      });
    });

    describe('al cambiar la persona de la sesión (sale A, entra B sin recargar)', () => {
      let personId: number | null;
      let tracked: ServerConsentRecorder;

      beforeEach(() => {
        personId = 41;
        tracked = new ServerConsentRecorder(TestBed.inject(SimulationService), () => personId);
      });

      it('el consentimiento por caso sigue a la persona', async () => {
        const saved = tracked.recordForCase(CASE_ID);
        http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
        await saved;
        expect(tracked.isGivenForCase(CASE_ID)).toBe(true);
        personId = 42;
        expect(tracked.isGivenForCase(CASE_ID)).toBe(false);
      });

      it('descarta la aceptación si la cuenta cambia durante la petición', async () => {
        const saved = tracked.recordForCase(CASE_ID);
        const request = http.expectOne(URL);
        personId = 42;
        request.flush(recordBody(), { status: 201, statusText: 'Created' });
        await expect(saved).rejects.toThrow();
        expect(tracked.isGivenForCase(CASE_ID)).toBe(false);
      });

      // Control negativo (mutación: `isGivenForCase` sin `followPerson`): B vería el `true` que el servidor le dio a A.
      it('cambio de cuenta ANTES de leer: la ficha de B no hereda lo que A aceptó', async () => {
        const saved = tracked.recordForCase(CASE_ID);
        http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
        await saved;
        personId = 42;
        expect(tracked.isGivenForCase(CASE_ID)).toBe(false);
        personId = 41;   // vuelve A: lo olvidado no reaparece sin volver a preguntar
        expect(tracked.isGivenForCase(CASE_ID)).toBe(false);
      });

      it('cambio de cuenta DURANTE prime: la respuesta tardía (de A) no se guarda para B', async () => {
        const primed = tracked.prime(CASE_ID);
        const request = http.expectOne(URL);
        personId = 42;
        request.flush(state(true));
        await primed;
        expect(tracked.isGivenForCase(CASE_ID)).toBe(false);
      });

      it('el rechazo por cambio de cuenta dice que la sesión cambió (la ficha no navega)', async () => {
        const saved = tracked.recordForCase(CASE_ID);
        const request = http.expectOne(URL);
        personId = null;
        request.flush(recordBody(), { status: 201, statusText: 'Created' });
        await expect(saved).rejects.toThrow(/sesión cambió/);
      });

      async function acceptAsPerson(): Promise<void> {
        const accepted = tracked.record(A_ATTEMPT_KEY);
        http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
        await accepted;
      }

      // Control negativo (mutación: no mirar a la persona en `isGiven`): el `true` de A seguiría valiendo para B sin preguntar nada.
      it('entra otra persona: lo que A aceptó no vale para B, sin haber preguntado nada', async () => {
        await acceptAsPerson();
        expect(tracked.isGiven(B_ATTEMPT_KEY)).toBe(true);

        personId = 42;

        expect(tracked.isGiven(B_ATTEMPT_KEY)).toBe(false);
        expect(tracked.isGiven(OTHER_CASE_KEY)).toBe(false);
      });

      it('sale A y no entra nadie: también se olvida', async () => {
        await acceptAsPerson();

        personId = null;

        expect(tracked.isGiven(B_ATTEMPT_KEY)).toBe(false);
      });

      // Control negativo (mutación: reiniciar en cada consulta): la misma persona perdería lo que sabe y se le pediría el aviso otra vez.
      it('la misma persona conserva lo que se sabe, la consulten cuantas veces la consulten', async () => {
        await acceptAsPerson();

        expect(tracked.isGiven(B_ATTEMPT_KEY)).toBe(true);
        expect(tracked.isGiven(B_ATTEMPT_KEY)).toBe(true);
        expect(tracked.isGiven(OTHER_ATTEMPT_KEY)).toBe(true);
      });

      it('lo que B acepta después sí vale para B', async () => {
        await acceptAsPerson();
        personId = 42;
        expect(tracked.isGiven(B_ATTEMPT_KEY)).toBe(false);

        const accepted = tracked.record(B_ATTEMPT_KEY);
        http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
        await accepted;

        expect(tracked.isGiven(B_ATTEMPT_KEY)).toBe(true);
      });

      // Control negativo (mutación: guardar la respuesta sin mirar si cambió la persona): la respuesta de A en camino llenaría la memoria de B.
      it('la respuesta de A que llega cuando ya entró B no se guarda para B', async () => {
        const inFlight = tracked.prime(CASE_ID); // A pregunta…
        const request = http.expectOne(URL);

        personId = 42; // …sale A y entra B antes de que responda
        const whilePending = tracked.isGiven(B_ATTEMPT_KEY); // B consulta: el registro ve que cambió la persona
        request.flush(state(true)); // llega lo de A
        await inFlight;

        expect(whilePending).toBe(false);
        expect(tracked.isGiven(B_ATTEMPT_KEY)).toBe(false);
      });

      it('si no se puede saber quién es la persona, el registro sigue funcionando y no inventa consentimientos', async () => {
        const broken = new ServerConsentRecorder(TestBed.inject(SimulationService), () => { throw new TypeError('sin sesión'); });
        expect(broken.isGiven(B_ATTEMPT_KEY)).toBe(false);

        const done = broken.prime(CASE_ID);
        http.expectOne(URL).flush(state(true));
        await done;

        expect(broken.isGiven(B_ATTEMPT_KEY)).toBe(true);
      });
    });
  });

  describe('forget: el servidor respondió 403 CONSENT_REQUIRED', () => {
    it('borra lo que sabía y la marca de la pestaña, y NO la vuelve a creer mientras no se acepte de nuevo', async () => {
      const accepted = recorder.record(KEY);
      http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
      await accepted;
      expect(recorder.isGiven(KEY)).toBe(true);

      recorder.forget(KEY);

      expect(recorder.isGiven(KEY)).toBe(false);
      expect(recorder.isGiven(OTHER_ATTEMPT_KEY)).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();

      const again = recorder.record(KEY);
      http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
      await again;
      expect(recorder.isGiven(KEY)).toBe(true);
    });

    it('con una marca vieja de la pestaña y sin haber preguntado, también queda en «no»', () => {
      sessionStorage.setItem(KEY, 'given');
      recorder.forget(KEY);
      expect(recorder.isGiven(KEY)).toBe(false);
    });

    it('no toca el consentimiento de otro caso', async () => {
      const prime = recorder.prime(8);
      http.expectOne('/api/simulation/cases/8/consent').flush(state(true));
      await prime;

      recorder.forget(KEY);

      expect(recorder.isGiven(OTHER_CASE_KEY)).toBe(true);
    });

    it('una clave que no es de un intento no hace nada ni lanza', () => {
      expect(() => recorder.forget('otra_clave')).not.toThrow();
    });

    it('un almacenamiento que lanza al borrar no impide olvidar', () => {
      sessionStorage.setItem(KEY, 'given');
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('bloqueado'); });
      expect(() => recorder.forget(KEY)).not.toThrow();
      expect(recorder.isGiven(KEY)).toBe(false);
    });
  });

  describe('withdraw: retirar el consentimiento', () => {
    it('llama a DELETE y, cuando el servidor responde, el caso queda sin consentimiento en memoria y en la pestaña', async () => {
      const accepted = recorder.record(KEY);
      http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
      await accepted;
      sessionStorage.setItem(OTHER_ATTEMPT_KEY, 'given');
      sessionStorage.setItem(OTHER_CASE_KEY, 'given');
      sessionStorage.setItem(consentStorageKey(77, 'attempt-1'), 'given'); // el 77 empieza con el 7: no es del caso 7
      sessionStorage.setItem('siep_case_intro_7_attempt-1', 'read');

      const done = recorder.withdraw(CASE_ID);
      const request = http.expectOne(URL);
      expect(request.request.method).toBe('DELETE');
      request.flush({ data: { caseVersionId: CASE_ID, withdrawnAt: '2026-10-18T11:00:00' } });
      await expect(done).resolves.toBeUndefined();

      expect(recorder.isGiven(KEY)).toBe(false);
      expect(recorder.isGiven(OTHER_ATTEMPT_KEY)).toBe(false);
      expect(sessionStorage.getItem(KEY)).toBeNull();
      expect(sessionStorage.getItem(OTHER_ATTEMPT_KEY)).toBeNull();
      // Lo de otro caso y lo que no es del consentimiento no se toca.
      expect(sessionStorage.getItem(OTHER_CASE_KEY)).toBe('given');
      expect(sessionStorage.getItem(consentStorageKey(77, 'attempt-1'))).toBe('given');
      expect(sessionStorage.getItem('siep_case_intro_7_attempt-1')).toBe('read');
    });

    it('es idempotente: sin nada vigente el servidor responde 200 con withdrawnAt nulo y también queda sin consentimiento', async () => {
      const done = recorder.withdraw(CASE_ID);
      http.expectOne(URL).flush({ data: { caseVersionId: CASE_ID, withdrawnAt: null } });
      await done;

      expect(recorder.isGiven(KEY)).toBe(false);
    });

    it('si el servidor no responde, rechaza y NO da por retirado lo que no lo está', async () => {
      const accepted = recorder.record(KEY);
      http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
      await accepted;

      const done = recorder.withdraw(CASE_ID);
      http.expectOne(URL).error(new ProgressEvent('error'));

      await expect(done).rejects.toThrow();
      expect(recorder.isGiven(KEY)).toBe(true);
      expect(sessionStorage.getItem(KEY)).toBe('given');
    });
  });

  describe('el registro que usa la aplicación', () => {
    it('el token CONSENT_RECORDER entrega el registro en servidor, no el de la pestaña', () => {
      const injected = TestBed.inject(CONSENT_RECORDER);
      expect(injected).toBeInstanceOf(ServerConsentRecorder);
      expect(injected).not.toBeInstanceOf(SessionConsentRecorder);
    });

    it('lo que el registro pide a la red no lleva datos de la persona: solo la versión del aviso en el cuerpo', async () => {
      const done = recorder.record(KEY);
      const request = http.expectOne(URL);
      expect(Object.keys(request.request.body as object)).toEqual(['noticeVersion']);
      request.flush(recordBody(), { status: 201, statusText: 'Created' });
      await done;
    });

    // S7-2 · `logout()` navega sin recargar y el registro es un singleton: debe seguir a la persona de la sesión sin que
    // `core/auth` sepa que existe (solo lee `AuthService.currentUser`, como ya hace `CachedSimulationService`).
    describe('sigue la sesión de AuthService (S7-2)', () => {
      const person = (id: number, nombre = 'Ana'): User => ({ id, nombre, apellido: 'Prueba', email: `persona${id}@siep.test`, role: 'ESTUDIANTE' });

      async function acceptWith(injected: ConsentRecorder): Promise<void> {
        const accepted = injected.record(KEY);
        http.expectOne(URL).flush(recordBody(), { status: 201, statusText: 'Created' });
        await accepted;
      }

      // Control negativo (mutación: el token arma el registro sin la persona): lo de A sigue valiendo después de salir.
      it('al cerrar sesión se olvida lo que sabía, y entra otra persona sin heredarlo', async () => {
        const auth = TestBed.inject(AuthService);
        auth.currentUser.set(person(41));
        const injected = TestBed.inject(CONSENT_RECORDER);
        await acceptWith(injected);
        expect(injected.isGiven(OTHER_ATTEMPT_KEY)).toBe(true);

        auth.clearSession(); // sale A: la aplicación navega al inicio de sesión sin recargar la página

        expect(injected.isGiven(OTHER_ATTEMPT_KEY)).toBe(false);
        auth.currentUser.set(person(42)); // entra B en la misma pestaña
        expect(injected.isGiven(OTHER_ATTEMPT_KEY)).toBe(false);
      });

      it('si entra otra persona sin pasar por «sin sesión», también se olvida', async () => {
        const auth = TestBed.inject(AuthService);
        auth.currentUser.set(person(41));
        const injected = TestBed.inject(CONSENT_RECORDER);
        await acceptWith(injected);

        auth.currentUser.set(person(42));

        expect(injected.isGiven(OTHER_ATTEMPT_KEY)).toBe(false);
      });

      // Control negativo (mutación: comparar el objeto de la ficha en vez de su id): `/me` refresca la ficha y se perdería lo que se sabe.
      it('la ficha de la misma persona refrescada (otro objeto, mismo id) no hace olvidar nada', async () => {
        const auth = TestBed.inject(AuthService);
        auth.currentUser.set(person(41));
        const injected = TestBed.inject(CONSENT_RECORDER);
        await acceptWith(injected);

        auth.currentUser.set(person(41, 'Ana María'));
        auth.markPasswordChanged();

        expect(injected.isGiven(OTHER_ATTEMPT_KEY)).toBe(true);
      });
    });
  });

  it('el error de «aviso nuevo» es un Error con nombre propio', () => {
    const error = new ConsentNoticeStaleError('v2');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ConsentNoticeStaleError');
    expect(error.currentNoticeVersion).toBe('v2');
    expect(new HttpErrorResponse({ status: 409 })).not.toBeInstanceOf(ConsentNoticeStaleError);
  });
});
