import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { rutasEditorCaso, rutasNuevoCaso } from './autoria.routes';
import { CasoStore } from './estado/caso.store';
import { GuiaService } from './guia/guia.service';
import { casoCopiadoDeLugar } from './testing/caso-api';
import { ServidorFalso } from './testing/servidor-falso';
import { cuentaDePrueba } from './testing/cuenta';
import { universidad } from './testing/universidad';

async function irA(url: string, iaEncendida = true) {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 }), universidad);
  await TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'portal/casos/nuevo', children: rutasNuevoCaso },
        { path: 'portal/casos/:caseVersionId/editor', children: rutasEditorCaso },
        { path: 'portal/casos', children: [] },
      ], withComponentInputBinding()),
      { provide: AuthoringApi, useValue: { ...servidor.api, assistantStatus: () => of({ enabled: iaEncendida, mode: iaEncendida ? 'connected' : 'disabled', remainingToday: 5 }) } },
      cuentaDePrueba,
    ],
  }).compileComponents();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const listo = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  };
  await listo();
  return { raiz: harness.routeNativeElement as HTMLElement, listo, harness };
}

function desplazarA(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('header button')].find((b) => b.textContent?.includes(texto))!;

// req: RNF-002, BLOQUE-H (estados de la barra en el editor: DG-5 una sola barra, DG-9 la ayuda no se pliega y congela la barra)
describe('Editor de casos: la barra de vidrio (tableros 45–51)', () => {
  afterEach(() => {
    desplazarA(0);
    document.querySelectorAll('body > app-autoria-shell, body > [ng-version]').forEach((n) => n.remove());
  });

  it('la cabecera usa GlassBarMachine con los módulos decididos: marca · contexto del editor · ayuda y cuenta', async () => {
    const { raiz, listo } = await irA('/portal/casos/41/editor');
    const barra = raiz.querySelector('header')!;
    expect(raiz.querySelectorAll('header')).toHaveLength(1); // una sola barra en pantalla
    expect(barra.classList).toContain('cromo');
    expect(barra.getAttribute('data-vidrio')).toBe('pseudo');
    expect(barra.getAttribute('data-estado')).toBe('inicial');
    const modulos = [...barra.querySelectorAll(':scope > nav.bandeja > .modulo')].map((m) => m.classList[1]);
    expect(modulos).toEqual(['modulo-logo', 'modulo-principal', 'modulo-cuenta']);

    // La máquina de la barra decide el estado: al desplazarse, pasa a «scroll».
    desplazarA(400);
    await listo();
    expect(barra.getAttribute('data-estado')).toBe('scroll');
  });

  // E0 (EDITOR.md §4.1): «‹ Casos» (el nombre de DISENO.md), una sola «Ayuda» que funde Buscar y Guía, el estado de
  // guardado, «Probar» y «Pendientes» junto a la cuenta, y el selector de tema.
  it('con un caso abierto, el módulo central trae «‹ Casos», el nombre del caso y su hilo; la cuenta, las herramientas, la ayuda y el menú', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    // En el editor la marca cede su sitio a «volver» (pedido del usuario, 2026-11-22): un círculo dentro de la banda en el
    // teléfono y, en escritorio, una pieza de vidrio APARTE de la barra (hermana de la píldora, no dentro de ella).
    const logo = raiz.querySelector<HTMLElement>('header .modulo-logo')!;
    expect(logo.querySelector('app-marca')).toBeNull();
    expect(logo.querySelector('a.volver--en-barra')!.getAttribute('href')).toBe('/portal/casos');
    const pieza = raiz.querySelector<HTMLAnchorElement>('header > a.volver--pieza')!;
    expect(pieza.closest('nav.bandeja')).toBeNull();
    expect(pieza.getAttribute('href')).toBe('/portal/casos');
    expect(pieza.textContent!.trim()).toBe('Volver a casos');
    const central = raiz.querySelector('header .modulo-principal')!;
    expect(central.querySelector('a[href="/portal/casos"]')).toBeNull();
    expect(central.textContent).not.toContain('Mis casos');
    expect(central.querySelector('.caso-actual')!.textContent).toContain('Primera escucha');
    const cuenta = raiz.querySelector('header .modulo-cuenta')!;
    const ayuda = cuenta.querySelector('[role="group"][aria-label="Ayuda"]')!;
    expect([...ayuda.querySelectorAll('button')].map((b) => b.textContent!.replace(/\s+/g, ' ').trim().split(' Ctrl')[0])).toEqual(['Ayuda', 'Asistente de IA']);
    expect(ayuda.querySelector('button')!.getAttribute('data-accion')).toBe('buscar guia');
    // El guardado informa: vive en la barra de estado, junto a «Pendientes», no entre los botones de arriba.
    expect(cuenta.querySelector('[data-estado-guardado]')).toBeNull();
    expect(raiz.querySelector('app-estudio-barra-estado [data-estado-guardado]')).not.toBeNull();
    expect(cuenta.querySelector('a.enlace-probar')).not.toBeNull();
    expect(cuenta.querySelector('button[data-accion="ver-pendientes"] .solo-lector')!.textContent).toMatch(/^Pendientes: /);
    expect(cuenta.querySelector('app-tema-selector')).not.toBeNull();
    expect(cuenta.querySelector('ui-menu')).not.toBeNull();
    expect(cuenta.textContent).toContain('Marta Ríos');
    expect(cuenta.textContent).toContain('Docente');
  });

  it('con el asistente apagado no se ofrece su botón', async () => {
    const { raiz } = await irA('/portal/casos/41/editor', false);
    expect(raiz.querySelector('header [data-accion~="pedir-a-la-ia"]')).toBeNull();
    expect(boton(raiz, 'Ayuda')).toBeDefined();
  });

  it('la ayuda nunca se pliega: ningún botón es plegable y Ctrl+K queda anunciado en «Comandos» (la paleta)', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    const ayuda = raiz.querySelector('header [aria-label="Ayuda"]')!;
    expect(ayuda.querySelectorAll('.control-plegable')).toHaveLength(0);
    expect(raiz.querySelectorAll('header .control-plegable')).toHaveLength(0);
    // Ctrl+K abre la paleta de comandos del estudio (EDITOR-PRO.md §4); «Ayuda» sigue abriendo el buscador de la guía.
    expect(raiz.querySelector('[data-accion="comandos"]')!.getAttribute('aria-keyshortcuts')).toBe('Control+K');
  });

  it('con el buscador abierto la barra no cambia de estado; al cerrarlo cae al que le toca', async () => {
    const { raiz, listo } = await irA('/portal/casos/41/editor');
    const barra = raiz.querySelector('header')!;
    boton(raiz, 'Ayuda').click();
    await listo();
    expect(raiz.querySelector('app-buscador')).not.toBeNull();
    desplazarA(400);
    await listo();
    expect(barra.getAttribute('data-estado')).toBe('inicial');
    [...raiz.querySelectorAll<HTMLButtonElement>('app-buscador button')].find((b) => b.textContent?.trim() === 'Cerrar')!.click();
    await listo();
    expect(raiz.querySelector('app-buscador')).toBeNull();
    // Sin ayuda abierta, la barra recoge el desplazamiento que pasó mientras tanto.
    expect(barra.getAttribute('data-estado')).toBe('scroll');
  });

  it('con la guía abierta la barra tampoco cambia de estado', async () => {
    const { raiz, listo } = await irA('/portal/casos/41/editor');
    const barra = raiz.querySelector('header')!;
    const guia = TestBed.inject(GuiaService);
    await guia.mostrar('buscar', 'resaltar');
    await listo();
    expect(guia.activa()).not.toBeNull();
    desplazarA(400);
    await listo();
    expect(barra.getAttribute('data-estado')).toBe('inicial');
    guia.cerrar();
    await listo();
    expect(barra.getAttribute('data-estado')).toBe('scroll');
  });

  // E0 (EDITOR.md §3.1): las cuatro secciones de antes pasan a ser el hilo de cinco etapas, con su estado dicho en texto.
  it('el hilo del caso va dentro de la barra, en el módulo central, con las cinco etapas y su estado; no hay banda debajo', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    expect(raiz.querySelector('.banda')).toBeNull();
    const secciones = raiz.querySelector('header .modulo-principal nav[aria-label="Secciones del caso"]')!;
    expect([...secciones.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/portal/casos/41/editor/datos', '/portal/casos/41/editor/plano', '/portal/casos/41/editor',
      '/portal/casos/41/editor/evaluacion', '/portal/casos/41/editor/revision',
    ]);
    // Cada etapa se anuncia con su nombre completo y su estado, aunque por ancho se vea solo su número.
    const nombres = [...secciones.querySelectorAll('a')].map((a) => a.querySelector('.solo-lector')!.textContent!);
    expect(nombres.map((n) => n.split(',')[1].trim())).toEqual(['Datos del caso', 'Lugar y salas', 'Historia: escenas y guion', 'Evaluación', 'Enviar a revisión']);
    expect(nombres[2]).toMatch(/Historia: escenas y guion, \d+ de \d+ escenas? escritas?/);
    // Cada etapa lleva su estado también como forma (no solo color).
    expect([...secciones.querySelectorAll('.marca-estado')].every((m) => !!m.getAttribute('data-estado'))).toBe(true);
    // La guía las encuentra por su acción.
    for (const accion of ['datos-del-caso', 'definir-finales', 'enviar-revision']) expect(secciones.querySelector(`[data-accion~="${accion}"]`)).not.toBeNull();
    expect(raiz.querySelector('header [data-accion~="probar"]')).not.toBeNull();
    // La etapa en la que estás se marca para el lector de pantalla.
    expect(secciones.querySelector('a[aria-current="page"] .solo-lector')!.textContent).toMatch(/^Historia/);
  });

  it('las secciones nunca se pliegan al desplazarse: ninguna es plegable', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    expect(raiz.querySelectorAll('header .modulo-principal .control-plegable')).toHaveLength(0);
  });

  it('crear un caso (sin caso abierto) trae la misma barra y ninguna sección', async () => {
    const { raiz } = await irA('/portal/casos/nuevo');
    // Una sola barra del marco: las cabeceras dentro de <main> son de la página (crear un caso trae la suya).
    expect([...raiz.querySelectorAll('header')].filter((h) => !h.closest('main'))).toHaveLength(1);
    expect(raiz.querySelector('header .modulo-principal')!.textContent).toContain('Editor de casos');
    expect(raiz.querySelectorAll('nav[aria-label="Secciones del caso"] a')).toHaveLength(0);
  });

  it('el contenido es el destino de «Saltar al contenido principal» de la aplicación (#main-content)', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    expect(raiz.querySelector('main')!.id).toBe('main-content');
  });
});

