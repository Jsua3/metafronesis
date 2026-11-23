import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthoringApi } from '../../../core/api/authoring.api';
import { CasoStore } from '../estado/caso.store';
import type { CasoBorrador } from '../modelo/caso';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import { universidad } from '../testing/universidad';
import { PanelIaComponent, contextoDeRuta } from './panel-ia.component';

/** Un caso del servidor: su id y los de su escena son números, y la psicóloga es el personaje 1. */
function caso(): CasoBorrador {
  const c = copiarEscenarioAlCaso(universidad, ['consultorio'], 'Caso');
  c.id = '41';
  c.escenas[0].id = '1';
  c.inicioId = '1';
  c.personajes = [{ id: '1', nombre: 'Psicóloga de Bienestar', rol: 'Psicóloga', recipeId: '' }];
  return c;
}

const PROPUESTA = {
  mensaje: 'Te propongo una línea y dos respuestas.',
  cambios: [
    { op: 'add-line', nodeId: 1, characterId: 1, text: 'No sé por dónde empezar.', expression: 'triste' },
    { op: 'add-response', nodeId: 1, text: 'Tómate tu tiempo.', responseClass: 'RECOMMENDED', feedbackText: 'No presiona.', prohibitionReason: '', targetNodeId: 1 },
    { op: 'add-response', nodeId: 1, text: 'Cuéntame rápido.', responseClass: 'CONTRAINDICATED', feedbackText: 'Apura.', prohibitionReason: 'Apura a la persona.', targetNodeId: 1 },
  ],
  changes: 3, model: 'm', modo: 'connected',
};

interface Api {
  assistantStatus: ReturnType<typeof vi.fn>;
  assistantPropose: ReturnType<typeof vi.fn>;
}

