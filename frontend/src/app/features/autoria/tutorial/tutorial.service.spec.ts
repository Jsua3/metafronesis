import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';

import { AutoriaShellComponent } from '../autoria-shell.component';
import { CasoStore } from '../estado/caso.store';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import { cuentaDePrueba } from '../testing/cuenta';
import { rutasDePrueba } from '../testing/rutas';
import { universidad } from '../testing/universidad';
import { CAPITULOS } from './capitulos';
import { leerProgreso } from './progreso-tutorial';
import { TutorialService } from './tutorial.service';

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [AutoriaShellComponent],
    providers: [
      provideRouter(rutasDePrueba, withComponentInputBinding()),
      { provide: BibliotecaService, useValue: { escenario: async () => universidad, lugares: async () => [] } },
      cuentaDePrueba,
    ],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(AutoriaShellComponent);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 0)); await fixture.whenStable(); fixture.detectChanges(); } };
  return { tutorial: TestBed.inject(TutorialService), store, router: TestBed.inject(Router), listo };
}

/** Recorre todo el capítulo 1 (sin prácticos) hasta su logro. */
async function terminarBienvenida(tutorial: TutorialService) {
  for (let i = 0; i < CAPITULOS[0].pasos.length; i++) await tutorial.siguiente();
}

describe('TutorialService', { timeout: 15_000 }, () => {
  afterEach(() => {
    TestBed.inject(TutorialService).salir();
    document.body.innerHTML = '';
  });

  it('iniciar abre el capítulo 1 en el mapa y guarda el progreso con el caso', async () => {
    const { tutorial, store, router, listo } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await listo();
    expect(tutorial.activo()).toBe(true);
    expect(tutorial.capitulo().id).toBe('bienvenida');
    expect(router.url).toBe(`/portal/casos/${store.caso()!.id}/editor`);
    expect(leerProgreso(7)).toMatchObject({ casoId: store.caso()!.id, capitulo: 0, paso: 0 });
  });

  it('al terminar un capítulo muestra su logro y continuar pasa al siguiente', async () => {
    const { tutorial, store, listo } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await terminarBienvenida(tutorial);
    await listo();
    expect(tutorial.logro()?.id).toBe('bienvenida');
    expect(leerProgreso(7).completados).toEqual(['bienvenida']);
    await tutorial.continuar();
    await listo();
    expect(tutorial.capitulo().id).toBe('datos');
    expect(tutorial.logro()).toBeNull();
  });

  it('un paso práctico no avanza hasta cumplirse, y al cumplirse lo registra', async () => {
    const { tutorial, store, listo } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await terminarBienvenida(tutorial);
    await tutorial.continuar();
    await tutorial.siguiente(); // d-nombre → d-contexto (práctico)
    await listo();
    expect(tutorial.paso().id).toBe('d-contexto');
    await tutorial.siguiente();
    expect(tutorial.paso().id).toBe('d-contexto'); // no avanza
    store.editarFicha('Una madre llega a consulta con su hija.', store.caso()!.objetivos ?? []);
    await listo();
    expect(tutorial.cumplido()).toBe(true);
    await tutorial.siguiente();
    expect(tutorial.paso().id).toBe('d-objetivos');
    expect(leerProgreso(7).practicos).toEqual(['d-contexto']);
  });

  it('saltar un práctico avanza sin registrarlo', async () => {
    const { tutorial, store } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await terminarBienvenida(tutorial);
    await tutorial.continuar();
    await tutorial.siguiente();
    await tutorial.saltarPractico();
    expect(tutorial.paso().id).toBe('d-objetivos');
    expect(leerProgreso(7).practicos).toEqual([]);
  });

  it('salir guarda el progreso; iniciar de nuevo retoma en el mismo paso', async () => {
    const { tutorial, store } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await tutorial.siguiente();
    await tutorial.siguiente();
    tutorial.salir();
    expect(tutorial.activo()).toBe(false);
    await tutorial.iniciar(store.caso()!.id);
    expect(tutorial.paso().id).toBe(CAPITULOS[0].pasos[2].id);
    await tutorial.iniciar(store.caso()!.id, true);
    expect(tutorial.paso().id).toBe(CAPITULOS[0].pasos[0].id);
  });

  it('anterior vuelve al paso de antes, también entre capítulos', async () => {
    const { tutorial, store } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await terminarBienvenida(tutorial);
    await tutorial.continuar();
    await tutorial.anterior();
    expect(tutorial.capitulo().id).toBe('bienvenida');
    expect(tutorial.paso().id).toBe(CAPITULOS[0].pasos.at(-1)!.id);
  });

  it('en otro caso el tutorial se pausa', async () => {
    const { tutorial, store } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    store.fijar(copiarEscenarioAlCaso(universidad, ['consultorio'], 'Otro'));
    expect(tutorial.pausado()).toBe(true);
  });

  it('al recargar con el tutorial abierto se reconoce para reanudarlo; al salir, ya no', async () => {
    const { tutorial, store } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    tutorial.activo.set(false); // como tras recargar: el servicio nace apagado, la marca de la pestaña sigue
    expect(tutorial.estabaActivo(store.caso()!.id)).toBe(true);
    expect(tutorial.estabaActivo('otro')).toBe(false);
    tutorial.salir();
    expect(tutorial.estabaActivo(store.caso()!.id)).toBe(false);
  });

  it('desde la pausa, volver al caso espera a que el editor lo abra y retoma el paso', async () => {
    const { tutorial, store, router, listo } = await montar();
    const practica = store.caso()!;
    await tutorial.iniciar(practica.id);
    await tutorial.siguiente();
    store.fijar(copiarEscenarioAlCaso(universidad, ['consultorio'], 'Otro'));
    expect(tutorial.pausado()).toBe(true);
    // El editor abre el caso de la dirección un rato después de navegar (aquí, a mano).
    setTimeout(() => store.fijar(practica), 60);
    await tutorial.volverAlCaso();
    await listo();
    expect(tutorial.pausado()).toBe(false);
    expect(router.url).toBe(`/portal/casos/${practica.id}/editor`);
    expect(tutorial.paso().id).toBe(CAPITULOS[0].pasos[1].id);
  });

  it('en el guion el anillo sigue a la docente: respuesta nueva → su texto → sus cuatro clases', async () => {
    const { tutorial, store, listo } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    const ci = CAPITULOS.findIndex((c) => c.id === 'guion');
    const pi = CAPITULOS[ci].pasos.findIndex((p) => p.id === 'g-agregar');
    const interno = tutorial as unknown as { fijar(p: object): void; entrar(): Promise<void> };
    interno.fijar({ ...tutorial.estado(), capitulo: ci, paso: pi });
    await interno.entrar();
    await listo();
    expect(tutorial.fase()).toBeNull();
    expect(tutorial.consigna()).toContain('Agregar una respuesta');

    const escena = store.caso()!.inicioId ?? store.caso()!.escenas[0].id;
    const id = store.agregarRespuesta(escena);
    await listo();
    tutorial.actualizarFase();
    expect(tutorial.fase()).toBe(0);
    expect(tutorial.elemento()?.classList.contains('ficha__texto')).toBe(true);
    expect(tutorial.consigna()).toContain('Escribe lo que diría');

    store.editarRespuesta(escena, id, { texto: 'Te escucho.' });
    await listo();
    tutorial.actualizarFase();
    expect(tutorial.fase()).toBe(1);
    expect(tutorial.elemento()?.classList.contains('clasificacion')).toBe(true);
    expect(tutorial.elemento()?.querySelectorAll('input[type="radio"]').length).toBe(4);
    expect(tutorial.consigna()).toContain('cuatro');
  });

  it('Esc sale del tutorial', async () => {
    const { tutorial, store } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tutorial.activo()).toBe(false);
  });

  describe('los atajos del pie de la burbuja', () => {
    const tecla = (init: KeyboardEventInit) => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    const esperar = () => new Promise((r) => setTimeout(r, 0));

    it('Alt+→ y Alt+← cambian de paso, también desde un campo de texto', async () => {
      const { tutorial, store } = await montar();
      await tutorial.iniciar(store.caso()!.id);
      const campo = document.body.appendChild(document.createElement('textarea'));
      campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
      await esperar();
      expect(tutorial.estado().paso).toBe(1);
      tecla({ key: 'ArrowLeft', altKey: true });
      await esperar();
      expect(tutorial.estado().paso).toBe(0);
    });

    it('Alt+→ en la insignia continúa al capítulo siguiente', async () => {
      const { tutorial, store } = await montar();
      await tutorial.iniciar(store.caso()!.id);
      await terminarBienvenida(tutorial);
      expect(tutorial.logro()).not.toBeNull();
      tecla({ key: 'ArrowRight', altKey: true });
      await vi.waitFor(() => expect(tutorial.capitulo().id).toBe('datos'));
      expect(tutorial.logro()).toBeNull();
    });

    it('Alt+→ en un práctico sin hacer lo salta, como «Saltar este paso»', async () => {
      const { tutorial, store } = await montar();
      await tutorial.iniciar(store.caso()!.id);
      await terminarBienvenida(tutorial);
      await tutorial.continuar();
      await tutorial.siguiente();
      expect(tutorial.paso().id).toBe('d-contexto');
      tecla({ key: 'ArrowRight', altKey: true });
      await vi.waitFor(() => expect(tutorial.paso().id).toBe('d-objetivos'));
      expect(leerProgreso(7).practicos).toEqual([]);
    });

    it('Alt+B lleva el foco a la burbuja (también si Opción+B escribe otra letra)', async () => {
      const { tutorial, store } = await montar();
      await tutorial.iniciar(store.caso()!.id);
      const antes = tutorial.focoBurbuja();
      tecla({ key: '∫', code: 'KeyB', altKey: true });
      expect(tutorial.focoBurbuja()).toBe(antes + 1);
    });

    it('Esc no cierra el tutorial si otra pieza ya la atendió o hay un diálogo abierto', async () => {
      const { tutorial, store } = await montar();
      await tutorial.iniciar(store.caso()!.id);
      const menu = document.body.appendChild(document.createElement('div'));
      menu.addEventListener('keydown', (e) => e.preventDefault());
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(tutorial.activo()).toBe(true);
      const dialogo = document.body.appendChild(document.createElement('div'));
      dialogo.setAttribute('aria-modal', 'true');
      tecla({ key: 'Escape' });
      expect(tutorial.activo()).toBe(true);
      dialogo.remove();
      tecla({ key: 'Escape' });
      expect(tutorial.activo()).toBe(false);
    });
  });
});
