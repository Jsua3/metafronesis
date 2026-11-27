import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { SimulationService } from '../../core/api/simulation.service';
import { armarGuia, type GuiaEscena } from './caso/guia';
import type { HintAttemptRef } from './scene-hint.component';
import { SceneGoalCardComponent } from './scene-goal-card.component';

const GUIA: GuiaEscena = {
  objetivo: 'Contener a la familia',
  enEstaSala: [
    { key: 'npc:enfermera', label: 'Enfermera', tipo: 'persona', visto: true },
    { key: 'familia', label: 'Familia', tipo: 'persona', visto: false },
    { key: 'carpeta', label: 'Historia clínica', tipo: 'objeto', visto: true },
  ],
  quedaPorConocer: true,
  siguiente: 'Habla con Familia',
  hechos: 1,
  total: 2,
  siguienteLugar: { key: 'familia', label: 'Familia', tipo: 'persona' },
};

/**
 * La ficha del objetivo (4.2): plegada muestra el objetivo; abierta lista «En esta sala» con la marca en palabras y ofrece
 * «Pedir una pista». Se pinta con el componente aislado y un `SimulationService` falso para la pista.
 */
describe('SceneGoalCardComponent', () => {
  function montar(entrada: { guia: GuiaEscena; hintAttempt?: HintAttemptRef | null; compact?: boolean }) {
    const servicio = {
      getHints: vi.fn(() => of({ available: 2, shown: [] })),
      revealNextHint: vi.fn(() => of({ available: 1, shown: [{ id: 1, text: 'Mira con calma.' }] })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SimulationService, useValue: servicio },
        { provide: LiveRegionAnnouncer, useValue: { announce: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(SceneGoalCardComponent);
    fixture.componentRef.setInput('guia', entrada.guia);
    fixture.componentRef.setInput('hintAttempt', entrada.hintAttempt ?? null);
    // Desde V7 la ficha arranca abierta fuera de compacto; las pruebas de la ficha plegada la montan en compacto (donde
    // sigue arrancando plegada), salvo que pidan otra cosa.
    fixture.componentRef.setInput('compact', entrada.compact ?? true);
    let abiertas = 0;
    fixture.componentInstance.opened.subscribe(() => abiertas++);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const toggle = () => host.querySelector<HTMLButtonElement>('button.goal-card__toggle')!;
    return {
      fixture, host, el: host, servicio,
      toggle,
      abrir: () => { toggle().click(); fixture.detectChanges(); },
      abiertas: () => abiertas,
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('nombra la acción de persona y conserva el botón al cambiar el destino', () => {
    const { fixture, host } = montar({ guia: GUIA, compact: false });
    const button = host.querySelector<HTMLButtonElement>('[data-guia-ir]')!;
    expect(button.textContent).toContain('Hablar con Familia');
    fixture.componentRef.setInput('guia', { ...GUIA, siguienteLugar: { key: 'puerta', label: 'Sala', tipo: 'puerta' } });
    fixture.detectChanges();
    expect(host.querySelector('[data-guia-ir]')).toBe(button);
    expect(button.textContent).toContain('Pasar a Sala');
  });

  it('una puerta cerrada conserva el foco y asocia el motivo de la barra', () => {
    const guia = { ...GUIA, siguienteLugar: { key: 'puerta', label: 'Sala', tipo: 'puerta' as const } };
    const { fixture, host } = montar({ guia, compact: false });
    fixture.componentRef.setInput('doorMessages', { puerta: 'Antes de pasar, habla con Enfermera.' });
    fixture.detectChanges();
    const button = host.querySelector<HTMLButtonElement>('[data-guia-ir]')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('#' + button.getAttribute('aria-describedby'))?.textContent).toBe('Antes de pasar, habla con Enfermera.');
    expect(button.disabled).toBe(false);
  });

  it('conserva Ir allí al actualizar la misma guía', () => {
    const { fixture, host } = montar({ guia: GUIA, compact: false });
    const button = host.querySelector('[data-guia-ir]');
    expect(button).not.toBeNull();
    const observer = new MutationObserver(() => {});
    observer.observe(host, { childList: true, subtree: true });
    for (let i = 0; i < 10; i++) {
      fixture.componentRef.setInput('guia', { ...GUIA, siguienteLugar: { ...GUIA.siguienteLugar! } });
      fixture.detectChanges();
    }
    expect(host.querySelector('[data-guia-ir]')).toBe(button);
    expect(observer.takeRecords().flatMap(r => Array.from(r.removedNodes)).filter(n => n === button || (n instanceof Element && !!n.querySelector('[data-guia-ir]')))).toHaveLength(0);
    observer.disconnect();
  });

  describe('guía para las primeras testers (V7)', () => {
    it('fuera de compacto arranca abierta, con el siguiente paso y la cuenta de la sala', () => {
      const { host, toggle } = montar({ guia: GUIA, compact: false });
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      const paso = host.querySelector('[data-guia-paso]')!;
      expect(paso.textContent).toContain('Siguiente paso · 2 de 2');
      expect(paso.textContent).toContain('Habla con Familia');
    });

    it('plegada por la persona, al cambiar el objetivo se vuelve a abrir con un pulso (una vez)', () => {
      const { fixture, host, toggle, abrir } = montar({ guia: GUIA, compact: false });
      abrir(); // la pliega
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      fixture.componentRef.setInput('guia', { ...GUIA, objetivo: 'Busca un lugar para hablar' });
      fixture.detectChanges();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(host.querySelector('.goal-card')!.classList.contains('goal-card--pulso')).toBe(true);
    });

    it('con «Reducir movimiento» se vuelve a abrir sin pulso, y con todo hecho lo dice', () => {
      const { fixture, host, toggle } = montar({ guia: GUIA, compact: false });
      fixture.componentRef.setInput('reduceMotion', true);
      fixture.componentRef.setInput('guia', { ...GUIA, objetivo: 'Otra', siguiente: 'Cuando termines en esta sala: X.', hechos: 2, total: 2 });
      fixture.detectChanges();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(host.querySelector('.goal-card')!.classList.contains('goal-card--pulso')).toBe(false);
      expect(host.querySelector('[data-guia-paso]')!.textContent).toContain('Todo hecho en esta sala · 2 de 2');
    });
  });

  it('plegada muestra el objetivo y lo publica en data-goal', () => {
    const { host, el } = montar({ guia: GUIA });
    expect(el.querySelector('button')!.textContent).toContain('Contener a la familia');
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    expect(host.getAttribute('data-goal')).toBe('Contener a la familia');
  });

  it('sin objetivo usa el texto de respaldo y data-goal queda vacío', () => {
    const { host, el } = montar({ guia: { ...GUIA, objetivo: '' } });
    expect(el.textContent).toContain('Explora la sala y conversa con las personas.');
    expect(host.getAttribute('data-goal')).toBe('');
  });

  it('abierta lista «En esta sala» con la marca en palabras y avisa que se abrió', () => {
    const { el, abrir, abiertas } = montar({ guia: GUIA });
    abrir();
    const filas = [...el.querySelectorAll('li')].map(li => li.textContent!.replace(/\s+/g, ' ').trim());
    // P9: «aún no» se leía como «no disponible»; la persona del siguiente paso lo dice, y quien falta dice qué falta.
    expect(filas).toEqual(['Enfermera · ya hablaste', 'Familia · tu siguiente paso', 'Historia clínica · ya revisaste']);
    expect(el.textContent).toContain('En esta sala');
    expect(abiertas()).toBe(1);
  });

  it('una persona sin hablar que no es el siguiente paso dice «sin hablar todavía», nunca «aún no»', () => {
    const guia: GuiaEscena = { ...GUIA, siguienteLugar: { key: 'npc:enfermera', label: 'Enfermera', tipo: 'persona' } };
    const { el, abrir } = montar({ guia });
    abrir();
    const filas = [...el.querySelectorAll('li')].map(li => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(filas[1]).toBe('Familia · sin hablar todavía');
    expect(el.textContent).not.toContain('aún no');
  });

  describe('«Siguiente paso» conectado con «Ir a…» (P9)', () => {
    it('el botón «Ir allí» emite la clave del siguiente paso y su nombre accesible dice a quién', () => {
      const { fixture, el, abrir } = montar({ guia: GUIA });
      const pedidas: string[] = [];
      fixture.componentInstance.goToStep.subscribe(k => pedidas.push(k));
      abrir();
      const ir = el.querySelector<HTMLButtonElement>('[data-guia-ir]')!;
      expect(ir.textContent).toContain('Hablar con Familia');
      ir.click();
      expect(pedidas).toEqual(['familia']);
    });

    it('asocia la flecha y el botón a la primera fila con destino disponible y muestra el avance real', () => {
      const guia = armarGuia({
        goal: 'Plan', lugares: [
          { key: 'cerrada', kind: 'door', label: 'Pasillo', note: 'Cerrada' },
          { key: 'npc:patricia', kind: 'person', label: 'Patricia' },
        ], inspeccionados: [], hablados: new Set(),
        autorada: {
          guia: { paso: 2, titulo: 'Plan', pasos: [
            { texto: 'Yuliana despertará en unas horas.' },
            { texto: 'Espera la apertura.', lugar: 'cerrada', hecho: { inspected: 'cerrada' } },
            { texto: 'Propón el plan a Patricia.', lugar: 'patricia', hecho: { talked: 'patricia' } },
            { texto: 'Recoge el material.', hecho: { has: 'kit' } },
          ] },
          mundo: { hablados: new Set(), inspeccionados: [], inventario: ['kit'], herramientasUsadas: [] },
        },
      });
      const { el, abrir } = montar({ guia });
      abrir();
      const fila = el.querySelector('[aria-current="step"]')!;
      expect(fila.textContent).toContain('Propón el plan a Patricia.');
      expect(fila.querySelector('[data-guia-ir]')?.textContent).toContain('Hablar con Patricia');
      expect(el.querySelector('.goal-card__paso-cuenta')?.textContent).toContain('1 de 4 hechos');
      expect(el.querySelector('[data-guia-pasos] li')?.textContent).not.toContain('✓');
    });

    it('sin nada a lo que apuntar no hay botón', () => {
      const { el, abrir } = montar({ guia: { ...GUIA, siguiente: null, siguienteLugar: null } });
      abrir();
      expect(el.querySelector('[data-guia-ir]')).toBeNull();
    });

    it('la puerta de respaldo queda fuera de la fila que indica cómo seguir en la sala', () => {
      const guia = armarGuia({
        goal: 'Plan', lugares: [{ key: 'puerta', kind: 'door', label: 'Pasillo' }], inspeccionados: [], hablados: new Set(),
        autorada: {
          guia: { paso: 1, titulo: '', pasos: [{ texto: 'Decide qué responder.' }] },
          mundo: { hablados: new Set(), inspeccionados: [], inventario: [], herramientasUsadas: [] },
        },
      });
      const { el, abrir, fixture } = montar({ guia });
      const lugares: string[] = [];
      fixture.componentInstance.goToStep.subscribe(k => lugares.push(k));
      abrir();
      expect(el.querySelector('[aria-current="step"]')?.textContent).toContain('Decide qué responder.');
      const ir = el.querySelector<HTMLButtonElement>('[data-guia-ir]')!;
      expect(ir.closest('li')).toBeNull();
      expect(el.textContent).toContain('Cuando termines en esta sala: Pasillo.');
      ir.click();
      expect(lugares).toEqual(['puerta']);
    });
  });

  it('abierta ofrece «Pedir una pista» con el intento', () => {
    const { el, abrir } = montar({ guia: GUIA, hintAttempt: { attemptId: 'a1' } });
    abrir();
    expect(el.querySelector('app-scene-hint button')!.textContent).toContain('Pedir una pista');
  });

  it('sin intento no hay botón de pista', () => {
    const { el, abrir } = montar({ guia: GUIA, hintAttempt: null });
    abrir();
    expect(el.querySelector('app-scene-hint')).toBeNull();
  });

  it('se abre y se cierra con su botón, y avisa «opened» solo al abrir', () => {
    const { toggle, abrir, abiertas, fixture } = montar({ guia: GUIA });
    abrir();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    toggle().click();
    fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(abiertas()).toBe(1);
  });

  it('arranca plegada también en compacto y no usa región viva propia', () => {
    const { toggle, host } = montar({ guia: GUIA, compact: true });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[aria-live], [role="status"]')).toBeNull();
  });

  it('abierta no dice ni insinúa qué responder', () => {
    const { el, abrir } = montar({ guia: GUIA, hintAttempt: { attemptId: 'a1' } });
    abrir();
    expect(el.textContent).not.toMatch(/recomendad|correct|adecuad|mejor|riesgo/i);
  });

  describe('aria-controls', () => {
    it('plegada no apunta a nada: el cuerpo aún no existe', () => {
      const { toggle } = montar({ guia: GUIA });
      expect(toggle().hasAttribute('aria-controls')).toBe(false);
    });

    it('abierta apunta al cuerpo que existe, y dos fichas no comparten id', () => {
      const uno = montar({ guia: GUIA });
      uno.abrir();
      const id = uno.toggle().getAttribute('aria-controls');
      expect(id).toBeTruthy();
      const cuerpo = document.getElementById(id!) ?? uno.host.querySelector(`[id="${id}"]`);
      expect(cuerpo).not.toBeNull();
      expect(cuerpo!.hasAttribute('hidden')).toBe(false);

      const dos = TestBed.createComponent(SceneGoalCardComponent);
      dos.componentRef.setInput('guia', GUIA);
      dos.detectChanges();
      const otro = dos.nativeElement as HTMLElement;
      otro.querySelector<HTMLButtonElement>('button.goal-card__toggle')!.click();
      dos.detectChanges();
      expect(otro.querySelector('button.goal-card__toggle')!.getAttribute('aria-controls')).not.toBe(id);
    });

    it('vuelve a plegarla y deja de apuntar', () => {
      const { toggle, abrir, fixture } = montar({ guia: GUIA });
      abrir();
      toggle().click();
      fixture.detectChanges();
      expect(toggle().hasAttribute('aria-controls')).toBe(false);
    });
  });

  it('plegar y volver a abrir no salta el enfriamiento de la pista ni pide el estado otra vez', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { el, abrir, toggle, fixture, servicio } = montar({ guia: GUIA, hintAttempt: { attemptId: 'a1' } });
      abrir();
      const boton = () => [...el.querySelectorAll('app-scene-hint button')].find(b => b.textContent!.includes('Pedir una pista')) as HTMLButtonElement;
      boton().click();
      fixture.detectChanges();
      expect(boton().getAttribute('aria-disabled')).toBe('true');

      toggle().click(); // plegar
      fixture.detectChanges();
      abrir(); // abrir otra vez, dentro de la ventana de duplicado
      expect(boton().getAttribute('aria-disabled')).toBe('true');
      expect(servicio.getHints).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2100);
      fixture.detectChanges();
      expect(boton().getAttribute('aria-disabled')).not.toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('plegada no pide las pistas hasta que se abre la primera vez', () => {
    const { servicio, abrir } = montar({ guia: GUIA, hintAttempt: { attemptId: 'a1' } });
    expect(servicio.getHints).not.toHaveBeenCalled();
    abrir();
    expect(servicio.getHints).toHaveBeenCalledTimes(1);
  });
});