describe('AutoriaShellComponent · el botón «Probar» de la barra', () => {
  afterEach(() => { vi.restoreAllMocks(); document.querySelectorAll('body > app-autoria-shell, body > [ng-version]').forEach((n) => n.remove()); });

  it('es un enlace al ensayo del caso, que abre otra pestaña, y la guía lo encuentra como «probar»', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    const enlace = raiz.querySelector<HTMLAnchorElement>('header .modulo-cuenta a.enlace-probar')!;
    expect(enlace.getAttribute('href')).toBe('/portal/casos/41/ensayo');
    expect(enlace.target).toBe('_blank');
    expect(enlace.rel).toContain('noopener');
    expect(enlace.getAttribute('aria-label')).toBe('Probar el caso en el juego (con Ctrl o clic central se abre en otra pestaña)');
    expect(enlace.textContent?.replace(/\s+/g, ' ').trim()).toBe('Probar ↗');
    expect(enlace.getAttribute('data-accion')).toBe('probar');
  });

  it('el clic va al ensayo en esta pestaña cuando lo pendiente se guardó, con el título para el umbral', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    const store = TestBed.inject(CasoStore);
    const abrir = vi.spyOn(window, 'open');
    const sincronizado = vi.spyOn(store, 'sincronizado').mockResolvedValue();
    const navegar = vi.spyOn(store, 'navegar').mockResolvedValue(true);
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    raiz.querySelector<HTMLAnchorElement>('a.enlace-probar')!.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith('/portal/casos/41/ensayo', { umbral: { titulo: expect.any(String) } }));
    expect(sincronizado).toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
  });
});

