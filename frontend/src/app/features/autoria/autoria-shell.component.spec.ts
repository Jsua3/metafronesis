import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { AutoriaShellComponent } from './autoria-shell.component';
import { rutasEditorCaso, rutasNuevoCaso } from './autoria.routes';
import { CasoStore } from './estado/caso.store';
import type { CasoBorrador } from './modelo/caso';
import { copiarEscenarioAlCaso } from './modelo/copiar';
import { casoCopiadoDeLugar } from './testing/caso-api';
import { cuentaDePrueba } from './testing/cuenta';
import { rutasDePrueba } from './testing/rutas';
import { ServidorFalso } from './testing/servidor-falso';
import { universidad } from './testing/universidad';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';

const caso: CasoBorrador = {
  id: 'caso-1', revision: 0, hitos: [], nivelRiesgo: null, titulo: 'Primera escucha en Bienestar', lugarId: 'universidad', salas: [], escenas: [],
  inicioId: null, modoFinales: 'automatico', finales: [], personajes: [],
  catalogo: { muebles: [], objetos: [], herramientas: [] },
};

const asistente = { assistantStatus: () => of({ enabled: true, mode: 'connected', remainingToday: 5 }) };

function boton(raiz: HTMLElement, texto: string): HTMLButtonElement | undefined {
  return [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes(texto)) as HTMLButtonElement | undefined;
}

describe('AutoriaShellComponent (marco)', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AutoriaShellComponent],
      providers: [provideRouter(rutasDePrueba), { provide: AuthoringApi, useValue: asistente }, cuentaDePrueba],
    }).compileComponents();
  });

  it('muestra el nombre del caso bajo la barra', async () => {
    TestBed.inject(CasoStore).fijar(caso);
    const fixture = TestBed.createComponent(AutoriaShellComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('header .caso-actual').textContent).toContain('Primera escucha en Bienestar');
  });

  async function montarApp() {
    const store = TestBed.inject(CasoStore);
    store.fijar(copiarEscenarioAlCaso(universidad, ['pasillo', 'consultorio'], 'Caso'));
    const fixture = TestBed.createComponent(AutoriaShellComponent);
    document.body.appendChild(fixture.nativeElement);
    const listo = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      await fixture.whenStable();
    };
    await listo();
    return { store, fixture, raiz: fixture.nativeElement as HTMLElement, listo };
  }

  afterEach(() => document.querySelectorAll('body > app-autoria-shell, body > [ng-version], body > textarea, body > div.prueba').forEach((n) => n.remove()));

  it('«Saltar al contenido» no recarga la página: lleva el foco al contenido', async () => {
    const { raiz, listo } = await montarApp();
    const enlace = raiz.querySelector<HTMLAnchorElement>('a.saltar')!;
    const clic = new MouseEvent('click', { bubbles: true, cancelable: true });
    enlace.dispatchEvent(clic);
    await listo();
    expect(clic.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('main-content');
  });

  it('abrir el asistente lleva el foco al panel', async () => {
    const { raiz, listo } = await montarApp();
    boton(raiz, 'Asistente de IA')!.click();
    await listo();
    expect(document.activeElement?.id).toBe('iat');
  });

  it('cerrar y volver a abrir el asistente conserva lo que estaba escrito', async () => {
    const { raiz, listo } = await montarApp();
    boton(raiz, 'Asistente de IA')!.click();
    await listo();
    const campo = raiz.querySelector<HTMLTextAreaElement>('#panel-ia textarea')!;
    campo.value = 'Agrega una respuesta inadecuada';
    campo.dispatchEvent(new Event('input'));
    await listo();
    raiz.querySelector<HTMLButtonElement>('[aria-label="Cerrar el asistente"]')!.click();
    await listo();
    boton(raiz, 'Asistente de IA')!.click();
    await listo();
    expect(raiz.querySelector<HTMLTextAreaElement>('#panel-ia textarea')!.value).toBe('Agrega una respuesta inadecuada');
  });

  it('deshacer y rehacer valen para la sala y los atiende su pantalla: el marco no los toma', async () => {
    const { store, listo } = await montarApp();
    const antes = store.caso()!.escenas.length;
    store.agregarEscena('pasillo');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(store.caso()!.escenas.length).toBe(antes + 1);
  });

  it('al cerrar o recargar la pestaña, lo que se estaba escribiendo se confirma antes de irse', async () => {
    const { store, listo } = await montarApp();
    const e = store.caso()!.escenas[0];
    store.agregarLinea(e.id);
    await listo();
    const campo = document.createElement('textarea');
    // El navegador suelta el cambio del campo al perder el foco; jsdom no, así que se simula con blur.
    campo.addEventListener('blur', () => store.editarLinea(e.id, store.caso()!.escenas[0].lineas[0].id, { texto: campo.value }));
    document.body.appendChild(campo);
    campo.focus();
    campo.value = 'Texto a medias';
    window.dispatchEvent(new Event('pagehide'));
    expect(store.caso()!.escenas[0].lineas[0].texto).toBe('Texto a medias');
  });
});

