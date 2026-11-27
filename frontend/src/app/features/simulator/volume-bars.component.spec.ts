import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VolumeBarsComponent } from './volume-bars.component';

describe('Barras de volumen', () => {
  let fixture: ComponentFixture<VolumeBarsComponent>;
  let emitted: number[];
  let mutes: number;

  const slider = () => fixture.nativeElement.querySelector('[role="slider"]') as HTMLElement;
  const key = (k: string) => {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    slider().dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(VolumeBarsComponent);
    fixture.componentRef.setInput('label', 'Música ambiental');
    fixture.componentRef.setInput('muteLabel', 'Silenciar la música');
    fixture.componentRef.setInput('level', 6);
    emitted = [];
    mutes = 0;
    fixture.componentInstance.levelChange.subscribe(level => { emitted.push(level); fixture.componentRef.setInput('level', level); });
    fixture.componentInstance.toggleMute.subscribe(() => mutes++);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('es un slider con nombre, rango y valor legible', () => {
    const el = slider();
    const labelledBy = el.getAttribute('aria-labelledby')!;
    expect(fixture.nativeElement.querySelector(`#${labelledBy}`).textContent).toContain('Música ambiental');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('aria-valuemin')).toBe('0');
    expect(el.getAttribute('aria-valuemax')).toBe('10');
    expect(el.getAttribute('aria-valuenow')).toBe('6');
    expect(el.getAttribute('aria-valuetext')).toBe('60 %');
  });

  it('enciende tantas barras como el nivel', () => {
    expect(fixture.nativeElement.querySelectorAll('.vol__barra--llena').length).toBe(6);
  });

  it('se lleva con el teclado y la tecla no llega al juego', () => {
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    const right = key('ArrowRight');
    expect(right.defaultPrevented).toBe(true);
    key('ArrowDown');
    key('ArrowDown');
    key('End');
    key('Home');
    key('PageUp');
    document.removeEventListener('keydown', outside);
    expect(emitted).toEqual([7, 6, 5, 10, 0, 3]);
    expect(outside).not.toHaveBeenCalled();
  });

  it('no sale del rango ni emite si el nivel no cambia', () => {
    fixture.componentRef.setInput('level', 10);
    fixture.detectChanges();
    key('ArrowRight');
    key('End');
    expect(emitted).toEqual([]);
  });

  it('al tocar una barra fija el nivel por su posición', () => {
    const el = slider();
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200, top: 0, height: 30 } as DOMRect);
    el.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 150, pointerId: 1, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, pointerId: 1, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { clientX: 30, pointerId: 1, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 190, pointerId: 1, bubbles: true }));
    expect(emitted).toEqual([8, 2]);
  });

  it('en silencio se ve y se anuncia sin perder el nivel; el botón pide silenciar', () => {
    fixture.componentRef.setInput('muted', true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Silenciar la música');
    expect(fixture.nativeElement.querySelector('.vol--silencio')).not.toBeNull();
    expect(slider().getAttribute('aria-valuetext')).toContain('Silenciado');
    expect(slider().getAttribute('aria-valuenow')).toBe('6');
    button.click();
    expect(mutes).toBe(1);
  });

  it('con movimiento reducido la barra queda quieta', () => {
    fixture.componentRef.setInput('reduceMotion', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.vol--quieto')).not.toBeNull();
  });
});
