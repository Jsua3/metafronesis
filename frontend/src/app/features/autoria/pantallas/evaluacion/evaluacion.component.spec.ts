import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { CasoStore } from '../../estado/caso.store';
import { injectLlevar } from '../../marco/llevar';
import type { CasoBorrador } from '../../modelo/caso';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { nuevaRespuesta } from '../../modelo/fabricas';
import { rutasDePrueba } from '../../testing/rutas';
import { universidad } from '../../testing/universidad';
import { GuionComponent } from '../guion/guion.component';
import { EvaluacionComponent, claveDePaso } from './evaluacion.component';
import { separarMarca } from './fila-de-paso.component';

/**
 * E5 · «Pasos profesionales» (EDITOR.md §3.5): la lista inversa de los hitos del caso. Los casos de «Hitos del caso» que
 * vivían bajo el mapa (`editor.hitos.spec.ts`) se mudaron aquí con la pantalla.
 */

/** Un caso de la universidad con dos respuestas en el consultorio; la primera cumple «Valorar el riesgo». */
let base: CasoBorrador | null = null;
function casoBase(): CasoBorrador {
  base ??= armarCaso();
  return structuredClone(base); // los mismos ids en cada prueba: así se pueden comparar dos casos enteros
}

function armarCaso(): CasoBorrador {
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
  const [a, b] = caso.escenas;
  a.respuestas = [nuevaRespuesta('r0', b.id, { texto: 'Pasa, por favor.', clase: 'ACCEPTABLE' })];
  b.respuestas = [
    nuevaRespuesta('r1', null, { texto: 'Cuéntame cómo te sientes en casa.', clase: 'RECOMMENDED', efectos: { hitos: ['valorar_el_riesgo'] } }),
    nuevaRespuesta('r2', null, { texto: 'Vamos a revisar tus derechos.', clase: 'RECOMMENDED' }),
  ];
  b.esFinal = true;
  return caso;
}

const proveedores = () => [
  provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } },
  { provide: UiDialog, useValue: { consequence: vi.fn().mockResolvedValue('proceed') } },
];

async function montar(caso: CasoBorrador = casoBase()) {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [EvaluacionComponent], providers: proveedores() }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(caso);
  const fixture = TestBed.createComponent(EvaluacionComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await listo();
  return { fixture, store, raiz: fixture.nativeElement as HTMLElement, listo };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === texto)!;

/** Elige una acción del menú «Más» de un paso (`ui-menu`): abre el menú por el nombre de su botón y pulsa el ítem. */
async function elegirEnMenu(raiz: HTMLElement, listo: () => Promise<void>, menu: string, item: string): Promise<void> {
  raiz.querySelector<HTMLButtonElement>(`button[aria-label="${menu}"]`)!.click();
  await listo();
  const opcion = [...raiz.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent?.includes(item));
  expect(opcion, `«${item}» en el menú «${menu}»`).toBeTruthy();
  opcion!.click();
  await listo();
}

/** Marca una respuesta desde «Agregar respuesta» del paso `clave`. */
async function marcarDesdeElPaso(raiz: HTMLElement, listo: () => Promise<void>, clave: string, texto: string): Promise<void> {
  raiz.querySelector<HTMLButtonElement>(`#agregar-${clave}`)!.click();
  await listo();
  const casilla = [...raiz.querySelectorAll<HTMLLabelElement>('app-selector-de-respuestas label.respuesta')]
    .find((l) => l.textContent?.includes(texto))!.querySelector('input')!;
  casilla.click();
  await listo();
}

