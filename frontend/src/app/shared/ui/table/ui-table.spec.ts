import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiDataStateValue } from '../state/ui-data-state';
import { UiErrorState } from '../state/ui-error-state';
import { UiCelda, UiCeldaAcciones, UiCeldaPrincipal } from './ui-table-celda';
import { UiTable, UiTableEmpty, UiTableError, UiTableRow, UiTableTable, marcarTablaApilable } from './ui-table';

/**
 * ui-table (plan visual F2-8): marco de tabla nativa con densidad, cabecera pegajosa, fila con hover (puntero fino)
 * y selección (aria-selected), carga, vacío y error DENTRO del marco (uno solo a la vez, uiDataState) e indicio de
 * desplazamiento horizontal solo cuando hay desborde (y entonces la región se puede enfocar para desplazarla con
 * el teclado, WCAG 2.1.1).
 */
// req: RNF-004 (tablas con nombre, desplazables con teclado)
@Component({
  imports: [UiTable, UiTableTable, UiTableRow, UiTableEmpty, UiTableError],
  template: `
    <ui-table label="Intentos del grupo" [density]="density()" [state]="state()">
      <table ui-table>
        <thead><tr><th scope="col">Estudiante</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          <tr uiRow [selected]="selected() === 1"><td>Ana</td><td>Completado</td></tr>
          <tr uiRow [selected]="selected() === 2"><td>Luis</td><td>En curso</td></tr>
        </tbody>
      </table>
      <p uiTableEmpty>Aún no hay intentos.</p>
      <p uiTableError>No se pudieron cargar los intentos.</p>
    </ui-table>
  `,
})
class Host {
  density = signal<'comfortable' | 'compact'>('comfortable');
  state = signal<UiDataStateValue>('ready');
  selected = signal<number | null>(null);
}

describe('ui-table', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const root = () => (fixture.nativeElement as HTMLElement).querySelector('ui-table') as HTMLElement;
  const region = () => root().querySelector<HTMLElement>('.ui-table__scroll')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('la región desplazable se nombra con el label y la tabla queda dentro', () => {
    expect(region().getAttribute('role')).toBe('region');
    expect(region().getAttribute('aria-label')).toBe('Intentos del grupo');
    expect(region().querySelector('table.ui-table__table')).not.toBeNull();
  });

  it('la densidad es una clase del marco', async () => {
    expect(root().classList).toContain('ui-table--comfortable');
    host.density.set('compact');
    await fixture.whenStable();
    expect(root().classList).toContain('ui-table--compact');
  });

  it('la fila seleccionada lleva aria-selected', async () => {
    host.selected.set(2);
    await fixture.whenStable();
    const rows = [...root().querySelectorAll<HTMLElement>('tr[uiRow]')];
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual([null, 'true']);
    expect(rows[1].classList).toContain('ui-table__row--selected');
  });

  it('carga, vacío y error se muestran dentro del marco y de a uno; la tabla se oculta mientras', async () => {
    const visible = () => ({
      table: !region().querySelector('table')!.closest('[hidden]'),
      skeleton: !!root().querySelector('ui-skeleton'),
      empty: !root().querySelector('[uiTableEmpty]')!.closest('[hidden]'),
      error: !root().querySelector('[uiTableError]')!.closest('[hidden]'),
    });
    expect(visible()).toEqual({ table: true, skeleton: false, empty: false, error: false });

    host.state.set('pending');
    await fixture.whenStable();
    expect(visible()).toEqual({ table: true, skeleton: false, empty: false, error: false });
    expect(region().getAttribute('aria-busy')).toBe('true');

    host.state.set('loading');
    await fixture.whenStable();
    expect(visible()).toEqual({ table: false, skeleton: true, empty: false, error: false });
    expect(region().getAttribute('aria-busy')).toBe('true');

    host.state.set('empty');
    await fixture.whenStable();
    expect(visible()).toEqual({ table: false, skeleton: false, empty: true, error: false });
    expect(region().hasAttribute('aria-busy')).toBe(false);

    host.state.set('error');
    await fixture.whenStable();
    expect(visible()).toEqual({ table: false, skeleton: false, empty: false, error: true });
  });

  it('sin desborde no hay indicio ni parada de tabulación; con desborde, sí, y sigue al desplazamiento', async () => {
    const scroller = region();
    expect(scroller.hasAttribute('tabindex')).toBe(false);
    expect(root().classList).not.toContain('ui-table--overflow-end');

    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 400 });
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(scroller.getAttribute('tabindex')).toBe('0');
    expect(root().classList).toContain('ui-table--overflow-end');
    expect(root().classList).not.toContain('ui-table--overflow-start');

    scroller.scrollLeft = 600;
    scroller.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(root().classList).toContain('ui-table--overflow-start');
    expect(root().classList).not.toContain('ui-table--overflow-end');
  });
});

// Revisión de F2 (I2): en la tabla el error no se desmonta (se oculta); tras un reintento fallido el foco va a su título.
@Component({
  imports: [UiTable, UiTableTable, UiTableError, UiErrorState],
  template: `
    <ui-table label="Intentos" [state]="state()">
      <table ui-table><tbody><tr><td>Ana</td></tr></tbody></table>
      <ui-error-state uiTableError kind="network" (retry)="state.set('loading')" />
    </ui-table>
  `,
})
class RetryHost {
  state = signal<UiDataStateValue>('error');
}

