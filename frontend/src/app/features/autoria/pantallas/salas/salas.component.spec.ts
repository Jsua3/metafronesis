import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { Subject, of } from 'rxjs';

import { AuthoringApi } from '../../../../core/api/authoring.api';

import { universidad } from '../../testing/universidad';
import { rutasDePrueba } from '../../testing/rutas';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { Escenario } from '../../modelo/escenario';
import { SalasComponent, conArticulo } from './salas.component';


const GENERACION_ENCENDIDA = { enabled: true, remainingToday: 5, inProgress: null };

async function montar(createCase = vi.fn(() => of({ caseVersionId: 77 })), estadoGeneracion: unknown = GENERACION_ENCENDIDA) {
  await TestBed.configureTestingModule({
    imports: [SalasComponent],
    providers: [
      provideRouter(rutasDePrueba),
      { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
      { provide: AuthoringApi, useValue: { createCase, generationStatus: () => of(estadoGeneracion), libraryPlaces: () => of([]) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SalasComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, raiz: fixture.nativeElement as HTMLElement, createCase };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(texto));

const marcadas = (raiz: HTMLElement) =>
  [...raiz.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter((c) => c.checked).map((c) => c.value);

describe('SalasComponent', () => {
  it('ofrece las dos formas de empezar y «Elegir salas a mano» deja la pantalla de siempre', async () => {
    const { fixture, raiz } = await montar();
    const grupo = raiz.querySelector('fieldset.forma')!;
    expect(grupo.querySelector('legend')!.textContent).toContain('¿Cómo quieres empezar?');
    const radios = [...grupo.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => r.value)).toEqual(['describe', 'a-mano']);
    expect(grupo.textContent).toContain('La IA arma un borrador completo a partir de tu descripción. Tú lo revisas y lo cambias.');
    expect(grupo.textContent).toContain('Eliges las salas y escribes tú cada escena.');

    // «a mano» es lo de hoy: ideas, lista de salas y barra de crear
    expect(radios[1].checked).toBe(true);
    expect(raiz.querySelector('#ideas')).toBeTruthy();
    expect(raiz.querySelector('[data-accion="elegir-salas"]')).toBeTruthy();
    expect(boton(raiz, 'Crear el caso con estas salas')).toBeTruthy();
    expect(raiz.querySelector('app-describir')).toBeNull();
    fixture.detectChanges();
  });

  it('«Describe tu caso» muestra el formulario de describir en vez de las ideas y las salas', async () => {
    const { fixture, raiz } = await montar();
    raiz.querySelector<HTMLInputElement>('input[value="describe"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(raiz.querySelector('app-describir')).toBeTruthy();
    expect(raiz.querySelector('#ideas')).toBeNull();
    expect(boton(raiz, 'Crear el caso con estas salas')).toBeUndefined();

    raiz.querySelector<HTMLInputElement>('input[value="a-mano"]')!.click();
    fixture.detectChanges();
    expect(raiz.querySelector('app-describir')).toBeNull();
    expect(raiz.querySelector('#ideas')).toBeTruthy();
  });

  it('pasar a «Elegir salas a mano» y volver no borra la descripción que la docente ya escribió', async () => {
    const { fixture, raiz } = await montar();
    raiz.querySelector<HTMLInputElement>('input[value="describe"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const texto = 'Una estudiante llega a Bienestar después de una noche difícil en casa y no quiere hablar.';
    const campo = raiz.querySelector<HTMLTextAreaElement>('#descripcion')!;
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    raiz.querySelector<HTMLInputElement>('input[value="a-mano"]')!.click();
    fixture.detectChanges();
    raiz.querySelector<HTMLInputElement>('input[value="describe"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(raiz.querySelector<HTMLTextAreaElement>('#descripcion')!.value).toBe(texto);
  });

  it('con una generación en curso entra en «Describe tu caso» y se ve el aviso de retomar', async () => {
    const { fixture, raiz } = await montar(undefined, {
      enabled: true, remainingToday: 4,
      inProgress: { id: 'g-7', lugarId: 'universidad', status: 'skeleton_ready', scenes: [] },
    });
    for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); fixture.detectChanges(); }

    expect(raiz.querySelector<HTMLInputElement>('input[value="describe"]')!.checked).toBe(true);
    expect(raiz.querySelector('app-describir')).toBeTruthy();
    expect(raiz.textContent).toContain('Tienes un caso a medio generar');
    expect(raiz.querySelector('#ideas')).toBeNull();
  });

  it('si el estado de la generación llega tarde, no cambia a «Describe tu caso» a quien ya empezó a mano (Codex, hallazgo 3)', async () => {
    const estado = new Subject<unknown>();
    await TestBed.configureTestingModule({
      imports: [SalasComponent],
      providers: [
        provideRouter(rutasDePrueba),
        { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
        { provide: AuthoringApi, useValue: { createCase: vi.fn(), generationStatus: () => estado, libraryPlaces: () => of([]) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SalasComponent);
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 0)); fixture.detectChanges(); }
    const raiz = fixture.nativeElement as HTMLElement;
    raiz.querySelector<HTMLInputElement>('.salas input[type="checkbox"]')!.click();
    fixture.detectChanges();

    estado.next({ enabled: true, remainingToday: 4, inProgress: { id: 'g-7', lugarId: 'universidad', status: 'skeleton_ready', scenes: [] } });
    estado.complete();
    for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); fixture.detectChanges(); }

    expect(raiz.querySelector<HTMLInputElement>('input[value="a-mano"]')!.checked).toBe(true);
    expect(raiz.querySelector('app-describir')).toBeNull();
    expect(raiz.querySelector('#ideas')).toBeTruthy();
  });

  it('con la generación apagada no se ofrece nada de la IA: ni opciones apagadas ni el motivo', async () => {
    const { fixture, raiz } = await montar(undefined, { enabled: false, remainingToday: 0, inProgress: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(raiz.querySelector('fieldset.forma')).toBeNull();
    expect(raiz.querySelector('input[type="radio"]')).toBeNull();
    expect(raiz.querySelector('input:disabled, button:disabled, [aria-disabled="true"]')).toBeNull();
    // Y el nombre del caso es lo primero que se ve para escribir.
    expect(raiz.querySelector('input, textarea')!.id).toBe('nombre-caso');
  });

  it('elegir un recorrido sugerido marca sus salas', async () => {
    const { fixture, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Atención en Bienestar"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(marcadas(raiz)).toEqual(['pasillo', 'sala-espera', 'consultorio']);
    expect(raiz.textContent).toContain('1. Pasillo de facultad, 2. Sala de espera de Bienestar, 3. Consultorio de atención psicológica');
  });

  it('sin salas elegidas el botón crear sigue disponible y, al pulsarlo, dice qué falta sin crear nada', async () => {
    const { fixture, raiz, createCase } = await montar();
    expect(raiz.textContent).toContain('Ninguna sala elegida');
    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('Elige al menos una sala');
    expect(createCase).not.toHaveBeenCalled();
  });

  it('crear manda el lugar y las salas elegidas, en su orden, y abre el editor del caso creado', async () => {
    const { fixture, raiz, createCase } = await montar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Crisis en un espacio común"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();

    expect(createCase).toHaveBeenCalledWith(expect.objectContaining({ title: 'Crisis en un espacio común', lugarId: 'universidad', salas: ['cafeteria', 'enfermeria', 'consultorio'] }));
    // El caso nace con la descripción de la idea elegida: es el contexto que lee el estudiante y la compuerta de publicación la exige.
    expect(createCase).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/\S/) }));
    expect(navegar).toHaveBeenCalledWith('/portal/casos/77/editor');
  });

  it('si el servidor no lo crea, lo dice y deja volver a intentarlo', async () => {
    const { fixture, raiz, createCase } = await montar(vi.fn(() => throwError(() => new Error('falla'))));
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Atención en Bienestar"]')!.click();
    await fixture.whenStable();
    boton(raiz, 'Crear el caso con estas salas')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[role="alert"]')!.textContent).toContain('No se pudo crear el caso');
    expect(navegar).not.toHaveBeenCalled();
    expect(boton(raiz, 'Crear el caso con estas salas')).toBeTruthy(); // el botón vuelve a estar disponible
    expect(createCase).toHaveBeenCalledTimes(1);
  });

  it('las flechas de orden cambian el orden de las escenas', async () => {
    const { fixture, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Usar esta idea: Atención en Bienestar"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Subir Sala de espera de Bienestar"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.textContent).toContain('1. Sala de espera de Bienestar, 2. Pasillo de facultad');
  });

  it('bajo el nombre dice cómo se llamará si queda vacío, sin prometer cambiarlo después', async () => {
    const { raiz } = await montar();
    const ayuda = raiz.querySelector('#nombre-caso')!.parentElement!.textContent!;
    expect(ayuda).not.toContain('Puedes cambiarlo después');
    expect(ayuda).toContain('Si lo dejas vacío, se llamará «Caso nuevo en la universidad».');
  });

  it('«Ver sala» abre la vista previa con teclado o con toque y vuelve a cerrarla', async () => {
    const { fixture, raiz } = await montar();
    const ver = raiz.querySelector<HTMLButtonElement>('button[aria-label^="Ver sala:"]')!;
    ver.click();
    fixture.detectChanges();
    expect(raiz.querySelector('#vista-sala')).toBeTruthy();
    expect(ver.getAttribute('aria-expanded')).toBe('true');
    ver.click();
    fixture.detectChanges();
    expect(raiz.querySelector('#vista-sala')).toBeNull();
  });
});

describe('RF-05 · CU-04 crear un caso: el nombre por defecto concuerda con el lugar', () => {
  it('«la universidad», «el hospital», «la comisaría de familia», «la casa»', () => {
    expect(conArticulo('Universidad')).toBe('la universidad');
    expect(conArticulo('Hospital')).toBe('el hospital');
    expect(conArticulo('Comisaría de familia')).toBe('la comisaría de familia');
    expect(conArticulo('Casa')).toBe('la casa');
  });
});