describe('EvaluacionComponent · Pasos profesionales (E5)', () => {
  afterEach(() => document.querySelectorAll('body > app-evaluacion, body > [ng-version], body > div').forEach((n) => n.remove()));

  it('CU-evaluación · lista cada paso con su ancla hito-<clave>, la cobertura y las respuestas que lo cumplen', async () => {
    const { raiz, store } = await montar();
    const caso = store.caso()!;
    for (const h of caso.hitos) {
      const fila = raiz.querySelector<HTMLElement>(`#hito-${h.clave}`)!;
      expect(fila, h.clave).not.toBeNull();
      expect(fila.getAttribute('tabindex')).toBe('-1');
    }
    expect(raiz.querySelector('.cobertura')!.textContent).toContain(`1 de ${caso.hitos.length} pasos`);
    expect(raiz.querySelector('#hito-valorar_el_riesgo')!.textContent).toContain('Cuéntame cómo te sientes en casa.');
    expect(raiz.querySelector('#hito-valorar_el_riesgo')!.textContent).toContain('2 · Consultorio');
  });

  it('los pasos sin respuesta van primero, y no se reordenan mientras se marca', async () => {
    const { raiz, listo } = await montar();
    const orden = () => [...raiz.querySelectorAll('app-fila-de-paso article')].map((a) => a.id);
    const antes = orden();
    expect(antes.at(-1)).toBe('hito-valorar_el_riesgo'); // el único con respuesta, al final
    await marcarDesdeElPaso(raiz, listo, 'informar_derechos', 'Vamos a revisar tus derechos.');
    expect(orden()).toEqual(antes);
  });

  it('CU-evaluación · marcar desde un paso deja el MISMO caso que marcar la casilla en la ficha de la respuesta', async () => {
    // Por la ficha de la respuesta (el guion, faceta «Pasos»)…
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [GuionComponent], providers: proveedores() }).compileComponents();
    let store = TestBed.inject(CasoStore);
    store.fijar(casoBase());
    const guion = TestBed.createComponent(GuionComponent);
    guion.componentRef.setInput('escenaId', store.caso()!.escenas[1].id);
    await guion.whenStable();
    guion.detectChanges();
    guion.nativeElement.querySelector('#faceta-boton-pasos-r2').click();
    await guion.whenStable();
    guion.detectChanges();
    const casilla = [...guion.nativeElement.querySelectorAll('#faceta-pasos-r2 label')]
      .find((l: Element) => l.textContent?.includes('Informar derechos'))!.querySelector('input') as HTMLInputElement;
    casilla.click();
    await guion.whenStable();
    const porLaFicha = structuredClone(store.caso());

    // …y por el paso, en Evaluación.
    const { raiz, listo, store: otro } = await montar();
    store = otro;
    await marcarDesdeElPaso(raiz, listo, 'informar_derechos', 'Vamos a revisar tus derechos.');
    expect(store.caso()!.escenas[1].respuestas[1].efectos.hitos).toEqual(['informar_derechos']);
    expect(store.caso()).toEqual(porLaFicha);
  });

  it('quitar una ficha le quita la marca a la respuesta y deja el foco en «Agregar respuesta» del mismo paso', async () => {
    const { raiz, store, listo } = await montar();
    raiz.querySelector<HTMLButtonElement>('#hito-valorar_el_riesgo .ficha__quitar')!.click();
    await listo();
    expect(store.caso()!.escenas[1].respuestas[0].efectos.hitos).toBeUndefined();
    expect(document.activeElement?.id).toBe('agregar-valorar_el_riesgo');
    expect(raiz.querySelector('[role="status"].solo-lector')!.textContent).toContain('ya no cumple «Valorar el riesgo»');
  });

  it('«Decide el final» es un interruptor que cambia el hito decisivo', async () => {
    const { raiz, store, listo } = await montar();
    const informar = raiz.querySelector<HTMLInputElement>('#hito-informar_derechos input[role="switch"]')!;
    expect(informar.checked).toBe(false);
    informar.click();
    await listo();
    expect(store.caso()!.hitos.find((h) => h.clave === 'informar_derechos')!.decisivo).toBe(true);
  });

  it('agregar un paso crea el hito con una clave propia y lleva el foco a «Agregar respuesta»', async () => {
    const { raiz, store, listo } = await montar();
    boton(raiz, 'Agregar un paso').click();
    await listo();
    expect(document.activeElement?.id).toBe('nuevo-nombre');
    boton(raiz, 'Agregar el paso').click();
    await listo();
    expect(raiz.querySelector('.nuevo [role="alert"]')!.textContent).toContain('Escribe el nombre del paso.');
    const nombre = raiz.querySelector<HTMLInputElement>('#nuevo-nombre')!;
    nombre.value = 'Cerrar la atención';
    nombre.dispatchEvent(new Event('input'));
    boton(raiz, 'Agregar el paso').click();
    await listo();
    expect(store.caso()!.hitos.at(-1)).toEqual({ clave: 'cerrar_la_atencion', nombre: 'Cerrar la atención', descripcion: '', decisivo: false });
    expect(document.activeElement?.id).toBe('agregar-cerrar_la_atencion');
  });

  it('borrar un paso pide confirmación, dice cuántas respuestas lo marcan y les quita la marca', async () => {
    const { raiz, store, listo } = await montar();
    await elegirEnMenu(raiz, listo, 'Más acciones del paso Valorar el riesgo', 'Borrar el paso');
    const confirmar = raiz.querySelector('#hito-valorar_el_riesgo [role="alertdialog"]')!;
    expect(confirmar.textContent).toContain('Lo marca 1 respuesta: se le quitará la marca.');
    boton(raiz, 'Borrar el paso').click();
    await listo();
    expect(store.caso()!.hitos.some((h) => h.clave === 'valorar_el_riesgo')).toBe(false);
    expect(store.caso()!.escenas[1].respuestas[0].efectos.hitos).toBeUndefined();
  });

  it('no deja borrar un paso que nombra la condición de un final propio, y dice cuál', async () => {
    const caso = casoBase();
    caso.modoFinales = 'propio';
    caso.finales = [{ id: 'f1', nombre: 'Bien atendida', texto: 'Bien.', tono: 'positive', condicion: { milestone: 'valorar_el_riesgo' }, marcaIa: false }];
    const { raiz, listo } = await montar(caso);
    await elegirEnMenu(raiz, listo, 'Más acciones del paso Valorar el riesgo', 'Borrar el paso');
    const confirmar = raiz.querySelector('#hito-valorar_el_riesgo [role="alertdialog"]')!;
    expect(confirmar.textContent).toContain('El final «Bien atendida» lo nombra en su condición.');
    expect([...confirmar.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Conservar el paso']);
  });

  it('un paso que nadie puede cumplir avisa que es por corregir; con escenas por escribir no es un aviso', async () => {
    const porEscribir = casoBase();
    porEscribir.escenas[1].respuestas = []; // el consultorio todavía sin escribir: el paso es trabajo por hacer, no un error
    const { raiz, store, listo } = await montar(porEscribir);
    expect(raiz.querySelector('#hito-informar_derechos .paso__aviso')).toBeNull();
    const escrito = casoBase();
    for (const e of escrito.escenas) e.lineas = [{ id: `l-${e.id}`, personajeId: escrito.personajes[0].id, texto: 'Hola', expresion: 'neutral', marcaIa: false }];
    store.fijar(escrito);
    await listo();
    expect(raiz.querySelector('#hito-informar_derechos .paso__aviso')!.textContent).toContain('Nadie puede cumplirlo todavía');
    expect(raiz.querySelector('#hito-informar_derechos')!.getAttribute('data-estado')).toBe('con-pendientes');
    expect(raiz.querySelector('#hito-valorar_el_riesgo .paso__aviso')).toBeNull();
  });

  it('en solo lectura todo se ve y nada se puede cambiar', async () => {
    const caso = casoBase();
    caso.estado = 'IN_REVIEW';
    const { raiz } = await montar(caso);
    expect(raiz.querySelectorAll('app-fila-de-paso')).toHaveLength(caso.hitos.length);
    expect(raiz.querySelector('#agregar-paso')).toBeNull();
    expect(raiz.querySelector('[id^="agregar-valorar"]')).toBeNull();
    expect(raiz.querySelector('ui-menu')).toBeNull();
    expect(raiz.querySelector('.ficha__quitar')).toBeNull();
    expect(raiz.querySelector<HTMLInputElement>('input[role="switch"]')!.disabled).toBe(true);
    expect(raiz.querySelector('#hito-valorar_el_riesgo')!.textContent).toContain('Cuéntame cómo te sientes en casa.');
  });

  it('en ninguna parte aparece una cifra de estrés o de puntaje', async () => {
    const { raiz } = await montar();
    expect(raiz.textContent).not.toMatch(/estr[eé]s|puntaje|puntos/i);
  });
});

