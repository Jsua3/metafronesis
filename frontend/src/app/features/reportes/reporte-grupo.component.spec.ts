import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { Grupo, GrupoService } from '../../core/api/grupo.service';
import { ReporteService } from '../../core/api/reporte.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { ReporteGrupo, ReporteSimulacionGrupo } from '../../core/models/reporte.model';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { ReporteGrupoComponent } from './reporte-grupo.component';

/**
 * Pantalla Reportes en el sistema de la biblioteca (plan visual F7-3): «Selecciona un grupo» (aún no hay consulta) no
 * se confunde con «Sin intentos en este corte» (la consulta no encontró nada), el reporte sale al elegir el grupo
 * (RQ-NEG-006: dos clics desde Grupos, tres desde el panel), la tabla indica que se desplaza y el vacío nunca se pinta
 * como un éxito verde.
 */
const grupoA: Grupo = { id: 1, nombre: 'Cohorte A', codigo: 'COH-A', totalEstudiantes: 24 };
const grupoB: Grupo = { id: 2, nombre: 'Cohorte B', codigo: 'COH-B', totalEstudiantes: 18 };
const caso = { caseVersionId: 12, code: 'CASO-12', title: 'Caso doce', semanticVersion: '1.0.0' } as SimulationCaseSummary;

function simulation(partial: Partial<ReporteSimulacionGrupo> = {}): ReporteSimulacionGrupo {
  return {
    totalIntentos: 10, intentosCompletados: 6, intentosEnProgreso: 3, intentosSalidaSegura: 1,
    hitos: [
      { key: 'escucha', label: 'Escuchar sin interrumpir', decisive: false, cobertura: 'MAYORIA' },
      { key: 'proteccion', label: 'Recomendar medidas de protección', decisive: true, cobertura: 'MENOS_DE_LA_MITAD' },
      { key: 'remision', label: 'Remitir a la ruta institucional', decisive: true, cobertura: null },
    ],
    bitacorasRegistradas: 9, rubricasAplicadas: 4,
    estudiantes: [
      {
        id: 11, nombre: 'Marta Ríos', totalIntentos: 2, intentosCompletados: 2, intentosEnProgreso: 0, intentosSalidaSegura: 0,
        hitosCumplidos: ['escucha', 'proteccion', 'hito_de_otra_version'], clases: { recommended: 12, acceptable: 2, risky: 1, contraindicated: 0 },
        bitacorasRegistradas: 2, rubricasAplicadas: 1, estado: 'COMPLETED',
      },
      {
        id: 12, nombre: 'Luis Gómez', totalIntentos: 1, intentosCompletados: 0, intentosEnProgreso: 1, intentosSalidaSegura: 0,
        hitosCumplidos: null, clases: { recommended: 3, acceptable: 0, risky: 0, contraindicated: 0 },
        bitacorasRegistradas: 0, rubricasAplicadas: 0, estado: 'PAUSED',
      },
    ],
    ...partial,
  };
}

const report = (grupoId: number, sim: ReporteSimulacionGrupo | null = simulation(), caseVersionId: number | null = null): ReporteGrupo =>
  ({ grupoId, caseVersionId, simulacion: sim });

interface Api {
  grupos: () => Observable<Grupo[]>;
  casos: () => Observable<SimulationCaseSummary[]>;
  reporte: (grupoId: number, caseVersionId?: number | null) => Observable<ReporteGrupo>;
}

