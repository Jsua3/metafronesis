import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { universidad } from '../../testing/universidad';
import { CasoStore } from '../../estado/caso.store';
import { DeshacerBorrado } from '../../marco/deshacer-borrado';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { GuionComponent } from './guion.component';


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

describe('GuionComponent', () => {
  it('los recursos de apoyo de la escena se escriben uno por línea y respaldan la casilla «protocolos de seguridad»', async () => {
    const { store, id, raiz, listo } = await montar();
    // Vacío, «Antes de decidir» está plegado y dice qué le falta.
    expect(raiz.querySelector('#antes-titulo')!.getAttribute('aria-expanded')).toBe('false');
    expect(raiz.querySelector('#antes-titulo')!.textContent).toContain('sin recursos de apoyo');
    raiz.querySelector<HTMLButtonElement>('#antes-titulo')!.click();
    await listo();
    const campo = raiz.querySelector<HTMLTextAreaElement>('#recursos-escena')!;
    expect(campo.labels?.[0].textContent).toContain('Recursos de apoyo para el estudiante');
    campo.value = 'Línea de atención de Bienestar\n\n  Consultorio de psicología, piso 2  \n';
    campo.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.recursosApoyo).toEqual(['Línea de atención de Bienestar', 'Consultorio de psicología, piso 2']);
    expect(campo.value).toBe('Línea de atención de Bienestar\nConsultorio de psicología, piso 2');
  });

  it('escribir una línea la guarda con su personaje y expresión', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una línea').click();
    await listo();
    const texto = raiz.querySelector<HTMLTextAreaElement>('textarea[id^="lt"]')!;
    texto.value = 'Hola, cuéntame qué te trae por aquí.';
    texto.dispatchEvent(new Event('change'));
    // La ficha de expresión abre las seis caras dibujadas (no una lista de texto) y se elige mirando.
    raiz.querySelector<HTMLButtonElement>('button#le0')!.click();
    await listo();
    const caras = [...raiz.querySelectorAll<HTMLButtonElement>('#le-panel-0 button')];
    expect(caras).toHaveLength(6);
    expect(caras.every((c) => c.querySelector('img'))).toBe(true);
    caras.find((c) => c.dataset['expresion'] === 'alegre')!.click();
    await listo();
    const linea = store.caso()!.escenas.find((e) => e.id === id)!.lineas[0];
    expect(linea).toMatchObject({ texto: 'Hola, cuéntame qué te trae por aquí.', expresion: 'alegre', personajeId: 'psicologa-bienestar' });
    expect(raiz.querySelector('img.retrato')!.getAttribute('src')).toContain('psicologa-hospitalaria/portrait-alegre.png');
  });

  it('elegir «Una escena nueva» no crea nada hasta pulsar «Crear la escena nueva»', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const llevaA = raiz.querySelector<HTMLSelectElement>('select[id^="rl"]')!;
    llevaA.value = 'nueva';
    llevaA.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.escenas).toHaveLength(2);
    boton(raiz, 'Crear la escena nueva').click();
    await listo();
    const caso = store.caso()!;
    expect(caso.escenas).toHaveLength(3);
    expect(caso.escenas.find((e) => e.id === id)!.respuestas[0].destinoId).toBe(caso.escenas[2].id);
    expect(raiz.textContent).toContain('conectada a la respuesta 1');
  });

  it('lo sugerido por la IA se acepta elemento por elemento', async () => {
    const { store, id, raiz, listo } = await montar();
    const caso = store.caso()!;
    store.fijar({
      ...caso,
      escenas: caso.escenas.map((e) => (e.id !== id ? e : {
        ...e, lineas: [{ id: 'l1', personajeId: 'estudiante-consultante', texto: 'Hola', expresion: 'triste', marcaIa: true }],
      })),
    });
    await listo();
    expect(raiz.textContent).toContain('Sugerido por la IA');
    boton(raiz, 'Aceptar línea').click();
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.lineas[0].marcaIa).toBe(false);
    expect(raiz.textContent).not.toContain('Sugerido por la IA');
  });

  it('«Aceptar toda la escena» dice cuántas partes son, las baja todas y lo anuncia', async () => {
    const { fixture, store, id, raiz, listo } = await montar();
    const caso = structuredClone(store.caso()!);
    const escena = caso.escenas.find((e) => e.id === id)!;
    escena.marcaIa = true;
    escena.lineas.push({ id: 'l-ia', personajeId: caso.personajes[0].id, texto: 'Hola', expresion: 'neutral', marcaIa: true });
    escena.respuestas.push({ id: 'r-ia', texto: 'Cuéntame', clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: 'Bien.', destinoId: null, marcaIa: true });
    store.fijar(caso);
    document.body.appendChild(fixture.nativeElement);
    await listo();
    expect([...raiz.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Aceptar escena')).toBe(false);
    boton(raiz, 'Aceptar toda la escena (3 partes)').click();
    await listo();
    await new Promise((r) => setTimeout(r, 0));
    const despues = store.caso()!.escenas.find((e) => e.id === id)!;
    expect([despues.marcaIa, despues.lineas[0].marcaIa, despues.respuestas[0].marcaIa]).toEqual([false, false, false]);
    expect(raiz.querySelector('[role="status"].solo-lector')!.textContent!.trim()).toBe('Aceptaste todo lo sugerido en esta escena.');
    expect(raiz.textContent).not.toContain('Aceptar toda la escena');
    fixture.nativeElement.remove();
  });

  it('con una sola parte sugerida el botón dice «1 parte»', async () => {
    const { store, id, raiz, listo } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.escenas.find((e) => e.id === id)!.marcaIa = true;
    store.fijar(caso);
    await listo();
    expect(boton(raiz, 'Aceptar toda la escena (1 parte)')).toBeDefined();
  });

  const enCuerpo = async (fixture: { nativeElement: HTMLElement }, listo: () => Promise<void>) => {
    document.body.appendChild(fixture.nativeElement);
    await listo();
    await new Promise((r) => setTimeout(r, 0));
  };
  const anunciado = (raiz: HTMLElement) => raiz.querySelector('[role="status"].solo-lector')!.textContent!.trim();

  it('borrar una línea lo anuncia y deja el foco en la línea que quedó en su lugar', async () => {
    const { fixture, raiz, listo } = await montar();
    await enCuerpo(fixture, listo);
    boton(raiz, 'Agregar una línea').click();
    await listo();
    boton(raiz, 'Agregar una línea').click();
    await listo();
    await elegirEnMenu(raiz, listo, 'Más acciones de la línea 1', 'Borrar la línea 1');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.id).toBe('lt0');
    expect(anunciado(raiz)).toBe('Línea 1 borrada.');
    // Nada apunta a una línea: se borra en el acto y el marco ofrece «Deshacer» (EDITOR.md §4.6).
    expect(TestBed.inject(DeshacerBorrado).aviso()?.texto).toContain('Borraste una línea');
    fixture.nativeElement.remove();
  });

  it('borrar la única respuesta deja el foco en «Agregar una respuesta»', async () => {
    const { fixture, raiz, listo } = await montar();
    await enCuerpo(fixture, listo);
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    await elegirEnMenu(raiz, listo, 'Más acciones de la respuesta 1', 'Borrar la respuesta 1');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.textContent?.trim()).toBe('Agregar una respuesta');
    expect(anunciado(raiz)).toBe('Respuesta 1 borrada.');
    fixture.nativeElement.remove();
  });

  it('aceptar una línea de la IA lo anuncia y deja el foco en su texto', async () => {
    const { fixture, store, id, raiz, listo } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.escenas.find((e) => e.id === id)!.lineas.push({ id: 'l-ia', personajeId: caso.personajes[0].id, texto: 'Hola', expresion: 'neutral', marcaIa: true });
    store.fijar(caso);
    await enCuerpo(fixture, listo);
    boton(raiz, 'Aceptar línea').click();
    await listo();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.id).toBe('lt0');
    expect(anunciado(raiz)).toBe('Línea 1 aceptada.');
    fixture.nativeElement.remove();
  });

  it('una respuesta nueva no trae ninguna clasificación marcada y pide elegirla', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const radios = [...raiz.querySelectorAll<HTMLInputElement>('li.respuesta fieldset.clasificacion input[type="radio"]')];
    expect(radios.length).toBe(4);
    expect(radios.some((r) => r.checked)).toBe(false);
    // La ficha dice por qué no se guarda con las palabras de `motivoSinGuardar` y la marca «Solo en esta pantalla».
    expect(raiz.querySelector('li.respuesta .sin-guardar')!.textContent).toContain('Solo en esta pantalla');
    expect(raiz.querySelector('li.respuesta')!.textContent).toContain('Elige cómo es esta respuesta para guardarla.');
    radios[0].click();
    await listo();
    expect(raiz.querySelector('li.respuesta')!.textContent).not.toContain('Elige cómo es esta respuesta para guardarla.');
  });

  it('una respuesta clasificada que aún no lleva a ninguna escena dice que queda en el borrador', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    raiz.querySelectorAll<HTMLInputElement>('li.respuesta input[type="radio"]')[0].click();
    await listo();
    expect(raiz.querySelector('li.respuesta .sin-guardar')!.textContent).toContain('Elige a qué escena lleva para guardarla.');
  });

  it('ofrece las cuatro clases de respuesta y guarda la que se elige', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const opciones = [...raiz.querySelectorAll<HTMLLabelElement>('fieldset.clasificacion label')].map((l) => l.textContent!.replace(/[✓▲✕]/g, '').trim());
    expect(opciones).toEqual(['Recomendada', 'Aceptable', 'Con riesgo', 'Contraindicada']);
    raiz.querySelector<HTMLInputElement>('fieldset.clasificacion input[value="RISKY"]')!.click();
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.respuestas[0].clase).toBe('RISKY');
    expect(raiz.querySelector('textarea[id^="rz"]')).toBeNull();
  });

  it('una respuesta contraindicada pide la razón y la guarda', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    raiz.querySelector<HTMLInputElement>('fieldset.clasificacion input[value="CONTRAINDICATED"]')!.click();
    await listo();
    const razon = raiz.querySelector<HTMLTextAreaElement>('textarea[id^="rz"]')!;
    expect(raiz.textContent).toContain('Explica por qué esta respuesta puede hacerle daño a la persona.');
    razon.value = 'Apura a la persona.';
    razon.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.respuestas[0]).toMatchObject({ clase: 'CONTRAINDICATED', razon: 'Apura a la persona.' });
    expect(raiz.textContent).not.toContain('Explica por qué esta respuesta');
  });

  it('cada respuesta trae «Aparece si…» y «Cómo reacciona», y avisa si todas las respuestas tienen requisito', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const [a, b] = store.caso()!.escenas.find((e) => e.id === id)!.respuestas;
    // Cerradas, las facetas dicen su valor; «Ver todo abierto» las abre todas.
    expect([...raiz.querySelectorAll('li.respuesta')][0].textContent).toContain('siempre');
    boton(raiz, 'Ver todo abierto').click();
    await listo();
    for (const r of [a, b]) {
      expect(raiz.querySelector(`fieldset#aparece-si-${r.id} legend`)!.textContent).toBe('Aparece si…');
      expect(raiz.querySelector(`fieldset#reaccion-${r.id} legend`)!.textContent).toBe('Cómo reacciona');
    }
    expect(raiz.querySelector('#aviso-todas-con-requisito')).toBeNull();

    store.editarRequisito(id, a.id, { milestone: 'x' });
    await listo();
    expect(raiz.querySelector('#aviso-todas-con-requisito')).toBeNull(); // la otra aparece siempre
    store.editarRequisito(id, b.id, { milestone: 'y' });
    await listo();
    expect(raiz.querySelector('#aviso-todas-con-requisito')!.textContent)
      .toContain('Todas las respuestas tienen un requisito: deja al menos una que aparezca siempre.');
    store.editarRequisito(id, b.id, {});
    await listo();
    expect(raiz.querySelector('#aviso-todas-con-requisito')).toBeNull();
  });
});

