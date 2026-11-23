import { readFileSync } from 'fs';
import { join } from 'path';

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FocoGuiaComponent } from './foco-guia.component';
import { GuiaService } from './guia.service';

describe('FocoGuiaComponent', () => {
  it('en el recorrido el anillo y el foco siguen al elemento de cada paso, y Alt+flechas avanzan sin ratón', async () => {
    await TestBed.configureTestingModule({ imports: [FocoGuiaComponent], providers: [provideRouter([{ path: '**', children: [] }])] }).compileComponents();
    const main = document.createElement('main');
    main.innerHTML = `
      <ul id="lista" data-accion="cambiar-expresion" tabindex="0"></ul>
      <section class="columna-detalles"><button id="uno">Uno</button></section>
      <div class="escenario"><button id="retrato" data-elemento="personaje-0">Cara</button></div>`;
    document.body.appendChild(main);
    const fixture = TestBed.createComponent(FocoGuiaComponent);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const guia = TestBed.inject(GuiaService);
    const listo = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
    };

    await guia.mostrar('cambiar-expresion', 'recorrido');
    await listo();
    expect(guia.elemento()!.id).toBe('lista');
    expect(document.activeElement!.id).toBe('lista');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(guia.activa()!.paso).toBe(1);
    expect(guia.elemento()!.className).toContain('columna-detalles');
    expect(document.activeElement).toBe(guia.elemento());

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(guia.elemento()!.id).toBe('retrato');
    expect(document.activeElement!.id).toBe('retrato');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(guia.activa()!.paso).toBe(1);
    expect(guia.elemento()!.className).toContain('columna-detalles');
    expect(fixture.nativeElement.textContent).toContain('Alt');

    guia.cerrar();
    main.remove();
    fixture.nativeElement.remove();
  });

  // req: EDITOR.md §4.7 y §7.3 E0, criterio 7: la guía ya no usa el violeta (que es el color de acción).
  it('la guía se marca con un anillo discontinuo de --guia (= --ds-info) y la palabra «Guía»', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [FocoGuiaComponent], providers: [provideRouter([{ path: '**', children: [] }])] }).compileComponents();
    const main = document.createElement('main');
    main.innerHTML = '<button data-accion="buscar">Ayuda</button>';
    document.body.appendChild(main);
    const fixture = TestBed.createComponent(FocoGuiaComponent);
    document.body.appendChild(fixture.nativeElement);
    await TestBed.inject(GuiaService).mostrar('buscar', 'foco');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.anillo .aqui')!.textContent).toBe('Guía');
    const fuente = readFileSync(join(__dirname, 'foco-guia.component.ts'), 'utf-8');
    expect(fuente).toMatch(/\.anillo \{[^}]*border: 4px dashed var\(--guia\)/);
    const piel = readFileSync(join(__dirname, '../../../../styles/skins/_autoria.scss'), 'utf-8');
    expect(piel).toContain('--guia: var(--ds-info);');
    TestBed.inject(GuiaService).cerrar();
    main.remove();
    fixture.nativeElement.remove();
  });
});
