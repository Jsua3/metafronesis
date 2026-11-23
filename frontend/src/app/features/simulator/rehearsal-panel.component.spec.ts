import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import type { Mock } from 'vitest';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { RehearsalApi } from '../../core/api/rehearsal.api';
import type { RehearsalBlock } from '../../core/models/simulation.model';
import { RehearsalPanelComponent } from './rehearsal-panel.component';

/**
 * El panel de autora del ensayo (bloque B, tarea 24): ajusta lo explorado, la persona, los hitos y la escena por `PATCH`,
 * explica por qué una respuesta no aparece y es operable con teclado (Alt+A pliega).
 */
const BLOQUE: RehearsalBlock = {
  sceneId: 7,
  options: [
    { id: 41, text: 'Quedarse', offered: true, missing: [], retainedBy: null },
    { id: 42, text: 'Derivar', offered: false, missing: [{ kind: 'inspected', key: 'carpeta', label: 'Carpeta' }], retainedBy: 'facts' },
  ],
  comments: [{ index: 0, personaje: 'enfermera', line: 'Está callada.', due: true, retainedBy: null, missing: [] }],
  warnings: ['Una respuesta no lleva a ninguna escena.'],
  persona: { bond: 'GUARDED', activation: 'TENSE', label: 'x' },
  milestones: ['escucha'],
  path: [{ nodeId: 7, title: 'Sala de escucha' }],
  explored: { talked: ['enfermera'], inspected: [], has: [], used: [] },
  explorable: [
    { kind: 'talked', key: 'enfermera', label: 'Enfermera' },
    { kind: 'inspected', key: 'carpeta', label: 'Carpeta' },
    { kind: 'used', key: 'PAP', label: 'PAP' },
  ],
  scenes: [
    { id: 3, key: 'a', title: 'Urgencias', start: true, terminal: false },
    { id: 7, key: 'b', title: 'Sala de escucha', start: false, terminal: false },
  ],
};
const BLOQUE_NUEVO: RehearsalBlock = { ...BLOQUE, explored: { ...BLOQUE.explored, inspected: ['carpeta'] } };

