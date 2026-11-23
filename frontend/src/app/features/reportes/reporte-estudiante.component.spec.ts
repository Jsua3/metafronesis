import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { ReporteService } from '../../core/api/reporte.service';
import { IntentoEstudianteReporte, ReporteEstudiante } from '../../core/models/reporte.model';
import { ReporteEstudianteComponent } from './reporte-estudiante.component';

/**
 * Reporte de un estudiante (plan visual F10-7†; RF-26, CU-15, RF-25, CU-14, RQ-NEG-006; contrato C3): los intentos de
 * UN estudiante para su docente, con el tiempo activo y el de reloj, y la cobertura «Mostrando X de N» con «Ver más
 * intentos» (el servidor da 50 por defecto y 200 como máximo). Un docente solo ve a los estudiantes de sus grupos
 * (403 del servidor); un estudiante que no existe es 404.
 */
function attempt(over: Partial<IntentoEstudianteReporte> = {}): IntentoEstudianteReporte {
  return {
    attemptId: 'a1', caseVersionId: 7, caseTitle: 'Duelo en la comisaría', status: 'COMPLETED', startedAt: '2026-10-10T10:30:00',
    activeSeconds: 600, clockSeconds: 900, ordinal: 1, ...over,
  };
}

function report(attempts: IntentoEstudianteReporte[], total = attempts.length): ReporteEstudiante {
  return { student: { ref: 'Estudiante-12', displayName: 'Ana Gómez' }, attempts, coverage: { shown: attempts.length, total } };
}

const manyAttempts = (count: number) => Array.from({ length: count }, (_, index) => attempt({ attemptId: `a${index}`, ordinal: index + 1 }));

