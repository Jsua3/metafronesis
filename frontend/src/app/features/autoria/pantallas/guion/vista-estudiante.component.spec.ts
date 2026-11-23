import { TestBed } from '@angular/core/testing';

import type { Escena } from '../../modelo/caso';
import { VistaEstudianteComponent } from './vista-estudiante.component';

/**
 * «Así lo verá el estudiante» (EDITOR.md §3.4, bloque E2): una mini simulación que avanza las líneas, ofrece las opciones
 * A a D y, al elegir, muestra la reacción y lo que lee el estudiante después. Nunca dice la clase de la respuesta, como el
 * juego (`no-classification-leak.spec.ts` del simulador).
 */
const escena: Escena = {
  id: 'e1', titulo: 'Recepción', narracion: '', salaId: null, esFinal: false, posicion: { x: 0, y: 0 }, intensidad: 'MEDIUM', advertencia: null,
  lineas: [
    { id: 'l1', personajeId: 'laura', texto: 'Hola.', expresion: 'preocupada', marcaIa: false },
    { id: 'l2', personajeId: 'laura', texto: 'No sé por dónde empezar.', expresion: 'triste', marcaIa: false },
  ],
  respuestas: [
    { id: 'r1', texto: 'Validar su miedo', clase: 'RECOMMENDED', razon: '', retroalimentacion: 'Respira más despacio.', efectos: {}, destinoId: null, marcaIa: false, reaccion: { linea: 'Gracias.', emocion: 'alegre' } },
    { id: 'r2', texto: 'Pedirle que cuente todo ya', clase: 'CONTRAINDICATED', razon: 'La expone.', retroalimentacion: 'Se cierra.', efectos: {}, destinoId: null, marcaIa: false },
  ],
};
const personajes = [{ id: 'laura', nombre: 'Laura', recipeId: 'estudiante' }];

async function montar(lineaEnfocada: string | null = null) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [VistaEstudianteComponent] }).compileComponents();
  const fixture = TestBed.createComponent(VistaEstudianteComponent);
  fixture.componentRef.setInput('escena', escena);
  fixture.componentRef.setInput('personajes', personajes);
  fixture.componentRef.setInput('lineaEnfocada', lineaEnfocada);
  await fixture.whenStable();
  const raiz = fixture.nativeElement as HTMLElement;
  const pulsar = async (texto: string) => {
    [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes(texto))!.click();
    await fixture.whenStable();
  };
  return { fixture, raiz, pulsar };
}

const CLASES = /Recomendada|Aceptable|Con riesgo|Contraindicada|La expone/;

describe('VistaEstudianteComponent', () => {
  it('avanza las líneas como el cuadro del juego y luego ofrece las respuestas A y B', async () => {
    const { raiz, pulsar } = await montar();
    expect(raiz.textContent).toContain('Hola.');
    expect(raiz.textContent).toContain('Línea 1 de 2');
    await pulsar('Siguiente');
    expect(raiz.textContent).toContain('No sé por dónde empezar.');
    await pulsar('Ver las respuestas');
    const opciones = [...raiz.querySelectorAll('.juego__opcion')].map((o) => o.textContent!.replace(/\s+/g, ' ').trim());
    expect(opciones).toEqual(['AValidar su miedo, opción A', 'BPedirle que cuente todo ya, opción B']);
  });

  it('al elegir una respuesta muestra la reacción y lo que lee después; «Volver a empezar» la reinicia', async () => {
    const { raiz, pulsar } = await montar();
    await pulsar('Siguiente');
    await pulsar('Ver las respuestas');
    await pulsar('Validar su miedo');
    expect(raiz.textContent).toContain('Gracias.');
    expect(raiz.textContent).toContain('Respira más despacio.');
    expect(raiz.querySelector('.juego__dialogo img')!.getAttribute('src')).toContain('portrait-alegre');
    await pulsar('Volver a empezar la escena');
    expect(raiz.textContent).toContain('Hola.');
  });

  it('nunca muestra la clase de la respuesta ni la razón de una contraindicada, en ningún momento', async () => {
    const { raiz, pulsar } = await montar();
    expect(raiz.textContent).not.toMatch(CLASES);
    await pulsar('Siguiente');
    await pulsar('Ver las respuestas');
    expect(raiz.textContent).not.toMatch(CLASES);
    await pulsar('Pedirle que cuente');
    expect(raiz.textContent).toContain('Se cierra.');
    expect(raiz.textContent).not.toMatch(CLASES);
  });

  it('salta a la línea que la docente está escribiendo', async () => {
    const { raiz } = await montar('l2');
    expect(raiz.textContent).toContain('No sé por dónde empezar.');
    expect(raiz.textContent).toContain('Línea 2 de 2');
  });
});
