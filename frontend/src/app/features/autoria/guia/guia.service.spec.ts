import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';

import { cuentaDePrueba } from '../testing/cuenta';
import { universidad } from '../testing/universidad';
import { AutoriaShellComponent } from '../autoria-shell.component';
import { rutasDePrueba } from '../testing/rutas';
import { CasoStore } from '../estado/caso.store';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { ACCIONES, buscarAcciones } from './acciones';
import { GuiaService } from './guia.service';


async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [AutoriaShellComponent],
    providers: [
      provideRouter(rutasDePrueba, withComponentInputBinding()),
      { provide: BibliotecaService, useValue: { escenario: async () => universidad, lugares: async () => [] } },
      cuentaDePrueba,
    ],
  }).compileComponents();
  TestBed.inject(CasoStore).fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(AutoriaShellComponent);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  return { fixture, guia: TestBed.inject(GuiaService), router: TestBed.inject(Router), store: TestBed.inject(CasoStore), raiz: fixture.nativeElement as HTMLElement, listo };
}

describe('GuiaService', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('mostrar navega a la pantalla de la acción y mueve el foco al elemento', async () => {
    const { guia, router, store, listo } = await montar();
    await guia.mostrar('agregar-linea', 'foco');
    await listo();
    expect(router.url).toBe(`/portal/casos/${store.caso()!.id}/editor/escena/${store.caso()!.escenas[0].id}`);
    expect(document.activeElement?.getAttribute('data-accion')?.split(' ')).toContain('agregar-linea');
    expect(guia.activa()).toMatchObject({ accionId: 'agregar-linea', modo: 'foco', paso: 0 });
  });

  it('Esc cierra la guía y devuelve el foco a donde estaba', async () => {
    const { guia, raiz, listo } = await montar();
    const botonGuia = raiz.querySelector<HTMLButtonElement>('button[data-accion~="guia"]')!;
    botonGuia.focus();
    await guia.mostrar('agregar-escena', 'resaltar');
    await listo();
    expect(document.activeElement).not.toBe(botonGuia);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await listo();
    expect(guia.activa()).toBeNull();
    expect(document.activeElement).toBe(botonGuia);
  });

  it('el recorrido avanza con Siguiente y termina en el último paso', async () => {
    const { guia, raiz, listo } = await montar();
    await guia.mostrar('cambiar-expresion', 'recorrido');
    await listo();
    const pasos = ACCIONES.find((a) => a.id === 'cambiar-expresion')!.pasos!;
    expect(raiz.textContent).toContain(`Paso 1 de ${pasos.length}`);
    expect(raiz.textContent).toContain(pasos[0]);
    const siguiente = () => [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => /^(Siguiente|Terminar)$/.test(b.textContent!.trim()))!;
    siguiente().click();
    await listo();
    expect(raiz.textContent).toContain(`Paso 2 de ${pasos.length}`);
    siguiente().click();
    await listo();
    expect(siguiente().textContent!.trim()).toBe('Terminar');
    siguiente().click();
    await listo();
    expect(guia.activa()).toBeNull();
  });

  it('con prefers-reduced-motion no se aplican animaciones', async () => {
    // addListener/removeListener: el BreakpointObserver del CDK (que usa el marco del estudio) los llama al montar; sin
    // ellos la prueba pasaba pero dejaba un error suelto que ponía en rojo la corrida completa (2026-11-22).
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    const { guia, raiz, listo } = await montar();
    await guia.mostrar('agregar-escena', 'foco');
    await listo();
    expect(raiz.querySelector('.guia')!.classList).toContain('sin-movimiento');
  });

  it('cada acción de ACCIONES tiene un elemento con su data-accion en su pantalla', async () => {
    const { guia, listo } = await montar();
    expect(ACCIONES.length).toBeGreaterThanOrEqual(20);
    const faltan: string[] = [];
    for (const a of ACCIONES) {
      await guia.mostrar(a.id, 'resaltar');
      await listo();
      if (!document.querySelector(`[data-accion~="${a.id}"]`) || !guia.activa()?.encontrado) faltan.push(`${a.id} (${a.ruta || 'cabecera'})`);
      guia.cerrar();
    }
    expect(faltan).toEqual([]);
  });

  it('el buscador entiende las palabras del docente', () => {
    expect(buscarAcciones('cara')[0].id).toBe('cambiar-expresion');
    expect(buscarAcciones('cómo hago que una respuesta abra un camino')[0].id).toBe('respuesta-a-escena-nueva');
    expect(buscarAcciones('').length).toBe(ACCIONES.length);
  });
});
