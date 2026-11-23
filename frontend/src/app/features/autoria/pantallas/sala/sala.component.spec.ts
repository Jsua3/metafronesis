import { readFileSync } from 'fs';
import { join } from 'path';

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { provideRouter } from '@angular/router';

import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { universidad } from '../../testing/universidad';
import { CASO_HOSPITAL } from '../../testing/hospital';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { SalaComponent } from './sala.component';
import { FABRICA_DE_JUEGO_DE_SALA } from './lienzo-de-sala.component';
import { primerHueco } from '../../modelo/arrastre-en-muro';
import { largoMuro } from '../../modelo/geometria';


/** `respuestaDelAviso`: lo que elige el docente cuando el editor le pregunta antes de quitar a la última persona. */
async function montar(respuestaDelAviso: 'continue' | 'proceed' = 'proceed') {
  localStorage.clear();
  TestBed.resetTestingModule();
  const consequence = vi.fn(async () => respuestaDelAviso);
  await TestBed.configureTestingModule({
    imports: [SalaComponent],
    providers: [
      { provide: CatalogoDePiezas, useValue: { manifiesto: signal(null), reglas: signal(null), error: signal(false) } },
      { provide: FABRICA_DE_JUEGO_DE_SALA, useValue: () => ({ destruir: () => {} }) },
      provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
      { provide: UiDialog, useValue: { consequence } },
    ],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(SalaComponent);
  fixture.componentRef.setInput('salaId', 'consultorio');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, store, consequence, raiz: fixture.nativeElement as HTMLElement };
}

const tecla = (el: Element, key: string, extra: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra }));

