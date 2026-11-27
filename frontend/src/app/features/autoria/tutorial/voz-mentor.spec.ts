import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstantTextSettings } from '../../../core/a11y/instant-text-settings.service';
import { VozMentor } from './voz-mentor';

describe('VozMentor', () => {
  let voz: VozMentor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    voz = runInInjectionContext(TestBed.inject(Injector), () => new VozMentor('assets/voz-de-prueba'));
  });

  afterEach(() => {
    voz.callar();
    vi.useRealTimers();
  });

  it('escribe el texto letra a letra y termina con el texto entero', () => {
    voz.decir('Hola');
    expect(voz.escrito()).toBe('');
    expect(voz.escribiendo()).toBe(true);
    vi.advanceTimersByTime(20);
    expect(voz.escrito()).toBe('H');
    vi.advanceTimersByTime(1000);
    expect(voz.escrito()).toBe('Hola');
    expect(voz.escribiendo()).toBe(false);
  });

  it('completar muestra el texto entero de una vez', () => {
    voz.decir('Un texto largo del mentor.');
    vi.advanceTimersByTime(40);
    voz.completar();
    expect(voz.escrito()).toBe('Un texto largo del mentor.');
    expect(voz.escribiendo()).toBe(false);
  });

  it('un texto nuevo empieza de cero', () => {
    voz.decir('Primero');
    vi.advanceTimersByTime(60);
    voz.decir('Segundo');
    expect(voz.escrito()).toBe('');
    vi.advanceTimersByTime(1000);
    expect(voz.escrito()).toBe('Segundo');
  });

  it('con «Texto instantáneo» el texto sale entero', () => {
    TestBed.inject(InstantTextSettings).set(true);
    voz.decir('Ya');
    expect(voz.escrito()).toBe('Ya');
    expect(voz.escribiendo()).toBe(false);
  });
});
