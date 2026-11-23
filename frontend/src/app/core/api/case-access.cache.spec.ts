import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject, forkJoin, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../auth/auth.service';
import { CatalogItem, SimulationAttemptState, StudentAttemptSummary } from '../models/simulation.model';
import { User } from '../models/user.model';
import { CASE_ACCESS_TTL_MS, CaseAccessCache, CaseAccessSnapshot } from './case-access.cache';

/**
 * `CaseAccessCache` (§4.4 de `DISENO.md`, pieza 1; D-16): 60 s de vida y un dueño de sesión. Lo que importa de verdad es
 * que en un computador del aula la persona B nunca vea el catálogo, el historial ni el intento abierto de A.
 */

const persona = (id: number): User => ({ id, nombre: 'N', apellido: 'A', email: `p${id}@x.com`, role: 'ESTUDIANTE' } as User);

const item = (caseVersionId: number): CatalogItem => ({
  caseVersionId, code: `C-${caseVersionId}`, title: `Caso ${caseVersionId}`, description: '', order: caseVersionId,
  unlocked: true, completed: false, locked: false,
});

const deA: CaseAccessSnapshot = { catalogo: [item(1)], historial: [] };
const deB: CaseAccessSnapshot = {
  catalogo: [item(2)],
  historial: [{ attemptId: 'b1', caseVersionId: 2, caseTitle: 'Caso 2', status: 'PAUSED' } as StudentAttemptSummary],
};
const intento = (attemptId: string) => ({ attemptId, caseVersionId: 7, status: 'IN_PROGRESS' } as SimulationAttemptState);

