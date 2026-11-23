import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { universidad } from '../testing/universidad';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { CasoStore } from './caso.store';


function montar() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  });
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  return { store, escena: () => store.caso()!.escenas[1], id: store.caso()!.escenas[1].id };
}

describe('CasoStore · guion y finales', () => {
  it('líneas: agregar, editar, subir y borrar', () => {
    const { store, escena, id } = montar();
    const l1 = store.agregarLinea(id);
    const l2 = store.agregarLinea(id);
    expect(escena().lineas[0].personajeId).toBe('psicologa-bienestar'); // el primer personaje de la sala
    store.editarLinea(id, l2, { texto: 'Hola, soy la psicóloga.', expresion: 'alegre' });
    store.moverLinea(id, l2, -1);
    expect(escena().lineas.map((l) => l.id)).toEqual([l2, l1]);
    expect(escena().lineas[0]).toMatchObject({ texto: 'Hola, soy la psicóloga.', expresion: 'alegre' });
    store.borrarLinea(id, l1);
    expect(escena().lineas).toHaveLength(1);
  });

  it('respuestas: agregar, editar y borrar', () => {
    const { store, escena, id } = montar();
    const r = store.agregarRespuesta(id);
    store.editarRespuesta(id, r, { texto: 'Te escucho.', clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: 'Bien.' });
    expect(escena().respuestas[0]).toMatchObject({ texto: 'Te escucho.', destinoId: null, marcaIa: false });
    store.borrarRespuesta(id, r);
    expect(escena().respuestas).toHaveLength(0);
  });

  it('respuesta a escena nueva crea la escena conectada en la misma sala', () => {
    const { store, escena, id } = montar();
    const r = store.agregarRespuesta(id);
    const nueva = store.respuestaAEscenaNueva(id, r);
    expect(escena().respuestas[0].destinoId).toBe(nueva);
    expect(store.caso()!.escenas.find((e) => e.id === nueva)!.salaId).toBe('consultorio');
  });

  it('aceptarIa pone marcaIa en false solo en el elemento indicado', () => {
    const { store, id } = montar();
    store.fijar({
      ...store.caso()!,
      escenas: store.caso()!.escenas.map((e) => e.id !== id ? e : {
        ...e,
        lineas: [
          { id: 'l1', personajeId: 'psicologa-bienestar', texto: 'A', expresion: 'neutral', marcaIa: true },
          { id: 'l2', personajeId: 'psicologa-bienestar', texto: 'B', expresion: 'neutral', marcaIa: true },
        ],
        respuestas: [{ id: 'r1', texto: 'R', clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: '', destinoId: null, marcaIa: true }],
      }),
      finales: [{ id: 'f1', nombre: 'F', texto: 'T', tono: 'neutral', condicion: { count: 'contraindicated', gte: 1 }, marcaIa: true }],
    });
    store.aceptarIa({ escenaId: id, lineaId: 'l2' });
    const e = store.caso()!.escenas.find((x) => x.id === id)!;
    expect(e.lineas.map((l) => l.marcaIa)).toEqual([true, false]);
    expect(e.respuestas[0].marcaIa).toBe(true);
    store.aceptarIa({ escenaId: id, respuestaId: 'r1' });
    store.aceptarIa({ finalId: 'f1' });
    expect(store.caso()!.escenas.find((x) => x.id === id)!.respuestas[0].marcaIa).toBe(false);
    expect(store.caso()!.finales[0].marcaIa).toBe(false);
  });

  it('finales: modo, agregar, editar, ordenar y borrar', () => {
    const { store } = montar();
    store.fijarModoFinales('propio');
    const f1 = store.agregarFinal();
    const f2 = store.agregarFinal();
    store.editarFinal(f2, { nombre: 'Ruta activada', condicion: { count: 'contraindicated', gte: 2 } });
    store.moverFinal(f2, -1);
    const caso = store.caso()!;
    expect(caso.modoFinales).toBe('propio');
    expect(caso.finales.map((f) => f.id)).toEqual([f2, f1]);
    expect(caso.finales[0]).toMatchObject({ nombre: 'Ruta activada', condicion: { count: 'contraindicated', gte: 2 } });
    store.borrarFinal(f1);
    expect(store.caso()!.finales).toHaveLength(1);
  });

  it('el nombre de una escena se puede cambiar', () => {
    const { store, escena, id } = montar();
    store.editarEscena(id, { titulo: 'Escuchar el relato' });
    expect(escena().titulo).toBe('Escuchar el relato');
  });

  it('una respuesta nueva nace sin clasificar, también la que nace de conectar o de «escena nueva»', () => {
    const { store, escena, id } = montar();
    const r = store.agregarRespuesta(id);
    expect(escena().respuestas.find((x) => x.id === r)!.clase).toBeNull();
    store.respuestaAEscenaNueva(id, store.agregarRespuesta(id));
    const otra = store.conectarEscena(id, 'nueva');
    expect(store.caso()!.escenas.flatMap((e) => e.respuestas).every((x) => x.clase === null)).toBe(true);
    expect(otra).toBeTruthy();
  });
});