describe('reporte de un estudiante (F10-7)', () => {
  let fixture: ComponentFixture<ReporteEstudianteComponent>;
  let service: { getReporteEstudiante: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const buttonLabelled = (label: string) => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')) === label);
  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  async function render(
    response: Observable<ReporteEstudiante> | ((id: number, options: Record<string, unknown>) => Observable<ReporteEstudiante>) = of(report([attempt()])),
    { query = {} as Record<string, string>, id = '12' } = {},
  ) {
    service = {
      getReporteEstudiante: vi.fn((studentId: number, options: Record<string, unknown>) =>
        (typeof response === 'function' ? response(studentId, options) : response)),
    };
    TestBed.configureTestingModule({
      imports: [ReporteEstudianteComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: ReporteService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ estudianteId: id }), queryParamMap: convertToParamMap(query) } } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ReporteEstudianteComponent);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // req: RNF-04, BLOQUE-H
  describe('estructura y estados', () => {
    it('pide el reporte del estudiante de la ruta, con un solo h1 que lo nombra y la región de estado siempre presente', async () => {
      await render();

      expect(service.getReporteEstudiante).toHaveBeenCalledWith(12, {});
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Reporte de Ana Gómez');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
    });

    it('sin nombre (la decisión 21 puede dar solo el alias) el título usa la referencia', async () => {
      await render(of({ student: { ref: 'Estudiante-12' }, attempts: [attempt()], coverage: { shown: 1, total: 1 } } as ReporteEstudiante));

      expect(text(host().querySelector('h1'))).toBe('Reporte de Estudiante-12');
    });

    it('mientras carga: esqueleto, la región de estado presente y un h1 que nombra la pantalla', async () => {
      await render(new Subject<ReporteEstudiante>());

      expect(text(host().querySelector('h1'))).toBe('Reporte del estudiante');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
    });

    it('sin intentos: lo dice con una explicación, no como un éxito', async () => {
      await render(of(report([])));

      expect(text(host())).toContain('Este estudiante aún no tiene intentos');
      expect(host().querySelector('table')).toBeNull();
    });

    it.each([
      [403, 'forbidden', 'No tienes permiso para ver el reporte de este estudiante.'],
      [404, 'not-found', 'no existe'],
      [500, 'server', ''],
    ])('un error %i se dice como «%s» con el texto de la pantalla (el del servidor es genérico: «No tiene permisos para realizar esta acción»)', async (status, _kind, fragment) => {
      const error = new HttpErrorResponse({ status, error: { message: status === 403 ? 'No tiene permisos para realizar esta acción' : undefined } });
      await render(throwError(() => error));

      const state = host().querySelector('ui-error-state');
      expect(state).not.toBeNull();
      if (fragment) expect(text(state)).toContain(fragment);
    });

    it('«Reintentar» vuelve a pedir el reporte', async () => {
      let calls = 0;
      await render(() => (++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 500 })) : of(report([attempt()]))));

      (host().querySelector('ui-error-state button') as HTMLButtonElement).click();
      await settle();
      fixture.detectChanges();

      expect(service.getReporteEstudiante).toHaveBeenCalledTimes(2);
      expect(text(host().querySelector('h1'))).toBe('Reporte de Ana Gómez');
    });
  });

  // req: RF-26, CU-15
  describe('los intentos', () => {
    it('cada intento dice caso, número de intento, estado en palabras, inicio y los dos tiempos', async () => {
      await render(of(report([
        attempt({ attemptId: 'a2', ordinal: 2, status: 'IN_PROGRESS', clockSeconds: null, activeSeconds: 125, caseTitle: 'Otro caso', caseVersionId: 9 }),
        attempt(),
      ])));

      const rows = [...host().querySelectorAll('tbody tr')].map(row => text(row));
      expect(rows).toHaveLength(2);
      expect(host().textContent).toContain('Otro caso');
      expect(rows[0]).toContain('2');
      expect(rows[0]).toContain('En curso');
      expect(rows[0]).toContain('2 min');
      expect(rows[0]).toContain('Reloj');
      expect(host().textContent).toContain('Duelo en la comisaría');
      expect(rows[1]).toContain('Finalizado');
      expect(rows[1]).toContain('10 min');
      expect(rows[1]).not.toMatch(/COMPLETED|IN_PROGRESS/);
    });

    it('la tabla lleva nombre y encabezados de columna', async () => {
      await render();

      const headers = [...host().querySelectorAll('thead th')].map(text);
      expect(headers).toEqual(['Intento', 'Estado', 'Inicio', 'Tiempo activo']);
      expect(host().querySelector('[role="region"][aria-label="Intentos del estudiante"]')).not.toBeNull();
    });
  });

  describe('estado del caso, encabezado de fila y tiempo de reloj', () => {
    const statusFor = async (status: string) => {
      await render(of(report([attempt({ status })])));
      return text(host().querySelector('.re-status'));
    };

    it.each([
      ['COMPLETED', 'Último intento: finalizado. 1 intento en este corte, 1 finalizado.'],
      ['IN_PROGRESS', 'Último intento: en curso. 1 intento en este corte, ninguno finalizado.'],
      ['PAUSED', 'Último intento: en pausa (reanudable). 1 intento en este corte, ninguno finalizado.'],
      ['SAFE_EXITED', 'Último intento: cerrado con salida segura. 1 intento en este corte, ninguno finalizado.'],
    ])('dice el estado %s en palabras antes de la tabla', async (status, expected) => {
      expect(await statusFor(status)).toBe(expected);
      const card = host().querySelector('.re-case-card')!;
      expect(card.querySelector('.re-status')!.compareDocumentPosition(card.querySelector('ui-table')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('toma el intento más reciente (el de mayor número) para el estado', async () => {
      await render(of(report([attempt({ attemptId: 'b', ordinal: 2, status: 'IN_PROGRESS' }), attempt({ attemptId: 'a', ordinal: 1 })])));
      expect(text(host().querySelector('.re-status'))).toBe('Último intento: en curso. 2 intentos en este corte, 1 finalizado.');
    });

    it('cada fila conserva un encabezado de fila accesible: el número de intento', async () => {
      await render(of(report([attempt({ attemptId: 'b', ordinal: 2 }), attempt({ attemptId: 'a', ordinal: 1 })])));
      const heads = [...host().querySelectorAll('tbody tr th[scope="row"]')].map(text);
      expect(heads).toEqual(['2', '1']);
      expect(host().querySelector('tbody tr th[scope="row"]')!.className).not.toContain('re-case');
    });

    it('el tiempo de reloj es auxiliar, se alcanza con el teclado y dice el dato o su ausencia', async () => {
      await render(of(report([attempt({ clockSeconds: 900 }), attempt({ attemptId: 'x', ordinal: 2, clockSeconds: null })])));
      const clocks = [...host().querySelectorAll<HTMLElement>('.re-clock')];
      expect(clocks.map(el => el.getAttribute('aria-label'))).toEqual(['Tiempo de reloj: 15 min', 'Tiempo de reloj: sin dato']);
      expect(clocks.every(el => el.tabIndex === 0)).toBe(true);
    });
  });

  it('apila la tabla y solo enlaza a la revisión general, sin identificar un intento', async () => {
    await render();
    expect(host().querySelector('ui-table')?.classList.contains('ui-table--apilar')).toBe(true);
    const link = host().querySelector('.re-privacy a');
    expect(link?.getAttribute('href')).toBe('/portal/docente/trazabilidad');
    expect(link?.getAttribute('href')).not.toContain('a1');
  });

  // req: RF-25, CU-14, RQ-NEG-006
  describe('«Mostrando X de N» y «Ver más intentos»', () => {
    it('dice cuántos intentos muestra de cuántos hay y lo anuncia', async () => {
      await render(of(report(manyAttempts(50), 120)));

      expect(text(host().querySelector('.re-coverage'))).toBe('Mostrando 50 de 120 intentos');
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('Mostrando 50 de 120 intentos');
    });

    it('«Ver más intentos» pide 50 más y reemplaza la lista (el servidor devuelve los más recientes primero)', async () => {
      await render((_id, options) => of(options['limit'] === 100 ? report(manyAttempts(100), 120) : report(manyAttempts(50), 120)));

      buttonLabelled('Ver más intentos')!.click();
      await settle();
      fixture.detectChanges();

      expect(service.getReporteEstudiante).toHaveBeenLastCalledWith(12, { limit: 100 });
      expect(text(host().querySelector('.re-coverage'))).toBe('Mostrando 100 de 120 intentos');
      expect(host().querySelectorAll('tbody tr')).toHaveLength(100);
    });

    it('al traer más el foco no se pierde: va a la línea «Mostrando X de N» (el botón puede desaparecer)', async () => {
      await render((_id, options) => of(options['limit'] === 100 ? report(manyAttempts(100), 100) : report(manyAttempts(50), 100)));

      buttonLabelled('Ver más intentos')!.click();
      await settle();
      fixture.detectChanges();
      await settle();

      expect(buttonLabelled('Ver más intentos')).toBeUndefined();
      expect(document.activeElement).toBe(host().querySelector('.re-coverage'));
    });

    it('con todo a la vista no ofrece «Ver más intentos»', async () => {
      await render(of(report(manyAttempts(3), 3)));

      expect(buttonLabelled('Ver más intentos')).toBeUndefined();
      expect(text(host().querySelector('.re-coverage'))).toBe('Mostrando 3 de 3 intentos');
    });

    it('en el tope de 200 por consulta no ofrece más y lo explica', async () => {
      await render(of(report(manyAttempts(200), 350)));

      expect(buttonLabelled('Ver más intentos')).toBeUndefined();
      expect(text(host())).toContain('200');
      expect(text(host().querySelector('.re-limit'))).toContain('máximo');
    });

    it('mientras pide más sigue mostrando los que ya tenía (no vuelve al esqueleto)', async () => {
      const more = new Subject<ReporteEstudiante>();
      await render((_id, options) => (options['limit'] === 100 ? more : of(report(manyAttempts(50), 120))));

      buttonLabelled('Ver más intentos')!.click();
      await settle();
      fixture.detectChanges();

      expect(host().querySelectorAll('tbody tr')).toHaveLength(50);
      expect(buttonLabelled('Ver más intentos')?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  // req: RF-25, RQ-NEG-006
  describe('filtro por caso y vuelta al reporte del grupo', () => {
    it('con ?caseVersionId pide solo ese caso y lo dice; «Ver todos los casos» lo quita', async () => {
      await render((_id, options) => of(options['caseVersionId'] === 7 ? report([attempt()], 1) : report([attempt(), attempt({ attemptId: 'b', caseVersionId: 9, caseTitle: 'Otro caso' })], 2)),
        { query: { caseVersionId: '7' } });

      expect(service.getReporteEstudiante).toHaveBeenCalledWith(12, { caseVersionId: 7 });
      expect(text(host().querySelector('.re-filter'))).toContain('Duelo en la comisaría');

      buttonLabelled('Ver todos los casos')!.click();
      await settle();
      fixture.detectChanges();

      expect(service.getReporteEstudiante).toHaveBeenLastCalledWith(12, {});
      expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { caseVersionId: null }, queryParamsHandling: 'merge' }));
      expect(host().querySelector('.re-filter')).toBeNull();
    });

    it('«Volver a los reportes» conserva el grupo del que se vino', async () => {
      await render(of(report([attempt()])), { query: { grupo: '4' } });

      const back = host().querySelector('a[href^="/portal/reportes"]') as HTMLAnchorElement;
      expect(text(back)).toContain('Volver a los reportes');
      expect(back.getAttribute('href')).toBe('/portal/reportes?grupo=4');
    });

    it('«Volver a los reportes» conserva también el caso filtrado, y lo suelta al quitar el filtro', async () => {
      await render(of(report([attempt()], 1)), { query: { grupo: '4', caseVersionId: '7' } });
      const back = () => (host().querySelector('a[href^="/portal/reportes"]') as HTMLAnchorElement).getAttribute('href');
      expect(back()).toBe('/portal/reportes?grupo=4&caseVersionId=7');

      buttonLabelled('Ver todos los casos')!.click();
      await settle();
      fixture.detectChanges();
      expect(back()).toBe('/portal/reportes?grupo=4');
    });

    it('sin grupo, vuelve a los reportes a secas', async () => {
      await render();

      expect((host().querySelector('a[href^="/portal/reportes"]') as HTMLAnchorElement).getAttribute('href')).toBe('/portal/reportes');
    });

    it('un identificador de estudiante que no es un número no llama al servidor y lo dice como no encontrado', async () => {
      await render(of(report([])), { id: 'abc' });

      expect(service.getReporteEstudiante).not.toHaveBeenCalled();
      expect(host().querySelector('ui-error-state')).not.toBeNull();
    });
  });
});