describe('CaseAccessCache', () => {
  let usuario: ReturnType<typeof signal<User | null>>;
  let cache: CaseAccessCache;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T09:00:00'));
    usuario = signal<User | null>(persona(1));
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser: usuario } }],
    });
    cache = TestBed.inject(CaseAccessCache);
    TestBed.tick();
  });

  afterEach(() => vi.useRealTimers());

  it('sin nada guardado no sabe nada', () => {
    expect(cache.acceso()).toBeNull();
    expect(cache.intentoAbierto(7)).toBeUndefined();
  });

  it('devuelve lo guardado mientras está fresco y deja de saberlo a los 60 s', () => {
    cache.guardarAcceso(cache.ticket(), deA);

    vi.setSystemTime(Date.now() + CASE_ACCESS_TTL_MS - 1);
    expect(cache.acceso()).toMatchObject(deA);

    vi.setSystemTime(Date.now() + 1);
    expect(cache.acceso()).toBeNull();
  });

  it('dice cuándo llegó lo que devuelve', () => {
    const llegada = Date.now();
    cache.guardarAcceso(cache.ticket(), deA);

    vi.setSystemTime(llegada + 5_000);
    expect(cache.acceso()?.en).toBe(llegada);
  });

  it('el intento abierto distingue «no sé» (undefined) de «no hay» (null), por caso y con la misma vida', () => {
    const ticket = cache.ticket();
    cache.guardarIntentoAbierto(ticket, 7, null);
    cache.guardarIntentoAbierto(ticket, 8, intento('a8'));

    expect(cache.intentoAbierto(7)).toBeNull();
    expect(cache.intentoAbierto(8)).toEqual(intento('a8'));
    expect(cache.intentoAbierto(9)).toBeUndefined();

    vi.setSystemTime(Date.now() + CASE_ACCESS_TTL_MS);
    expect(cache.intentoAbierto(8)).toBeUndefined();
  });

  it('cambiar de persona lo vacía antes de contestar, aunque el effect no haya corrido todavía', () => {
    cache.guardarAcceso(cache.ticket(), deA);
    cache.guardarIntentoAbierto(cache.ticket(), 7, intento('de-A'));

    usuario.set(persona(2)); // sin TestBed.tick(): la lectura misma tiene que darse cuenta

    expect(cache.acceso()).toBeNull();
    expect(cache.intentoAbierto(7)).toBeUndefined();
  });

  it('cerrar sesión lo vacía: lo de A no queda en memoria aunque A vuelva a entrar', () => {
    cache.guardarAcceso(cache.ticket(), deA);
    cache.guardarIntentoAbierto(cache.ticket(), 7, intento('de-A'));

    // Nadie lee entre medio: solo el effect puede haberlo vaciado.
    usuario.set(null);
    TestBed.tick();
    usuario.set(persona(1));
    TestBed.tick();

    expect(cache.acceso()).toBeNull();
    expect(cache.intentoAbierto(7)).toBeUndefined();
  });

  it('sin sesión no da permiso para guardar y nada se guarda', () => {
    usuario.set(null);

    expect(cache.ticket()).toBeNull();
    cache.guardarAcceso(cache.ticket(), deA);
    expect(cache.acceso()).toBeNull();
  });

  it('una respuesta que salió en la sesión de A y llega con B en sesión se descarta', () => {
    const enCamino = new Subject<CaseAccessSnapshot>();
    enCamino.pipe(cache.guardandoAcceso()).subscribe();

    usuario.set(persona(2));
    enCamino.next(deA);

    expect(cache.acceso()).toBeNull();
  });

  it('una respuesta de una sesión anterior se descarta aunque vuelva a entrar la misma persona (la época cambió)', () => {
    const enCamino = new Subject<SimulationAttemptState | null>();
    enCamino.pipe(cache.guardandoIntentoAbierto(7)).subscribe();

    usuario.set(null);
    TestBed.tick();
    usuario.set(persona(1));
    TestBed.tick();
    enCamino.next(intento('de-la-sesion-vieja'));

    expect(cache.intentoAbierto(7)).toBeUndefined();
  });

  it('el permiso se toma al suscribirse, no al armar la petición', () => {
    const peticion = of(deB).pipe(cache.guardandoAcceso()); // armada mientras A está en sesión
    usuario.set(persona(2));
    TestBed.tick();

    peticion.subscribe(); // sale de verdad con B en sesión: es de B

    expect(cache.acceso()).toMatchObject(deB);
  });

  it('los operadores dejan pasar la respuesta tal cual a quien pidió', () => {
    let recibido: CaseAccessSnapshot | undefined;
    forkJoin({ catalogo: of(deA.catalogo), historial: of(deA.historial) })
      .pipe(cache.guardandoAcceso())
      .subscribe(valor => (recibido = valor));

    expect(recibido).toEqual(deA);
    expect(cache.acceso()).toMatchObject(deA);
  });

  it('A → cierre → A sin que el effect corra entre los cambios: la respuesta de la primera sesión se descarta', () => {
    const enCamino = new Subject<CaseAccessSnapshot>();
    enCamino.pipe(cache.guardandoAcceso()).subscribe();

    usuario.set(null);
    usuario.set(persona(1)); // mismo id, sesión nueva; ni lectura ni TestBed.tick() entre medio
    enCamino.next(deA);

    expect(cache.acceso()).toBeNull();
  });

  it('una respuesta que salió antes de olvidar el caso no devuelve el estado viejo', () => {
    const enCamino = new Subject<SimulationAttemptState | null>();
    enCamino.pipe(cache.guardandoIntentoAbierto(7)).subscribe();

    cache.olvidarCaso(7); // p. ej. se empezó o terminó el intento mientras la lectura viajaba
    enCamino.next(intento('de-antes'));

    expect(cache.intentoAbierto(7)).toBeUndefined();
  });

  it('una respuesta del acceso que salió antes de olvidar el caso tampoco se guarda', () => {
    const enCamino = new Subject<CaseAccessSnapshot>();
    enCamino.pipe(cache.guardandoAcceso()).subscribe();

    cache.olvidarCaso(1);
    enCamino.next(deA);

    expect(cache.acceso()).toBeNull();
  });

  it('vaciar descarta además lo que esté en camino', () => {
    const ticket = cache.ticket();
    cache.vaciar();

    cache.guardarAcceso(ticket, deA);

    expect(cache.acceso()).toBeNull();
  });

  it('olvidar un caso borra su intento abierto y el acceso, y deja los otros casos', () => {
    const ticket = cache.ticket();
    cache.guardarAcceso(ticket, deA);
    cache.guardarIntentoAbierto(ticket, 7, intento('a7'));
    cache.guardarIntentoAbierto(ticket, 8, null);

    cache.olvidarCaso(7);

    expect(cache.intentoAbierto(7)).toBeUndefined();
    expect(cache.intentoAbierto(8)).toBeNull();
    expect(cache.acceso()).toBeNull();
  });
});
