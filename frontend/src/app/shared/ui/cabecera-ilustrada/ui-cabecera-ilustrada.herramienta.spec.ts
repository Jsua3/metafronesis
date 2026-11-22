import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { UiCabeceraIlustrada } from './ui-cabecera-ilustrada';
import type { NombreEscena } from '..';

@Component({
  imports: [UiCabeceraIlustrada],
  template: `
    <ui-cabecera-ilustrada [herramienta]="true" [escena]="escena" eyebrow="Docente" title="Reportes" description="Cómo le fue al grupo.">
      <button uiHerramientaAcciones type="button">Exportar</button>
    </ui-cabecera-ilustrada>
  `,
})
class Anfitrion {
  escena: NombreEscena | null = 'reportes';
}

// req: RNF-04 (interfaz consistente y accesible en las herramientas del docente y del administrador)
describe('RNF-04 · cabecera de herramienta (Composite: cabecera de página + viñeta + doodles)', () => {
  const crear = async (escena: NombreEscena | null) => {
    TestBed.configureTestingModule({ imports: [Anfitrion], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.componentInstance.escena = escena;
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('un solo h1 con el título y la acción proyectada en la columna de acciones de la cabecera', async () => {
    const host = await crear('reportes');
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Reportes');
    const accion = host.querySelector('.cabecera-herramienta__acciones button');
    expect(accion?.textContent?.trim()).toBe('Exportar');
  });

  it('la viñeta del simulador es decorativa y los doodles van detrás, limitados a la banda', async () => {
    const host = await crear('reportes');
    const banda = host.querySelector('ui-cabecera-ilustrada')!;
    expect(banda.id).toMatch(/^cabecera-ilustrada-\d+$/);
    expect(host.querySelector('ui-vineta')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('app-doodles')).not.toBeNull();
  });

  it('sin escena no hay viñeta (una por pantalla: si el vacío lleva la suya, la cabecera cede)', async () => {
    const host = await crear(null);
    expect(host.querySelector('ui-vineta')).toBeNull();
    expect(host.querySelector('h1')).not.toBeNull();
  });
});
