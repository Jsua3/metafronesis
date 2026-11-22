import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiArchivo, archivoAceptado, tamanoLegible } from './ui-archivo';

/**
 * ui-archivo (DISENO C11): el control es un `input type="file"` nativo con nombre (la etiqueta) y descripción (formato,
 * archivo elegido, ayuda o error). Elegir y soltar emiten el archivo; soltar uno de otro formato no se acepta y se dice
 * por qué; «Quitar» emite null y devuelve el foco al control.
 */
// req: RNF-004 (WCAG 2.5.7: arrastrar es opcional, elegir siempre funciona)
@Component({
  imports: [UiArchivo],
  template: `<ui-archivo etiqueta="Lista de estudiantes" acepta=".xlsx" [ayuda]="ayuda()" [error]="error()"
    (archivo)="recibidos.push($event)" />`,
})
class Host {
  readonly ayuda = signal<string | null>('Una fila por estudiante: nombre, apellido y correo.');
  readonly error = signal<string | null>(null);
  readonly recibidos: (File | null)[] = [];
}

describe('ui-archivo', () => {
  let fixture: ComponentFixture<Host>;
  const root = () => fixture.nativeElement as HTMLElement;
  const entrada = () => root().querySelector<HTMLInputElement>('input[type="file"]')!;
  const xlsx = () => new File(['x'.repeat(12_400)], 'estudiantes 2026-1.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const soltar = async (archivo: File) => {
    const zona = root().querySelector('.ui-archivo__zona')!;
    const evento = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(evento, 'dataTransfer', { value: { files: [archivo], types: ['Files'] } });
    zona.dispatchEvent(evento);
    await fixture.whenStable();
    return evento;
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('es un control nativo de archivo, nombrado por la etiqueta y descrito por el formato y la ayuda', () => {
    expect(entrada().getAttribute('accept')).toBe('.xlsx');
    expect(document.getElementById(entrada().getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('Lista de estudiantes');
    const descripcion = entrada().getAttribute('aria-describedby')!.split(' ').map(id => document.getElementById(id)?.textContent?.trim());
    expect(descripcion).toEqual(['Formato .xlsx', 'Una fila por estudiante: nombre, apellido y correo.']);
    // El icono del kit es decorativo.
    expect(root().querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('elegir con el diálogo emite el archivo y lo muestra con su nombre, su tamaño y «Quitar»', async () => {
    Object.defineProperty(entrada(), 'files', { value: [xlsx()], configurable: true });
    entrada().dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.recibidos.map(archivo => archivo?.name)).toEqual(['estudiantes 2026-1.xlsx']);
    expect(root().querySelector('.ui-archivo__nombre')?.textContent?.trim()).toBe('estudiantes 2026-1.xlsx');
    expect(root().querySelector('.ui-archivo__tamano')?.textContent?.trim()).toBe('12,4 kB');
    expect(entrada().getAttribute('aria-describedby')).toContain(root().querySelector('.ui-archivo__elegido')!.id);
  });

  it('soltar un archivo del formato pedido lo emite; uno de otro formato se rechaza con el motivo en texto', async () => {
    const aceptado = await soltar(xlsx());
    expect(aceptado.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.recibidos).toHaveLength(1);

    await soltar(new File(['a'], 'foto.png', { type: 'image/png' }));
    const error = root().querySelector('.ui-archivo__mensaje--error');
    expect(error?.textContent?.trim()).toBe('Ese archivo no es del formato pedido. Formato .xlsx.');
    expect(entrada().getAttribute('aria-invalid')).toBe('true');
  });

  // válido → inválido no puede dejar viva la lista anterior, que se importaría en silencio.
  it('soltar uno inválido después de uno válido suelta también el anterior y emite null', async () => {
    await soltar(xlsx());
    await soltar(new File(['a'], 'foto.png', { type: 'image/png' }));
    expect(fixture.componentInstance.recibidos.map(archivo => archivo?.name ?? null)).toEqual(['estudiantes 2026-1.xlsx', null]);
    expect(root().querySelector('.ui-archivo__elegido')).toBeNull();
    expect(root().querySelector('.ui-archivo__mensaje--error')).not.toBeNull();
  });

  // tras soltar, el control nativo queda vacío; así elegir otra vez el mismo archivo con el diálogo
  // dispara `change` y reemplaza al soltado.
  it('soltar un archivo vacía el control nativo para que volver a elegir con el diálogo cuente', async () => {
    // Un `input type="file"` solo admite que se le escriba '': se espía el setter para ver que la zona lo vació.
    const vaciar = vi.spyOn(HTMLInputElement.prototype, 'value', 'set');
    try {
      await soltar(xlsx());
      expect(vaciar.mock.contexts.some(contexto => contexto === entrada())).toBe(true);
      expect(vaciar).toHaveBeenCalledWith('');
    } finally {
      vaciar.mockRestore();
    }
  });

  it('«Quitar» emite null, limpia el control y devuelve el foco al control', async () => {
    await soltar(xlsx());
    root().querySelector<HTMLButtonElement>('.ui-archivo__quitar')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.recibidos.at(-1)).toBeNull();
    expect(root().querySelector('.ui-archivo__elegido')).toBeNull();
    expect(document.activeElement).toBe(entrada());
  });

  it('el error de quien lo usa (el servidor) se muestra en lugar de la ayuda', async () => {
    fixture.componentInstance.error.set('El archivo no tiene la columna «correo».');
    await fixture.whenStable();
    expect(root().querySelector('.ui-archivo__mensaje--error')?.textContent?.trim()).toBe('El archivo no tiene la columna «correo».');
    expect(root().querySelectorAll('.ui-archivo__mensaje')).toHaveLength(1);
  });

  it('archivoAceptado lee la lista como el atributo accept; tamanoLegible dice B, kB o MB', () => {
    expect(archivoAceptado({ name: 'A.XLSX', type: '' }, '.xlsx')).toBe(true);
    expect(archivoAceptado({ name: 'a.csv', type: 'text/csv' }, '.xlsx, text/csv')).toBe(true);
    expect(archivoAceptado({ name: 'a.png', type: 'image/png' }, 'image/*')).toBe(true);
    expect(archivoAceptado({ name: 'a.pdf', type: 'application/pdf' }, '.xlsx')).toBe(false);
    expect(archivoAceptado({ name: 'a.pdf', type: 'application/pdf' }, '')).toBe(true);
    expect(tamanoLegible(900)).toBe('900 B');
    expect(tamanoLegible(1_250_000)).toBe('1,3 MB');
  });
});
