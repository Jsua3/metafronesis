import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { SimulationService } from '../../core/api/simulation.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { CatalogItem, StudentAttemptSummary } from '../../core/models/simulation.model';
import { SimulationCatalogComponent } from './simulation-catalog.component';

const entrada = (id: number, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  caseVersionId: id, code: `C${id}`, title: `Caso ${id}`, description: 'Una descripción larga del caso.', order: id, unlocked: true, completed: false, locked: false, ...extra,
});
const resumen = (id: number) => ({ ...entrada(id), semanticVersion: '1.0.0', nodeCount: 8, status: 'PUBLISHED' });
const intento = (extra: Partial<StudentAttemptSummary> = {}): StudentAttemptSummary => ({
  attemptId: 'abc', caseVersionId: 1, caseTitle: 'Caso 1', status: 'COMPLETED', totalDurationSeconds: 10, activeDurationSeconds: 10, startedAt: '2026-01-01T10:00:00Z', endedAt: null, ...extra,
});

describe('Casos del estudiante', () => {
  const info = vi.fn();

  async function render(catalogo: CatalogItem[], historial: StudentAttemptSummary[], opciones: { rol?: string; bloqueado?: string } = {}) {
    const rol = opciones.rol ?? 'ESTUDIANTE';
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ id: 1 }), hasRole: (r: string) => r === rol } },
        { provide: NotificationService, useValue: { info } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(opciones.bloqueado ? { bloqueado: opciones.bloqueado } : {})) } },
        { provide: CaseAccessCache, useValue: { acceso: () => ({ catalogo, historial }), guardandoAcceso: () => (fuente: unknown) => fuente } },
        { provide: SimulationService, useValue: { listCases: () => of(catalogo.map(item => resumen(item.caseVersionId))) } },
      ],
    });
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SimulationCatalogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement, navegar };
  }

  beforeEach(() => { info.mockClear(); sessionStorage.removeItem('siep.catalogo.retorno'); });

  it('agrupa los intentos por caso sin duración ni nombre repetido, y «Ver tu recorrido» navega al cierre', async () => {
    const { host, navegar } = await render([entrada(1, { completed: true })], [intento()]);
    const historial = host.querySelector('details')!;
    expect(historial.textContent).toContain('Tus intentos (1)');
    expect(historial.textContent).not.toContain('Caso 1');
    expect(historial.textContent).not.toContain('Duración');
    expect(historial.querySelector('th')?.textContent).toContain('Estado');
    (historial.querySelector('tbody button') as HTMLButtonElement).click();
    expect(navegar).toHaveBeenCalledWith(['/portal/simulador', 1, 'cierre', 'abc']);
  });

  it('la acción de la tarjeta depende del estado: terminado lleva al recorrido', async () => {
    const { host, navegar } = await render([entrada(1, { completed: true })], [intento()]);
    const accion = host.querySelector('.cs-acciones button') as HTMLButtonElement;
    expect(accion.textContent).toContain('Ver tu recorrido');
    accion.click();
    expect(navegar).toHaveBeenCalledWith(['/portal/simulador', 1, 'cierre', 'abc']);
  });

  it('al volver del recorrido devuelve el foco a la accion del caso', async () => {
    sessionStorage.setItem('siep.catalogo.retorno', '1');
    const foco = vi.spyOn(HTMLElement.prototype, 'focus');
    const { host } = await render([entrada(1, { completed: true })], [intento()]);
    const boton = host.querySelector('[data-case-id="1"] .cs-acciones button');
    expect(boton).not.toBeNull();
    expect(foco.mock.instances).toContain(boton);
    expect(sessionStorage.getItem('siep.catalogo.retorno')).toBeNull();
    foco.mockRestore();
  });

  it('lo abierto se continúa directo; sin empezar abre la ficha; el estado va en palabras', async () => {
    const { host, navegar } = await render([entrada(1), entrada(2)], [intento({ status: 'PAUSED' })]);
    const botones = Array.from(host.querySelectorAll<HTMLButtonElement>('.cs-acciones button'));
    expect(botones).toHaveLength(2);
    expect(botones[0].textContent).toContain('Continuar');
    expect(botones[1].textContent).toContain('Ver ficha');
    botones[0].click();
    expect(navegar).toHaveBeenCalledWith(['/portal/simulador', 1], expect.objectContaining({ queryParams: { intento: 'continuar' } }));
    botones[1].click();
    expect(navegar).toHaveBeenCalledWith(['/portal/simulador', 2, 'ficha'], expect.anything());
    expect(host.textContent).toContain('En pausa');
    expect(host.textContent).toContain('Sin empezar');
  });

  it('un caso bloqueado dice por qué y su botón queda deshabilitado con el motivo', async () => {
    const { host } = await render([entrada(1), entrada(2, { unlocked: false, locked: true })], []);
    const tarjeta = host.querySelectorAll('.cs-tarjeta')[1];
    expect(tarjeta.textContent).toContain('Bloqueado');
    expect(tarjeta.textContent).toContain('Se abre al terminar «Caso 1»');
    expect(tarjeta.querySelector('.cs-acciones button')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('un reemplazado se dice «Reemplazado» y no ofrece acción', async () => {
    const { host } = await render([entrada(1)], [intento({ status: 'REPLACED' })]);
    const fila = host.querySelector('details tbody tr')!;
    expect(fila.textContent).toContain('Reemplazado');
    expect(fila.querySelector('button')).toBeNull();
  });

  it('el filtro de estado lleva cuentas y filtra; la búsqueda no aparece con pocos casos', async () => {
    const { fixture, host } = await render([entrada(1, { completed: true }), entrada(2)], [intento()]);
    expect(host.querySelector('ui-segmentado')).not.toBeNull();
    expect(host.querySelector('input[type="search"]')).toBeNull();
    expect(host.querySelectorAll('.cs-tarjeta')).toHaveLength(2);
    expect(host.querySelector('.cs-rejilla--uno')).toBeNull();
    const terminados = Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]')).find(radio => radio.textContent?.includes('Terminados'))!;
    expect(terminados.textContent).toContain('1');
    terminados.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelectorAll('.cs-tarjeta')).toHaveLength(1);
    // Un solo caso visible no se queda en un tercio de la rejilla: va a todo el ancho.
    expect(host.querySelector('.cs-rejilla--uno')).not.toBeNull();
  });

  it('con más de 8 casos aparece la búsqueda', async () => {
    const casos = Array.from({ length: 9 }, (_, i) => entrada(i + 1));
    const { host } = await render(casos, []);
    expect(host.querySelector('input[type="search"]')).not.toBeNull();
  });

  it('un caso bloqueado pedido por dirección se avisa con el sistema de avisos', async () => {
    await render([entrada(1), entrada(2, { unlocked: false, locked: true })], [], { bloqueado: '2' });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toContain('Caso 2');
  });

  it('el administrador ve el catálogo con «Editor visual» y sin estados del estudiante', async () => {
    const { host } = await render([entrada(1)], [], { rol: 'ADMIN' });
    expect(host.textContent).toContain('Editor visual');
    expect(host.querySelector('ui-segmentado')).toBeNull();
    expect(host.querySelector('details')).toBeNull();
  });

  describe('catálogo e historial fallan por separado (Codex B4a, hallazgo 3)', () => {
    async function renderSinCache(servicio: Record<string, unknown>) {
      const guardarAcceso = vi.fn();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideRouter([]),
          { provide: AuthService, useValue: { currentUser: signal({ id: 1 }), hasRole: (r: string) => r === 'ESTUDIANTE' } },
          { provide: NotificationService, useValue: { info } },
          { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
          { provide: CaseAccessCache, useValue: { acceso: () => null, ticket: () => ({ dueno: 1, epoca: 0 }), guardarAcceso } },
          { provide: SimulationService, useValue: { listCases: () => of([resumen(1)]), ...servicio } },
        ],
      });
      const fixture = TestBed.createComponent(SimulationCatalogComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      return { host: fixture.nativeElement as HTMLElement, fixture, guardarAcceso };
    }
    const falla = () => throwError(() => ({ status: 500 }));

    it('si falla el catálogo, el historial se ve, el error es de los casos y su reintento pide el catálogo', async () => {
      const getCatalog = vi.fn().mockReturnValueOnce(falla()).mockReturnValue(of([entrada(1)]));
      const attemptHistory = vi.fn(() => of([intento({ status: 'PAUSED' })]));
      const { host, fixture, guardarAcceso } = await renderSinCache({ getCatalog, attemptHistory });
      // Sin catálogo no se pintan tarjetas con un «abierto» inventado; el historial llegó y no se volvió a pedir.
      expect(host.querySelector('.cs-acciones')).toBeNull();
      expect(guardarAcceso).not.toHaveBeenCalled();
      const reintentos = Array.from(host.querySelectorAll('ui-error-state'));
      expect(reintentos).toHaveLength(1);
      (reintentos[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(getCatalog).toHaveBeenCalledTimes(2);
      expect(attemptHistory).toHaveBeenCalledTimes(1);
      expect(host.querySelector('.cs-acciones button')?.textContent).toContain('Continuar');
      expect(guardarAcceso).toHaveBeenCalledTimes(1);
    });

    it('si falla el historial, las tarjetas usan el catálogo y el reintento solo pide el historial', async () => {
      const getCatalog = vi.fn(() => of([entrada(1, { locked: true, unlocked: false })]));
      const attemptHistory = vi.fn().mockReturnValueOnce(falla()).mockReturnValue(of([]));
      const { host, guardarAcceso } = await renderSinCache({ getCatalog, attemptHistory });
      expect(host.querySelectorAll('ui-error-state')).toHaveLength(1);
      // La tarjeta sale del catálogo (bloqueada), no del respaldo «abierto».
      expect(host.querySelector('.cs-acciones')?.textContent).toContain('Se abre al terminar el caso anterior.');
      expect(guardarAcceso).not.toHaveBeenCalled();
      expect(getCatalog).toHaveBeenCalledTimes(1);
    });
  });
});
