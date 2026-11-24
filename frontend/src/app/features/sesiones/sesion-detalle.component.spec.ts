import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';

import { SesionesApi } from '../../core/api/sesiones.api';
import { SesionDetalle } from '../../core/models/sesion.model';
import { UiDialog } from '../../shared/ui';
import { SesionDetalleComponent } from './sesion-detalle.component';

const base: SesionDetalle = {
  id: 4, estado: 'EN_CURSO', acciones: ['pausar', 'finalizar', 'gestionarConvocados'], grupo: { id: 2, nombre: 'Psicología 1' },
  caso: { caseVersionId: 9, titulo: 'La casa de Sofía' }, espacioAcademico: 'Clínica', inicio: '2026-11-25T08:00:00',
  fin: '2026-11-25T10:00:00', tiempoMaximoMin: 30, lugar: 'Aula 3', mensaje: '', totalConvocados: 1,
  iniciadaEn: '2026-11-25T08:01:00', finalizadaEn: null, canceladaEn: null,
  convocados: [{ estudianteId: 7, nombre: 'Lía Pérez', email: 'lia@example.test', estadoConvocatoria: 'ACTIVA', intento: 'JUGANDO', puedeRepetir: false }],
};

describe('SesionDetalleComponent', () => {
  let fixture: ComponentFixture<SesionDetalleComponent>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let confirm: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const botones = () => [...el().querySelectorAll<HTMLButtonElement>('[data-accion]')].map(b => b.dataset['accion']);

  async function montar(sesion: SesionDetalle, confirma = true, extra: Record<string, unknown> = {}) {
    TestBed.resetTestingModule(); // algunas pruebas montan dos veces
    api = {
      detalle: vi.fn(() => of(sesion)),
      transicionar: vi.fn((_id: number, accion: string) => of({ ...sesion, estado: accion === 'pausar' ? 'PAUSADA' : 'FINALIZADA', acciones: [] })),
      sincronizar: vi.fn(() => of({ agregados: 2 })),
      retirar: vi.fn(() => of(null)),
      ...extra,
    };
    confirm = vi.fn(() => Promise.resolve(confirma));
    await TestBed.configureTestingModule({
      imports: [SesionDetalleComponent],
      providers: [provideRouter([]), { provide: SesionesApi, useValue: api }, { provide: UiDialog, useValue: { confirm, open: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(SesionDetalleComponent);
    fixture.componentRef.setInput('sesionId', 4);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  it('los botones salen solo de las acciones del servidor', async () => {
    await montar(base);
    expect(botones()).toEqual(['pausar', 'finalizar', 'sincronizar']);
    await montar({ ...base, estado: 'FINALIZADA', acciones: [] });
    expect(botones()).toEqual([]);
  });

  it('pausar no pide confirmación; finalizar sí', async () => {
    await montar(base);
    el().querySelector<HTMLButtonElement>('[data-accion=pausar]')!.click();
    expect(confirm).not.toHaveBeenCalled();
    expect(api['transicionar']).toHaveBeenCalledWith(4, 'pausar');
  });

  it('si no confirma finalizar, no se llama al servidor', async () => {
    await montar(base, false);
    el().querySelector<HTMLButtonElement>('[data-accion=finalizar]')!.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalled();
    expect(api['transicionar']).not.toHaveBeenCalled();
  });

  it('muestra a cada convocado con el estado de su intento', async () => {
    await montar(base);
    expect(el().textContent).toContain('Lía Pérez');
    expect(el().textContent).toContain('Jugando');
  });

  it('en vivo se refresca cada 20 s y programada no', async () => {
    vi.useFakeTimers();
    await montar(base);
    const antes = api['detalle'].mock.calls.length;
    vi.advanceTimersByTime(20_000);
    expect(api['detalle'].mock.calls.length).toBe(antes + 1);
    await montar({ ...base, estado: 'PROGRAMADA', acciones: ['iniciar', 'cancelar', 'editar', 'gestionarConvocados'] });
    const despues = api['detalle'].mock.calls.length;
    vi.advanceTimersByTime(40_000);
    expect(api['detalle'].mock.calls.length).toBe(despues);
  });

  it('un refresco lento no pisa el estado que devolvió una transición', async () => {
    const refresco = new Subject<SesionDetalle>();
    let llamadas = 0;
    await montar(base, true, { detalle: vi.fn(() => (++llamadas === 1 ? of(base) : refresco)) });
    (fixture.componentInstance as unknown as { cargar(id: number, silencioso: boolean): void })['cargar'](4, true);
    el().querySelector<HTMLButtonElement>('[data-accion=pausar]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().textContent).toContain('Pausada');
    refresco.next(base); // respuesta vieja: EN_CURSO
    fixture.detectChanges();
    expect(el().textContent).toContain('Pausada');
    expect(el().textContent).not.toContain('En curso');
  });
});
