import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { abrirEditor } from './marco.testing';

// req: EDITOR.md §4.1 (el riel de escenas, versión básica de E0) y §7.3 E0 (compatibilidad: el riel solo en Historia)
describe('RielDeEscenasComponent', () => {
  afterEach(() => document.querySelectorAll('body > [ng-version]').forEach((n) => n.remove()));

  it('en la etapa Historia lista las escenas en orden con número, título y estado, y marca la abierta', async () => {
    const { raiz, store, harness, listo } = await abrirEditor('/portal/casos/41/editor');
    expect(raiz.querySelector('app-riel-de-escenas')).not.toBeNull();
    const primera = store.caso()!.escenas[0];
    await harness.navigateByUrl(`/portal/casos/41/editor/escena/${primera.id}`);
    await listo();
    const filas = [...raiz.querySelectorAll<HTMLAnchorElement>('app-riel-de-escenas .riel__lista a')];
    expect(filas).toHaveLength(store.caso()!.escenas.length);
    expect(filas[0].querySelector('.riel__numero')!.textContent).toBe('1');
    expect(filas[0].getAttribute('title')).toBe(primera.titulo);
    expect(filas[0].querySelector('.solo-lector')!.textContent).toMatch(new RegExp(`^Escena 1, ${primera.titulo}: `));
    expect(filas[0].getAttribute('aria-current')).toBe('page');
    expect(filas.every((a) => !!a.querySelector('.marca-estado')!.getAttribute('data-estado'))).toBe(true);
  });

  it('«Siguiente paso» está arriba y lleva al sitio', async () => {
    const { raiz, listo, store } = await abrirEditor('/portal/casos/41/editor');
    const boton = raiz.querySelector<HTMLButtonElement>('app-riel-de-escenas [data-accion="siguiente-paso"]')!;
    expect(boton.textContent!.trim().length).toBeGreaterThan(0);
    // Con una escena vacía, el paso es escribirla.
    const vacia = store.caso()!.escenas.find((e) => !e.lineas.length && !e.respuestas.length);
    if (vacia) {
      expect(boton.textContent).toContain('Escribe la escena');
      boton.click();
      await listo();
      await new Promise((r) => setTimeout(r, 0));
      expect(TestBed.inject(Router).url).toContain('/editor/escena/');
    }
  });

  it('fuera de la etapa Historia no se pinta: el contenido ocupa todo el ancho', async () => {
    const { raiz } = await abrirEditor('/portal/casos/41/editor/datos');
    expect(raiz.querySelector('app-riel-de-escenas')).toBeNull();
    expect(raiz.querySelector('.cuerpo')!.classList).not.toContain('con-riel');
  });

  it('en el teléfono el riel es un selector «Escena N de M»', async () => {
    const { raiz, store } = await abrirEditor('/portal/casos/41/editor');
    const opciones = [...raiz.querySelectorAll<HTMLOptionElement>('app-riel-de-escenas select option')].map((o) => o.textContent!.trim());
    expect(opciones[0]).toBe('Todas las escenas y sus caminos');
    expect(opciones[1].startsWith(`Escena 1 de ${store.caso()!.escenas.length} · ${store.caso()!.escenas[0].titulo}`)).toBe(true);
    // Un select no lleva iconos: el estado de cada escena va en palabras.
    const vacia = store.caso()!.escenas[0].lineas.length === 0 && store.caso()!.escenas[0].respuestas.length === 0;
    if (vacia) expect(opciones[1]).toMatch(/ · por escribir$/);
  });
  // req: EDITOR.md §3.4 y §7.3 E1 (riel completo: conmutador, marcas con palabras, «Sin conexión», Alt+↓ y Alt+M)
  it('E1 · el conmutador «Guion | Caminos» dice cuál es la vista actual y «Guion» vuelve a la última escena abierta', async () => {
    const { raiz, store, harness, listo } = await abrirEditor('/portal/casos/41/editor');
    const vista = (v: string) => raiz.querySelector<HTMLAnchorElement>(`app-riel-de-escenas [data-vista="${v}"]`)!;
    expect(vista('caminos').getAttribute('aria-current')).toBe('page');
    expect(vista('guion').getAttribute('aria-current')).toBeNull();
    const segunda = store.caso()!.escenas[1];
    await harness.navigateByUrl(`/portal/casos/41/editor/escena/${segunda.id}`);
    await listo();
    expect(vista('guion').getAttribute('aria-current')).toBe('page');
    await harness.navigateByUrl('/portal/casos/41/editor');
    await listo();
    expect(vista('guion').getAttribute('href')).toContain(`/editor/escena/${segunda.id}`);
  });

  it('E1 · cada fila dice con palabras Inicio, Final, IA y su estado, y lleva la miniatura de su sala (nunca un src vacío)', async () => {
    const { raiz, store, listo } = await abrirEditor('/portal/casos/41/editor');
    const caso = structuredClone(store.caso()!);
    const [a, b] = caso.escenas;
    b.esFinal = true;
    b.marcaIa = true;
    a.lineas = [{ id: 'l1', personajeId: caso.personajes[0].id, texto: 'Hola', expresion: 'neutral', marcaIa: false }];
    a.respuestas = [{ id: 'r1', texto: 'Ir', clase: 'RECOMMENDED', razon: '', retroalimentacion: '', destinoId: b.id, efectos: {}, marcaIa: false }];
    store.fijar(caso);
    await listo();
    const filas = [...raiz.querySelectorAll<HTMLAnchorElement>('app-riel-de-escenas .riel__lista a')];
    const marcas = (f: HTMLElement) => f.querySelector('.riel__marcas')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(marcas(filas[0])).toContain('Inicio');
    expect(marcas(filas[0])).toMatch(/Completa|Le falta/);
    expect(marcas(filas[1])).toContain('Final');
    expect(marcas(filas[1])).toContain('IA');
    expect(marcas(filas[1])).toContain('Sin escribir');
    expect(filas[1].querySelector('.solo-lector')!.textContent).toContain('es un final');
    for (const img of raiz.querySelectorAll<HTMLImageElement>('app-riel-de-escenas img')) expect(img.getAttribute('src')).toBeTruthy();
  });

  it('E1 · las escenas que ninguna respuesta alcanza van al final, bajo «Sin conexión»', async () => {
    const { raiz, store, listo } = await abrirEditor('/portal/casos/41/editor');
    const caso = structuredClone(store.caso()!);
    for (const e of caso.escenas) e.respuestas = [];
    store.fijar(caso);
    await listo();
    expect(raiz.querySelector('app-riel-de-escenas .riel__grupo')!.textContent).toContain('Sin conexión');
    const listas = raiz.querySelectorAll('app-riel-de-escenas .riel__lista');
    expect(listas).toHaveLength(2);
    expect(listas[0].querySelectorAll('a')).toHaveLength(1); // solo el inicio se alcanza
  });

  it('E1 · Alt+↓ y Alt+↑ pasan a la escena siguiente o anterior de la historia; Alt+M cambia a Caminos', async () => {
    const { store, harness, listo } = await abrirEditor('/portal/casos/41/editor');
    const caso = structuredClone(store.caso()!);
    const [a, b] = caso.escenas;
    a.respuestas = [{ id: 'r1', texto: 'Ir', clase: 'RECOMMENDED', razon: '', retroalimentacion: '', destinoId: b.id, efectos: {}, marcaIa: false }];
    store.fijar(caso);
    await harness.navigateByUrl(`/portal/casos/41/editor/escena/${a.id}`);
    await listo();
    const router = TestBed.inject(Router);
    const pulsar = async (init: KeyboardEventInit) => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, bubbles: true, cancelable: true, ...init }));
      await listo();
      await new Promise((r) => setTimeout(r, 0));
    };
    await pulsar({ key: 'ArrowDown' });
    expect(router.url).toContain(`/editor/escena/${b.id}`);
    await pulsar({ key: 'ArrowUp' });
    expect(router.url).toContain(`/editor/escena/${a.id}`);
    await pulsar({ key: 'm', code: 'KeyM' });
    expect(router.url).toMatch(/\/editor$/);
  });

  it('E1 · Alt+↓ no actúa sobre una lista desplegable (allí abre la lista)', async () => {
    const { store, harness, listo } = await abrirEditor('/portal/casos/41/editor');
    const primera = store.caso()!.escenas[0];
    await harness.navigateByUrl(`/portal/casos/41/editor/escena/${primera.id}`);
    await listo();
    const lista = document.createElement('select');
    document.body.appendChild(lista);
    const evento = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true });
    lista.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    lista.remove();
    expect(TestBed.inject(Router).url).toContain(`/editor/escena/${primera.id}`);
  });
});
