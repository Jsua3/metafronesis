import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';

import { SesionesApi } from '../../core/api/sesiones.api';
import { SesionResumen } from '../../core/models/sesion.model';
import { SesionListaComponent } from './sesion-lista.component';

const fila: SesionResumen = {
  id: 4, estado: 'EN_CURSO', acciones: ['pausar', 'finalizar', 'gestionarConvocados'], grupo: { id: 2, nombre: 'Psicología 1' },
  caso: { caseVersionId: 9, titulo: 'La casa de Sofía' }, espacioAcademico: 'Clínica', inicio: '2026-11-25T08:00:00',
  fin: '2026-11-25T10:00:00', tiempoMaximoMin: 30, lugar: '', mensaje: '', totalConvocados: 12,
  iniciadaEn: '2026-11-25T08:01:00', finalizadaEn: null, canceladaEn: null,
};

describe('SesionListaComponent', () => {
  let fixture: ComponentFixture<SesionListaComponent>;
  let listar: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function montar(filas: SesionResumen[]) {
    listar = vi.fn(() => of(filas));
    await TestBed.configureTestingModule({
      imports: [SesionListaComponent],
      providers: [provideRouter([]), { provide: SesionesApi, useValue: { listar, casos: () => of([]) } }],
    }).compileComponents();
    fixture = TestBed.createComponent(SesionListaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('pide las próximas al abrir y pinta cada sesión con su estado', async () => {
    await montar([fila]);
    expect(listar).toHaveBeenCalledWith(['PROGRAMADA']);
    expect(el().textContent).toContain('La casa de Sofía');
    expect(el().textContent).toContain('Psicología 1');
    expect(el().textContent).toContain('En curso');
    expect(el().querySelector('a[href="/portal/sesiones/4"]')).not.toBeNull();
  });

  it('sin sesiones muestra el estado vacío', async () => {
    await montar([]);
    expect(el().querySelector('ui-empty-state')).not.toBeNull();
  });

  it('al cambiar de filtro pide los nuevos estados y una respuesta tardía del anterior no pisa la lista', async () => {
    const pendientes: Subject<SesionResumen[]>[] = [];
    listar = vi.fn(() => { const s = new Subject<SesionResumen[]>(); pendientes.push(s); return s; });
    await TestBed.configureTestingModule({
      imports: [SesionListaComponent],
      providers: [provideRouter([]), { provide: SesionesApi, useValue: { listar, casos: () => of([]) } }],
    }).compileComponents();
    fixture = TestBed.createComponent(SesionListaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(listar).toHaveBeenLastCalledWith(['PROGRAMADA']);

    (fixture.componentInstance as unknown as { filtro: { set(v: string): void } }).filtro.set('en-curso');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(listar).toHaveBeenLastCalledWith(['EN_CURSO', 'PAUSADA']);

    pendientes[1].next([fila]);
    pendientes[0].next([{ ...fila, id: 99, caso: { caseVersionId: 1, titulo: 'Caso viejo' } }]);
    fixture.detectChanges();
    expect(el().textContent).toContain('La casa de Sofía');
    expect(el().textContent).not.toContain('Caso viejo');
  });
});