describe('RehearsalPanelComponent', () => {
  let fixture: ComponentFixture<RehearsalPanelComponent>;
  let api: { adjust: Mock; read: Mock };
  let envio: Subject<RehearsalBlock>;
  let adjusted: RehearsalBlock[];
  let gone: number;
  let el: HTMLElement;
  const text = () => (el.textContent ?? '').replace(/\s+/g, ' ');

  beforeEach(() => {
    envio = new Subject<RehearsalBlock>();
    api = { adjust: vi.fn(() => envio), read: vi.fn(() => envio) };
    adjusted = [];
    gone = 0;
    TestBed.configureTestingModule({
      imports: [RehearsalPanelComponent],
      providers: [
        provideRouter([]),
        { provide: RehearsalApi, useValue: api },
      ],
    });
    fixture = TestBed.createComponent(RehearsalPanelComponent);
    fixture.componentRef.setInput('caseVersionId', 9);
    fixture.componentRef.setInput('attemptId', 'a1');
    fixture.componentRef.setInput('block', BLOQUE);
    fixture.componentRef.setInput('hitosDeclarados', [
      { key: 'escucha', label: 'Escuchar sin juzgar', description: '', decisive: false },
      { key: 'remision', label: 'Remitir', description: '', decisive: true },
    ]);
    fixture.componentInstance.adjusted.subscribe(b => adjusted.push(b));
    fixture.componentInstance.gone.subscribe(() => gone++);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('muestra las secciones en su orden, con los textos del borrador', () => {
    const titulos = Array.from(el.querySelectorAll('[data-section]')).map(s => s.getAttribute('data-section'));
    expect(titulos).toEqual(['escena', 'explorado', 'persona', 'hitos', 'ocultas', 'comentarios', 'avisos']);
    expect(text()).toContain('Panel de autora');
    expect(text()).toContain('Lo explorado en esta sala');
    expect(text()).toContain('Herramientas');
    expect(text()).toContain('Derivar');
    expect(text()).toContain('Le falta: revisar Carpeta');
    expect(text()).toContain('Se dirá al acercarte.');
    expect(text()).toContain('Una respuesta no lleva a ninguna escena.');
    expect(text()).toContain('Escuchar sin juzgar');
  });

  it('el enlace de vuelta al guion lleva a la escena actual del editor', () => {
    expect(el.querySelector('a[href="/portal/casos/9/editor/escena/7"]')).not.toBeNull();
  });

  it('el regreso al guion va arriba, antes del cuerpo del panel, y se ve aunque el panel esté plegado', () => {
    const enlace = el.querySelector<HTMLAnchorElement>('a.rp__volver')!;
    expect(enlace.getAttribute('href')).toBe('/portal/casos/9/editor/escena/7');
    expect(enlace.compareDocumentPosition(el.querySelector('.rp__toggle')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(enlace.closest('.rp__body')).toBeNull();
    expect(el.querySelectorAll('a[href="/portal/casos/9/editor/escena/7"]')).toHaveLength(1);
  });

  it('marcar una casilla manda lo explorado completo, avisa al juego y queda ocupado (aria-busy) mientras tanto', () => {
    (el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(api.adjust).toHaveBeenCalledWith(9, 'a1', { explorado: { talked: ['enfermera'], inspected: ['carpeta'], has: [], used: [] } });
    expect(el.querySelector('fieldset')!.getAttribute('aria-busy')).toBe('true');
    envio.next(BLOQUE_NUEVO);
    fixture.detectChanges();
    expect(adjusted).toEqual([BLOQUE_NUEVO]);
    expect(el.querySelector('fieldset')!.getAttribute('aria-busy')).toBe('false');
  });

  it('«Ir a esta escena» manda irA con la escena elegida', () => {
    const select = el.querySelector('select[data-field="irA"]') as HTMLSelectElement;
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    (el.querySelector('button[data-action="irA"]') as HTMLButtonElement).click();
    expect(api.adjust).toHaveBeenCalledWith(9, 'a1', { irA: 3 });
  });

  it('el vínculo y la activación mandan persona, una dimensión por vez', () => {
    const vinculo = el.querySelector('select[data-field="bond"]') as HTMLSelectElement;
    vinculo.value = 'OPEN';
    vinculo.dispatchEvent(new Event('change'));
    expect(api.adjust).toHaveBeenLastCalledWith(9, 'a1', { persona: { bond: 'OPEN' } });
    envio.next(BLOQUE);
    fixture.detectChanges();
    const activacion = el.querySelector('select[data-field="activation"]') as HTMLSelectElement;
    activacion.value = 'CRISIS';
    activacion.dispatchEvent(new Event('change'));
    expect(api.adjust).toHaveBeenLastCalledWith(9, 'a1', { persona: { activation: 'CRISIS' } });
  });

  it('si el cambio de persona falla o se descarta (hay otro en curso), el selector vuelve al valor del servidor', () => {
    const vinculo = el.querySelector('select[data-field="bond"]') as HTMLSelectElement;
    const activacion = el.querySelector('select[data-field="activation"]') as HTMLSelectElement;
    vinculo.value = 'OPEN';
    vinculo.dispatchEvent(new Event('change'));
    activacion.value = 'CRISIS';   // el PATCH del vínculo sigue en vuelo: este cambio se descarta
    activacion.dispatchEvent(new Event('change'));
    expect(activacion.value).toBe('TENSE');
    envio.error(new HttpErrorResponse({ status: 500 }));   // y el del vínculo falla
    fixture.detectChanges();
    expect(vinculo.value).toBe('GUARDED');
  });

  it('marcar un hito manda la lista completa de hitos cumplidos', () => {
    (el.querySelector('input[type=checkbox][value="hito:remision"]') as HTMLInputElement).click();
    expect(api.adjust).toHaveBeenCalledWith(9, 'a1', { hitos: ['escucha', 'remision'] });
  });

  it('«Recargar borrador» lee el bloque y lo entrega al juego', () => {
    (el.querySelector('button[data-action="reload"]') as HTMLButtonElement).click();
    expect(api.read).toHaveBeenCalledWith(9, 'a1');
    envio.next(BLOQUE_NUEVO);
    expect(adjusted).toEqual([BLOQUE_NUEVO]);
  });

  it('un 400 se muestra junto a su control y no cambia nada; REHEARSAL_GONE avisa al juego', () => {
    (el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement).click();
    envio.error(new HttpErrorResponse({ status: 400, error: { message: 'El hito no está declarado.', field: 'hitos' } }));
    fixture.detectChanges();
    const alerta = el.querySelector('[data-section="hitos"] .rp__error');
    expect(alerta?.textContent).toContain('El hito no está declarado.');
    expect(adjusted).toEqual([]);
    expect(el.querySelector('fieldset')!.getAttribute('aria-busy')).toBe('false');

    envio = new Subject<RehearsalBlock>();
    api.adjust.mockReturnValue(envio);
    (el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement).click();
    envio.error(new HttpErrorResponse({ status: 404, error: { code: 'REHEARSAL_GONE' } }));
    expect(gone).toBe(1);
  });

  it('un 409 REHEARSAL_CLOSED del panel avisa al juego con el motivo «closed»', () => {
    const motivos: string[] = [];
    fixture.componentInstance.gone.subscribe(m => motivos.push(m));
    (el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement).click();
    envio.error(new HttpErrorResponse({ status: 409, error: { code: 'REHEARSAL_CLOSED' } }));
    fixture.detectChanges();
    expect(motivos).toEqual(['closed']);
    expect(el.querySelector('.rp__error')).toBeNull();
  });

  it('un error sin mensaje dice algo útil en vez de callar', () => {
    (el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement).click();
    envio.error(new HttpErrorResponse({ status: 500 }));
    fixture.detectChanges();
    expect(text()).toContain('No pudimos ajustar el ensayo.');
  });

  it('Alt+A pliega y despliega el panel, y el botón lo anuncia', () => {
    const boton = el.querySelector('[aria-expanded]') as HTMLElement;
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(boton.getAttribute('aria-keyshortcuts')).toBe('Alt+A');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[data-section]')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(boton.getAttribute('aria-expanded')).toBe('true');
  });

  it('una «a» sin Alt no pliega nada', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    fixture.detectChanges();
    expect((el.querySelector('[aria-expanded]') as HTMLElement).getAttribute('aria-expanded')).toBe('true');
  });

  it('un rechazo devuelve la casilla a su valor y no cambia nada', () => {
    const casilla = el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement;
    expect(casilla.checked).toBe(false);
    casilla.click();
    expect(casilla.checked).toBe(true);
    envio.error(new HttpErrorResponse({ status: 400, error: { message: 'No existe.', field: 'explorado' } }));
    expect(casilla.checked).toBe(false);
    const hito = el.querySelector('input[type=checkbox][value="hito:remision"]') as HTMLInputElement;
    envio = new Subject<RehearsalBlock>();
    api.adjust.mockReturnValue(envio);
    hito.click();
    envio.error(new HttpErrorResponse({ status: 400, error: { message: 'No.', field: 'hitos' } }));
    expect(hito.checked).toBe(false);
  });

  it('el foco se queda en el control tras un PATCH (acierte o falle) y el resultado se anuncia con cortesía', () => {
    const anunciar = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
    const casilla = el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement;
    document.body.appendChild(el);
    casilla.focus();
    casilla.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(casilla);
    envio.next(BLOQUE_NUEVO);
    fixture.detectChanges();
    expect(document.activeElement).toBe(casilla);
    expect(anunciar).toHaveBeenLastCalledWith('Ensayo actualizado.', 'polite');

    envio = new Subject<RehearsalBlock>();
    api.adjust.mockReturnValue(envio);
    casilla.click();
    envio.error(new HttpErrorResponse({ status: 400, error: { message: 'El hito no está declarado.', field: 'hitos' } }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(casilla);
    expect(anunciar).toHaveBeenLastCalledWith('El hito no está declarado.', 'polite');
    el.remove();
  });

  it('un cambio en vuelo no pisa el bloque de otro ensayo ni llega tras destruir el panel', () => {
    (el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement).click();
    fixture.componentRef.setInput('attemptId', 'a2');   // se abrió otro ensayo mientras tanto
    envio.next(BLOQUE_NUEVO);
    expect(adjusted).toEqual([]);

    envio = new Subject<RehearsalBlock>();
    api.adjust.mockReturnValue(envio);
    fixture.detectChanges();
    (el.querySelector('input[type=checkbox][value="inspected:carpeta"]') as HTMLInputElement).click();
    fixture.destroy();
    envio.next(BLOQUE_NUEVO);
    expect(adjusted).toEqual([]);
  });

  it('plegar con Alt+A solo mueve el foco al botón si estaba dentro del panel', () => {
    document.body.appendChild(el);
    const fuera = document.createElement('button');
    document.body.appendChild(fuera);
    fuera.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(fuera);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    (el.querySelector('input[type=checkbox]') as HTMLInputElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', altKey: true, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('.rp__toggle'));
    fuera.remove();
    el.remove();
  });
});
