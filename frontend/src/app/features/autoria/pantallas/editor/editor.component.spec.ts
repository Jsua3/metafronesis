import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { universidad } from '../../testing/universidad';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { EditorComponent } from './editor.component';


async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [EditorComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['pasillo', 'sala-espera', 'consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(EditorComponent);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  };
  return { fixture, store, raiz: fixture.nativeElement as HTMLElement, listo };
}

const tarjeta = (raiz: HTMLElement, i: number) => raiz.querySelectorAll<HTMLButtonElement>('button.escena')[i];
const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;
const item = (texto: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent!.replace(/s+/g, ' ').trim().startsWith(texto))!;

describe('EditorComponent · aceptar toda la escena', () => {
  afterEach(() => {
    document.querySelectorAll('app-root, [ng-version]').forEach((n) => n.remove());
  });

  it('la tarjeta de la escena sugerida ofrece «Aceptar toda la escena (n partes)», baja todo y lo anuncia', async () => {
    const { store, raiz, listo } = await montar();
    const caso = structuredClone(store.caso()!);
    const escena = caso.escenas.find((e) => e.id === caso.inicioId)!;
    escena.marcaIa = true;
    escena.lineas.push({ id: 'l-ia', personajeId: caso.personajes[0].id, texto: 'Hola', expresion: 'neutral', marcaIa: true });
    store.fijar(caso);
    await listo();
    const aceptar = raiz.querySelector<HTMLButtonElement>('[data-accion="aceptar-ia"]')!;
    expect(aceptar.textContent!.trim()).toBe('Aceptar toda la escena (2 partes)');
    aceptar.click();
    await listo();
    const despues = store.caso()!.escenas.find((e) => e.id === caso.inicioId)!;
    expect([despues.marcaIa, despues.lineas[0].marcaIa]).toEqual([false, false]);
    expect(raiz.querySelector('[role="status"].solo-lector')!.textContent!.trim()).toBe('Aceptaste todo lo sugerido en esta escena.');
    expect(raiz.querySelector('[data-accion="aceptar-ia"]')).toBeNull();
    // El botón desaparece: el foco no puede caer al cuerpo de la página, va al título de la escena.
    expect(document.activeElement?.id).toBe('pe');
  });
});

describe('EditorComponent · diálogos', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = ''));
    document.querySelectorAll('app-root, [ng-version]').forEach((n) => n.remove());
  });

  it('«Conectar con…» lleva el foco al diálogo y «No conectar» lo devuelve a la escena', async () => {
    const { raiz, listo } = await montar();
    tarjeta(raiz, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await listo();
    item('Conectar con').click();
    await listo();
    expect(document.activeElement?.id).toBe('cct');
    boton(raiz, 'No conectar').click();
    await listo();
    expect(document.activeElement).toBe(tarjeta(raiz, 0));
  });

  it('Supr lleva el foco a la pregunta de borrar y, al borrar, el foco queda en una escena', async () => {
    const { raiz, listo } = await montar();
    tarjeta(raiz, 1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await listo();
    expect(document.activeElement?.id).toBe('bt');
    boton(raiz, 'Borrar la escena').click();
    await listo();
    expect(document.activeElement?.classList.contains('escena')).toBe(true);
  });

  it('A8 · la pregunta de borrar dice que se pierden el guion y las respuestas de la escena', async () => {
    const { raiz, listo } = await montar();
    tarjeta(raiz, 1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await listo();
    const texto = raiz.querySelector('#bd')!.textContent!;
    expect(texto).toContain('Se pierden su guion y sus respuestas.');
    expect(texto).toContain('No se puede deshacer.');
  });

  it('en «Conectar con…» la barra espaciadora elige una opción', async () => {
    const { raiz, listo } = await montar();
    tarjeta(raiz, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await listo();
    item('Conectar con').click();
    await listo();
    const opcion = raiz.querySelector<HTMLElement>('[role="option"]')!;
    opcion.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await listo();
    expect(opcion.getAttribute('aria-selected')).toBe('true');
  });

  // E1: los avisos ya no son una columna; los de la escena elegida van en su franja, con la misma salida rápida.
  it('un aviso de escena sin salida ofrece marcarla como final desde la franja de la escena elegida', async () => {
    const { raiz, store, listo } = await montar();
    const caso = structuredClone(store.caso()!);
    // Escrita (tiene una línea) y sin respuestas: es un callejón «por corregir», no trabajo por hacer.
    for (const e of caso.escenas) e.lineas = [{ id: `l-${e.id}`, personajeId: caso.personajes[0].id, texto: 'Hola', expresion: 'neutral', marcaIa: false }];
    store.fijar(caso);
    await listo();
    const sinSalida = store.caso()!.escenas.find((e) => !e.esFinal && e.respuestas.length === 0)!;
    tarjeta(raiz, store.caso()!.escenas.indexOf(sinSalida)).click();
    await listo();
    const boton = [...raiz.querySelectorAll<HTMLButtonElement>('.elegida__avisos button')].find((b) => b.textContent?.includes('Marcar como final'));
    expect(boton).toBeDefined();
    boton!.click();
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === sinSalida.id)!.esFinal).toBe(true);
  });

  it('E1 · un caso recién creado no muestra ningún aviso: lo que falta escribir no es un error', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('.pildora.aviso, .aviso-hito, .elegida__avisos, .boton-aviso')).toBeNull();
    expect(raiz.querySelector('[data-accion="revisar-caminos"]')!.textContent).toContain('Faltan caminos por escribir');
  });

  it('E1 · «N avisos en los caminos» elige la escena con el aviso y lo anuncia', async () => {
    const { raiz, store, listo } = await montar();
    const caso = structuredClone(store.caso()!);
    for (const e of caso.escenas) e.lineas = [{ id: `l-${e.id}`, personajeId: caso.personajes[0].id, texto: 'Hola', expresion: 'neutral', marcaIa: false }];
    store.fijar(caso);
    await listo();
    const aviso = raiz.querySelector<HTMLButtonElement>('button[data-accion="revisar-caminos"]')!;
    expect(aviso.textContent).toMatch(/\d+ avisos? en los caminos/);
    aviso.click();
    await listo();
    expect(raiz.querySelector('.elegida__avisos')).not.toBeNull();
    expect(raiz.querySelector('[role="status"].solo-lector')!.textContent!.trim().length).toBeGreaterThan(0);
  });

  it('E1 · se conservan el título «Escenas y caminos», «Abrir guion» y «Abrir sala» de la escena elegida', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('h1')!.textContent).toBe('Escenas y caminos');
    expect(raiz.querySelector('[data-accion="abrir-guion"]')!.textContent!.trim()).toBe('Abrir guion');
    expect(raiz.querySelector('[data-accion="abrir-sala"]')!.textContent!.trim()).toBe('Abrir sala');
  });

  it('los conteos usan singular con 1 (una línea, una respuesta, una escena)', async () => {
    const { raiz, store, listo } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.escenas = [caso.escenas[0]];
    caso.escenas[0].lineas = [{ id: 'l1', personajeId: caso.personajes[0].id, texto: 'x', expresion: 'neutral', marcaIa: false }];
    caso.escenas[0].respuestas = [];
    caso.inicioId = caso.escenas[0].id;
    store.fijar(caso);
    await listo();
    const texto = raiz.textContent!;
    expect(texto).not.toMatch(/\b1 (líneas|respuestas|escenas)\b/);
    expect(texto).toContain('1 línea');
  });

  it('un caso en blanco ya existente abre con su escena de inicio sin sala, lo explica y deja agregar escenas', async () => {
    const { store, raiz, listo } = await montar();
    const blanco = structuredClone(store.caso()!);
    blanco.lugarId = null;
    blanco.salas = [];
    blanco.escenas = [{ ...blanco.escenas[0], salaId: null }];
    blanco.inicioId = blanco.escenas[0].id;
    store.fijar(blanco);
    await listo();
    expect(raiz.querySelector('[data-sin-salas]')!.textContent).toContain('no tiene salas de un lugar de la biblioteca');
    boton(raiz, 'Agregar una escena').click();
    await listo();
    expect(store.caso()!.escenas).toHaveLength(2);
    expect(store.caso()!.escenas[1].salaId).toBeNull();
  });

  it('un caso con salas no muestra esa explicación', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('[data-sin-salas]')).toBeNull();
  });
});
