import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { leerTutor } from './lectura';
import type { TutorLeido } from './lectura';
import { TutorCasoComponent, ladoDelRetrato } from './tutor-caso.component';

const TUTOR = leerTutor({
  tutor: {
    nombre: 'Profesor',
    rol: 'Tutor del caso',
    recipeId: 'supervisor-clinico',
    lineas: ['Hola, {nombre}. Lo que viste pasa.', 'Te dejo el paso a paso:', 'Entra.'],
    pasos: [{ numero: 1, titulo: 'Observa', detalle: 'antes de actuar.' }, { numero: 2, titulo: 'Contén' }],
  },
}) as TutorLeido;

describe('TutorCasoComponent', () => {
  let fixture: ComponentFixture<TutorCasoComponent>;
  let component: TutorCasoComponent;
  let anuncios: string[];
  let cerrado = 0;
  let salidas = 0;

  beforeEach(() => {
    anuncios = [];
    cerrado = 0;
    salidas = 0;
    TestBed.configureTestingModule({
      imports: [TutorCasoComponent],
      providers: [{ provide: LiveRegionAnnouncer, useValue: { announce: (t: string) => anuncios.push(t) } }],
    });
    fixture = TestBed.createComponent(TutorCasoComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('tutor', TUTOR);
    fixture.componentRef.setInput('nombre', 'Laura Gómez');
    component.cerrado.subscribe(() => cerrado++);
    component.salidaSegura.subscribe(() => salidas++);
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const boton = (texto: string) => Array.from(el().querySelectorAll('button')).find(b => b.textContent?.trim() === texto);

  it('es un diálogo con el retrato del kit, el nombre, el rol y la primera línea con el nombre de pila', () => {
    const dialogo = el().querySelector('[role="dialog"]');
    expect(dialogo?.getAttribute('aria-modal')).toBe('true');
    expect(el().querySelector('#tutor-nombre')?.textContent?.trim()).toBe('Profesor');
    expect(el().textContent).toContain('Tutor del caso');
    expect(el().querySelector('#tutor-linea')?.textContent).toBe('Hola, Laura. Lo que viste pasa.');
    const retrato = el().querySelector<HTMLImageElement>('img.tutor__retrato');
    expect(retrato?.getAttribute('src')).toBe('/assets/characters/kit/supervisor-clinico/portrait-neutral.png');
    expect(retrato?.getAttribute('alt')).toBe('');
    expect(dialogo?.getAttribute('aria-describedby')).toContain('tutor-rol');
    expect(anuncios[0]).toBe('Profesor. Tutor del caso. Línea 1 de 3. Hola, Laura. Lo que viste pasa.');
  });

  it('«Seguir» avanza; la lista de pasos va con la penúltima línea; la última dice «Continuar» y cierra', () => {
    expect(el().querySelector('.tutor__pasos')).toBeNull();
    boton('Seguir')!.click();
    fixture.detectChanges();
    expect(el().querySelector('#tutor-linea')?.textContent).toBe('Te dejo el paso a paso:');
    const pasos = Array.from(el().querySelectorAll('.tutor__paso')).map(p => p.textContent?.replace(/\s+/g, ' ').trim());
    expect(pasos).toEqual(['1 Observa antes de actuar.', '2 Contén']);
    expect(anuncios.at(-1)).toBe('Línea 2 de 3. Te dejo el paso a paso: 1. Observa antes de actuar. 2. Contén');
    boton('Seguir')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.tutor__pasos')).toBeNull();
    expect(boton('Continuar')).toBeTruthy();
    boton('Anterior')!.click();
    fixture.detectChanges();
    expect(component.indice()).toBe(1);
    boton('Seguir')!.click();
    fixture.detectChanges();
    boton('Continuar')!.click();
    expect(cerrado).toBe(1);
  });

  it('Enter y Espacio pasan la línea con el foco fuera de los botones; un clic en la tarjeta también', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(component.indice()).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(component.indice()).toBe(2);
    // Una pulsación mantenida no se come las líneas.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true }));
    expect(cerrado).toBe(0);
    (el().querySelector('.tutor__cuerpo') as HTMLElement).click();
    expect(cerrado).toBe(1);
  });

  it('devuelve el foco a Seguir cuando desaparece el botón Anterior', () => {
    boton('Seguir')!.click();
    fixture.detectChanges();
    const anterior = boton('Anterior')!;
    anterior.focus();
    expect(document.activeElement).toBe(anterior);
    anterior.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(boton('Seguir'));
  });

  it('la región de lectura se alcanza con Tab y Espacio permite recorrerla', () => {
    const region = el().querySelector<HTMLElement>('[aria-label="Texto del tutor"]')!;
    expect(region?.tabIndex).toBe(0);
    Object.defineProperty(region, 'scrollHeight', { value: 500 });
    Object.defineProperty(region, 'clientHeight', { value: 100 });
    const espacio = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    region.dispatchEvent(espacio);
    expect(espacio.defaultPrevented).toBe(false);
    expect(component.indice()).toBe(0);
  });

  it('la preferencia del juego y la del sistema eliminan todas las traslaciones', () => {
    fixture.componentRef.setInput('reduceMotion', true);
    boton('Seguir')!.click();
    fixture.detectChanges();
    const tarjeta = el().querySelector<HTMLElement>('.tutor__tarjeta')!;
    const paso = el().querySelector<HTMLElement>('.tutor__paso')!;
    expect(getComputedStyle(tarjeta).animationName).toMatch(/(?:^|_)tutor-funde$/);
    expect(getComputedStyle(paso).animation).toBe('none');
    expect(paso.style.animationDelay).toBe('0ms');

    const medios = Array.from(document.styleSheets).flatMap(s => Array.from(s.cssRules))
      .filter((r): r is CSSMediaRule => r.type === CSSRule.MEDIA_RULE && r.cssText.includes('tutor__tarjeta'));
    const reducido = medios.find(r => r.conditionText.includes('prefers-reduced-motion: reduce'));
    expect(reducido?.cssText).toMatch(/tutor__tarjeta[^{}]*\{[^{}]*animation-name:\s*[\w-]*tutor-funde/);
    expect(reducido?.cssText).toMatch(/tutor__paso[^{}]*\{[^{}]*animation:\s*none/);
  });

  it('la salida segura está en la tarjeta', () => {
    const salida = el().querySelector<HTMLButtonElement>('.tutor__tarjeta app-safe-exit-button button');
    expect(salida?.querySelector('.safe-exit-btn__label')?.textContent?.trim()).toBe('Salida segura');
    salida!.click();
    expect(salidas).toBe(1);
    expect(component.indice()).toBe(0);
  });

  it('el retrato mide un número entero de píxeles físicos por píxel del arte', () => {
    expect(ladoDelRetrato(1, false)).toBe(96);
    expect(ladoDelRetrato(2, false)).toBe(96);
    expect(ladoDelRetrato(1.25, false) * 1.25).toBe(128);
    expect(ladoDelRetrato(1, true)).toBe(64);
  });

  it('sin receta válida no pinta retrato', () => {
    fixture.componentRef.setInput('tutor', { ...TUTOR, recipeId: null });
    fixture.detectChanges();
    expect(el().querySelector('img')).toBeNull();
  });
});