describe('Pasos profesionales · funciones puras', () => {
  it('la marca «[por validar con Psicología]» sale del texto y queda como dato aparte', () => {
    expect(separarMarca('Explorar las señales de riesgo. [por validar con Psicología]')).toEqual({ descripcion: 'Explorar las señales de riesgo.', porValidar: true });
    expect(separarMarca('Sin marca.')).toEqual({ descripcion: 'Sin marca.', porValidar: false });
  });

  it('la clave de un paso nuevo sale del nombre y no repite una que ya existe', () => {
    expect(claveDePaso('Cerrar la atención', [])).toBe('cerrar_la_atencion');
    expect(claveDePaso('Cerrar la atención', ['cerrar_la_atencion'])).toBe('cerrar_la_atencion_2');
    expect(claveDePaso('¡¡!!', [])).toBe('paso');
  });
});

describe('Pasos profesionales · «Llévame ahí»', () => {
  afterEach(() => document.querySelectorAll('body > [ng-version], body > div').forEach((n) => n.remove()));

  it('un paso inalcanzable de la hoja de pendientes lleva a Evaluación y enfoca su fila', async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [provideRouter(rutasDePrueba), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
    }).compileComponents();
    const store = TestBed.inject(CasoStore);
    store.fijar(casoBase());
    const harness = await RouterTestingHarness.create();
    document.body.appendChild(harness.fixture.nativeElement);
    await harness.navigateByUrl(`/portal/casos/${store.caso()!.id}/editor/datos`);
    const llevar = TestBed.runInInjectionContext(() => injectLlevar());
    await llevar({ ruta: '/editor/evaluacion', ancla: 'hito-informar_derechos' });
    harness.detectChanges();
    expect(document.activeElement?.id).toBe('hito-informar_derechos');
  });
});