describe('SalaComponent', () => {
  it('agregar, quitar y reordenar puntos con teclado se deshace', async () => {
    const { fixture, store, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!.click();
    fixture.detectChanges();
    [...raiz.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Recorre un trayecto')!.click();
    fixture.detectChanges();
    const movimiento = () => store.caso()!.salas[0].personajes[0].movimiento as
      { tipo: 'ruta'; puntos: { x: number; y: number }[] };
    const inicial = structuredClone(movimiento().puntos);
    const punto = raiz.querySelector<HTMLElement>('app-trayecto-de-persona li button')!;
    tecla(punto, 'ArrowRight'); fixture.detectChanges();
    expect(movimiento().puntos[0].x).toBe(inicial[0].x + 8);
    raiz.querySelector<HTMLButtonElement>('[data-agregar]')!.click(); fixture.detectChanges();
    expect(movimiento().puntos.length).toBe(3);
    raiz.querySelector<HTMLButtonElement>('[data-subir="1"]')!.click(); fixture.detectChanges();
    raiz.querySelector<HTMLButtonElement>('[data-quitar="1"]')!.click(); fixture.detectChanges();
    expect(movimiento().puntos.length).toBe(2);
    for (let i = 0; i < 4; i++) store.deshacer();
    fixture.detectChanges();
    expect(movimiento().puntos).toEqual(inicial);
  });

  it('un punto del trayecto se mueve con Mayús y flechas y Ctrl+Z / Ctrl+Y desde el mismo punto lo deshacen y rehacen', async () => {
    const { fixture, store, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!.click();
    fixture.detectChanges();
    [...raiz.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Recorre un trayecto')!.click();
    fixture.detectChanges();
    const puntos = () => (store.caso()!.salas[0].personajes[0].movimiento as { puntos: { x: number; y: number }[] }).puntos;
    const inicial = structuredClone(puntos());
    const punto = () => raiz.querySelector<HTMLElement>('app-trayecto-de-persona li button')!;
    tecla(punto(), 'ArrowDown', { shiftKey: true }); fixture.detectChanges();
    expect(puntos()[0]).toEqual({ x: inicial[0].x, y: inicial[0].y + 1 });
    tecla(punto(), 'ArrowLeft'); fixture.detectChanges();
    expect(puntos()[0]).toEqual({ x: inicial[0].x - 8, y: inicial[0].y + 1 });
    tecla(punto(), 'z', { ctrlKey: true }); fixture.detectChanges();
    expect(puntos()[0]).toEqual({ x: inicial[0].x, y: inicial[0].y + 1 });
    tecla(punto(), 'z', { ctrlKey: true }); fixture.detectChanges();
    expect(puntos()).toEqual(inicial);
    tecla(punto(), 'y', { ctrlKey: true }); fixture.detectChanges();
    expect(puntos()[0]).toEqual({ x: inicial[0].x, y: inicial[0].y + 1 });
    // En la casilla de la pausa Ctrl+Z es del texto: no toca el borrador.
    tecla(raiz.querySelector('app-trayecto-de-persona input')!, 'z', { ctrlKey: true }); fixture.detectChanges();
    expect(puntos()[0]).toEqual({ x: inicial[0].x, y: inicial[0].y + 1 });
  });

  it('agregar una ventana la deja elegida y enfocada en el primer hueco del fondo', async () => {
    const { fixture, store, raiz } = await montar();
    const catalogo = TestBed.inject(CatalogoDePiezas);
    const ficha = { nombre: 'Ventana alta', ocupa: 40, franja: [0, 40] as [number, number], muros: ['fondo'] };
    const falso = catalogo as unknown as { manifiesto: ReturnType<typeof signal<unknown>>; paleta: () => unknown; acabados: () => unknown };
    falso.manifiesto.set({ piezas: { 'ventana/alta': ficha }, pisos: {}, muros: {} });
    falso.paleta = () => [{ clave: 'ventanas', nombre: 'Ventanas', modelos: [
      { tipo: 'ventana', modelo: 'alta', nombre: 'Ventana alta', muros: ['fondo'] },
    ] }];
    falso.acabados = () => ({ pisos: [], muros: [] });
    const caso = structuredClone(CASO_HOSPITAL);
    caso.salas[0].estructura!.piezas = [];
    caso.salas[0].puertas = [];
    store.fijar(caso); fixture.componentRef.setInput('salaId', caso.salas[0].id);
    document.body.appendChild(raiz);
    try {
      fixture.detectChanges();
      raiz.querySelector<HTMLButtonElement>('[data-modelo="alta"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise(resolve => setTimeout(resolve, 0));
      fixture.detectChanges();
      const pieza = store.caso()!.salas[0].estructura!.piezas!.at(-1)!;
      const esperado = primerHueco('fondo', { ...ficha, esPuerta: false }, [],
        largoMuro('fondo', caso.salas[0].encuadre, caso.salas[0].estructura!.ancho));
      const boton = raiz.querySelector<HTMLButtonElement>(`[data-pieza="${pieza.id}"]`)!;
      expect(pieza).toMatchObject({ muro: 'fondo', pos: esperado });
      expect(boton.classList.contains('elegida')).toBe(true);
      expect(document.activeElement).toBe(boton);
    } finally { raiz.remove(); fixture.destroy(); }
  });

  it('en la sala por piezas el botón de una hoja animada mide un cuadro de la pieza, no la hoja entera', async () => {
    const { fixture, store, raiz } = await montar();
    const catalogo = TestBed.inject(CatalogoDePiezas);
    const falso = catalogo as unknown as { manifiesto: ReturnType<typeof signal<unknown>>; paleta: () => unknown; acabados: () => unknown };
    const ruta = 'piezas/muebles/comisaria/escritorio.png';
    falso.manifiesto.set({ piezas: {}, pisos: {}, muros: {}, objetos: {}, herramientas: {},
      muebles: { 'comisaria/escritorio': { nombre: 'Escritorio', ruta, ancho: 125, alto: 68, cuadros: 6, apoyo: [62, 68] } } });
    falso.paleta = () => [];
    falso.acabados = () => ({ pisos: [], muros: [] });
    const caso = structuredClone(CASO_HOSPITAL);
    caso.catalogo.muebles.push({ id: 'escritorio', nombre: 'Escritorio', arte: `/assets/biblioteca/${ruta}`, ancho: 125, alto: 68, colision: true });
    caso.salas[0].muebles = [{ ref: 'escritorio', x: 300, y: 300 }];
    store.fijar(caso); fixture.componentRef.setInput('salaId', caso.salas[0].id);
    fixture.detectChanges();
    const img = raiz.querySelector<HTMLImageElement>('[data-elemento="mueble-0"] img')!;
    expect(img.classList.contains('cuadro')).toBe(true);
    expect([img.style.width, img.style.height]).toEqual(['125px', '68px']);
  });

  it('un objeto elegido ofrece las herramientas del caso y guarda la que entrega al revisarlo', async () => {
    const { fixture, store, raiz } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.herramientas = [{ codigo: 'ficha-riesgo', nombre: 'Ficha de riesgo' }, { codigo: 'acta-registro', nombre: 'Acta de registro de la atención' }];
    caso.salas[0].objetos = [{ ref: caso.catalogo.objetos[0].id, x: 400, y: 300 }];
    store.fijar(caso);
    fixture.detectChanges();
    raiz.querySelector<HTMLButtonElement>('[data-elemento="objeto-0"]')!.click();
    fixture.detectChanges();
    const select = raiz.querySelector<HTMLSelectElement>('select[data-accion="entrega-herramienta"]')!;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['Ninguna', 'Ficha de riesgo', 'Acta de registro de la atención']);
    select.value = 'acta-registro';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(store.caso()!.salas[0].objetos[0].toolCode).toBe('acta-registro');
    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(store.caso()!.salas[0].objetos[0].toolCode).toBeUndefined();
  });

  it('al ensanchar una sala ampliada vuelve a escala uno', async () => {
    const { fixture, store, raiz } = await montar();
    const caso = structuredClone(CASO_HOSPITAL);
    caso.salas[0].estructura!.ancho = 960;
    store.fijar(caso); fixture.componentRef.setInput('salaId', caso.salas[0].id); fixture.detectChanges();
    [...raiz.querySelectorAll('button')].find(b => b.textContent?.trim() === '×2')!.click();
    fixture.detectChanges();
    expect(raiz.querySelector<HTMLElement>('.escenario')!.style.width).toBe('1920px');
    raiz.querySelector<HTMLElement>('[role="slider"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(raiz.querySelector<HTMLElement>('.escenario')!.style.width).toBe('1200px');
  });

  it('una sala por piezas deja desplazar con el dedo y solo las piezas bloquean el gesto', async () => {
    const { fixture, store, raiz } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.salas[0].estructura = structuredClone(CASO_HOSPITAL.salas[0].estructura!);
    store.fijar(caso); fixture.detectChanges();
    const escenario = raiz.querySelector<HTMLElement>('.escenario')!;
    expect(getComputedStyle(escenario).touchAction).toBe('pan-x pan-y');
    expect(getComputedStyle(raiz.querySelector<HTMLElement>('.pieza')!).touchAction).toBe('none');
  });

  it('si el catálogo falla, Reintentar vuelve a pedirlo', async () => {
    const { fixture, store, raiz } = await montar();
    const catalogo = TestBed.inject(CatalogoDePiezas);
    const reintentar = vi.fn();
    (catalogo as unknown as { reintentar: () => void }).reintentar = reintentar;
    (catalogo.error as ReturnType<typeof signal<boolean>>).set(true);
    const caso = structuredClone(store.caso()!);
    caso.salas[0].estructura = structuredClone(CASO_HOSPITAL.salas[0].estructura!);
    store.fijar(caso); fixture.detectChanges();
    [...raiz.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Reintentar')!.click();
    expect(reintentar).toHaveBeenCalledOnce();
  });

  it('una puerta sin destino aparece en Por resolver hasta que se elige su sala', async () => {
    const { fixture, store, raiz } = await montar();
    const caso = structuredClone(CASO_HOSPITAL);
    store.fijar(caso); fixture.componentRef.setInput('salaId', caso.salas[0].id);
    const id = store.agregarPuerta(caso.salas[0].id, 'madera', 'fondo', 100);
    const pendientes = signal(new Map([[caso.salas[0].id, [id]]]));
    vi.spyOn(store, 'puertasSinGuardar').mockImplementation(pendientes);
    fixture.detectChanges();
    expect(raiz.textContent).toContain('Esta puerta no se guarda hasta que elijas a qué sala lleva.');
    store.fijarDestinoDePuerta(caso.salas[0].id, id, caso.salas[1].id);
    pendientes.set(new Map()); fixture.detectChanges();
    expect(raiz.textContent).not.toContain('Esta puerta no se guarda hasta que elijas a qué sala lleva.');
  });

  it('una sala de imagen fija no carga el lienzo ni la capa de piezas', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('app-lienzo-de-sala')).toBeNull();
    expect(raiz.querySelector('app-piezas-del-muro')).toBeNull();
    expect(raiz.querySelector('img.fondo')).not.toBeNull();
  });

  it('con un elemento elegido, las flechas lo mueven 8 px y con Mayúsculas 1 px', async () => {
    const { fixture, store, raiz } = await montar();
    const psicologa = raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!;
    const antes = store.caso()!.salas[0].personajes[0];
    psicologa.click();
    tecla(psicologa, 'ArrowLeft');
    tecla(psicologa, 'ArrowUp', { shiftKey: true });
    await fixture.whenStable();
    const despues = store.caso()!.salas[0].personajes[0];
    expect(despues.x).toBe(antes.x - 8);
    expect(despues.y).toBe(antes.y - 1);
  });

  it('Supr quita el elemento elegido y Ctrl+Z lo devuelve', async () => {
    const { fixture, store, raiz } = await montar();
    const vaso = raiz.querySelector<HTMLButtonElement>('[data-elemento="objeto-0"]')!;
    vaso.click();
    tecla(vaso, 'Delete');
    await fixture.whenStable();
    expect(store.caso()!.salas[0].objetos.map((o) => o.ref)).not.toContain('vaso-agua');
    tecla(raiz.querySelector('.escenario')!, 'z', { ctrlKey: true });
    await fixture.whenStable();
    expect(store.caso()!.salas[0].objetos.map((o) => o.ref)).toContain('vaso-agua');
  });

  it('la lista «En esta sala» permite elegir sin arrastrar y cambiar la expresión', async () => {
    const { fixture, store, raiz } = await montar();
    const opcion = [...raiz.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('Psicóloga de Bienestar'))!;
    opcion.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = raiz.querySelector<HTMLSelectElement>('select#expresion')!;
    select.value = 'preocupada';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(store.caso()!.salas[0].personajes[0].expresion).toBe('preocupada');
  });

  // Atención (hover y foco) en la lista «En esta sala»: señala la pieza en la sala; lo elegido pesa más que la atención. Tablero 50.
  const opcionDe = (raiz: HTMLElement, nombre: string) =>
    [...raiz.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes(nombre))!;
  const piezaAtendida = (raiz: HTMLElement) => raiz.querySelector<HTMLElement>('.pieza.atendida');

  it('la atención en una cosa de la lista señala dónde está en la sala, y Esc la pliega', async () => {
    const { fixture, raiz } = await montar();
    expect(piezaAtendida(raiz)).toBeNull();
    opcionDe(raiz, 'Psicóloga de Bienestar').dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)!.getAttribute('aria-label')).toContain('Psicóloga de Bienestar');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)).toBeNull();
  });

  it('con el teclado: el foco en la lista señala la pieza y salir de la lista la suelta; Esc no quita lo elegido', async () => {
    const { fixture, raiz } = await montar();
    const opcion = opcionDe(raiz, 'Psicóloga de Bienestar');
    opcion.click();
    await fixture.whenStable();
    fixture.detectChanges();
    opcion.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)).toBeNull();
    expect(opcionDe(raiz, 'Psicóloga de Bienestar').getAttribute('aria-selected')).toBe('true'); // lo elegido sigue elegido
    opcion.dispatchEvent(new FocusEvent('focus'));
    opcion.dispatchEvent(new FocusEvent('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(piezaAtendida(raiz)).toBeNull();
  });

  it('los personajes se dibujan con la hoja y el retrato del kit del programa', async () => {
    const { raiz } = await montar();
    const estilo = raiz.querySelector<HTMLElement>('.escenario .personaje')!.getAttribute('style') ?? '';
    expect(estilo).toContain('/assets/characters/kit/');
    expect(estilo).not.toContain('assets/kit/');
    const retratos = [...raiz.querySelectorAll<HTMLImageElement>('.catalogo-lista img')].map((i) => i.getAttribute('src'));
    expect(retratos.every((s) => !s || !s.includes('assets/kit/'))).toBe(true);
  });

  describe('A7 · lo que la IA puso o movió en la sala', () => {
    const marcar = (store: CasoStore, tipo: 'personajes' | 'muebles' | 'objetos', i: number) => {
      const caso = structuredClone(store.caso()!);
      caso.salas[0][tipo][i].marcaIa = true;
      store.fijar(caso);
    };

    it('lo marcado dice «Sugerido por la IA» en la lista y en los detalles, con un botón para aceptarlo', async () => {
      const { fixture, store, raiz } = await montar();
      marcar(store, 'personajes', 0);
      fixture.detectChanges();
      await fixture.whenStable();
      const opcion = [...raiz.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('Psicóloga de Bienestar'))!;
      expect(opcion.textContent).toContain('sugerido por la IA');
      expect([...raiz.querySelectorAll('[role="option"]')].filter((o) => o.textContent?.includes('sugerido por la IA'))).toHaveLength(1);
      opcion.click();
      await fixture.whenStable();
      fixture.detectChanges();
      const detalles = raiz.querySelector('.columna-detalles')!;
      expect(detalles.textContent).toContain('Sugerido por la IA');
      expect(detalles.querySelector('button[data-accion="aceptar-ia"]')).not.toBeNull();
    });

    it('«Aceptar» baja la marca y lo anuncia; lo que no está marcado no ofrece aceptar', async () => {
      const { fixture, store, raiz } = await montar();
      marcar(store, 'muebles', 0);
      fixture.detectChanges();
      await fixture.whenStable();
      raiz.querySelector<HTMLButtonElement>('[data-elemento="mueble-1"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(raiz.querySelector('.columna-detalles button[data-accion="aceptar-ia"]')).toBeNull();
      raiz.querySelector<HTMLButtonElement>('[data-elemento="mueble-0"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      raiz.querySelector<HTMLButtonElement>('.columna-detalles button[data-accion="aceptar-ia"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(store.caso()!.salas[0].muebles[0].marcaIa).toBe(false);
      expect(raiz.querySelector('.columna-detalles button[data-accion="aceptar-ia"]')).toBeNull();
      expect(raiz.querySelector('[role="status"].solo-lector')!.textContent).toContain('Aceptado');
    });
  });

  it('A8 · la nota de las expresiones cuenta las del kit (seis), no cuatro', async () => {
    const { fixture, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const detalles = raiz.querySelector('.columna-detalles')!.textContent!;
    expect(detalles).toContain('Las 6 caras');
    expect(detalles).not.toContain('Las 4 caras');
    expect(raiz.querySelectorAll('select#expresion option')).toHaveLength(6);
  });

  it('agregar desde el catálogo pone la pieza en la sala', async () => {
    const { fixture, store, raiz } = await montar();
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Agregar a la sala: Sofá de dos puestos"]')!.click();
    await fixture.whenStable();
    expect(store.caso()!.salas[0].muebles.at(-1)!.ref).toBe('sofa');
  });

  it('un caso sin lugar no tiene catálogo, lo dice, y sus salas se siguen editando', async () => {
    const { fixture, store, raiz } = await montar();
    const sinLugar = structuredClone(store.caso()!);
    sinLugar.lugarId = null;
    sinLugar.catalogo = { muebles: [], objetos: [], herramientas: [] };
    sinLugar.salas[0].origen = null;
    store.fijar(sinLugar);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[data-sin-catalogo]')!.textContent).toContain('no viene de un lugar de la biblioteca');
    expect(raiz.querySelector('[data-sin-catalogo]')!.textContent).not.toMatch(/catálogo vacío|undefined/i);

    // Agregar una pieza que no existe no deja una pieza fantasma en la sala
    const antes = store.caso()!.salas[0].muebles.length;
    store.agregarElemento('consultorio', 'mueble', 'sofa');
    expect(store.caso()!.salas[0].muebles).toHaveLength(antes);

    // Mover lo que ya está sí funciona
    const psicologa = raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!;
    const x = store.caso()!.salas[0].personajes[0].x;
    psicologa.click();
    psicologa.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(store.caso()!.salas[0].personajes[0].x).toBe(x + 8);
  });

  // ── Cómo se mueve una persona y a quién atender ───────────────────────────────

  type Fixture = { whenStable(): Promise<unknown>; detectChanges(): void };
  const hacer = async (fixture: Fixture) => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const elegirPersona = async (fixture: Fixture, raiz: HTMLElement) => {
    raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-0"]')!.click();
    await hacer(fixture);
  };
  const boton = (raiz: HTMLElement, nombre: string) =>
    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === nombre || b.getAttribute('aria-label') === nombre)!;
  const medida = (escenario: HTMLElement) => {
    escenario.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 528, right: 960, bottom: 528, x: 0, y: 0, toJSON: () => ({}) });
  };
  /** Con la persona elegida, «Va y viene» y «Elegir el punto»: el punto empieza a elegirse. */
  const empezarAElegirElPunto = async (fixture: Fixture, raiz: HTMLElement) => {
    await elegirPersona(fixture, raiz);
    boton(raiz, 'Va y viene').click();
    await hacer(fixture);
    boton(raiz, 'Elegir el punto').click();
    await hacer(fixture);
  };

  describe('«Cómo se mueve»', () => {
    it('una persona elegida ofrece cuatro opciones en palabras del docente y por defecto se queda quieta', async () => {
      const { fixture, raiz } = await montar();
      await elegirPersona(fixture, raiz);
      const opciones = [...raiz.querySelectorAll<HTMLElement>('[role="radiogroup"][aria-labelledby="pmueve"] [role="radio"]')];
      expect(opciones.map((o) => o.textContent?.trim())).toEqual(['Se queda quieto', 'Camina por la sala', 'Va y viene', 'Recorre un trayecto']);
      expect(opciones.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
      expect(raiz.querySelector('#pmueve')!.textContent).toContain('Cómo se mueve');
    });

    it('un mueble no ofrece cómo se mueve ni persona a atender', async () => {
      const { fixture, raiz } = await montar();
      raiz.querySelector<HTMLButtonElement>('[data-elemento="mueble-0"]')!.click();
      await hacer(fixture);
      expect(raiz.querySelector('#pmueve')).toBeNull();
      expect(raiz.querySelector('input[data-persona-a-atender]')).toBeNull();
    });

    it('«Camina por la sala» se guarda en el borrador y se puede deshacer', async () => {
      const { fixture, store, raiz } = await montar();
      await elegirPersona(fixture, raiz);
      boton(raiz, 'Camina por la sala').click();
      await hacer(fixture);
      expect(store.caso()!.salas[0].personajes[0].movimiento).toBe('deambula');
      expect(boton(raiz, 'Camina por la sala').getAttribute('aria-checked')).toBe('true');
      store.deshacer();
      await hacer(fixture);
      expect(boton(raiz, 'Se queda quieto').getAttribute('aria-checked')).toBe('true');
    });

    it('«Va y viene» pide el punto: mientras no se fija, el movimiento no cambia', async () => {
      const { fixture, store, raiz } = await montar();
      await elegirPersona(fixture, raiz);
      boton(raiz, 'Va y viene').click();
      await hacer(fixture);
      expect(boton(raiz, 'Va y viene').getAttribute('aria-checked')).toBe('true');
      expect(raiz.querySelector('#phasta')!.textContent).toContain('Hasta dónde va');
      expect(raiz.textContent).toContain('Todavía no elegiste el punto');
      expect(store.caso()!.salas[0].personajes[0].movimiento ?? 'quieto').toBe('quieto');
      expect(boton(raiz, 'Elegir el punto')).toBeTruthy();
    });

    it('elegir el punto con los botones de flecha y «Listo» lo fija; la sala muestra la marca y la línea', async () => {
      const { fixture, store, raiz } = await montar();
      await empezarAElegirElPunto(fixture, raiz);
      const persona = store.caso()!.salas[0].personajes[0];
      expect(raiz.querySelector('.punto-ida')).toBeTruthy();
      boton(raiz, 'Mover el punto hacia abajo').click();
      boton(raiz, 'Mover el punto a la derecha').click();
      await hacer(fixture);
      boton(raiz, 'Listo').click();
      await hacer(fixture);
      const movimiento = store.caso()!.salas[0].personajes[0].movimiento as { tipo: string; hasta: { x: number; y: number } };
      expect(movimiento.tipo).toBe('va-y-viene');
      expect(movimiento.hasta.x).toBeGreaterThan(persona.x + 50);
      expect(raiz.querySelector('.punto-ida')).toBeNull();
      expect(raiz.querySelector('[data-hasta="personaje-0"]')).toBeTruthy();
      expect(raiz.querySelector('[data-ida="personaje-0"]')).toBeTruthy();
      expect(raiz.querySelector('#phasta')!.textContent).toContain('Hasta dónde va');
    });

    it('el punto también se mueve con las flechas del teclado (Mayúsculas mueve un poquito) y Enter lo fija', async () => {
      const { fixture, store, raiz } = await montar();
      await empezarAElegirElPunto(fixture, raiz);
      const marcador = raiz.querySelector<HTMLElement>('.punto-ida')!;
      expect(document.activeElement).toBe(marcador); // el foco pasa al punto: las flechas valen de inmediato
      const x0 = Number(marcador.getAttribute('data-x'));
      tecla(marcador, 'ArrowRight');
      tecla(marcador, 'ArrowRight', { shiftKey: true });
      await hacer(fixture);
      expect(Number(raiz.querySelector('.punto-ida')!.getAttribute('data-x'))).toBe(x0 + 9);
      tecla(raiz.querySelector('.punto-ida')!, 'Enter');
      await hacer(fixture);
      const m = store.caso()!.salas[0].personajes[0].movimiento as { hasta: { x: number } };
      expect(m.hasta.x).toBe(x0 + 9);
    });

    it('un clic en la sala pone el punto ahí', async () => {
      const { fixture, raiz } = await montar();
      await empezarAElegirElPunto(fixture, raiz);
      const escenario = raiz.querySelector<HTMLElement>('.escenario')!;
      medida(escenario);
      escenario.dispatchEvent(new MouseEvent('click', { clientX: 200, clientY: 440, bubbles: true }));
      await hacer(fixture);
      const marcador = raiz.querySelector('.punto-ida')!;
      expect([marcador.getAttribute('data-x'), marcador.getAttribute('data-y')]).toEqual(['200', '440']);
    });

    it('un punto dentro de un mueble no se fija: el editor lo dice y el movimiento sigue como estaba', async () => {
      const { fixture, store, raiz } = await montar();
      await empezarAElegirElPunto(fixture, raiz);
      const escenario = raiz.querySelector<HTMLElement>('.escenario')!;
      medida(escenario);
      escenario.dispatchEvent(new MouseEvent('click', { clientX: 690, clientY: 275, bubbles: true })); // dentro del escritorio
      await hacer(fixture);
      expect(raiz.querySelector('[data-aviso-punto]')!.textContent).toContain('Ese punto cae dentro de «Escritorio»');
      boton(raiz, 'Listo').click();
      await hacer(fixture);
      expect(store.caso()!.salas[0].personajes[0].movimiento ?? 'quieto').toBe('quieto');
      expect(raiz.querySelector('.punto-ida')).not.toBeNull(); // sigue eligiendo
    });

    it('«Cancelar» deja todo como estaba y Esc también', async () => {
      const { fixture, store, raiz } = await montar();
      await empezarAElegirElPunto(fixture, raiz);
      boton(raiz, 'Cancelar').click();
      await hacer(fixture);
      expect(raiz.querySelector('.punto-ida')).toBeNull();
      expect(store.caso()!.salas[0].personajes[0].movimiento ?? 'quieto').toBe('quieto');
      boton(raiz, 'Elegir el punto').click();
      await hacer(fixture);
      tecla(raiz.querySelector('.punto-ida')!, 'Escape');
      await hacer(fixture);
      expect(raiz.querySelector('.punto-ida')).toBeNull();
    });

    it('volver a «Se queda quieto» quita el punto y la marca de la sala', async () => {
      const { fixture, store, raiz } = await montar();
      store.fijarMovimiento('consultorio', 0, { tipo: 'va-y-viene', hasta: { x: 200, y: 440 } });
      await elegirPersona(fixture, raiz);
      expect(boton(raiz, 'Va y viene').getAttribute('aria-checked')).toBe('true');
      expect(raiz.querySelector('[data-hasta="personaje-0"]')).toBeTruthy();
      boton(raiz, 'Se queda quieto').click();
      await hacer(fixture);
      expect(store.caso()!.salas[0].personajes[0].movimiento ?? 'quieto').toBe('quieto');
      expect(raiz.querySelector('[data-hasta="personaje-0"]')).toBeNull();
      expect(raiz.querySelector('#phasta')).toBeNull();
    });

    it('si después de fijar el punto un mueble o la persona se mueve y el punto ya no sirve, los detalles lo dicen', async () => {
      const { fixture, store, raiz } = await montar();
      store.fijarMovimiento('consultorio', 0, { tipo: 'va-y-viene', hasta: { x: 200, y: 440 } });
      await elegirPersona(fixture, raiz);
      expect(raiz.querySelector('[data-aviso-ida]')!.textContent!.trim()).toBe('');
      // el mueble más cercano al punto se mueve encima de él
      const indice = store.caso()!.salas[0].muebles.findIndex((m) => m.ref === 'escritorio');
      store.moverElemento('consultorio', 'mueble', indice, 200, 450);
      await hacer(fixture);
      expect(raiz.querySelector('[data-aviso-ida]')!.textContent).toContain('El punto ya no sirve');
      expect(raiz.querySelector('[data-aviso-ida]')!.textContent).toContain('Escritorio');
    });

    it('todo lo que se maneja para elegir el punto tiene nombre', async () => {
      const { fixture, raiz } = await montar();
      await empezarAElegirElPunto(fixture, raiz);
      for (const nombre of ['Mover el punto a la izquierda', 'Mover el punto hacia arriba', 'Mover el punto hacia abajo', 'Mover el punto a la derecha', 'Listo', 'Cancelar']) {
        expect(boton(raiz, nombre), nombre).toBeTruthy();
      }
      expect(raiz.querySelector('.punto-ida')!.getAttribute('aria-label')).toMatch(/punto/i);
    });
  });

  describe('«Persona a atender»', () => {
    const casilla = (raiz: HTMLElement) => raiz.querySelector<HTMLInputElement>('input[data-persona-a-atender]')!;

    it('es una casilla de los detalles de una persona, sin marcar al principio', async () => {
      const { fixture, raiz } = await montar();
      await elegirPersona(fixture, raiz);
      expect(casilla(raiz).checked).toBe(false);
      expect(raiz.querySelector(`label[for="${casilla(raiz).id}"]`)!.textContent).toContain('Persona a atender');
    });

    it('marcarla la guarda y la sala la señala con una marca de forma y texto, no solo de color', async () => {
      const { fixture, store, raiz } = await montar();
      await elegirPersona(fixture, raiz);
      casilla(raiz).click();
      await hacer(fixture);
      expect(store.caso()!.salas[0].personajes[0].personaClave).toBe(true);
      const pieza = raiz.querySelector<HTMLElement>('[data-elemento="personaje-0"]')!;
      expect(pieza.getAttribute('aria-label')).toContain('persona a atender');
      const marca = pieza.querySelector('.marca-atender')!;
      expect(marca.textContent).toContain('A atender');
      expect(marca.querySelector('.chevron')).toBeTruthy();
      expect(opcionDe(raiz, 'Psicóloga de Bienestar').textContent).toContain('persona a atender');
      expect(raiz.querySelector('[role="status"][data-aviso-persona]')!.textContent).toContain('Ahora la persona a atender es Psicóloga de Bienestar');
    });

    it('a lo sumo una por sala: marcar a otra desmarca a la anterior y el editor lo dice', async () => {
      const { fixture, store, raiz } = await montar();
      store.agregarElemento('consultorio', 'personaje', 'docente');
      await elegirPersona(fixture, raiz);
      casilla(raiz).click();
      await hacer(fixture);
      raiz.querySelector<HTMLButtonElement>('[data-elemento="personaje-1"]')!.click();
      await hacer(fixture);
      casilla(raiz).click();
      await hacer(fixture);
      expect(store.caso()!.salas[0].personajes.map((p) => p.personaClave)).toEqual([false, true]);
      const aviso = raiz.querySelector('[data-aviso-persona]')!.textContent!;
      expect(aviso).toContain('Ahora la persona a atender es Docente');
      expect(aviso).toContain('Psicóloga de Bienestar dejó de serlo');
      expect(raiz.querySelectorAll('.marca-atender')).toHaveLength(1);
    });

    it('desmarcarla lo dice y la sala se queda sin ninguna', async () => {
      const { fixture, store, raiz } = await montar();
      await elegirPersona(fixture, raiz);
      casilla(raiz).click();
      await hacer(fixture);
      casilla(raiz).click();
      await hacer(fixture);
      expect(store.caso()!.salas[0].personajes[0].personaClave).toBe(false);
      expect(raiz.querySelector('.marca-atender')).toBeNull();
      expect(raiz.querySelector('[data-aviso-persona]')!.textContent).toContain('Esta sala ya no tiene persona a atender');
    });

    it('el código de la sala no usa el morado de la guía', () => {
      expect(readFileSync(join(__dirname, 'sala.component.ts'), 'utf-8').toLowerCase()).not.toContain('7c3aed');
    });
  });

  describe('quitar a la última persona de una sala con respuestas', () => {
    /** La escena de la sala con una línea y una respuesta (que solo ofrece la persona de la sala). */
    const conGuion = (store: CasoStore) => {
      const caso = structuredClone(store.caso()!);
      const escena = caso.escenas.find((e) => e.salaId === 'consultorio')!;
      escena.lineas.push({ id: 'l1', personajeId: 'psicologa-bienestar', texto: 'Hola.', expresion: 'neutral', marcaIa: false });
      escena.respuestas.push({
        id: 'respuesta-ab12', texto: 'Te escucho.', clase: 'RECOMMENDED', razon: '', retroalimentacion: 'Da seguridad.', efectos: {}, destinoId: null, marcaIa: false,
      });
      store.fijar(caso);
      return escena.titulo;
    };
    type Aviso = { title: string; consequence: string; continueLabel: string; proceedLabel: string };

    it('avisa antes de quitar a la última persona de la que cuelga un diálogo, y si el docente prefiere dejarla, no la quita', async () => {
      const { fixture, store, consequence, raiz } = await montar('continue');
      const titulo = conGuion(store);
      await elegirPersona(fixture, raiz);
      boton(raiz, 'Quitar de la sala').click();
      await hacer(fixture);
      expect(consequence).toHaveBeenCalledTimes(1);
      const aviso = (consequence.mock.calls[0] as unknown as [Aviso])[0];
      expect(aviso.consequence).toContain(titulo);
      expect(aviso.consequence).toContain('Psicóloga de Bienestar');
      expect(aviso.continueLabel).toBe('Dejarla en la sala');
      expect(aviso.proceedLabel).toBe('Quitarla de todos modos');
      expect(store.caso()!.salas[0].personajes).toHaveLength(1);
    });

    it('si el docente acepta, la quita (y Ctrl+Z la devuelve)', async () => {
      const { fixture, store, consequence, raiz } = await montar('proceed');
      conGuion(store);
      await elegirPersona(fixture, raiz);
      boton(raiz, 'Quitar de la sala').click();
      await hacer(fixture);
      expect(consequence).toHaveBeenCalledTimes(1);
      expect(store.caso()!.salas[0].personajes).toHaveLength(0);
      tecla(raiz.querySelector('.escenario')!, 'z', { ctrlKey: true });
      await hacer(fixture);
      expect(store.caso()!.salas[0].personajes).toHaveLength(1);
    });

    it('una escena con solo líneas (sin respuestas) no impide quitar a la persona: no pregunta', async () => {
      const { fixture, store, consequence, raiz } = await montar();
      const caso = structuredClone(store.caso()!);
      caso.escenas.find((e) => e.salaId === 'consultorio')!.lineas.push({ id: 'l1', personajeId: 'p', texto: 'Hola.', expresion: 'neutral', marcaIa: false });
      store.fijar(caso);
      await elegirPersona(fixture, raiz);
      boton(raiz, 'Quitar de la sala').click();
      await hacer(fixture);
      expect(consequence).not.toHaveBeenCalled();
      expect(store.caso()!.salas[0].personajes).toHaveLength(0);
    });

    it('si un objeto de la sala ofrece las respuestas, quitar a la persona no pregunta: nada queda sin forma de ofrecerse', async () => {
      const { fixture, store, consequence, raiz } = await montar();
      conGuion(store);
      const caso = structuredClone(store.caso()!);
      caso.escenas.find((e) => e.salaId === 'consultorio')!.respuestas[0].id = '501';
      caso.salas[0].objetos.push({ ref: 'opcion', x: 300, y: 300, clave: 'opcion-1', decisionOptionId: 501 });
      store.fijar(caso);
      await elegirPersona(fixture, raiz);
      boton(raiz, 'Quitar de la sala').click();
      await hacer(fixture);
      expect(consequence).not.toHaveBeenCalled();
      expect(store.caso()!.salas[0].personajes).toHaveLength(0);
    });

    it('sin diálogo en las escenas de la sala no pregunta nada', async () => {
      const { fixture, store, consequence, raiz } = await montar();
      await elegirPersona(fixture, raiz);
      boton(raiz, 'Quitar de la sala').click();
      await hacer(fixture);
      expect(consequence).not.toHaveBeenCalled();
      expect(store.caso()!.salas[0].personajes).toHaveLength(0);
    });

    it('si queda otra persona en la sala no pregunta: el diálogo pasa a ella', async () => {
      const { fixture, store, consequence, raiz } = await montar();
      conGuion(store);
      store.agregarElemento('consultorio', 'personaje', 'docente');
      await elegirPersona(fixture, raiz);
      boton(raiz, 'Quitar de la sala').click();
      await hacer(fixture);
      expect(consequence).not.toHaveBeenCalled();
      expect(store.caso()!.salas[0].personajes).toHaveLength(1);
    });

    it('quitar un mueble nunca pregunta', async () => {
      const { fixture, store, consequence, raiz } = await montar();
      conGuion(store);
      raiz.querySelector<HTMLButtonElement>('[data-elemento="mueble-0"]')!.click();
      await hacer(fixture);
      boton(raiz, 'Quitar de la sala').click();
      await hacer(fixture);
      expect(consequence).not.toHaveBeenCalled();
    });
  });
});
