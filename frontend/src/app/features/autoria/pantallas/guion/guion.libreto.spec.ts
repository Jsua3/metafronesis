import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { escenasEnOrden } from '../../modelo/progreso';
import { GuionComponent } from './guion.component';

/**
 * El guion como libreto (EDITOR.md §3.4, bloque E2): borrar con confirmación que nombra lo que depende, atajos de teclado,
 * anclas de «Llévame ahí» dentro de una faceta cerrada y facetas que se abren de a una.
 */

/** El diálogo de confirmación, falso: responde lo que diga la prueba y guarda lo que se le preguntó. */
const dialogoFalso = (respuesta: 'proceed' | 'continue' = 'proceed') => ({ consequence: vi.fn().mockResolvedValue(respuesta) });

async function montar(dialogo = dialogoFalso()) {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [GuionComponent],
    providers: [
      provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
      { provide: UiDialog, useValue: dialogo },
    ],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  const id = store.caso()!.escenas[1].id;
  const fixture = TestBed.createComponent(GuionComponent);
  fixture.componentRef.setInput('escenaId', id);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  return { fixture, store, id, raiz: fixture.nativeElement as HTMLElement, listo };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;

/** Elige una acción de un menú «Más» (`ui-menu`): abre el menú por el nombre de su botón y pulsa el ítem. */
async function elegirEnMenu(raiz: HTMLElement, listo: () => Promise<void>, menu: string, item: string): Promise<void> {
  raiz.querySelector<HTMLButtonElement>(`button[aria-label="${menu}"]`)!.click();
  await listo();
  const opcion = [...raiz.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent?.includes(item));
  expect(opcion, `«${item}» en el menú «${menu}»`).toBeTruthy();
  opcion!.click();
  await listo();
}

describe('GuionComponent · borrar con lo que depende (EDITOR.md §4.6)', () => {
  /** La segunda escena con una respuesta escrita (id de servidor 57) que ofrece un objeto de su sala y que lleva a la primera. */
  async function conRespuestaOfrecida(dialogo: ReturnType<typeof dialogoFalso>) {
    const montado = await montar(dialogo);
    const caso = structuredClone(montado.store.caso()!);
    const [primera, segunda] = caso.escenas;
    const sala = caso.salas.find((s) => s.id === segunda.salaId)!;
    sala.objetos = [{ ...sala.objetos[0], decisionOptionId: 57 }, ...sala.objetos.slice(1)];
    segunda.respuestas = [{
      id: '57', texto: 'Validar su miedo', clase: 'RECOMMENDED', razon: '', retroalimentacion: 'Respira.', efectos: {},
      destinoId: primera.id, marcaIa: false,
    }];
    montado.store.fijar(caso);
    await montado.listo();
    const objeto = caso.catalogo.objetos.find((o) => o.id === sala.objetos[0].ref)?.nombre ?? sala.objetos[0].ref;
    return { ...montado, objeto, sala };
  }

  it('borrar una respuesta escrita pide confirmación y nombra el objeto de la sala que la ofrece; «Conservarla» no borra', async () => {
    const dialogo = dialogoFalso('continue');
    const { store, id, raiz, listo, objeto, sala } = await conRespuestaOfrecida(dialogo);
    await elegirEnMenu(raiz, listo, 'Más acciones de la respuesta 1', 'Borrar la respuesta 1');
    await vi.waitFor(() => expect(dialogo.consequence).toHaveBeenCalledTimes(1));
    const pregunta = dialogo.consequence.mock.calls[0][0];
    expect(pregunta).toMatchObject({ title: '¿Borrar la respuesta 1?', proceedLabel: 'Borrar la respuesta 1', continueLabel: 'Conservarla' });
    expect(pregunta.consequence).toContain(`La ofrece «${objeto}» de la sala ${sala.nombre}.`);
    expect(store.caso()!.escenas.find((e) => e.id === id)!.respuestas).toHaveLength(1);
  });

  it('confirmar el borrado de la respuesta la quita del caso', async () => {
    const { store, id, raiz, listo } = await conRespuestaOfrecida(dialogoFalso('proceed'));
    await elegirEnMenu(raiz, listo, 'Más acciones de la respuesta 1', 'Borrar la respuesta 1');
    await vi.waitFor(() => expect(store.caso()!.escenas.find((e) => e.id === id)!.respuestas).toHaveLength(0));
  });

  it('borrar la escena nombra las respuestas que llegan a ella y quién pasa a ser el inicio', async () => {
    const dialogo = dialogoFalso('continue');
    const montado = await montar(dialogo);
    const caso = structuredClone(montado.store.caso()!);
    caso.escenas[1].respuestas = [{
      id: 'r1', texto: 'Volver', clase: 'ACCEPTABLE', razon: '', retroalimentacion: '', efectos: {}, destinoId: caso.escenas[0].id, marcaIa: false,
    }];
    montado.store.fijar(caso);
    montado.fixture.componentRef.setInput('escenaId', caso.escenas[0].id);
    await montado.listo();
    await elegirEnMenu(montado.raiz, montado.listo, 'Más acciones de la escena', 'Borrar la escena');
    await vi.waitFor(() => expect(dialogo.consequence).toHaveBeenCalledTimes(1));
    const texto = dialogo.consequence.mock.calls[0][0].consequence as string;
    expect(texto).toContain(`Llegan aquí: Respuesta A de 2 · ${caso.escenas[1].titulo}. Quedarán sin destino.`);
    expect(texto).toContain(`Es el inicio del caso: «${caso.escenas[1].titulo}» pasará a serlo.`);
    expect(montado.store.caso()!.escenas).toHaveLength(2); // «Conservarla»: no se borró
  });
});

describe('GuionComponent · teclado, anclas y facetas', () => {
  it('Ctrl+Enter en una línea guarda lo escrito y crea la siguiente debajo, con el mismo personaje y el foco', async () => {
    const { fixture, store, id, raiz, listo } = await montar();
    document.body.appendChild(fixture.nativeElement);
    boton(raiz, 'Agregar una línea').click();
    await listo();
    boton(raiz, 'Agregar una línea').click();
    await listo();
    const otro = store.caso()!.personajes[1].id;
    const [primera] = store.caso()!.escenas.find((e) => e.id === id)!.lineas;
    store.editarLinea(id, primera.id, { personajeId: otro });
    await listo();
    const campo = raiz.querySelector<HTMLTextAreaElement>('#lt0')!;
    campo.value = 'Hola';
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await listo();
    const lineas = store.caso()!.escenas.find((e) => e.id === id)!.lineas;
    expect(lineas).toHaveLength(3);
    expect(lineas[0].texto).toBe('Hola');
    expect(lineas[1].personajeId).toBe(otro);
    expect(lineas[1].texto).toBe('');
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('lt1'));
    fixture.nativeElement.remove();
  });

  it('«Llévame ahí» a las competencias de una respuesta abre su faceta cerrada y le pasa el foco', async () => {
    const { fixture, store, id, raiz, listo } = await montar();
    store.fijar({ ...store.caso()!, competencias: [{ codigo: 'ETICA', nombre: 'Ética profesional' }] });
    document.body.appendChild(fixture.nativeElement);
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const r = store.caso()!.escenas.find((e) => e.id === id)!.respuestas[0];
    expect(raiz.querySelector('fieldset.competencias')).toBeNull(); // la faceta está cerrada
    document.getElementById(`competencias-${r.id}`)!.focus(); // lo que hace «Llévame ahí»
    await listo();
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('FIELDSET'));
    expect(document.activeElement?.id).toBe(`competencias-${r.id}`);
    expect(raiz.querySelector(`button.faceta[aria-controls="faceta-criterios-${r.id}"]`)!.getAttribute('aria-expanded')).toBe('true');
    fixture.nativeElement.remove();
  });

  it('las facetas se abren de a una y Esc cierra la abierta', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const ficha = (nombre: string) =>
      [...raiz.querySelectorAll<HTMLButtonElement>('button.faceta')].find((b) => b.querySelector('.faceta__nombre')!.textContent === nombre)!;
    ficha('Pasos').click();
    await listo();
    ficha('Persona').click();
    await listo();
    const abiertas = () => [...raiz.querySelectorAll('button.faceta[aria-expanded="true"]')].map((b) => b.querySelector('.faceta__nombre')!.textContent);
    expect(abiertas()).toEqual(['Persona']);
    raiz.querySelector('fieldset.persona input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await listo();
    expect(abiertas()).toEqual([]);
  });

  it('Alt+2 clasifica la respuesta enfocada como Aceptable', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    raiz.querySelector('#rt0')!.dispatchEvent(new KeyboardEvent('keydown', { key: '2', altKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.respuestas[0].clase).toBe('ACCEPTABLE');
  });

  it('Ctrl+Mayús+Enter agrega una respuesta', async () => {
    const { store, id, raiz, listo } = await montar();
    raiz.querySelector('#en')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.respuestas).toHaveLength(1);
  });

  it('en la última escena del recorrido el pie dice qué etapa sigue: Evaluación (flujo guiado, EDITOR.md §3.1)', async () => {
    const { fixture, store, listo, raiz } = await montar();
    const ultima = escenasEnOrden(store.caso()!).at(-1)!;
    fixture.componentRef.setInput('escenaId', ultima.id);
    await listo();
    const pie = raiz.querySelector('nav.pie')!;
    expect(pie.textContent).not.toContain('Escena siguiente');
    expect(pie.querySelector('[data-accion="siguiente-etapa"]')?.textContent).toContain('Evaluación');
  });
});
