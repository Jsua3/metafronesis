import { TestBed } from '@angular/core/testing';
import { abrirEditor } from '../marco/marco.testing';
import { ProgresoDelCaso } from '../marco/progreso.service';
import { alPulsarProbar } from '../ensayo';

describe('P4 · contrato visible del editor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('body > [ng-version]').forEach(n => n.remove());
  });

  it('barra, Evaluación y Enviar muestran el mismo total incluyendo escribir y servidor', async () => {
    const { raiz, store, servidor, harness, listo } = await abrirEditor('/portal/casos/41/editor');
    servidor.hallazgos = [{ code: 'CASE_NO_TIME', severity: 'error', message: 'Falta tiempo.' }];
    await store.revisarConServidor();
    await listo();
    const total = store.totalPendientes();
    expect(total).toBeGreaterThan(TestBed.inject(ProgresoDelCaso).porCorregir().length);
    const barra = () => raiz.querySelector('header button[data-accion="ver-pendientes"]')!;
    expect(barra().textContent).toContain(`Pendientes: ${total} por resolver antes de enviar`);
    await harness.navigateByUrl('/portal/casos/41/editor/evaluacion');
    await listo();
    expect(raiz.querySelector('app-evaluacion')!.textContent).toContain(`${total} por resolver antes de enviar el caso.`);
    expect(barra().textContent).toContain(`Pendientes: ${total}`);
    await harness.navigateByUrl('/portal/casos/41/editor/revision');
    await listo();
    expect(store.totalPendientes()).toBe(total);
    expect(raiz.querySelector('#fl')!.textContent).toBe(`Por resolver (${total})`);
    expect(raiz.querySelectorAll('section.por-resolver li.problema')).toHaveLength(total);
    expect(barra().textContent).toContain(`Pendientes: ${total}`);
  });

  it('una escena con relleno no tiene marca de completa y el título largo conserva su nombre accesible', async () => {
    const { raiz, store, listo } = await abrirEditor('/portal/casos/41/editor');
    const caso = structuredClone(store.caso()!);
    caso.titulo = 'Primera atención con escucha y apoyo a la persona consultante.'.slice(0, 60);
    expect(caso.titulo.length).toBe(60);
    caso.escenas[0].lineas.push({ id: 'muestra', personajeId: caso.personajes[0].id, texto: '[diálogo]', expresion: 'neutral', marcaIa: false });
    store.fijar(caso);
    await listo();
    const fila = raiz.querySelector('app-riel-de-escenas .riel__lista a')!;
    expect(fila.textContent).toContain('Por escribir');
    expect(fila.textContent).not.toContain('Completa');
    const titulo = raiz.querySelector<HTMLElement>('header .caso-actual')!;
    expect(titulo.title).toBe(caso.titulo);
    expect(titulo.textContent).toContain(caso.titulo);
    expect(titulo.getAttribute('aria-hidden')).not.toBe('true');
  });

  it('el aviso visible deshace la aceptación y desaparece al editar después', async () => {
    const { raiz, store, listo } = await abrirEditor('/portal/casos/41/editor');
    const caso = structuredClone(store.caso()!);
    caso.escenas[0].marcaIa = true;
    store.fijar(caso);
    store.aceptarIa({ escenaId: caso.escenas[0].id });
    await listo();
    const aviso = raiz.querySelector('[data-deshacer-ia]')!;
    expect(aviso.closest('[aria-live="polite"]')).not.toBeNull();
    aviso.querySelector<HTMLButtonElement>('button')!.click();
    await listo();
    expect(store.caso()!.escenas[0].marcaIa).toBe(true);
    store.aceptarIa({ escenaId: caso.escenas[0].id });
    store.editarEscena(caso.escenas[0].id, { titulo: 'Edición posterior' });
    await listo();
    expect(raiz.querySelector('[data-deshacer-ia]')).toBeNull();
  });

  it('una ventana bloqueada se anuncia sin navegar; una cola sin conexión impide probar datos antiguos', async () => {
    const { store, servidor, raiz, listo } = await abrirEditor('/portal/casos/41/editor');
    const navegar = vi.spyOn(store, 'navegar');
    await alPulsarProbar(new MouseEvent('click'), store, undefined, () => null);
    await listo();
    expect(raiz.querySelector('.deshacer-zona')!.textContent).toContain('Permite las ventanas emergentes');
    expect(navegar).not.toHaveBeenCalled();
    servidor.fallar('updateNode', 0);
    store.editarEscena(store.caso()!.escenas[0].id, { titulo: 'Espera la conexión' });
    await store.sincronizado();
    const ventana = { opener: {}, closed: false, location: { href: '' }, close: vi.fn() };
    await alPulsarProbar(new MouseEvent('click'), store, undefined, () => ventana as unknown as Window);
    expect(ventana.close).toHaveBeenCalledOnce();
    expect(ventana.location.href).toBe('');
    expect(navegar).not.toHaveBeenCalled();
  });
});
