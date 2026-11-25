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
    expect(boton.querySelector('.solo-lector')!.textContent).toContain('falta completar la revisión');
    boton.click();
    await listo();

    const hoja = document.querySelector<HTMLElement>('.ui-sheet-pane app-panel-pendientes')!;
    expect(hoja).not.toBeNull();
    expect(hoja.querySelector('h2')!.textContent).toBe('Pendientes del caso');
    const sugerencias = hoja.querySelector<HTMLDetailsElement>('.pp__sugerencias')!;
    expect(sugerencias.textContent).toContain('no impiden enviar');
    sugerencias.open = true;
    const llevar = [...hoja.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label')?.includes('no lleva a ninguna escena'))!;
    expect(llevar.textContent!.trim()).toBe('Ir');
    llevar.click();
    await listo();
    await new Promise((res) => setTimeout(res, 50));
    expect(TestBed.inject(Router).url).toBe(`/portal/casos/41/editor/escena/${escena.id}`);
  });
  it('agrupa los textos de muestra por escena', async () => {
    const { raiz, listo, store } = await abrirEditor('/portal/casos/41/editor/datos');
    const escena = store.caso()!.escenas[0];
    const r = store.agregarRespuesta(escena.id);
    store.editarRespuesta(escena.id, r, { texto: 'Respuesta 1 de la persona profesional.', retroalimentacion: '[retroalimentacion]' });
    await listo();
    raiz.querySelector<HTMLButtonElement>('header button[data-accion="ver-pendientes"]')!.click();
    await listo();
    const hoja = document.querySelector<HTMLElement>('app-panel-pendientes')!;
    expect(hoja.querySelector('.pp__sugerencias')?.textContent).toContain('2 textos de muestra');
    expect(hoja.querySelectorAll('.pp__grupo:not(.pp__sugerencias .pp__grupo)').length).toBe(0);
    expect(hoja.textContent).toContain('Respuesta 1 \u00b7 texto');
    expect(hoja.textContent).toContain('Respuesta 1 \u00b7 retroalimentaci\u00f3n');
  });

  it('con el caso publicado no invita a enviarlo: dice por qué no hay nada que hacer y no ofrece «Ir a Enviar»', async () => {
    const { raiz, listo } = await abrirEditor('/portal/casos/41/editor/datos', { estado: 'PUBLISHED' });
    raiz.querySelector<HTMLButtonElement>('header button[data-accion="ver-pendientes"]')!.click();
    await listo();
    const hoja = document.querySelector<HTMLElement>('app-panel-pendientes')!;
    expect(hoja.textContent).toContain('El caso está publicado');
    expect(hoja.textContent).not.toContain('envíalo a Psicología');
    expect(hoja.textContent).not.toContain('impiden enviar');
    expect([...hoja.querySelectorAll('button')].some(b => b.textContent?.includes('Ir a Enviar'))).toBe(false);
  });

  it('las sugerencias plegadas muestran una marca de que se despliegan', async () => {
    const { raiz, listo, store } = await abrirEditor('/portal/casos/41/editor/datos');
    const escena = store.caso()!.escenas[0];
    const r = store.agregarRespuesta(escena.id);
    store.editarRespuesta(escena.id, r, { texto: 'Te escucho.', clase: 'RECOMMENDED', retroalimentacion: 'Bien.' });
    await listo();
    raiz.querySelector<HTMLButtonElement>('header button[data-accion="ver-pendientes"]')!.click();
    await listo();
    const resumen = document.querySelector<HTMLElement>('.pp__sugerencias summary')!;
    expect(resumen.querySelector('.pp__chevron')).not.toBeNull();
  });

  it('con cero pendientes ofrece ir a Enviar', async () => {
    const { raiz, listo, store } = await abrirEditor('/portal/casos/41/editor/datos');
    store.registrarRevision([]);
    await listo();
    raiz.querySelector<HTMLButtonElement>('header button[data-accion="ver-pendientes"]')!.click();
    await listo();
    const hoja = document.querySelector<HTMLElement>('app-panel-pendientes')!;
    const boton = [...hoja.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Ir a Enviar'))!;
    expect(boton).toBeTruthy();
    boton.click();
    await listo();
    expect(TestBed.inject(Router).url).toBe('/portal/casos/41/editor/revision');
  });

});