describe('AutoriaShellComponent · como ruta del programa', () => {
  async function irA(
    url: string,
    servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 }), universidad),
    extra: Provider[] = [],
  ) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'portal/casos/nuevo', children: rutasNuevoCaso },
          { path: 'portal/casos/:caseVersionId/editor', children: rutasEditorCaso },
          { path: 'portal/casos', children: [] },
        ]),
        { provide: AuthoringApi, useValue: { ...servidor.api, assistantStatus: asistente.assistantStatus } },
        cuentaDePrueba,
        ...extra,
      ],
    }).compileComponents();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const raiz = harness.routeNativeElement as HTMLElement;
    const listo = async () => {
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 0));
        await harness.fixture.whenStable();
        harness.detectChanges();
      }
    };
    await listo();
    return { servidor, harness, raiz, listo, store: TestBed.inject(CasoStore) };
  }

  it('abre el caso que dice la dirección y pinta sus escenas dentro del marco', async () => {
    const { raiz, servidor, store } = await irA('/portal/casos/41/editor');
    expect(servidor.llamadasA('caseEditor')).toHaveLength(1);
    expect(store.caso()!.id).toBe('41');
    expect(raiz.querySelector('header .caso-actual')!.textContent).toContain('Primera escucha en Bienestar');
    expect(raiz.querySelector('main h1')!.textContent).toContain('Escenas y caminos');
    // Los enlaces del marco cuelgan del caso abierto y de la lista de casos: «volver» (el círculo de la banda del teléfono),
    // las cinco etapas del hilo y «Probar» en la barra, y la pieza «volver» de escritorio, aparte de la barra (2026-11-22).
    // Cada «volver» se ve en su ancho; los dos llevan al mismo sitio.
    const enlaces = [...raiz.querySelectorAll<HTMLAnchorElement>('header a')].map((a) => a.getAttribute('href'));
    expect(enlaces).toEqual([
      '/portal/casos', '/portal/casos/41/editor/datos', '/portal/casos/41/editor/plano', '/portal/casos/41/editor',
      '/portal/casos/41/editor/evaluacion', '/portal/casos/41/editor/revision', '/portal/casos/41/ensayo', '/portal/casos',
    ]);
  });

  it('si el caso no se puede abrir, lo dice y deja volver a intentarlo o volver a Mis casos', async () => {
    const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio'], { caseVersionId: 41, revision: 3 }), universidad);
    servidor.fallar('caseEditor', 404);
    const { raiz, listo, store } = await irA('/portal/casos/41/editor', servidor);
    expect(raiz.querySelector('main')!.textContent).toContain('No pudimos abrir el caso');
    expect(raiz.querySelector('main')!.textContent).toContain('No encontramos ese caso');
    expect(store.caso()).toBeNull();
    expect(raiz.querySelector('main a.boton')!.getAttribute('href')).toBe('/portal/casos');

    boton(raiz, 'Volver a intentarlo')!.click();
    await listo();
    expect(raiz.querySelector('main h1')!.textContent).toContain('Escenas y caminos');
  });

  it('un conflicto de revisión se avisa con «Recargar el caso» y no pierde lo escrito', async () => {
    const { raiz, listo, servidor, store } = await irA('/portal/casos/41/editor');
    servidor.otraSesionEscribe();
    const id = store.caso()!.escenas[0].id;
    store.editarEscena(id, { titulo: 'Recibir a Camila con calma' });
    await store.sincronizado();
    await listo();

    const aviso = raiz.querySelector('[role="alert"]')!;
    expect(aviso.textContent).toContain('Este caso cambió mientras lo editabas');
    expect(aviso.textContent).toContain('Recibir a Camila con calma');
    expect(raiz.querySelector('[data-estado-guardado]')!.textContent).toContain('Hay cambios sin guardar');

    boton(raiz, 'Recargar el caso')!.click();
    await listo();
    expect(raiz.querySelector('[role="alert"]')).toBeNull();
    expect(raiz.textContent).toContain('Esto no se alcanzó a guardar');
    expect(raiz.textContent).toContain('Recibir a Camila con calma'); // sigue a la vista, para volver a escribirlo
    boton(raiz, 'Ya lo copié')!.click();
    await listo();
    expect(raiz.textContent).not.toContain('Esto no se alcanzó a guardar');
  });

  it('un cambio que el servidor rechaza se dice con palabras llanas y se puede cerrar', async () => {
    const { raiz, listo, servidor, store } = await irA('/portal/casos/41/editor');
    servidor.fallar('updateNode', 500);
    store.moverEscena(store.caso()!.escenas[0].id, 50, 50);
    await store.sincronizado();
    await listo();
    expect(raiz.querySelector('.aviso-error')!.textContent).toContain('No se pudo guardar la posición de la escena. Lo dejamos como estaba.');
    boton(raiz, 'Entendido')!.click();
    await listo();
    expect(raiz.querySelector('.aviso-error')).toBeNull();
  });

  it('crear un caso no abre ninguno: el marco queda sin caso y solo ofrece Mis casos', async () => {
    const { raiz, servidor } = await irA('/portal/casos/nuevo');
    expect(servidor.llamadasA('caseEditor')).toHaveLength(0);
    expect(raiz.querySelector('main h1')!.textContent).toContain('¿Dónde pasa tu caso?');
    // Solo la marca y «Mis casos» de la barra: sin caso no hay secciones.
    // Solo los enlaces del marco: la página de crear un caso trae su propia barra de pasos dentro de <main>.
    expect([...raiz.querySelectorAll<HTMLAnchorElement>('nav a')].filter((a) => !a.closest('main')).map((a) => a.getAttribute('href'))).toEqual(['/portal/casos']);
  });

  it('salir del editor espera a que lo pendiente llegue al servidor y cierra el caso', async () => {
    const { harness, servidor, store, listo } = await irA('/portal/casos/41/editor');
    store.moverEscena(store.caso()!.escenas[0].id, 5, 5);
    await harness.navigateByUrl('/portal/casos');
    await listo();
    await store.sincronizado();
    await new Promise((r) => setTimeout(r, 0));
    expect(servidor.llamadasA('updateNode')).toHaveLength(1); // lo pendiente no se perdió
    expect(store.caso()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/portal/casos');
  });

  // ─── Ronda de arreglos 1, tanda S ───────────────────────────────────────────────

  it('S8 · el indicador cuenta las respuestas que solo están en pantalla, no dice «Todo guardado»', async () => {
    const { raiz, listo, store } = await irA('/portal/casos/41/editor');
    // E0: el indicador vive en la barra de estado; a la vista va la forma corta y la frase entera es la que se anuncia (y la del globo).
    const indicador = () => raiz.querySelector('app-estudio-barra-estado [data-estado-guardado] .solo-lector')!.textContent!.trim();
    expect(indicador()).toBe('Todo guardado');

    const origen = store.caso()!.escenas[0];
    const r = store.agregarRespuesta(origen.id);
    store.editarRespuesta(origen.id, r, { texto: 'A medias' });
    await store.sincronizado();
    await listo();
    expect(indicador()).toBe('Falta elegir la clase de 1 respuesta: solo está en esta pantalla');

    store.editarRespuesta(origen.id, r, { clase: 'ACCEPTABLE' }); // ya tiene clase, falta a dónde lleva
    await store.sincronizado();
    await listo();
    expect(indicador()).toBe('Falta completar 1 respuesta: solo está en esta pantalla');

    store.editarRespuesta(origen.id, r, { destinoId: store.caso()!.escenas[1].id });
    await store.sincronizado();
    await listo();
    expect(indicador()).toBe('Todo guardado');
  });

  it('S7 · el aviso de conflicto y el de error se traen a la vista con el foco al aparecer, sin robarlo en cada guardado', async () => {
    const { raiz, listo, servidor, store } = await irA('/portal/casos/41/editor');
    const origen = store.caso()!.escenas[0];

    servidor.fallar('updateNode', 500);
    store.moverEscena(origen.id, 5, 5);
    await store.sincronizado();
    await listo();
    const error = raiz.querySelector<HTMLElement>('.aviso-error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(error);

    // un guardado normal no mueve el foco
    const campo = document.createElement('input');
    document.body.appendChild(campo);
    campo.focus();
    store.moverEscena(origen.id, 9, 9);
    await store.sincronizado();
    await listo();
    expect(document.activeElement).toBe(campo);

    servidor.otraSesionEscribe();
    store.moverEscena(origen.id, 11, 11);
    await store.sincronizado();
    await listo();
    expect(document.activeElement).toBe(raiz.querySelector('.aviso-conflicto'));
    campo.remove();
  });

  it('S7 · los avisos no ponen encabezados antes del título de la pantalla', async () => {
    const { raiz, listo, servidor, store } = await irA('/portal/casos/41/editor');
    servidor.otraSesionEscribe();
    store.moverEscena(store.caso()!.escenas[0].id, 5, 5);
    await store.sincronizado();
    await listo();
    expect(raiz.querySelector('.aviso-conflicto')).not.toBeNull();
    expect(raiz.querySelector('app-avisos-guardado h1, app-avisos-guardado h2, app-avisos-guardado h3')).toBeNull();
    const encabezados = [...raiz.querySelectorAll('h1, h2, h3')].map((h) => h.tagName);
    expect(encabezados[0]).toBe('H1');
  });

  it('S1 · salir con un conflicto pregunta, y «Seguir editando» se queda; «Salir sin guardar» sale', async () => {
    const respuestas: Array<'continue' | 'proceed'> = ['continue', 'proceed'];
    const consequence = vi.fn(async (_opciones: unknown) => respuestas.shift()!);
    const { harness, listo, servidor, store } = await irA('/portal/casos/41/editor', undefined, [{ provide: UiDialog, useValue: { consequence } }]);
    servidor.otraSesionEscribe();
    store.moverEscena(store.caso()!.escenas[0].id, 5, 5);
    await store.sincronizado();

    await harness.navigateByUrl('/portal/casos');
    await listo();
    expect(consequence).toHaveBeenCalledTimes(1);
    expect(consequence.mock.calls[0][0]).toMatchObject({ title: 'Tienes cambios sin guardar', continueLabel: 'Seguir editando', proceedLabel: 'Salir sin guardar' });
    expect((consequence.mock.calls[0][0] as { consequence: string }).consequence).toContain('otra persona cambió el caso');
    expect(TestBed.inject(Router).url).toBe('/portal/casos/41/editor');

    await harness.navigateByUrl('/portal/casos');
    await listo();
    expect(consequence).toHaveBeenCalledTimes(2);
    expect(TestBed.inject(Router).url).toBe('/portal/casos');
  });

  it('S1 · salir con una respuesta a medias pregunta; con todo guardado sale sin preguntar', async () => {
    const consequence = vi.fn(async (_opciones: unknown) => 'proceed' as const);
    const { harness, listo, store } = await irA('/portal/casos/41/editor', undefined, [{ provide: UiDialog, useValue: { consequence } }]);
    const origen = store.caso()!.escenas[0];
    store.moverEscena(origen.id, 3, 3); // un cambio en vuelo no pregunta: se espera a que llegue
    await harness.navigateByUrl('/portal/casos/nuevo');
    await listo();
    expect(consequence).not.toHaveBeenCalled();

    await harness.navigateByUrl('/portal/casos/41/editor');
    await listo();
    const r = store.agregarRespuesta(store.caso()!.escenas[0].id);
    store.editarRespuesta(store.caso()!.escenas[0].id, r, { texto: 'Sin terminar' });
    await store.sincronizado();
    await harness.navigateByUrl('/portal/casos');
    await listo();
    expect(consequence).toHaveBeenCalledTimes(1);
    expect((consequence.mock.calls[0][0] as { consequence: string }).consequence).toContain('1 respuesta sin completar');
  });

  it('S1 · cerrar la pestaña pregunta con las mismas condiciones', async () => {
    const { listo, store, servidor } = await irA('/portal/casos/41/editor');
    const cerrar = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(cerrar()).toBe(false);
    servidor.otraSesionEscribe();
    store.moverEscena(store.caso()!.escenas[0].id, 5, 5);
    await store.sincronizado();
    await listo();
    expect(cerrar()).toBe(true);
  });

  describe('A3 · lo escrito en un campo no se pierde al salir sin salir del campo', () => {
    /** Un campo como los del editor: guarda al perder el foco (jsdom no suelta el `change` solo, así que se simula con blur). */
    function campoConCambioPendiente(store: CasoStore, titulo: string): HTMLTextAreaElement {
      const campo = document.createElement('textarea');
      campo.addEventListener('blur', () => store.editarEscena(store.caso()!.escenas[0].id, { titulo: campo.value }));
      document.body.appendChild(campo);
      campo.focus();
      campo.value = titulo;
      return campo;
    }

    afterEach(() => document.querySelectorAll('body > textarea').forEach((n) => n.remove()));

    it('cerrar la pestaña con el cursor en un campo pregunta y el cambio entra a la cola', async () => {
      const { listo, store, servidor } = await irA('/portal/casos/41/editor');
      campoConCambioPendiente(store, 'Escrito sin salir del campo');
      const cerrar = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(cerrar);
      expect(cerrar.defaultPrevented).toBe(true);
      await store.sincronizado();
      await listo();
      expect(store.caso()!.escenas[0].titulo).toBe('Escrito sin salir del campo');
      expect(servidor.llamadasA('updateNode').length).toBeGreaterThan(0);
    });

    it('salir del editor con el cursor en un campo guarda lo escrito y sale sin preguntar', async () => {
      const consequence = vi.fn(async (_opciones: unknown) => 'proceed' as const);
      const { harness, listo, store, servidor } = await irA('/portal/casos/41/editor', undefined, [{ provide: UiDialog, useValue: { consequence } }]);
      campoConCambioPendiente(store, 'Titulo al salir');
      await harness.navigateByUrl('/portal/casos');
      await listo();
      expect(consequence).not.toHaveBeenCalled();
      expect(TestBed.inject(Router).url).toBe('/portal/casos');
      const guardado = servidor.llamadasA('updateNode').at(-1)!.args.map((a) => JSON.stringify(a)).join(' ');
      expect(guardado).toContain('Titulo al salir');
    });

    it('un cambio que el sistema rechazó y se deshizo cuenta como algo que se pierde: salir pregunta y lo dice', async () => {
      const consequence = vi.fn(async (_opciones: unknown) => 'continue' as const);
      const { harness, listo, store, servidor } = await irA('/portal/casos/41/editor', undefined, [{ provide: UiDialog, useValue: { consequence } }]);
      servidor.fallar('updateNode', 400, 'No.', { campo: 'title' });
      store.editarEscena(store.caso()!.escenas[0].id, { titulo: 'No se pudo' });
      await store.sincronizado();
      await listo();
      expect(store.error()).not.toBeNull();
      await harness.navigateByUrl('/portal/casos');
      await listo();
      expect(consequence).toHaveBeenCalledTimes(1);
      expect((consequence.mock.calls[0][0] as { consequence: string }).consequence).toContain('no se guardó');
      expect(TestBed.inject(Router).url).toBe('/portal/casos/41/editor');
    });

    it('cerrar la pestaña con un cambio rechazado pregunta; si el aviso se descarta, ya no', async () => {
      const { listo, store, servidor } = await irA('/portal/casos/41/editor');
      servidor.fallar('updateNode', 400, 'No.', { campo: 'title' });
      store.editarEscena(store.caso()!.escenas[0].id, { titulo: 'No se pudo' });
      await store.sincronizado();
      await listo();
      const cerrar = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(cerrar);
      expect(cerrar.defaultPrevented).toBe(true);
      store.descartarError();
      const otra = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(otra);
      expect(otra.defaultPrevented).toBe(false);
    });
  });
});
