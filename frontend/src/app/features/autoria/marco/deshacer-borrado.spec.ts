import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../estado/caso.store';
import { BibliotecaService } from '../modelo/biblioteca.service';
import type { CasoBorrador } from '../modelo/caso';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import { universidad } from '../testing/universidad';
import { DeshacerBorrado, PLAZO_DESHACER_MS } from './deshacer-borrado';
import { abrirEditor } from './marco.testing';

function montar() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  });
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  const escenaId = store.caso()!.escenas[1].id;
  const deshacer = TestBed.inject(DeshacerBorrado);
  return { store, escenaId, deshacer };
}

/** El caso sin los identificadores de las líneas y de las pistas: lo recreado puede tener otro (nada apunta a ellos). */
function sinIds(caso: CasoBorrador | null): unknown {
  return {
    ...caso,
    escenas: caso!.escenas.map((e) => ({
      ...e,
      lineas: e.lineas.map(({ id: _id, ...resto }) => resto),
      pistas: e.pistas?.map(({ id: _id, ...resto }) => resto),
    })),
  };
}

// req: EDITOR.md §4.6 (deshacer los borrados del guion) y §7.3 E0, criterio 6
describe('DeshacerBorrado', () => {
  afterEach(() => vi.useRealTimers());

  it('borrar una línea va al store en el acto y «Deshacer» deja el caso igual (personaje, expresión, texto y posición)', () => {
    const { store, escenaId, deshacer } = montar();
    const [a, b, c] = [store.agregarLinea(escenaId), store.agregarLinea(escenaId), store.agregarLinea(escenaId)];
    store.editarLinea(escenaId, a, { texto: 'Buenos días.' });
    store.editarLinea(escenaId, b, { texto: 'No sé si hice bien en venir.', expresion: 'preocupada', personajeId: 'psicologa-bienestar' });
    store.editarLinea(escenaId, c, { texto: 'Aquí estás a salvo.' });
    const antes = sinIds(structuredClone(store.caso()));

    deshacer.linea(escenaId, b);
    expect(store.caso()!.escenas[1].lineas.map((l) => l.id)).toEqual([a, c]); // ya está borrada en el modelo
    expect(deshacer.aviso()?.texto).toMatch(/^Borraste una línea/);

    deshacer.deshacer();
    expect(sinIds(store.caso())).toEqual(antes);
    expect(store.caso()!.escenas[1].lineas[1]).toMatchObject({ texto: 'No sé si hice bien en venir.', expresion: 'preocupada' });
    expect(deshacer.aviso()).toBeNull();
  });

  it('pasado el plazo el aviso desaparece y no queda nada pendiente: el borrado se queda', () => {
    vi.useFakeTimers();
    const { store, escenaId, deshacer } = montar();
    const a = store.agregarLinea(escenaId);
    deshacer.linea(escenaId, a);
    vi.advanceTimersByTime(PLAZO_DESHACER_MS - 1);
    expect(deshacer.aviso()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(deshacer.aviso()).toBeNull();
    deshacer.deshacer(); // ya no hace nada
    expect(store.caso()!.escenas[1].lineas).toHaveLength(0);
  });

  it('frases al acercarse: se borran en el acto y «Deshacer» vuelve a la lista anterior', () => {
    const { store, escenaId, deshacer } = montar();
    store.fijarComentarios(escenaId, [
      { personaje: 'psicologa-bienestar', linea: 'Hola.' },
      { personaje: 'psicologa-bienestar', linea: 'Pasa, por favor.', emocion: 'alegre' },
    ]);
    const antes = sinIds(structuredClone(store.caso()));
    deshacer.comentario(escenaId, 1);
    expect(store.caso()!.escenas[1].comentarios).toHaveLength(1);
    deshacer.deshacer();
    expect(sinIds(store.caso())).toEqual(antes);
  });

  it('pistas: se borran en el acto y «Deshacer» las devuelve en su orden', () => {
    const { store, escenaId, deshacer } = montar();
    store.fijarPistas(escenaId, ['Pregúntale cómo está.', 'Escucha antes de proponer.', 'Valida su miedo.']);
    const antes = sinIds(structuredClone(store.caso()));
    deshacer.pista(escenaId, 0);
    expect(store.caso()!.escenas[1].pistas!.map((p) => p.texto)).toEqual(['Escucha antes de proponer.', 'Valida su miedo.']);
    deshacer.deshacer();
    expect(sinIds(store.caso())).toEqual(antes);
  });

  it('«Deshacer» una frase no se lleva lo que se editó o agregó después del borrado (revisión de Codex, hallazgo 1)', () => {
    const { store, escenaId, deshacer } = montar();
    const p = 'psicologa-bienestar';
    store.fijarComentarios(escenaId, [{ personaje: p, linea: 'Uno.' }, { personaje: p, linea: 'Dos.' }]);
    deshacer.comentario(escenaId, 0);
    store.fijarComentarios(escenaId, [{ personaje: p, linea: 'Dos, corregida.' }, { personaje: p, linea: 'Tres.' }]);
    deshacer.deshacer();
    expect(store.caso()!.escenas[1].comentarios!.map((c) => c.linea)).toEqual(['Uno.', 'Dos, corregida.', 'Tres.']);
  });

  it('con la escena otra vez llena de frases, «Deshacer» explica por qué no puede y no lanza error', () => {
    const { store, escenaId, deshacer } = montar();
    const p = 'psicologa-bienestar';
    const seis = Array.from({ length: 6 }, (_, i) => ({ personaje: p, linea: `Frase ${i + 1}.` }));
    store.fijarComentarios(escenaId, seis);
    deshacer.comentario(escenaId, 2);
    store.fijarComentarios(escenaId, [...seis.filter((_, i) => i !== 2), { personaje: p, linea: 'Nueva.' }]);
    expect(() => deshacer.deshacer()).not.toThrow();
    expect(store.caso()!.escenas[1].comentarios).toHaveLength(6);
    expect(deshacer.aviso()).toEqual({ texto: expect.stringMatching(/^No se pudo deshacer/), deshacible: false });
  });

  it('«Deshacer» una pista la devuelve a su sitio sin perder la pista editada después, y respeta el tope', () => {
    const { store, escenaId, deshacer } = montar();
    store.fijarPistas(escenaId, ['Uno.', 'Dos.']);
    deshacer.pista(escenaId, 1, 3);
    store.fijarPistas(escenaId, ['Uno, corregida.', 'Nueva.']);
    deshacer.deshacer();
    expect(store.caso()!.escenas[1].pistas!.map((p) => p.texto)).toEqual(['Uno, corregida.', 'Dos.', 'Nueva.']);

    deshacer.pista(escenaId, 0, 3);
    store.fijarPistas(escenaId, ['Dos.', 'Nueva.', 'Otra.']);
    deshacer.deshacer();
    expect(store.caso()!.escenas[1].pistas!.map((p) => p.texto)).toEqual(['Dos.', 'Nueva.', 'Otra.']);
    expect(deshacer.aviso()?.deshacible).toBe(false);
  });

  it('un borrado nuevo reemplaza el aviso del anterior (un solo «Deshacer» a la vez)', () => {
    const { store, escenaId, deshacer } = montar();
    store.fijarPistas(escenaId, ['Uno.', 'Dos.']);
    const l = store.agregarLinea(escenaId);
    deshacer.linea(escenaId, l);
    deshacer.pista(escenaId, 0);
    expect(deshacer.aviso()?.texto).toBe('Borraste una pista');
    deshacer.deshacer();
    expect(store.caso()!.escenas[1].lineas).toHaveLength(0);
    expect(store.caso()!.escenas[1].pistas!.map((p) => p.texto)).toEqual(['Uno.', 'Dos.']);
  });

  it('el marco pinta el aviso con «Deshacer» abajo, en una región que se anuncia, y al pulsarlo la línea vuelve', async () => {
    const { raiz, listo, store } = await abrirEditor('/portal/casos/41/editor');
    const escenaId = store.caso()!.escenas[0].id;
    const l = store.agregarLinea(escenaId);
    store.editarLinea(escenaId, l, { texto: 'Hola, te escucho.' });
    TestBed.inject(DeshacerBorrado).linea(escenaId, l);
    await listo();
    const zona = raiz.querySelector('.deshacer-zona')!;
    expect(zona.getAttribute('role')).toBe('status');
    expect(zona.textContent).toContain('Borraste una línea');
    [...zona.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Deshacer')!.click();
    await listo();
    expect(store.caso()!.escenas[0].lineas.at(-1)!.texto).toBe('Hola, te escucho.');
    expect(zona.textContent!.trim()).toBe('');
    document.querySelectorAll('body > [ng-version]').forEach((n) => n.remove());
  });
});