async function montar(api: Partial<Api> = {}) {
  TestBed.resetTestingModule();
  const completa = {
    assistantStatus: vi.fn(() => of({ enabled: true, mode: 'connected', remainingToday: 7 })),
    assistantPropose: vi.fn(() => of(PROPUESTA)),
    ...api,
  };
  await TestBed.configureTestingModule({
    imports: [PanelIaComponent],
    providers: [provideRouter([]), { provide: AuthoringApi, useValue: completa }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(caso());
  const fixture = TestBed.createComponent(PanelIaComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  const raiz = fixture.nativeElement as HTMLElement;
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await listo();
  return { fixture, store, raiz, listo, api: completa };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;

async function pedir(raiz: HTMLElement, listo: () => Promise<void>, texto: string) {
  const campo = raiz.querySelector<HTMLTextAreaElement>('textarea')!;
  campo.value = texto;
  campo.dispatchEvent(new Event('input'));
  raiz.querySelector('form')!.dispatchEvent(new Event('submit'));
  await listo();
  await new Promise((r) => setTimeout(r, 0));
  await listo();
}

describe('PanelIaComponent', () => {
  it('con asistente dice cuántas ayudas quedan y la propuesta llega por partes con casillas', async () => {
    const { raiz, listo, api } = await montar();
    expect(raiz.textContent).toContain('La IA propone; tú decides.');
    expect(raiz.textContent).toContain('Hoy te quedan 7 ayudas.');
    await pedir(raiz, listo, 'Escribe cómo saluda la psicóloga');
    expect(api.assistantPropose).toHaveBeenCalledWith(41, { pantalla: 'inicio', peticion: 'Escribe cómo saluda la psicóloga', seleccion: null });
    expect(raiz.querySelector('[role="log"]')!.textContent).toContain('Escribe cómo saluda la psicóloga');
    expect(raiz.querySelectorAll('input[type="checkbox"]').length).toBe(3);
    expect(raiz.textContent).toContain('Psicóloga de Bienestar dice en «');
    expect(raiz.textContent).not.toMatch(/sin conexión/i);
  });

  it('«Aplicar lo marcado» aplica solo las partes marcadas, con la marca de IA', async () => {
    const { store, raiz, listo } = await montar();
    await pedir(raiz, listo, 'Propón respuestas');
    const casillas = [...raiz.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    casillas[0].click(); // desmarca la primera parte (la línea)
    await listo();
    boton(raiz, 'Aplicar lo marcado').click();
    await listo();
    const escena = store.caso()!.escenas[0];
    expect(escena.lineas).toHaveLength(0);
    expect(escena.respuestas).toHaveLength(2);
    expect(escena.respuestas.every((r) => r.marcaIa)).toBe(true);
    expect(raiz.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(raiz.querySelector('[role="log"]')!.textContent).toContain('marcadas «Sugerido por la IA»');
  });

  it('«Descartar» no cambia el caso', async () => {
    const { store, raiz, listo } = await montar();
    const antes = store.caso();
    await pedir(raiz, listo, 'Propón algo');
    boton(raiz, 'Descartar').click();
    await listo();
    expect(store.caso()).toBe(antes);
  });

  it('después de aplicar, «Deshacer lo aplicado» devuelve el caso a como estaba, de un paso', async () => {
    const { store, raiz, listo } = await montar();
    const antes = structuredClone(store.caso()!);
    await pedir(raiz, listo, 'Propón respuestas');
    expect(boton(raiz, 'Deshacer lo aplicado')).toBeUndefined(); // antes de aplicar no hay nada que deshacer
    boton(raiz, 'Aplicar lo marcado').click();
    await listo();
    expect(store.caso()!.escenas[0].respuestas).toHaveLength(2);
    expect(raiz.querySelector('[role="log"]')!.textContent).not.toContain('Ctrl+Z');

    boton(raiz, 'Deshacer lo aplicado').click();
    await listo();
    expect(store.caso()).toEqual(antes);
    expect(boton(raiz, 'Deshacer lo aplicado')).toBeUndefined();
    expect(raiz.querySelector('[role="log"]')!.textContent).toContain('Deshice lo que había aplicado');
  });

  it('«Deshacer lo aplicado» desaparece si la persona cambia algo después de aplicar', async () => {
    const { store, raiz, listo } = await montar();
    await pedir(raiz, listo, 'Propón respuestas');
    boton(raiz, 'Aplicar lo marcado').click();
    await listo();
    expect(boton(raiz, 'Deshacer lo aplicado')).toBeDefined();
    store.agregarEscena('consultorio');
    await listo();
    expect(boton(raiz, 'Deshacer lo aplicado')).toBeUndefined();
  });

  it('el aviso fijo no promete marcar lo que no se puede marcar', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('.aviso-ia')!.textContent).not.toContain('Todo lo generado queda marcado');
    expect(raiz.querySelector('.aviso-ia')!.textContent).toContain('Las escenas, líneas, respuestas y finales que agregue quedan marcados');
  });

  it('apagado lo dice en lenguaje del docente, no deja pedir y no hay «modo sin conexión»', async () => {
    const { raiz, listo, api } = await montar({ assistantStatus: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
    expect(raiz.textContent).toContain('El asistente de IA no está disponible por ahora');
    expect(raiz.textContent).toContain('todo lo demás del editor funciona igual');
    expect(raiz.textContent).not.toMatch(/sin conexión|ejemplo/i);
    expect(raiz.querySelector('button[type="submit"]')!.getAttribute('aria-disabled')).toBe('true');
    await pedir(raiz, listo, 'Hola');
    expect(api.assistantPropose).not.toHaveBeenCalled();
  });

  it('sin cupo lo dice y deja seguir editando a mano', async () => {
    const { raiz } = await montar({ assistantStatus: vi.fn(() => of({ enabled: true, mode: 'connected', remainingToday: 0 })) });
    expect(raiz.textContent).toContain('Llegaste al límite de ayuda de la IA');
    expect(raiz.querySelector('button[type="submit"]')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('si el asistente se apaga mientras se usa, la respuesta lo dice y el panel pasa a «no disponible»', async () => {
    const { raiz, listo } = await montar({ assistantPropose: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))) });
    await pedir(raiz, listo, 'Hola');
    expect(raiz.querySelector('[role="log"]')!.textContent).toContain('no está disponible por ahora');
    expect(raiz.textContent).toContain('No disponible');
  });

  it('al abrir otro caso, el asistente olvida la conversación y la propuesta', async () => {
    const { store, raiz, listo } = await montar();
    await pedir(raiz, listo, 'Propón respuestas');
    expect(raiz.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
    store.fijar({ ...caso(), id: '42' });
    await listo();
    expect(raiz.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(raiz.querySelector('[role="log"]')!.textContent!.trim()).toBe('');
  });
});

describe('contextoDeRuta', () => {
  it('lee la pantalla y el elemento de la dirección del editor en el programa', () => {
    expect(contextoDeRuta('/portal/casos/41/editor')).toEqual({ pantalla: 'mapa', seleccion: null });
    expect(contextoDeRuta('/portal/casos/41/editor/escena/12?x=1')).toEqual({ pantalla: 'guion', seleccion: '12' });
    expect(contextoDeRuta('/portal/casos/41/editor/sala/consultorio')).toEqual({ pantalla: 'sala', seleccion: 'consultorio' });
    expect(contextoDeRuta('/portal/casos/41/editor/finales')).toEqual({ pantalla: 'finales', seleccion: null });
    expect(contextoDeRuta('/portal/casos/41/editor/probar')).toEqual({ pantalla: 'mapa', seleccion: null }); // ya no es una pantalla del editor
    expect(contextoDeRuta('/portal/casos/nuevo')).toEqual({ pantalla: 'nuevo', seleccion: null });
  });
});
