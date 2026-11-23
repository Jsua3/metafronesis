import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { universidad } from '../testing/universidad';
import { BibliotecaService } from '../modelo/biblioteca.service';
import type { CasoBorrador } from '../modelo/caso';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { ALTO_ESCENA, ANCHO_ESCENA } from '../modelo/trazado';
import { CasoStore } from './caso.store';


/** Caso de 3 escenas: A → B (dos respuestas), A → C, C → C (un bucle). */
function montar() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  });
  const store = TestBed.inject(CasoStore);
  const caso = copiarEscenarioAlCaso(universidad, ['pasillo', 'sala-espera', 'consultorio'], 'Caso');
  const [a, b, c] = caso.escenas;
  const respuesta = (id: string, destinoId: string | null) =>
    ({ id, texto: `Respuesta ${id}`, clase: 'RECOMMENDED' as const, razon: '', efectos: {}, retroalimentacion: '', destinoId, marcaIa: false });
  a.respuestas = [respuesta('r1', b.id), respuesta('r2', b.id), respuesta('r3', c.id)];
  c.respuestas = [respuesta('r4', c.id)];
  a.lineas = [{ id: 'l1', personajeId: 'docente', texto: 'Hola', expresion: 'neutral', marcaIa: false }];
  store.fijar(caso);
  return { store, a: a.id, b: b.id, c: c.id };
}

const escena = (caso: CasoBorrador | null, id: string) => caso!.escenas.find((e) => e.id === id);

describe('CasoStore · escenas y caminos', () => {
  it('borrar escena deja respuestas sin destino', () => {
    const { store, a, b } = montar();
    store.borrarEscena(b);
    const caso = store.caso();
    expect(escena(caso, b)).toBeUndefined();
    expect(escena(caso, a)!.respuestas.map((r) => r.destinoId)).toEqual([null, null, expect.any(String)]);
  });

  it('borrar la escena de inicio pasa el inicio a la primera que quede', () => {
    const { store, a, b } = montar();
    store.borrarEscena(a);
    expect(store.caso()!.inicioId).toBe(b);
    expect(store.puedeDeshacer()).toBe(false); // deshacer es solo de la sala
  });

  it('duplicar copia guion y respuestas con ids nuevos y sin destino propio repetido', () => {
    const { store, a, c } = montar();
    const copiaA = store.duplicarEscena(a);
    const original = escena(store.caso(), a)!;
    const copia = escena(store.caso(), copiaA)!;
    expect(copia.id).not.toBe(original.id);
    expect(copia.lineas.map((l) => l.texto)).toEqual(['Hola']);
    expect(copia.lineas[0].id).not.toBe(original.lineas[0].id);
    expect(copia.respuestas.map((r) => r.destinoId)).toEqual(original.respuestas.map((r) => r.destinoId));
    expect(copia.respuestas.every((r, i) => r.id !== original.respuestas[i].id)).toBe(true);

    const copiaC = store.duplicarEscena(c);
    expect(escena(store.caso(), copiaC)!.respuestas[0].destinoId).toBe(copiaC); // el bucle apunta a la copia
  });

  it('agregar, mover, conectar y marcar como final', () => {
    const { store, b, c } = montar();
    const nueva = store.agregarEscena('consultorio', c);
    const e = escena(store.caso(), nueva)!;
    expect(e.salaId).toBe('consultorio');
    expect(e.posicion.x).toBeGreaterThan(escena(store.caso(), c)!.posicion.x);
    store.moverEscena(nueva, 900, 120);
    expect(escena(store.caso(), nueva)!.posicion).toEqual({ x: 900, y: 120 });
    store.conectar('r4', nueva);
    expect(escena(store.caso(), c)!.respuestas[0].destinoId).toBe(nueva);
    store.marcarFinal(b, true);
    expect(escena(store.caso(), b)!.esFinal).toBe(true);
  });

  it('conectar una escena con otra agrega una respuesta que lleva a ella', () => {
    const { store, b, c } = montar();
    store.conectarEscena(b, c);
    const respuestas = escena(store.caso(), b)!.respuestas;
    expect(respuestas.at(-1)!.destinoId).toBe(c);
    const nueva = store.conectarEscena(b, 'nueva');
    expect(escena(store.caso(), b)!.respuestas.at(-1)!.destinoId).toBe(nueva);
    expect(escena(store.caso(), nueva)!.salaId).toBe('sala-espera');
  });

  it('las escenas nuevas creadas desde la misma escena no quedan encima de otra', () => {
    const { store, b } = montar();
    store.conectarEscena(b, 'nueva');
    store.conectarEscena(b, 'nueva');
    store.conectarEscena(b, 'nueva');
    const cajas = store.caso()!.escenas.map((e) => e.posicion);
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        const encima = Math.abs(cajas[i].x - cajas[j].x) < ANCHO_ESCENA && Math.abs(cajas[i].y - cajas[j].y) < ALTO_ESCENA;
        expect(encima, `escenas ${i} y ${j} en ${JSON.stringify([cajas[i], cajas[j]])}`).toBe(false);
      }
    }
  });
});