describe('pantalla Reportes (F7-3)', () => {
  let fixture: ComponentFixture<ReporteGrupoComponent>;
  let reporteService: { getReporteGrupo: ReturnType<typeof vi.fn>; exportarCsv: ReturnType<typeof vi.fn> };
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const select = (label: string) => [...host().querySelectorAll('ui-field')]
    .find(field => text(field.querySelector('label')).startsWith(label))!.querySelector('select') as HTMLSelectElement;
  const choose = (control: HTMLSelectElement, label: string) => {
    const option = [...control.options].find(item => text(item) === label)!;
    control.value = option.value;
    control.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const stat = (label: string) => [...host().querySelectorAll('ui-stat')]
    .find(el => text(el.querySelector('.ui-stat__label')) === label);
  const status = () => text(host().querySelector('[role="status"].ds-sr-only'));
  /** Un botón por su rótulo (sin la ligadura de su icono, que es decorativa). */
  const buttonLabelled = (label: string) => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')) === label);

  async function render(api: Partial<Api> = {}, { query = {}, stable = true } = {}) {
    reporteService = {
      getReporteGrupo: vi.fn(api.reporte ?? ((grupoId: number) => of(report(grupoId)))),
      exportarCsv: vi.fn(() => of(new Blob(['a,b']))),
    };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      imports: [ReporteGrupoComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: ReporteService, useValue: reporteService },
        { provide: GrupoService, useValue: { listar: vi.fn(api.grupos ?? (() => of([grupoA, grupoB]))) } },
        { provide: CaseCatalogApi, useValue: { listPublished: vi.fn(api.casos ?? (() => of([caso]))) } },
        { provide: NotificationService, useValue: notify },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    fixture = TestBed.createComponent(ReporteGrupoComponent);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // req: RNF-04, BLOQUE-H
  describe('estados', () => {
    it('distingue la carga y el error de casos y permite reintentar sin recargar grupos', async () => {
      const pending = new Subject<SimulationCaseSummary[]>();
      let calls = 0;
      await render({ casos: () => ++calls === 1 ? pending : of([]) }, { stable: false });
      expect(text(host())).toContain('Cargando casos');
      pending.error(new Error('falló'));
      fixture.detectChanges();
      expect(text(host())).toContain('No fue posible cargar los casos');
      const error = host().querySelector('[data-error-casos]')!;
      (error.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(text(host())).toContain('Aún no hay casos publicados');
    });
    it('un solo h1 y la región de estado siempre presente', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Reportes por grupo');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
    });

    it('al abrir: «Selecciona un grupo», sin cifras y sin decir «Sin intentos» (aún no se consultó nada)', async () => {
      await render();
      const empty = host().querySelector('ui-vacio-ilustrado')!;
      expect(text(empty)).toContain('Selecciona un grupo');
      expect(text(host())).not.toContain('Sin intentos en este corte');
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      expect(reporteService.getReporteGrupo).not.toHaveBeenCalled();
      expect(buttonLabelled('Generar reporte')).toBeUndefined();
    });

    it('sin caso elegido pide elegir uno (el servidor no consolida el grupo), no dice que nadie empezó, y sin tono de éxito', async () => {
      await render({ reporte: grupoId => of(report(grupoId, null)) });
      choose(select('Grupo'), 'Cohorte A · COH-A');
      await fixture.whenStable();
      fixture.detectChanges();

      const empty = host().querySelector('ui-vacio-ilustrado')!;
      expect(text(empty)).toContain('Elige un caso');
      expect(text(empty)).not.toContain('Sin intentos en este corte');
      expect(text(empty)).not.toContain('Selecciona un grupo');
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      // El vacío no es un éxito: ni icono de «check», ni mensaje verde, ni aviso de éxito.
      expect(host().innerHTML).not.toContain('check_circle');
      expect(host().querySelector('.state-message')).toBeNull();
      expect(notify.success).not.toHaveBeenCalled();
    });

    it('un caso elegido sin intentos dice «Sin intentos» con el título del caso y propone otro caso', async () => {
      await render({ reporte: (grupoId, caseVersionId) => of(report(grupoId, simulation({ totalIntentos: 0, estudiantes: [] }), caseVersionId ?? null)) });
      choose(select('Grupo'), 'Cohorte A · COH-A');
      choose(select('Caso'), 'Caso doce · v1.0.0');
      await fixture.whenStable();
      fixture.detectChanges();

      const empty = host().querySelector('ui-vacio-ilustrado')!;
      expect(text(empty)).toContain('Sin intentos en este corte');
      expect(text(empty)).toContain('«Caso doce»');
      expect(text(empty)).toContain('Prueba con otro caso');
      expect(reporteService.getReporteGrupo).toHaveBeenLastCalledWith(1, 12);
    });

    it('sin un caso elegido, el vacío no ofrece quitar un filtro que no hay', async () => {
      await render({ reporte: grupoId => of(report(grupoId, null)) });
      choose(select('Grupo'), 'Cohorte A · COH-A');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host().querySelector('ui-vacio-ilustrado button')).toBeNull();
    });

    it('si la consulta falla: UN error con «Reintentar» que la repite, y ninguna cifra', async () => {
      let calls = 0;
      await render({ reporte: grupoId => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of(report(grupoId))) });
      choose(select('Grupo'), 'Cohorte A · COH-A');
      await fixture.whenStable();
      fixture.detectChanges();

      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      expect(text(errors[0])).toContain('No pudimos generar el reporte.');
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      expect(host().querySelector('ui-vacio-ilustrado')).toBeNull();

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(host().querySelectorAll('ui-stat').length).toBeGreaterThan(0);
    });

    it('mientras genera: esqueleto con aria-busy, el estado leído y ninguna cifra', async () => {
      vi.useFakeTimers();
      const pending = new Subject<ReporteGrupo>();
      await render({ reporte: () => pending }, { stable: false });
      choose(select('Grupo'), 'Cohorte A · COH-A');
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
      expect(host().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
      expect(status()).toBe('Generando el reporte…');

      pending.next(report(1));
      pending.complete();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(host().querySelectorAll('ui-skeleton')).toHaveLength(0);
      expect(stat('Intentos')).toBeDefined();
      expect(status()).toBe('');
    });
  });

  // req: RNF-04, BLOQUE-H, RQ-NEG-006
  describe('consulta', () => {
    it('elegir un grupo genera el reporte sin otro clic: elige el caso y muestra las cifras', async () => {
      await render();
      choose(select('Grupo'), 'Cohorte B · COH-B');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(reporteService.getReporteGrupo).toHaveBeenCalledTimes(1);
      expect(reporteService.getReporteGrupo).toHaveBeenCalledWith(2, 12);
      expect(text(stat('Intentos')!.querySelector('.ui-stat__value'))).toBe('10');
      expect(stat('Puntaje promedio')).toBeUndefined();
      expect(stat('Decisiones adecuadas')).toBeUndefined();
      expect(text(stat('Bitácoras')!.querySelector('.ui-stat__value'))).toBe('9');
      expect(text(host().querySelector('.rg-result h2'))).toContain('Cohorte B');
    });

    it('RQ-NEG-006: elige el primer caso con intentos, aun si otro caso no tiene', async () => {
      const segundo = { ...caso, caseVersionId: 13, title: 'Caso trece' };
      await render({ casos: () => of([caso, segundo]), reporte: (grupo, id) => of(report(grupo, id === 13 ? simulation() : null, id)) });
      choose(select('Grupo'), 'Cohorte A · COH-A');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(select('Caso').selectedOptions[0].textContent?.trim()).toBe('Caso trece · v1.0.0');
      expect(reporteService.getReporteGrupo.mock.calls.map(call => call[1])).toEqual([12, 13]);
      expect(text(stat('Intentos')!.querySelector('.ui-stat__value'))).toBe('10');
    });

    it('cambiar el caso vuelve a pedir el reporte con ese caso', async () => {
      await render();
      choose(select('Grupo'), 'Cohorte A · COH-A');
      await fixture.whenStable();
      choose(select('Caso'), 'Caso doce · v1.0.0');
      await fixture.whenStable();

      expect(reporteService.getReporteGrupo).toHaveBeenCalledTimes(2);
      expect(reporteService.getReporteGrupo).toHaveBeenLastCalledWith(1, 12);
    });

    it('?grupo=<id> preselecciona el grupo y genera el reporte (el camino corto desde Grupos)', async () => {
      await render({}, { query: { grupo: '2' } });

      expect(select('Grupo').selectedOptions[0].textContent?.trim()).toBe('Cohorte B · COH-B');
      expect(reporteService.getReporteGrupo).toHaveBeenCalledWith(2, 12);
      expect(stat('Intentos')).toBeDefined();
    });

    // req: RF-25, RQ-NEG-006
    it('?grupo=<id>&caseVersionId=<id> deja elegidos el grupo Y el caso y pide ese corte (la vuelta desde el reporte de un estudiante)', async () => {
      await render({}, { query: { grupo: '2', caseVersionId: '12' } });

      expect(select('Grupo').selectedOptions[0].textContent?.trim()).toBe('Cohorte B · COH-B');
      expect(select('Caso de simulación').selectedOptions[0].textContent?.trim()).toBe('Caso doce · v1.0.0');
      expect(reporteService.getReporteGrupo).toHaveBeenCalledTimes(1);
      expect(reporteService.getReporteGrupo).toHaveBeenCalledWith(2, 12);
    });

    it('un ?caseVersionId= que no es un número se ignora (el grupo sí se elige)', async () => {
      await render({}, { query: { grupo: '2', caseVersionId: 'abc' } });

      expect(reporteService.getReporteGrupo).toHaveBeenCalledWith(2, 12);
    });

    it('un ?grupo= que no existe se ignora: queda «Selecciona un grupo» y no se consulta nada', async () => {
      await render({}, { query: { grupo: '999' } });

      expect(reporteService.getReporteGrupo).not.toHaveBeenCalled();
      expect(text(host().querySelector('ui-vacio-ilustrado'))).toContain('Selecciona un grupo');
    });

    it('cambiar de grupo con una consulta en curso: solo cuenta la última', async () => {
      const first = new Subject<ReporteGrupo>();
      await render({ reporte: grupoId => (grupoId === 1 ? first : of(report(2, simulation({ totalIntentos: 77 })))) });
      choose(select('Grupo'), 'Cohorte A · COH-A');
      choose(select('Grupo'), 'Cohorte B · COH-B');
      await fixture.whenStable();
      fixture.detectChanges();

      first.next(report(1, simulation({ totalIntentos: 5 })));
      first.complete();
      fixture.detectChanges();
      expect(text(stat('Intentos')!.querySelector('.ui-stat__value'))).toBe('77');
      expect(text(host().querySelector('.rg-result h2'))).toContain('Cohorte B');
    });

    it('«Limpiar» vuelve a «Selecciona un grupo»', async () => {
      await render();
      choose(select('Grupo'), 'Cohorte A · COH-A');
      await fixture.whenStable();
      buttonLabelled('Limpiar')!.click();
      fixture.detectChanges();

      expect(text(host().querySelector('ui-vacio-ilustrado'))).toContain('Selecciona un grupo');
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
    });

    it('si fallan los filtros: un error con «Reintentar» que vuelve a pedirlos', async () => {
      let calls = 0;
      await render({ grupos: () => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of([grupoA])) });
      const error = host().querySelector('ui-error-state')!;
      expect(text(error)).toContain('No fue posible cargar los grupos');

      (error.querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect([...select('Grupo').options].map(option => text(option))).toContain('Cohorte A · COH-A');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('resultado', () => {
    async function withReport() {
      await render();
      choose(select('Grupo'), 'Cohorte A · COH-A');
      await fixture.whenStable();
      fixture.detectChanges();
    }

    /** La tabla de estudiantes (la de cobertura por hito es otra, con su propio nombre). */
    const studentTable = () => [...host().querySelectorAll('ui-table')]
      .find(table => table.querySelector('[role="region"]')?.getAttribute('aria-label') === 'Tabla de simulación por estudiante')!;

    it('la tabla es una región con nombre, con una fila por estudiante y estados en insignias', async () => {
      await withReport();
      const region = studentTable().querySelector('[role="region"]')!;
      expect(region.getAttribute('aria-label')).toBe('Tabla de simulación por estudiante');
      const rows = [...studentTable().querySelectorAll('tbody tr')];
      expect(rows).toHaveLength(2);
      expect(text(rows[0])).toContain('Marta Ríos');
      expect(text(rows[0].querySelector('ui-badge'))).toBe('Completado');
      expect(text(rows[1].querySelector('ui-badge'))).toBe('En pausa (reanudable)');
    });

    // req: RF-26, CU-15, RQ-NEG-006
    it('cada estudiante es un enlace a su reporte (F10-7), con el grupo y el caso elegidos para que el reporte conserve el contexto', async () => {
      await withReport();
      const hrefs = () => [...studentTable().querySelectorAll('tbody a')].map(link => link.getAttribute('href'));
      expect(hrefs()).toEqual(['/portal/reportes/estudiante/11?grupo=1&caseVersionId=12', '/portal/reportes/estudiante/12?grupo=1&caseVersionId=12']);
      expect(text(studentTable().querySelector('tbody a'))).toContain('Marta Ríos');

      choose(select('Caso de simulación'), 'Caso doce · v1.0.0');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(hrefs()[0]).toBe('/portal/reportes/estudiante/11?grupo=1&caseVersionId=12');
    });

    it('ninguna región de la pantalla repite el nombre de otra (landmark-unique)', async () => {
      await withReport();
      const names = [...host().querySelectorAll('section[aria-labelledby], [role="region"][aria-label]')].map(el => {
        const labelledBy = el.getAttribute('aria-labelledby');
        return labelledBy ? text(host().querySelector(`#${labelledBy}`)) : el.getAttribute('aria-label');
      });
      expect(names.length).toBeGreaterThan(2);
      expect(new Set(names).size).toBe(names.length);
    });

    it('las dos medidas de calidad son barras con nombre y valor legible', async () => {
      await withReport();
      const bars = [...host().querySelectorAll('ui-progress')];
      expect(bars.map(bar => bar.getAttribute('aria-label'))).toEqual(['Finalización de intentos', 'Salida segura']);
      expect(bars[0].getAttribute('aria-valuenow')).toBe('60');
      expect(bars[1].getAttribute('aria-valuenow')).toBe('10');
    });

    it('«Exportar CSV» solo aparece con datos y confirma con un aviso, no con un mensaje verde en la página', async () => {
      await render();
      expect(buttonLabelled('Exportar CSV')).toBeUndefined();

      choose(select('Grupo'), 'Cohorte A · COH-A');
      await fixture.whenStable();
      fixture.detectChanges();
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      try {
        buttonLabelled('Exportar CSV')!.click();
        await fixture.whenStable();

        expect(reporteService.exportarCsv).toHaveBeenCalledWith(1, 12);
        expect(notify.success).toHaveBeenCalledWith('El archivo CSV se descargó correctamente.');
        expect(host().querySelector('.state-message')).toBeNull();
      } finally {
        click.mockRestore();
      }
    });

    it('si la exportación falla avisa con un aviso de error', async () => {
      await withReport();
      reporteService.exportarCsv.mockReturnValue(throwError(() => new Error('HTTP 500')));
      buttonLabelled('Exportar CSV')!.click();
      await fixture.whenStable();

      expect(notify.error).toHaveBeenCalledWith('No fue posible exportar el reporte.');
    });

    // req: RN-09, modelo de métricas
    describe('cobertura por hito', () => {
      const hitoRows = () => [...host().querySelectorAll('.rg-hito')];

      it('no hay puntaje promedio ni decisiones adecuadas: ni en las cifras ni en las columnas', async () => {
        await withReport();
        expect(stat('Puntaje promedio')).toBeUndefined();
        expect(stat('Decisiones adecuadas')).toBeUndefined();
        const headers = [...studentTable().querySelectorAll('th[scope="col"]')].map(th => text(th));
        expect(headers).toEqual([
          'Estudiante', 'Intentos', 'Hitos cumplidos', 'Recomendadas', 'Aceptables', 'Con riesgo', 'Contraindicadas', 'Bitácoras', 'Estado',
        ]);
        expect(text(host().querySelector('.rg-result'))).not.toMatch(/Puntaje|Adecuadas|Desempeño/i);
      });

      it('cada hito sale con su nombre, la marca «clave» si decide el final y la cobertura EN PALABRAS', async () => {
        await withReport();
        const rows = hitoRows();
        expect(rows).toHaveLength(3);
        expect(text(rows[0])).toContain('Escuchar sin interrumpir');
        expect(text(rows[0])).toContain('La mayoría cumplió este paso');
        expect(rows[0].querySelector('ui-badge')).toBeNull();
        expect(text(rows[1].querySelector('ui-badge'))).toBe('clave');
        expect(text(rows[1])).toContain('Menos de la mitad cumplió este paso');
        expect(text(rows[2])).toContain('Aún no hay datos suficientes para mostrarlo');
        // Con menos de 20 estudiantes no viaja el porcentaje: ni barra ni cifra al lado.
        expect(host().querySelectorAll('.rg-bar')).toHaveLength(0);
        expect(text(host().querySelector('.rg-hitos'))).not.toMatch(/\d/);
      });

      it('representa los porcentajes publicados con denominador y patrón', async () => {
        const sim = simulation({ hitos: [
          { key: 'escucha', label: 'Escuchar', decisive: false, cobertura: 'MAYORIA', porcentaje: 62.5 },
          { key: 'proteccion', label: 'Proteger', decisive: true, cobertura: 'MENOS_DE_LA_MITAD', porcentaje: 30 },
        ] });
        await render({ reporte: grupoId => of(report(grupoId, sim)) });
        choose(select('Grupo'), 'Cohorte A · COH-A');
        await fixture.whenStable();
        fixture.detectChanges();
        // Una fila por hito con su palabra, su porcentaje y su barra: sin un segundo gráfico que repita los hitos.
        const lista = host().querySelector('.rg-hitos');
        expect(host().querySelector('ui-barras:not(.ui-barras--apilada)')).toBeNull();
        expect(lista?.querySelectorAll('.rg-hito ui-progress')).toHaveLength(2);
        // Es un porcentaje, no un conteo de personas: nunca «de 100».
        // El separador decimal lo pone el LOCALE_ID de la app (en la prueba, el predeterminado).
        expect(text(lista)).toMatch(/62[,.]5 % del grupo/);
        expect(text(lista)).toContain('30 % del grupo');
        expect(text(lista)).not.toContain('de 100');
        expect(text(host().querySelector('.rg-lectura'))).toContain('El paso menos logrado es «Proteger», con 30 %.');
      });

      it('la descripción del gráfico de decisiones dice qué predomina y cuántas piden atención', async () => {
        await withReport();
        const description = text(host().querySelector('ui-barras.ui-barras--apilada .ui-barras__descripcion'));
        expect(description).toMatch(/Predomina «[^»]+» con \d+\.|Empatan/);
        expect(description).toMatch(/Piden atención \d+|Ninguna decisión es de riesgo/);
      });

      it('una tabla equivalente trae los mismos hitos con su cobertura en palabras y el porcentaje (o un guion)', async () => {
        const sim = simulation({
          hitos: [
            { key: 'escucha', label: 'Escuchar sin interrumpir', decisive: false, cobertura: 'MAYORIA', porcentaje: 62.5 },
            { key: 'proteccion', label: 'Recomendar medidas de protección', decisive: true, cobertura: 'MENOS_DE_LA_MITAD' },
          ],
        });
        await render({ reporte: grupoId => of(report(grupoId, sim)) });
        choose(select('Grupo'), 'Cohorte A · COH-A');
        await fixture.whenStable();
        fixture.detectChanges();

        const table = [...host().querySelectorAll('ui-table')]
          .find(el => el.querySelector('[role="region"]')?.getAttribute('aria-label') === 'Tabla de cobertura por hito')!;
        expect([...table.querySelectorAll('thead th')].map(th => text(th))).toEqual(['Hito', 'Cobertura', 'Porcentaje del grupo']);
        const rows = [...table.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('th, td')].map(cell => text(cell)));
        expect(rows).toEqual([
          ['Escuchar sin interrumpir', 'La mayoría cumplió este paso', '62.5 %'],
          ['Recomendar medidas de protección clave', 'Menos de la mitad cumplió este paso', '—'],
        ]);
      });

      it('por estudiante: los conteos por clase son números en la tabla docente y el orden sigue siendo por nombre', async () => {
        await withReport();
        const rows = [...studentTable().querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('th, td')].slice(1, 8).map(cell => text(cell)));
        expect(rows).toEqual([
          // La clave que no es de los hitos del caso no se cuenta: «2 de 3», no «3 de 3».
          ['2', '2 de 3', '12', '2', '1', '0', '2'],
          ['1', '—', '3', '0', '0', '0', '0'],
        ]);
        expect(text(host().querySelector('.rg-result'))).toContain('el orden es por nombre');
      });

      it('un caso sin hitos lo dice en vez de dejar el bloque vacío', async () => {
        await render({ reporte: grupoId => of(report(grupoId, simulation({ hitos: [] }))) });
        choose(select('Grupo'), 'Cohorte A · COH-A');
        await fixture.whenStable();
        fixture.detectChanges();
        expect(text(host().querySelector('.rg-result'))).toContain('Este caso no declara hitos.');
        expect(hitoRows()).toHaveLength(0);
      });
    });

    it('sin restos del diseño anterior: ni Material, ni medidores con ancho en línea, ni mensajes verdes', async () => {
      await withReport();
      expect(host().querySelector('mat-card, mat-form-field, mat-select, mat-chip, mat-progress-bar, table[mat-table], .psy-button, .meter')).toBeNull();
      expect(host().querySelector('[style*="width"]')).toBeNull();
    });
  });
});