describe('AutoriaShellComponent · «Probar» ya no es una pantalla del editor', () => {
  afterEach(() => document.querySelectorAll('body > app-autoria-shell, body > [ng-version]').forEach((n) => n.remove()));

  it('la barra no tiene la sección «Probar como estudiante» y sí el botón «Probar»', async () => {
    const { raiz } = await irA('/portal/casos/41/editor');
    const nombres = [...raiz.querySelectorAll('header a')].map((a) => a.getAttribute('aria-label'));
    expect(nombres).not.toContain('Probar como estudiante');
    expect(nombres).toContain('Probar el caso en el juego (con Ctrl o clic central se abre en otra pestaña)');
  });

  it('/probar redirige a El caso', async () => {
    const { raiz } = await irA('/portal/casos/41/editor/probar');
    expect(raiz.querySelector('main h1')!.textContent).toContain('Escenas y caminos');
  });
});

// req: pedido del usuario del 2026-11-22: «volver» es un módulo de la barra que lleva al menú anterior dentro del editor.
describe('Editor de casos: el módulo «volver» de la barra', () => {
  const volver = (harness: RouterTestingHarness) => (harness.routeNativeElement as HTMLElement).querySelector<HTMLAnchorElement>('header a.volver')!;

  it('desde una pantalla principal vuelve a Casos y su nombre accesible es su propio texto', async () => {
    const { harness } = await irA('/portal/casos/41/editor');
    expect(volver(harness).getAttribute('href')).toBe('/portal/casos');
    expect(volver(harness).textContent!.trim()).toBe('Volver a casos');
    expect(volver(harness).hasAttribute('aria-label')).toBe(false);
  });

  it('desde el guion de una escena vuelve a Caminos', async () => {
    const { harness, listo } = await irA('/portal/casos/41/editor');
    const id = TestBed.inject(CasoStore).caso()!.escenas[0].id;
    await harness.navigateByUrl(`/portal/casos/41/editor/escena/${id}`);
    await listo();
    expect(volver(harness).getAttribute('href')).toBe('/portal/casos/41/editor');
    expect(volver(harness).textContent!.trim()).toBe('Volver a Caminos');
  });

  it('a una sala abierta desde el Plano, vuelve al Plano', async () => {
    const { harness, listo } = await irA('/portal/casos/41/editor/plano');
    const sala = TestBed.inject(CasoStore).caso()!.salas[0].id;
    await harness.navigateByUrl(`/portal/casos/41/editor/sala/${sala}`);
    await listo();
    expect(volver(harness).getAttribute('href')).toBe('/portal/casos/41/editor/plano');
    expect(volver(harness).textContent!.trim()).toBe('Volver al Plano');
  });
});

