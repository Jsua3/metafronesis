import { ComponentFixture, TestBed } from '@angular/core/testing';

import { contrastRatio } from '../../../../styles/contrast.util';
import { AvisoDePuertaComponent } from './aviso-de-puerta.component';

/** Nombre accesible aproximado: el texto del botón sin lo que está oculto a las tecnologías de apoyo. */
function nombreAccesible(boton: HTMLElement): string {
  const recorrer = (nodo: Node): string => {
    if (nodo.nodeType === Node.TEXT_NODE) return nodo.textContent ?? '';
    if (!(nodo instanceof Element) || nodo.getAttribute('aria-hidden') === 'true') return '';
    return Array.from(nodo.childNodes).map(recorrer).join('');
  };
  return recorrer(boton).replace(/\s+/g, ' ').trim();
}

describe('AvisoDePuertaComponent', () => {
  let fixture: ComponentFixture<AvisoDePuertaComponent>;
  const boton = () => fixture.nativeElement.querySelector('button.aviso') as HTMLButtonElement;
  const poner = (valores: Record<string, unknown>) => {
    for (const [nombre, valor] of Object.entries(valores)) fixture.componentRef.setInput(nombre, valor);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AvisoDePuertaComponent] });
    fixture = TestBed.createComponent(AvisoDePuertaComponent);
    poner({ texto: 'Pasar a la sala de espera' });
  });

  it('es un botón con la tecla E, el separador y el destino; el lector de pantalla oye solo el destino', () => {
    expect(boton().type).toBe('button');
    // Lo que se ve, en orden; la separación entre las partes la pone el `gap` de la hoja de estilos.
    expect(Array.from(boton().children).map(parte => parte.textContent!.trim())).toEqual(['E', '·', 'Pasar a la sala de espera']);
    expect(nombreAccesible(boton())).toBe('Pasar a la sala de espera');
    expect(boton().getAttribute('aria-disabled')).toBeNull();
  });

  it('sin teclado (pantalla táctil o atajos apagados) no promete la tecla E', () => {
    poner({ conTecla: false });
    expect(boton().querySelector('kbd')).toBeNull();
    expect(boton().textContent!.replace(/\s+/g, ' ').trim()).toBe('Pasar a la sala de espera');
  });

  it('cerrada con llave muestra un candado y lo que falta, y lo dice al lector de pantalla', () => {
    poner({ bloqueada: true, falta: 'Antes, habla con la enfermera.' });
    expect(boton().querySelector('svg.aviso__candado')).not.toBeNull();
    expect(boton().getAttribute('aria-disabled')).toBe('true');
    expect(nombreAccesible(boton())).toBe('Pasar a la sala de espera: cerrada. Antes, habla con la enfermera.');
    poner({ falta: null });
    expect(nombreAccesible(boton())).toBe('Pasar a la sala de espera: cerrada. Todavía no se puede pasar.');
  });

  it('pulsarlo pide cruzar, también si está cerrada (la escena sacude la puerta)', () => {
    const pedidos: number[] = [];
    fixture.componentInstance.cruzar.subscribe(() => pedidos.push(1));
    boton().click();
    poner({ bloqueada: true });
    boton().click();
    expect(pedidos.length).toBe(2);
  });

  it('se coloca con la cola en el punto que le dan', () => {
    poner({ x: 412, y: 188 });
    const cola = fixture.nativeElement.querySelector('.aviso__cola') as HTMLElement;
    expect([boton().style.left, boton().style.top]).toEqual(['412px', '188px']);
    expect([cola.style.left, cola.style.top]).toEqual(['412px', '188px']);
  });

  // Bloque U1: el cartel pasó a la placa del cuadro de diálogo (tintas de tokens/_pixel.scss): texto y detalle sobre la
  // penumbra de la placa, y la letra de la tecla sobre su relleno.
  it('el texto se lee: contraste de al menos 4,5 a 1 en todo lo que dice', () => {
    expect(contrastRatio('#f2ecdf', '#1b1826')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#c3bccf', '#1b1826')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#f2ecdf', '#3a3454')).toBeGreaterThanOrEqual(4.5);
  });

  it('es la placa-botón de la hoja común con la tecla de las fichas y una cola de pixel', () => {
    expect(boton().classList).toContain('u-boton');
    expect(boton().querySelector('kbd')!.classList).toContain('u-tecla');
    expect(fixture.nativeElement.querySelector('.aviso__cola app-pixel-icono')).not.toBeNull();
  });
});
