import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { abrirEditor } from './marco.testing';

// req: EDITOR.md §3.6 (la única lista de pendientes del editor, por etapa) y §7.3 E0
describe('PanelPendientesComponent', () => {
  afterEach(() => {
    document.querySelectorAll('body > [ng-version]').forEach((n) => n.remove());
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => (n.innerHTML = ''));
  });

  it('«Pendientes» abre una hoja con lo que hay que corregir, por etapa, y «Llévame ahí» cierra la hoja y lleva al sitio', async () => {
    const { raiz, listo, store } = await abrirEditor('/portal/casos/41/editor/datos');
    // Una respuesta sin destino: algo «por corregir» de la historia.
    const escena = store.caso()!.escenas[0];
    const r = store.agregarRespuesta(escena.id);
    store.editarRespuesta(escena.id, r, { texto: 'Te escucho.', clase: 'RECOMMENDED', retroalimentacion: 'Bien.' });
    await listo();

    const boton = raiz.querySelector<HTMLButtonElement>('header button[data-accion="ver-pendientes"]')!;
    expect(boton.querySelector('.solo-lector')!.textContent).toMatch(/^Pendientes: \d+ por corregir$/);
    boton.click();
    await listo();

    const hoja = document.querySelector<HTMLElement>('.ui-sheet-pane app-panel-pendientes')!;
    expect(hoja).not.toBeNull();
    expect(hoja.querySelector('h2')!.textContent).toBe('Pendientes del caso');
    const historia = hoja.querySelector('#pp-historia')!;
    expect(historia.textContent).toBe('Historia: escenas y guion');
    const llevar = [...hoja.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label')?.includes('no lleva a ninguna escena'))!;
    expect(llevar.textContent!.trim()).toBe('Llévame ahí');
    llevar.click();
    await listo();
    await new Promise((res) => setTimeout(res, 50));
    expect(TestBed.inject(Router).url).toBe(`/portal/casos/41/editor/escena/${escena.id}`);
  });
});
