import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { BibliotecaService } from '../../modelo/biblioteca.service';
import { LugarComponent } from './lugar.component';
import { PintorDeVistas } from './pintor-de-vistas.service';

const LUGARES = [
  { id: 'universidad', nombre: 'Universidad', descripcion: 'Campus.', temas: ['orientacion'], completo: true, salas: 10, portada: '/u.png' },
  { id: 'hospital', nombre: 'Hospital', descripcion: 'Urgencias.', temas: ['rutas'], completo: true, salas: 8, portada: '' },
];
const ESCENARIO = (id: string) => ({
  id, nombre: id, salas: [{ id: `${id}-1`, nombre: 'Entrada', fondo: '' }], personajes: [{}, {}], recorridosSugeridos: [{}],
});

async function montar(lugares: () => Promise<unknown[]>, consulta: Record<string, string> = {}) {
  TestBed.resetTestingModule();
  const vista = vi.fn().mockResolvedValue('blob:compuesta');
  await TestBed.configureTestingModule({
    imports: [LugarComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(consulta) } } },
      { provide: BibliotecaService, useValue: { lugares, escenario: (id: string) => Promise.resolve(ESCENARIO(id)) } },
      { provide: PintorDeVistas, useValue: { vista } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(LugarComponent);
  const listo = async () => {
    for (let i = 0; i < 3; i++) { await fixture.whenStable(); fixture.detectChanges(); await new Promise((r) => setTimeout(r, 0)); }
    fixture.detectChanges();
  };
  await listo();
  return { fixture, raiz: fixture.nativeElement as HTMLElement, listo, vista };
}

const continuar = (raiz: HTMLElement) => raiz.querySelector<HTMLAnchorElement>('a[aria-label^="Elegir este lugar"]');

describe('LugarComponent · RF-05 · CU-04 crear un caso: paso 1, elegir el lugar', () => {
  it('si los lugares no se pueden leer, lo dice y deja volver a intentarlo', async () => {
    const lugares = vi.fn().mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce([LUGARES[0]]);
    const { raiz, listo } = await montar(lugares);
    const aviso = raiz.querySelector('[role="alert"]')!;
    expect(aviso.textContent).toContain('No pudimos cargar los lugares');
    expect(raiz.textContent).not.toContain('Cargando lugares…');

    aviso.querySelector('button')!.click();
    await listo();
    expect(raiz.querySelector('[role="alert"]')).toBeNull();
    expect(raiz.textContent).toContain('Universidad');
    expect(lugares).toHaveBeenCalledTimes(2);
  });

  it('una lista vacía termina la carga y explica el estado', async () => {
    const { raiz } = await montar(() => Promise.resolve([]));
    expect(raiz.textContent).toContain('Aún no hay lugares disponibles');
    expect(raiz.textContent).not.toContain('Cargando lugares…');
    expect(raiz.querySelector('.esqueleto')).toBeNull();
  });

  it('elige de entrada el primer lugar disponible y «Continuar» lleva a sus salas', async () => {
    const { raiz } = await montar(() => Promise.resolve(LUGARES));
    expect(raiz.querySelector<HTMLInputElement>('input[type="radio"][value="universidad"]')!.checked).toBe(true);
    const enlace = continuar(raiz)!;
    expect(enlace.getAttribute('aria-label')).toBe('Elegir este lugar: Universidad y continuar');
    expect(enlace.textContent).toContain('Continuar');
    expect(enlace.getAttribute('href')).toContain('lugar=universidad');
    expect(raiz.querySelector('nav[aria-label="Pasos para crear el caso"]')!.textContent).toContain('Paso 1 de 2');
  });

  it('elegir otra plantilla cambia el panel de detalle y el destino de «Continuar»', async () => {
    const { raiz, listo } = await montar(() => Promise.resolve(LUGARES));
    raiz.querySelector<HTMLInputElement>('input[type="radio"][value="hospital"]')!.click();
    await listo();
    expect(raiz.querySelector('#detalle-nombre')!.textContent).toContain('Hospital');
    const inspector = raiz.querySelector('.inspector')!;
    expect(inspector.getAttribute('role')).toBe('region');
    expect(inspector.getAttribute('tabindex')).toBe('0');
    expect(inspector.getAttribute('aria-label')).toBeTruthy();
    expect(raiz.querySelector('.cifras')!.textContent).toContain('Personajes');
    expect(continuar(raiz)!.getAttribute('aria-label')).toBe('Elegir este lugar: Hospital y continuar');
  });

  it('al volver del paso 2 con ?lugar= sigue elegido el mismo lugar', async () => {
    const { raiz } = await montar(() => Promise.resolve(LUGARES), { lugar: 'hospital' });
    expect(raiz.querySelector<HTMLInputElement>('input[type="radio"][value="hospital"]')!.checked).toBe(true);
  });

  it('un lugar sin portada (por piezas) muestra el cuarto compuesto, nunca un hueco', async () => {
    const { raiz, vista } = await montar(() => Promise.resolve(LUGARES));
    expect(vista).toHaveBeenCalledWith('hospital', expect.objectContaining({ id: 'hospital-1' }));
    const arte = [...raiz.querySelectorAll<HTMLImageElement>('.plantilla img')].map((i) => i.getAttribute('src'));
    expect(arte).toContain('blob:compuesta');
  });
});
