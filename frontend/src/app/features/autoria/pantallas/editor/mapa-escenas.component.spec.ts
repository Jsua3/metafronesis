import { type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { universidad } from '../../testing/universidad';
import type { CasoBorrador } from '../../modelo/caso';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { MapaEscenasComponent } from './mapa-escenas.component';


async function montar() {
  const caso: CasoBorrador = copiarEscenarioAlCaso(universidad, ['pasillo', 'consultorio'], 'Caso');
  caso.escenas[0].respuestas = [
    { id: 'r1', texto: 'Acompañarla', clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: '', destinoId: caso.escenas[1].id, marcaIa: false },
  ];
  await TestBed.configureTestingModule({ imports: [MapaEscenasComponent] }).compileComponents();
  const fixture = TestBed.createComponent(MapaEscenasComponent);
  fixture.componentRef.setInput('caso', caso);
  fixture.componentRef.setInput('avisos', []);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, caso, raiz: fixture.nativeElement as HTMLElement };
}

const nodo = (raiz: HTMLElement, i: number) => raiz.querySelectorAll<HTMLButtonElement>('button.escena')[i];
const menuitems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((m) => m.textContent!.replace(/\s+/g, ' ').trim());

describe('MapaEscenasComponent', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = '')));

  // req: EDITOR-PRO punto 3 y 4: encuadre completo y regreso legible al inicio.
  it('F y el botón encuadran todo; Volver al inicio recupera el encuadre legible', async () => {
    const { fixture, caso, raiz } = await montar();
    fixture.componentRef.setInput('caso', { ...caso, inicioId: caso.escenas[1].id, escenas: [
      { ...caso.escenas[0], posicion: { x: 0, y: 0 } },
      { ...caso.escenas[1], posicion: { x: 9000, y: 0 } },
    ] });
    await fixture.whenStable();
    const estado = fixture.componentInstance as unknown as {
      tamMarco: WritableSignal<{ w: number; h: number }>;
      camara: WritableSignal<{ x: number; y: number; z: number }>;
      limites: () => { ancho: number; alto: number };
    };
    estado.tamMarco.set({ w: 800, h: 600 });
    const comprobarTodo = () => {
      const c = estado.camara(), l = estado.limites();
      expect(c.z).toBeLessThan(0.3);
      expect(c.x).toBeGreaterThanOrEqual(16);
      expect(c.x + l.ancho * c.z).toBeLessThanOrEqual(784);
      expect(c.y).toBeGreaterThanOrEqual(16);
      expect(c.y + l.alto * c.z).toBeLessThanOrEqual(584);
    };
    raiz.querySelector<HTMLButtonElement>('[aria-label="Ver todo el mapa"]')!.click();
    comprobarTodo();
    raiz.querySelector<HTMLButtonElement>('[aria-label="Volver al inicio"]')!.click();
    expect(estado.camara().z).toBe(0.75);
    expect(estado.camara().x).toBeLessThan(-5000);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    comprobarTodo();
  });

  it('pasar el cursor por una escena muestra la miniatura de su sala', async () => {
    const { fixture, raiz } = await montar();
    nodo(raiz, 1).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    const vista = raiz.querySelector('[role="tooltip"]');
    expect(vista).not.toBeNull();
    expect(vista!.querySelector('img')!.getAttribute('src')).toContain('arte/salas/consultorio.png');
    expect(vista!.textContent).toContain('Consultorio de atención psicológica');
  });

  // Atención (hover y foco) en una respuesta: la flecha que la une a su escena. Tablero 50 de estados.
  const flecha = (raiz: HTMLElement) => raiz.querySelector<SVGPathElement>('path.flecha')!;
  const detalleDeRespuesta = (raiz: HTMLElement) => raiz.querySelector<HTMLElement>('.tarjeta-flecha');

  // Axe (aria-prohibited-attr): un aria-label sin rol en un <path> no se permite; la flecha es una imagen con nombre.
  it('cada flecha es una imagen con nombre: dice qué respuesta es', async () => {
    const { raiz } = await montar();
    const flechas = [...raiz.querySelectorAll<SVGPathElement>('path.flecha')];
    expect(flechas.length).toBeGreaterThan(0);
    for (const f of flechas) {
      expect(f.getAttribute('role')).toBe('img');
      expect(f.getAttribute('aria-label')).toMatch(/^Respuesta: /);
    }
  });

  it('la atención en una respuesta muestra su detalle (qué dice y a dónde lleva) y se pliega con Esc', async () => {
    const { fixture, caso, raiz } = await montar();
    expect(detalleDeRespuesta(raiz)).toBeNull();
    flecha(raiz).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    const detalle = detalleDeRespuesta(raiz)!;
    expect(detalle).not.toBeNull();
    expect(detalle.textContent).toContain('Acompañarla');
    expect(detalle.textContent).toContain(`Lleva a la escena 2 · ${caso.escenas[1].titulo}`);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(detalleDeRespuesta(raiz)).toBeNull();
  });

  it('con el teclado: el foco en la respuesta la muestra, Esc la pliega sin quitar el foco, y volver a enfocarla la muestra otra vez', async () => {
    const { fixture, raiz } = await montar();
    const camino = flecha(raiz);
    camino.focus();
    camino.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(detalleDeRespuesta(raiz)).not.toBeNull();
    camino.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(detalleDeRespuesta(raiz)).toBeNull();
    expect(document.activeElement).toBe(camino);
    camino.dispatchEvent(new FocusEvent('blur'));
    camino.dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(detalleDeRespuesta(raiz)).not.toBeNull();
  });

  it('Esc también pliega la vista de la sala de una escena, aunque el cursor siga encima (dismissible, WCAG 1.4.13)', async () => {
    const { fixture, raiz } = await montar();
    nodo(raiz, 1).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[role="tooltip"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(raiz.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('el detalle de una respuesta no roba el foco ni se lee dos veces: es un aviso de estado, no un diálogo', async () => {
    const { fixture, raiz } = await montar();
    flecha(raiz).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    const detalle = detalleDeRespuesta(raiz)!;
    expect(detalle.getAttribute('role')).toBe('status');
    expect(detalle.hasAttribute('tabindex')).toBe(false);
  });

  const abrirCon: Record<string, () => Event> = {
    'clic derecho': () => new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
    'Mayús+F10': () => new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
    'tecla ContextMenu': () => new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }),
  };

  for (const [forma, evento] of Object.entries(abrirCon)) {
    it(`${forma} abre el mismo menú de acciones`, async () => {
      const { fixture, raiz } = await montar();
      nodo(raiz, 0).dispatchEvent(evento());
      await fixture.whenStable();
      expect(menuitems()).toEqual([
        'Abrir guion Enter', 'Abrir sala', 'Mover', 'Duplicar', 'Conectar con…', 'Marcar como final', 'Borrar Supr',
      ]);
      expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
    });
  }

  // Linux y macOS mandan `contextmenu` al PULSAR el botón derecho (aún abajo) y el `auxclick` de soltarlo llega con el menú
  // ya abierto: el CDK lo tomaba por un clic fuera y lo cerraba al instante (en Windows `contextmenu` llega al soltar).
  it('clic derecho con el orden de Linux y macOS: el menú sigue abierto después de soltar el botón', async () => {
    const { fixture, raiz } = await montar();
    const escena = nodo(raiz, 0);
    const base = { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 2 };
    escena.dispatchEvent(new MouseEvent('pointerdown', { ...base, buttons: 2 }));
    escena.dispatchEvent(new MouseEvent('contextmenu', { ...base, buttons: 2 }));
    escena.dispatchEvent(new MouseEvent('pointerup', { ...base, buttons: 0 }));
    escena.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
    escena.dispatchEvent(new MouseEvent('auxclick', { ...base, buttons: 0 }));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(menuitems()).toContain('Marcar como final');
    expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
  });

  it('un clic derecho que el navegador cancela (pointercancel) no deja el menú esperando: se abre igual', async () => {
    const { fixture, raiz } = await montar();
    const escena = nodo(raiz, 0);
    escena.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 2 }));
    escena.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(menuitems()).toContain('Marcar como final');
  });

  it('al destruir el mapa cancela la apertura diferida del menú contextual', async () => {
    const { fixture, raiz } = await montar();
    nodo(raiz, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 2 }));
    fixture.destroy();
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve));
    expect(menuitems()).toEqual([]);
  });

  // Axe (color-contrast) en un caso de solo lectura: el fieldset deshabilitado atenúa «Acciones», pero un aria-disabled="false"
  // explícito decía lo contrario, y Axe y el lector de pantalla lo tomaban por habilitado.
  it('«Acciones» nunca dice aria-disabled="false": sin escena elegida va deshabilitado y con escena no lo dice', async () => {
    const { fixture, raiz } = await montar();
    const acciones = raiz.querySelector<HTMLButtonElement>('button[data-accion~="marcar-final"]')!;
    expect(acciones.getAttribute('aria-disabled')).toBe('true');
    nodo(raiz, 0).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(acciones.hasAttribute('aria-disabled')).toBe(false);
  });

  // Axe (scrollable-region-focusable): en un caso de solo lectura las escenas están deshabilitadas y el mapa desplazable no
  // tenía nada que alcanzar con el teclado; entonces el mapa mismo toma el foco (y se desplaza con las flechas).
  it('en solo lectura el mapa desplazable se alcanza con Tab y dice qué es; editable, el foco va a las escenas', async () => {
    const { fixture, raiz } = await montar();
    const marco = raiz.querySelector<HTMLElement>('.marco')!;
    expect(marco.hasAttribute('tabindex')).toBe(false);
    fixture.componentRef.setInput('soloLectura', true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(marco.getAttribute('tabindex')).toBe('0');
    expect(marco.getAttribute('role')).toBe('region');
    expect(marco.getAttribute('aria-label')).toMatch(/mapa del caso/i);
  });

  it('el menú tiene Abrir guion, Abrir sala, Mover, Duplicar, Conectar con…, Marcar como final y Borrar', async () => {
    const { fixture, raiz } = await montar();
    nodo(raiz, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await fixture.whenStable();
    const textos = menuitems().map((t) => t.replace(/ (Enter|Supr)$/, ''));
    expect(textos).toEqual(['Abrir guion', 'Abrir sala', 'Mover', 'Duplicar', 'Conectar con…', 'Marcar como final', 'Borrar']);
  });

  it('Enter en una escena pide abrir su guion', async () => {
    const { fixture, caso, raiz } = await montar();
    let abierta: string | null = null;
    fixture.componentInstance.abrirGuion.subscribe((id: string) => (abierta = id));
    nodo(raiz, 1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(abierta).toBe(caso.escenas[1].id);
  });

  it('si la escena elegida desaparece (borrar, deshacer), otra escena sigue alcanzable con Tab', async () => {
    const { fixture, caso, raiz } = await montar();
    nodo(raiz, 1).click();
    await fixture.whenStable();
    fixture.componentRef.setInput('caso', { ...caso, escenas: caso.escenas.slice(0, 1) });
    await fixture.whenStable();
    fixture.detectChanges();
    const paradas = [...raiz.querySelectorAll('button.escena')].filter((b) => b.getAttribute('tabindex') === '0');
    expect(paradas).toHaveLength(1);
  });

  it('«Acciones» sin escena elegida no abre el menú y dice qué hacer', async () => {
    const { fixture, raiz } = await montar();
    const acciones = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Acciones')!;
    acciones.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(menuitems()).toEqual([]);
    expect(raiz.querySelector('[role="status"]')!.textContent).toContain('Primero elige una escena en el mapa.');
  });

  // req: EDITOR.md §7.3 E1, criterios 5 y 7
  it('E1 · una sala sin fondo dibujado no deja una imagen con src vacío en el globo', async () => {
    const { fixture, caso, raiz } = await montar();
    fixture.componentRef.setInput('caso', { ...caso, salas: caso.salas.map((s) => ({ ...s, fondo: '' })) });
    await fixture.whenStable();
    fixture.detectChanges();
    nodo(raiz, 0).dispatchEvent(new MouseEvent('mouseenter'));
    await fixture.whenStable();
    fixture.detectChanges();
    const vista = raiz.querySelector('[role="tooltip"]')!;
    expect(vista).not.toBeNull();
    expect(vista.querySelector('img')).toBeNull();
    expect([...raiz.querySelectorAll('img')].every((i) => !!i.getAttribute('src'))).toBe(true);
  });

  it('E1 · el menú «Acciones» lleva la piel de quien lo abre (oscuro en oscuro), sin tocar body', async () => {
    const contenedor = document.createElement('section');
    contenedor.setAttribute('data-skin', 'game');
    document.body.appendChild(contenedor);
    const { fixture, raiz } = await montar();
    contenedor.appendChild(raiz);
    nodo(raiz, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.querySelector('.cdk-overlay-container [role="menu"]')!.getAttribute('data-skin')).toBe('game');
    expect(menuitems()).toContain('Marcar como final');
    contenedor.remove();
    expect(document.body.hasAttribute('data-skin')).toBe(false);
  });

  it('E1 · los números de las tarjetas son los del orden de la historia (los del riel)', async () => {
    const { fixture, caso, raiz } = await montar();
    // La segunda escena del arreglo es el inicio: el número sigue a la historia, no al arreglo.
    const volver = { id: 'r2', texto: 'Volver', clase: 'RECOMMENDED' as const, razon: '', efectos: {}, retroalimentacion: '', destinoId: caso.escenas[0].id, marcaIa: false };
    fixture.componentRef.setInput('caso', {
      ...caso, inicioId: caso.escenas[1].id,
      escenas: [{ ...caso.escenas[0], respuestas: [] }, { ...caso.escenas[1], respuestas: [volver] }],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(nodo(raiz, 0).querySelector('.numero')!.textContent).toBe('2');
    expect(nodo(raiz, 1).querySelector('.numero')!.textContent).toBe('1');
  });

  it('E1 · «Teclas del mapa» abre la ayuda en un globo y Esc lo pliega; la ayuda sigue describiendo el mapa', async () => {
    const { fixture, raiz } = await montar();
    const boton = raiz.querySelector<HTMLButtonElement>('button[aria-label="Teclas del mapa"]')!;
    const ayuda = raiz.querySelector<HTMLElement>('#mapa-ayuda')!;
    expect(ayuda.hidden).toBe(true);
    expect(raiz.querySelector('.plano')!.getAttribute('aria-describedby')).toBe('mapa-ayuda');
    boton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(ayuda.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(ayuda.hidden).toBe(true);
  });
});