describe('ui-table: foco tras un reintento fallido', () => {
  it('vuelve al título del error cuando el reintento falla', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RetryHost);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const retry = root.querySelector<HTMLButtonElement>('ui-error-state button')!;
    retry.focus();
    retry.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.state()).toBe('loading');
    fixture.componentInstance.state.set('error');
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('.ui-error-state__title'));
    root.remove();
  });
});

/**
 * ui-table apilar (DISENO C3, DP-20): en un contenedor estrecho cada fila pasa a ser una tarjeta. El CSS lo decide por
 * consulta de contenedor (el ancho real se mira en la captura a 320 px de la galería); aquí se prueba lo que lo hace
 * posible y accesible: la clase, los roles explícitos (con `display: block` algunos navegadores pierden la semántica de
 * tabla) y el rótulo de cada celda, propio o tomado de su columna, también en las filas que llegan después.
 */
// req: RNF-004 (WCAG 1.4.10, reflujo: nada se desborda a 320 px), P7
@Component({
  imports: [UiTable, UiTableTable, UiTableRow, UiCelda, UiCeldaPrincipal, UiCeldaAcciones],
  template: `
    <ui-table label="Intentos del grupo" [apilar]="apilar()">
      <table ui-table>
        <thead><tr><th scope="col">Estudiante</th><th scope="col">Estado</th><th scope="col" colspan="2">Caso y escena</th><th scope="col"><span class="ds-sr-only">Acciones</span></th></tr></thead>
        <tbody>
          @for (fila of filas(); track fila) {
            <tr uiRow>
              <td uiCeldaPrincipal>{{ fila }}</td>
              <td uiCelda="Situación">En curso</td>
              <td>Crisis en urgencias</td>
              <td>Escena 2</td>
              <td uiCeldaAcciones><button type="button">Revisar</button></td>
            </tr>
          }
        </tbody>
      </table>
    </ui-table>
  `,
})
class ApilarHost {
  readonly apilar = signal(true);
  readonly filas = signal(['Ana', 'Luis']);
}

describe('ui-table apilar', () => {
  let fixture: ComponentFixture<ApilarHost>;
  const tabla = () => (fixture.nativeElement as HTMLElement).querySelector('table')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ApilarHost);
    await fixture.whenStable();
  });

  it('marca el marco para el apilado por consulta de contenedor', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('ui-table')!.classList).toContain('ui-table--apilar');
  });

  it('pone roles explícitos de tabla en la tabla, los grupos, las filas y las celdas', () => {
    expect(tabla().getAttribute('role')).toBe('table');
    expect([...tabla().querySelectorAll('thead, tbody')].map(el => el.getAttribute('role'))).toEqual(['rowgroup', 'rowgroup']);
    expect([...tabla().querySelectorAll('tr')].every(fila => fila.getAttribute('role') === 'row')).toBe(true);
    expect([...tabla().querySelectorAll('thead th')].every(th => th.getAttribute('role') === 'columnheader')).toBe(true);
    expect([...tabla().querySelectorAll('tbody td')].every(td => td.getAttribute('role') === 'cell')).toBe(true);
  });

  it('cada celda lleva su rótulo: el propio de [uiCelda] o el de su columna (respetando colspan)', () => {
    const primera = [...tabla().querySelectorAll('tbody tr')[0].querySelectorAll('td')];
    expect(primera.map(td => td.getAttribute('data-etiqueta'))).toEqual(['Estudiante', 'Situación', 'Caso y escena', 'Caso y escena', 'Acciones']);
    expect(primera[0].getAttribute('data-celda')).toBe('principal');
    expect(primera[4].getAttribute('data-celda')).toBe('acciones');
  });

  it('las filas que llegan después también se marcan', async () => {
    fixture.componentInstance.filas.set(['Ana', 'Luis', 'Sara']);
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
    const nueva = tabla().querySelectorAll('tbody tr')[2];
    expect(nueva.getAttribute('role')).toBe('row');
    expect(nueva.querySelector('td')?.getAttribute('data-etiqueta')).toBe('Estudiante');
  });

  it('sin apilar no quedan roles ni rótulos puestos por el apilado (los de [uiCelda] se conservan)', async () => {
    fixture.componentInstance.apilar.set(false);
    await fixture.whenStable();
    expect(tabla().hasAttribute('role')).toBe(false);
    expect(tabla().querySelector('tbody tr')!.hasAttribute('role')).toBe(false);
    const celdas = [...tabla().querySelectorAll('tbody tr')[0].querySelectorAll('td')];
    expect(celdas.map(td => td.getAttribute('data-etiqueta'))).toEqual([null, 'Situación', null, null, null]);
  });

  it('marcarTablaApilable toma la fila de encabezados de filas como rowheader', () => {
    const t = document.createElement('table');
    t.innerHTML = '<thead><tr><th>Escena</th><th>Decisión</th></tr></thead><tbody><tr><th scope="row">1</th><td>Escuchar</td></tr></tbody>';
    marcarTablaApilable(t, true);
    expect(t.querySelector('tbody th')?.getAttribute('role')).toBe('rowheader');
    expect(t.querySelector('tbody td')?.getAttribute('data-etiqueta')).toBe('Decisión');
  });
});