// req: pedido del usuario del 2026-11-22: la pasarela del docente (agregar sin volver a menús anteriores).
describe('Editor de casos: la pasarela del docente', () => {
  it('el guion muestra la escena anterior y la siguiente arriba, e invita a escribir la siguiente si está vacía', async () => {
    const { harness, listo } = await irA('/portal/casos/41/editor');
    const store = TestBed.inject(CasoStore);
    const [primera, segunda] = store.caso()!.escenas;
    await harness.navigateByUrl(`/portal/casos/41/editor/escena/${primera.id}`);
    await listo();
    const raiz = harness.routeNativeElement as HTMLElement;
    const siguiente = raiz.querySelector<HTMLAnchorElement>('.guion-nav__enlace--siguiente')!;
    expect(siguiente).not.toBeNull();
    const vacia = !segunda.lineas.length && !segunda.respuestas.length;
    expect(siguiente.textContent!.replace(/\s+/g, ' ').trim()).toContain(vacia ? 'Escribir la escena 2' : 'Escena 2');
    expect(siguiente.getAttribute('href')).toBe(`/portal/casos/41/editor/escena/${segunda.id}`);
  });

  it('«Agregar → Escena nueva» la crea después de la actual y abre su guion', async () => {
    const { harness, listo } = await irA('/portal/casos/41/editor');
    const store = TestBed.inject(CasoStore);
    const antes = store.caso()!.escenas.length;
    const shell = harness.routeDebugElement!.componentInstance as { agregar(v: string): Promise<void> };
    await shell.agregar('escena');
    await listo();
    expect(store.caso()!.escenas.length).toBe(antes + 1);
    const nueva = store.caso()!.escenas[antes];
    expect(TestBed.inject(Router).url).toBe(`/portal/casos/41/editor/escena/${nueva.id}`);
  });

  it('el siguiente paso está a la vista en la barra de estado', async () => {
    const { raiz } = await irA('/portal/casos/41/editor/datos');
    const siguiente = raiz.querySelector<HTMLButtonElement>('app-estudio-barra-estado .est-siguiente')!;
    expect(siguiente).not.toBeNull();
    expect(siguiente.textContent).toContain('Siguiente:');
    expect(siguiente.textContent!.length).toBeGreaterThan('Siguiente: →'.length);
  });
});
