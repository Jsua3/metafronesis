import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiBarras, UiBarrasDato, filasDeBarras, textoCantidad } from './ui-barras';

/**
 * ui-barras (DISENO C10): la lectura en palabras va en la página (no en un alt); con `total` cada cantidad se escribe con
 * su denominador («3 de 9», nunca un porcentaje suelto); el color nunca va solo (patrón por tono) y los datos están en
 * una tabla para lectores de pantalla, con el dibujo oculto para ellos (no se leen dos veces).
 */
// req: RNF-004 (WCAG 1.4.1: el color no es el único medio), idea de Kimi-c (denominador en los gráficos)
@Component({
  imports: [UiBarras],
  template: `<ui-barras [datos]="datos()" [descripcion]="descripcion" [total]="total()" [modo]="modo()" etiquetaColumna="Estado" />`,
})
class Host {
  readonly descripcion = 'De 9 estudiantes, 3 terminaron el caso, 4 lo tienen en curso y 2 no lo han empezado.';
  readonly datos = signal<UiBarrasDato[]>([
    { etiqueta: 'Terminaron', valor: 3, tono: 'success' },
    { etiqueta: 'En curso', valor: 4, tono: 'info' },
    { etiqueta: 'Sin empezar', valor: 2 },
  ]);
  readonly total = signal<number | null>(9);
  readonly modo = signal<'lista' | 'apilada'>('lista');
}

describe('ui-barras', () => {
  let fixture: ComponentFixture<Host>;
  const root = () => fixture.nativeElement as HTMLElement;
  const textos = (selector: string) => [...root().querySelectorAll(selector)].map(el => el.textContent?.trim());

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('la lectura en palabras va en un párrafo visible, encima del gráfico', () => {
    const descripcion = root().querySelector('ui-barras > p.ui-barras__descripcion');
    expect(descripcion?.textContent?.trim()).toBe(fixture.componentInstance.descripcion);
    expect(root().querySelector('ui-barras')!.firstElementChild).toBe(descripcion);
  });

  it('con total escribe el denominador en cada cantidad («3 de 9»), nunca un porcentaje', () => {
    expect(textos('.ui-barras__fila .ui-barras__valor')).toEqual(['3 de 9', '4 de 9', '2 de 9']);
    expect(root().textContent).not.toContain('%');
  });

  it('sin total escribe la cantidad sola', async () => {
    fixture.componentInstance.total.set(null);
    await fixture.whenStable();
    expect(textos('.ui-barras__fila .ui-barras__valor')).toEqual(['3', '4', '2']);
  });

  it('el dibujo está oculto para el lector y los datos van en una tabla con su leyenda', () => {
    expect(root().querySelector('.ui-barras__lista')?.getAttribute('aria-hidden')).toBe('true');
    const tabla = root().querySelector('.ds-sr-only > table')!;
    expect(tabla.querySelector('caption')?.textContent?.trim()).toBe(fixture.componentInstance.descripcion);
    expect([...tabla.querySelectorAll('tbody tr')].map(fila => [...fila.children].map(celda => celda.textContent?.trim())))
      .toEqual([['Terminaron', '3 de 9'], ['En curso', '4 de 9'], ['Sin empezar', '2 de 9']]);
    expect(tabla.querySelector('thead th')?.textContent?.trim()).toBe('Estado');
  });

  it('cada tono lleva su patrón: el color nunca va solo', () => {
    const barras = [...root().querySelectorAll('.ui-barras__fila .ui-barras__barra')];
    expect(barras[0].classList).toContain('ui-barras__tinta--success');
    expect(barras[1].classList).toContain('ui-barras__tinta--rayas');
    expect(barras[2].classList).toContain('ui-barras__tinta--neutral');
    // Las clases fijas del elemento se conservan junto a las de tono.
    expect(barras.every(barra => barra.classList.contains('ui-barras__barra'))).toBe(true);
  });

  it('apilada: una barra partida con su leyenda en texto, también con denominador', async () => {
    fixture.componentInstance.modo.set('apilada');
    await fixture.whenStable();
    expect(root().querySelectorAll('.ui-barras__apilada .ui-barras__barra')).toHaveLength(3);
    expect(textos('.ui-barras__clave .ui-barras__valor')).toEqual(['3 de 9', '4 de 9', '2 de 9']);
  });

  it('las proporciones se acotan: negativos y no numéricos valen 0 y nada pasa del 100 %', () => {
    const filas = filasDeBarras([
      { etiqueta: 'a', valor: 12 }, { etiqueta: 'b', valor: -3 }, { etiqueta: 'c', valor: Number.NaN },
    ], 'lista', 10);
    expect(filas.map(fila => fila.ratio)).toEqual([1, 0, 0]);
    expect(filasDeBarras([{ etiqueta: 'a', valor: 2 }, { etiqueta: 'b', valor: 6 }], 'apilada', null).map(f => f.ratio)).toEqual([0.25, 0.75]);
    expect(textoCantidad(1234, 3000)).toBe('1.234 de 3.000');
  });
});
