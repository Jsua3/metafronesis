import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { type EscenarioReaccion, type FinReaccion, ReactionDirectorComponent } from './reaction-director.component';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { KitService } from '../character/kit/kit.service';

const ANTES = { bond: 'GUARDED', activation: 'TENSE', label: 'La persona se muestra cautelosa y tensa' } as const;
const DESPUES = { bond: 'OPEN', activation: 'CALM', label: 'La persona se abre y está serena' } as const;
const REACCION = { line: 'Gracias por quedarse.', emotion: 'triste', gesture: 'se-acerca', objectKey: 'familia-duelo' };
const ENTRADA = { reaction: REACCION, personaAntes: ANTES, personaDespues: DESPUES, reduceMotion: false };
const QUIEN = { nombre: 'Familia en crisis', visual: null };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function montar(opts: { reduceMotion: boolean }) {
  const llamadas: string[] = [];
  const escenario: EscenarioReaccion & { llamadas: string[] } = {
    llamadas,
    frameActors: k => { llamadas.push(`frameActors:${k}`); },
    releaseFrame: () => { llamadas.push('releaseFrame'); },
    playGesture: (k, g) => { llamadas.push(`playGesture:${k}:${g}`); return Promise.resolve(); },
    setPersonaState: t => { llamadas.push(`setPersonaState:${t}`); },
  };
  const announcer = { announce: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: LiveRegionAnnouncer, useValue: announcer },
      { provide: KitService, useValue: fakeKitService() },
    ],
  });
  const fixture = TestBed.createComponent(ReactionDirectorComponent);
  fixture.componentRef.setInput('escenario', escenario);
  fixture.componentRef.setInput('reduceMotion', opts.reduceMotion);
  const director = fixture.componentInstance;
  const terminado: FinReaccion[] = [];
  director.finished.subscribe(m => terminado.push(m));
  const teclear = (key: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
    document.dispatchEvent(e);
    return e;
  };
  return { director, escenario, announcer, terminado, teclear, fixture };
}

it('recorre encuadre, gesto, cara, frase y etiqueta, espera «Continuar» y al pulsarlo termina soltando el encuadre', async () => {
  const { director, escenario, announcer, terminado } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  await vi.runAllTimersAsync();
  expect(terminado, 'V7: la respuesta no se va sola').toEqual([]);
  expect(escenario.llamadas).not.toContain('releaseFrame');
  director.continuar();
  expect(escenario.llamadas).toEqual(['frameActors:familia-duelo', 'playGesture:familia-duelo:se-acerca', 'setPersonaState:La persona se abre y está serena', 'releaseFrame']);
  expect(announcer.announce).toHaveBeenCalledWith('Familia en crisis: Gracias por quedarse.', 'polite');
  expect(announcer.announce).toHaveBeenCalledTimes(1);
  expect(terminado).toEqual(['completa']);
});

it('con movimiento reducido no encuadra ni gesticula, pero la frase y la etiqueta cambian', async () => {
  const { director, escenario } = montar({ reduceMotion: true });
  director.play(ENTRADA, QUIEN);
  await vi.runAllTimersAsync();
  expect(escenario.llamadas.some(c => c.startsWith('frameActors') || c.startsWith('playGesture'))).toBe(false);
  expect(escenario.llamadas).toContain('setPersonaState:La persona se abre y está serena');
});

it('Enter salta al final una sola vez y deja el estado final', () => {
  const { director, escenario, terminado, teclear, announcer } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  const primero = teclear('Enter');
  teclear('Enter', { repeat: true });
  teclear(' ');
  expect(primero.defaultPrevented).toBe(true);
  expect(terminado).toEqual(['saltada']);
  expect(escenario.llamadas.at(-1)).toBe('releaseFrame');
  expect(escenario.llamadas).toContain('setPersonaState:La persona se abre y está serena');
  expect(announcer.announce).toHaveBeenCalledTimes(1);
});

