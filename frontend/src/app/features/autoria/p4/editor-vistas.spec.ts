import { TestBed } from '@angular/core/testing';
import { abrirEditor } from '../marco/marco.testing';
import { ProgresoDelCaso } from '../marco/progreso.service';
import { alPulsarProbar } from '../ensayo';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('P4 · contrato visible del editor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('body > [ng-version]').forEach(n => n.remove());
  });

  it('el título largo cede y las cinco etapas conservan sus nombres desde 1280 px', async () => {
    const { raiz, store, listo } = await abrirEditor('/portal/casos/41/editor');
    const caso = structuredClone(store.caso()!);
    caso.titulo = 'Violencia Familiar y Tentativa de Feminicidio — tres capítulos';
    store.fijar(caso);
    await listo();
    expect(raiz.querySelector<HTMLElement>('.caso-actual')!.title).toBe(caso.titulo);
    expect(raiz.querySelectorAll('.hilo__numero')).toHaveLength(5);
    expect(raiz.querySelectorAll('.hilo__etapa[aria-describedby]')).toHaveLength(5);
    const leer = (ruta: string) => readFileSync(join(__dirname, ruta), 'utf8');
    const shell = leer('../autoria-shell.component.ts');
    const hilo = leer('../marco/hilo-del-caso.component.ts');
    const barra = leer('../../../../styles/components/_autoria.scss');
    expect(shell).toMatch(/flex: 1 1 12rem; min-inline-size: 0/);
    expect(barra).toMatch(/grid-template-columns: minmax\(0, 1fr\) auto/);
    expect(barra).toMatch(/justify-self: stretch/);
    // Por debajo de 75rem los nombres ceden; el círculo numerado de cada etapa se ve siempre.
    expect(hilo).toMatch(/max-width: 74\.999rem[\s\S]*?\.hilo__nombre \{ display: none; \}/);
    expect(hilo).not.toMatch(/\.hilo__numero \{ display: none/);
    expect([...raiz.querySelectorAll('.hilo__nombre')].map(e => e.textContent?.trim())).toEqual(['Datos', 'Lugar', 'Historia', 'Evaluación', 'Enviar']);
    expect(barra).toMatch(/max-width: 99\.999rem[\s\S]*?menu-agregar[\s\S]*?ui-button__label/);
  });

  it('barra, Evaluación y Enviar muestran el mismo total confirmado por servidor', async () => {
    const { raiz, store, servidor, harness, listo } = await abrirEditor('/portal/casos/41/editor');
    servidor.hallazgos = [{ code: 'CASE_NO_TIME', severity: 'error', message: 'Falta tiempo.' }];
    await store.revisarConServidor();
    await listo();
    const total = store.totalPendientes();
    expect(total).toBe(1);
    expect(store.pendientes().some(p => p.tipo === 'sugerencia')).toBe(true);
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
    expect(raiz.querySelector('app-estudio-barra-estado')!.textContent!.match(/por resolver/g)).toHaveLength(1);
    expect(raiz.querySelectorAll('section.por-resolver li.problema')).toHaveLength(total);
    expect(barra().textContent).toContain(`Pendientes: ${total}`);
  });

  it('la compuerta manda con un final narrado y una sala de escucha sin respuestas ni conexión', async () => {
    const { raiz, store, servidor, harness, listo } = await abrirEditor('/portal/casos/41/editor');
    const caso = structuredClone(store.caso()!);
    const final = caso.escenas[0];
    final.esFinal = true; final.narracion = 'La intervenci?n ha terminado y la persona recibe acompa?amiento.';
    final.lineas = []; final.respuestas = [];
    const escucha = caso.escenas[1];
    escucha.esFinal = false; escucha.narracion = 'En esta sala la persona puede escuchar con tranquilidad.';
    escucha.lineas = []; escucha.respuestas = [];
    caso.inicioId = final.id;
    servidor.hallazgos = [];
    store.fijar(caso);
    await listo();
    store.registrarRevision([]);
    await listo();
    expect(store.totalPendientes()).toBe(0);
    expect(TestBed.inject(ProgresoDelCaso).avance().find(e => e.etapa === 'historia')?.detalle).toContain('2 de 2');
    expect(raiz.querySelector('header button[data-accion="ver-pendientes"]')!.textContent).toContain('Pendientes: 0 por resolver');
    await harness.navigateByUrl('/portal/casos/41/editor/revision');
    await listo();
    expect(raiz.querySelector('#fl')!.textContent).toBe('Por resolver (0)');
    expect(store.pendientes().filter(p => p.tipo !== 'sugerencia')).toHaveLength(0);
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
