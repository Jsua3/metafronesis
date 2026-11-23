import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { universidad } from '../testing/universidad';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { zonaCaminable } from '../modelo/geometria';
import { CasoStore } from './caso.store';


function montar() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  });
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['consultorio', 'pasillo'], 'Caso'));
  return store;
}

const sala = (store: CasoStore, id: string) => store.caso()!.salas.find((s) => s.id === id)!;

describe('CasoStore · editar una sala', () => {
  it('mover un mueble traslada su choque', () => {
    const store = montar();
    store.agregarElemento('pasillo', 'mueble', 'sofa');
    const m = sala(store, 'pasillo').muebles.at(-1)!;
    const antes = { ...sala(store, 'pasillo').choques[m.clave!] };
    store.moverElemento('pasillo', 'mueble', sala(store, 'pasillo').muebles.length - 1, m.x + 30, m.y + 20);
    const despues = sala(store, 'pasillo').muebles.at(-1)!;
    expect(sala(store, 'pasillo').choques[m.clave!]).toEqual({
      ...antes, x: antes.x + despues.x - m.x, y: antes.y + despues.y - m.y,
    });
  });

  it('agregar un mueble con colisi?n le crea su choque', () => {
    const store = montar();
    store.agregarElemento('pasillo', 'mueble', 'sofa');
    const m = sala(store, 'pasillo').muebles.at(-1)!;
    const ficha = store.caso()!.catalogo.muebles.find(f => f.id === m.ref)!;
    expect(ficha.colision).toBe(true);
    expect(sala(store, 'pasillo').choques[m.clave!]).toEqual({
      x: m.x - Math.floor(ficha.ancho / 2), y: m.y - ficha.alto, ancho: ficha.ancho, alto: ficha.alto,
    });
  });

  it('quitar un mueble quita su choque', () => {
    const store = montar();
    store.agregarElemento('pasillo', 'mueble', 'sofa');
    const s = sala(store, 'pasillo');
    const clave = s.muebles.at(-1)!.clave!;
    store.quitarElemento('pasillo', 'mueble', s.muebles.length - 1);
    expect(sala(store, 'pasillo').choques[clave]).toBeUndefined();
  });

  it('deshacer devuelve el choque', () => {
    const store = montar();
    store.agregarElemento('pasillo', 'mueble', 'sofa');
    const s = sala(store, 'pasillo');
    const clave = s.muebles.at(-1)!.clave!;
    const choque = { ...s.choques[clave] };
    store.quitarElemento('pasillo', 'mueble', s.muebles.length - 1);
    store.deshacer();
    expect(sala(store, 'pasillo').choques[clave]).toEqual(choque);
  });

  it('mover fuera de la zona caminable se limita al borde', () => {
    const store = montar();
    const zona = zonaCaminable('tres-paredes');
    store.moverElemento('consultorio', 'personaje', 0, 5000, -40);
    const p = sala(store, 'consultorio').personajes[0];
    expect(p.x).toBe(zona.x + zona.ancho);
    expect(p.y).toBe(zona.y);

    store.moverElemento('consultorio', 'mueble', 1, -300, 900); // escritorio, 122 de ancho
    const m = sala(store, 'consultorio').muebles[1];
    expect(m.x).toBe(zona.x + 61);
    expect(m.y).toBe(zona.y + zona.alto);
  });

  it('agregar un mueble lo coloca dentro de la zona caminable', () => {
    const store = montar();
    const antes = sala(store, 'pasillo').muebles.length;
    store.agregarElemento('pasillo', 'mueble', 'sofa');
    const muebles = sala(store, 'pasillo').muebles;
    expect(muebles).toHaveLength(antes + 1);
    const nuevo = muebles.at(-1)!;
    const zona = zonaCaminable('una-pared');
    expect(nuevo.ref).toBe('sofa');
    expect(nuevo.x).toBe(zona.x + zona.ancho / 2);
    expect(nuevo.y).toBeGreaterThanOrEqual(zona.y);
    expect(nuevo.y).toBeLessThanOrEqual(zona.y + zona.alto);
  });

  it('quitar y editar un personaje se pueden deshacer y rehacer', () => {
    const store = montar();
    store.editarPersonajeEnSala('consultorio', 0, { expresion: 'triste', mirando: 'derecha' });
    expect(sala(store, 'consultorio').personajes[0]).toMatchObject({ expresion: 'triste', mirando: 'derecha' });
    store.quitarElemento('consultorio', 'personaje', 0);
    expect(sala(store, 'consultorio').personajes).toHaveLength(0);
    store.deshacer();
    expect(sala(store, 'consultorio').personajes[0].expresion).toBe('triste');
    store.deshacer();
    expect(sala(store, 'consultorio').personajes[0].expresion).toBe('neutral');
    store.rehacer();
    expect(sala(store, 'consultorio').personajes[0].expresion).toBe('triste');
  });

  it('volver a la sala original restaura muebles, objetos y personajes de la biblioteca y se puede deshacer', async () => {
    const store = montar();
    store.quitarElemento('consultorio', 'mueble', 0);
    store.agregarElemento('consultorio', 'objeto', 'mochila');
    store.moverElemento('consultorio', 'personaje', 0, 300, 300);
    await store.volverSalaOriginal('consultorio');
    const original = universidad.salas.find((s) => s.id === 'consultorio')!;
    const s = sala(store, 'consultorio');
    // Cada pieza trae además la clave con la que se guarda en el mapa
    const sinClave = <T extends { clave?: string }>(piezas: T[]) => piezas.map(({ clave, ...resto }) => (clave ? resto : resto));
    expect(sinClave(s.muebles)).toEqual(original.muebles);
    expect(sinClave(s.objetos)).toEqual(original.objetos);
    expect(sinClave(s.personajes)).toEqual(original.personajes);
    expect(new Set([...s.muebles, ...s.objetos, ...s.personajes].map((c) => c.clave)).size).toBe(s.muebles.length + s.objetos.length + s.personajes.length); // sin repetidas
    store.deshacer();
    expect(sala(store, 'consultorio').objetos.at(-1)!.ref).toBe('mochila');
  });

  it('la sala original no cambia aunque se edite la copia', () => {
    const store = montar();
    const antes = structuredClone(universidad);
    store.quitarElemento('consultorio', 'mueble', 0);
    expect(universidad).toEqual(antes);
  });

  it('en una sala sin lugar no hay original al que volver: no pasa nada', async () => {
    const store = montar();
    const caso = structuredClone(store.caso()!);
    caso.lugarId = null;
    caso.salas[0].origen = null;
    store.fijar(caso);
    const antes = structuredClone(store.caso()!.salas[0]);
    await store.volverSalaOriginal(caso.salas[0].id);
    expect(store.caso()!.salas[0]).toEqual(antes);
  });
});