it('una tecla repetida mantenida durante la secuencia no salta ni pasa a otros oyentes', () => {
  const { director, terminado, teclear } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  expect(teclear('Enter', { repeat: true }).defaultPrevented).toBe(true);
  expect(terminado).toEqual([]);
});

it('Esc no lo consume: sigue a la cadena de la salida segura', () => {
  const { director, teclear } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  expect(teclear('Escape').defaultPrevented).toBe(false);
});

it('cancel corta sin emitir completa y suelta el encuadre', async () => {
  const { director, escenario, terminado } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  director.cancel();
  await vi.runAllTimersAsync();
  expect(terminado).toEqual(['cancelada']);
  expect(escenario.llamadas.at(-1)).toBe('releaseFrame');
  expect(escenario.llamadas).not.toContain('setPersonaState:La persona se abre y está serena');
  expect(director.activa()).toBe(false);
});

it('cancel sin secuencia activa no emite nada', () => {
  const { director, terminado } = montar({ reduceMotion: false });
  director.cancel();
  expect(terminado).toEqual([]);
});

it('fuera de la secuencia no consume ninguna tecla', () => {
  const { teclear } = montar({ reduceMotion: false });
  expect(teclear('Enter').defaultPrevented).toBe(false);
});

it('pinta la franja con el nombre, la frase y el botón «Continuar» (con la tecla oculta a lectores) mientras está activa', async () => {
  const { director, fixture } = montar({ reduceMotion: true });
  director.play(ENTRADA, QUIEN);
  await vi.advanceTimersByTimeAsync(10);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  expect(el.textContent).toContain('Familia en crisis');
  expect(el.textContent).toContain('Gracias por quedarse.');
  const continuar = el.querySelector<HTMLButtonElement>('button.reaction-continue');
  expect(continuar?.textContent).toContain('Continuar');
  expect(continuar?.querySelector('.reaction-key')?.getAttribute('aria-hidden')).toBe('true');
  director.cancel();
  fixture.detectChanges();
  expect(el.querySelector('.reaction-strip')).toBeNull();
});

it('REGLA-004: con el foco en un botón (p. ej. «Salida segura»), Enter y Espacio son del botón, no saltan la reacción', () => {
  const { director, terminado } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  const salida = document.createElement('button');
  salida.textContent = 'Salida segura';
  document.body.appendChild(salida);
  try {
    for (const key of ['Enter', ' ']) {
      const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
      salida.dispatchEvent(e);
      expect(e.defaultPrevented, `${key} sobre el botón no se cancela`).toBe(false);
    }
    expect(terminado, 'la reacción sigue en curso').toEqual([]);
  } finally {
    salida.remove();
  }
});

it('REGLA-004: Enter sobre «Salida segura» de la propia franja pide la pausa y no salta la reacción', async () => {
  const { director, fixture, terminado } = montar({ reduceMotion: true });
  const pausas: number[] = [];
  director.safeExit.subscribe(() => pausas.push(1));
  director.play(ENTRADA, QUIEN);
  await vi.advanceTimersByTimeAsync(10);
  fixture.detectChanges();
  const boton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.reaction-dock .safe-exit-btn')!;
  const e = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
  boton.dispatchEvent(e);
  expect(e.defaultPrevented, 'el navegador activa el botón').toBe(false);
  expect(terminado, 'la reacción no se saltó').toEqual([]);
  boton.click();   // lo que hace el navegador con Enter sobre un botón
  expect(pausas).toEqual([1]);
  director.cancel();
});

it('la franja trae «Salida segura» (REGLA-004): pulsarla pide la pausa y, pedida, dice «Pausando…»', async () => {
  const { director, fixture } = montar({ reduceMotion: true });
  const pausas: number[] = [];
  director.safeExit.subscribe(() => pausas.push(1));
  director.play(ENTRADA, QUIEN);
  await vi.advanceTimersByTimeAsync(10);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const boton = el.querySelector<HTMLButtonElement>('.reaction-dock .safe-exit-btn');
  expect(boton?.textContent).toContain('Salida segura');
  boton!.click();
  expect(pausas).toEqual([1]);
  fixture.componentRef.setInput('pausing', true);
  fixture.detectChanges();
  expect(el.querySelector('.reaction-dock .safe-exit-btn')?.textContent).toContain('Pausando…');
  director.cancel();
  fixture.detectChanges();
  expect(el.querySelector('.safe-exit-btn')).toBeNull();
});