describe('GuionComponent · Probar desde aquí', () => {
  it('es un enlace a la ruta del ensayo desde esa escena, que abre otra pestaña', async () => {
    const { store, id, raiz, listo } = await montar();
    vi.spyOn(store, 'nodoDeEscena').mockReturnValue(12);
    store.fijar({ ...store.caso()!, id: '41' }); // el caso abierto es el 41
    await listo();
    const enlace = raiz.querySelector<HTMLAnchorElement>('a[data-accion="probar"]')!;
    expect(enlace.getAttribute('href')).toBe('/portal/casos/41/ensayo?desde=12');
    expect(enlace.target).toBe('_blank');
    expect(enlace.rel).toContain('noopener');
    expect(enlace.getAttribute('aria-label')).toBe('Probar desde aquí, en el juego (se abre en otra pestaña)');
    expect(enlace.textContent?.trim()).toBe('Probar desde aquí ↗');
    expect(id).toBeTruthy();
  });

  it('el clic primario guarda lo pendiente y va al ensayo en esta pestaña; Ctrl+clic abre otra pestaña ya sincronizada', async () => {
    const { store, raiz, listo } = await montar();
    vi.spyOn(store, 'nodoDeEscena').mockReturnValue(12);
    store.fijar({ ...store.caso()!, id: '41' });
    await listo();
    const sincronizado = vi.spyOn(store, 'sincronizado').mockResolvedValue();
    const navegar = vi.spyOn(store, 'navegar').mockResolvedValue(true);
    // Ctrl+clic: el navegador no sigue el enlace a ciegas; se abre una pestaña provisional y recibe la dirección al guardar
    // (cambio de «Probar» de la pasada final de editor-b, `ensayo.ts`).
    const pestana = { opener: {}, closed: false, close: vi.fn(), location: { href: '' } };
    const abrir = vi.spyOn(window, 'open').mockReturnValue(pestana as unknown as Window);
    const enlace = raiz.querySelector<HTMLAnchorElement>('a[data-accion="probar"]')!;
    const conCtrl = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    enlace.dispatchEvent(conCtrl);
    expect(conCtrl.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(pestana.location.href).toBe('/portal/casos/41/ensayo?desde=12'));
    expect(navegar).not.toHaveBeenCalled();
    abrir.mockClear();
    const primario = new MouseEvent('click', { bubbles: true, cancelable: true });
    enlace.dispatchEvent(primario);
    expect(primario.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith('/portal/casos/41/ensayo?desde=12', { umbral: { titulo: expect.any(String) } }));
    expect(sincronizado).toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
    abrir.mockRestore();
  });

  it('una escena sin guardar no ofrece el enlace y dice por qué', async () => {
    const { raiz } = await montar(); // un borrador en memoria: ninguna escena tiene número en el servidor
    expect(raiz.querySelector('a[data-accion="probar"]')).toBeNull();
    const boton = raiz.querySelector<HTMLButtonElement>('button[data-accion="probar"]')!;
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    expect(raiz.querySelector('#probar-aviso')!.textContent).toContain('Guarda la escena para probarla.');
    expect(boton.getAttribute('aria-describedby')).toBe('probar-aviso');
  });
});