it('sin nombre se anuncia solo la frase, sin los dos puntos sueltos', async () => {
  const { director, announcer } = montar({ reduceMotion: true });
  director.play(ENTRADA, { nombre: '', visual: null });
  await vi.runAllTimersAsync();
  expect(announcer.announce).toHaveBeenCalledWith('Gracias por quedarse.', 'polite');
});

// V7: la respuesta del personaje nunca se va sola. Con frase, la franja espera «Continuar» (botón, Enter, Espacio o toque).

it('con frase, la franja no se va sola: un minuto después sigue esperando «Continuar»', async () => {
  const { director, terminado } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(director.activa()).toBe(true);
  expect(terminado).toEqual([]);
  director.continuar();
  expect(terminado).toEqual(['completa']);
  expect(director.activa()).toBe(false);
});

it('«Continuar» antes de la frase la muestra y sigue esperando; el segundo cierra la franja', async () => {
  const { director, escenario, terminado, fixture } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  await vi.advanceTimersByTimeAsync(10);
  director.continuar();
  fixture.detectChanges();
  expect(terminado, 'el primero no la cierra').toEqual([]);
  expect((fixture.nativeElement as HTMLElement).textContent).toContain('Gracias por quedarse.');
  expect(escenario.llamadas).toContain('setPersonaState:La persona se abre y está serena');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(terminado, 'ni pasa sola después').toEqual([]);
  director.continuar();
  expect(terminado).toEqual(['saltada']);
});

it('Enter y Espacio son «Continuar»: el primero muestra la frase, el segundo cierra; la repetición no cuenta', () => {
  const { director, terminado, teclear } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  expect(teclear('Enter').defaultPrevented).toBe(true);
  expect(terminado).toEqual([]);
  teclear('Enter', { repeat: true });
  expect(terminado, 'una tecla mantenida no la cierra').toEqual([]);
  teclear(' ');
  expect(terminado).toEqual(['saltada']);
  expect(director.activa()).toBe(false);
});

it('el botón «Continuar» de la franja la cierra al pulsarlo (clic o toque)', async () => {
  const { director, fixture, terminado } = montar({ reduceMotion: true });
  director.play(ENTRADA, QUIEN);
  await vi.runAllTimersAsync();
  fixture.detectChanges();
  const boton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.reaction-continue')!;
  boton.click();
  fixture.detectChanges();
  expect(terminado).toEqual(['completa']);
  expect((fixture.nativeElement as HTMLElement).querySelector('.reaction-strip')).toBeNull();
});

it('sin frase no hay nada que leer: la franja termina sola, como siempre', async () => {
  const { director, terminado } = montar({ reduceMotion: false });
  director.play({ ...ENTRADA, reaction: { ...REACCION, line: '' } }, QUIEN);
  await vi.runAllTimersAsync();
  expect(terminado).toEqual(['completa']);
});

it('con movimiento reducido también espera «Continuar», sin encuadre ni gesto', async () => {
  const { director, escenario, terminado } = montar({ reduceMotion: true });
  director.play(ENTRADA, QUIEN);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(terminado).toEqual([]);
  director.continuar();
  expect(terminado).toEqual(['completa']);
  expect(escenario.llamadas.some(c => c.startsWith('frameActors') || c.startsWith('playGesture'))).toBe(false);
});

it('«Salida segura» mientras espera «Continuar»: cancel la corta en el acto (REGLA-004)', async () => {
  const { director, terminado } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  await vi.runAllTimersAsync();
  director.cancel();
  expect(terminado).toEqual(['cancelada']);
  expect(director.activa()).toBe(false);
});
