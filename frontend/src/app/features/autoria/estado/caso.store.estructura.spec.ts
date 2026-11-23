import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../core/api/authoring.api';
import type { WorldRoomSaveRequest } from '../../../core/models/simulation.model';
import { llegada } from '../modelo/geometria';
import { casoSinLugar } from '../testing/caso-api';
import { CASO_HOSPITAL, MUNDO_HOSPITAL } from '../testing/hospital';
import { ServidorFalso } from '../testing/servidor-falso';
import { CasoStore } from './caso.store';

function montar() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const store = TestBed.inject(CasoStore);
  store.fijar(structuredClone(CASO_HOSPITAL));
  return store;
}

const sala = (store: CasoStore, id: string) => store.caso()!.salas.find((s) => s.id === id)!;
const ficha = () => ({ ocupa: 80, franja: [0, 200] as const });

describe('CasoStore · estructura de sala', () => {
  it('mover una pieza deja un paso de historial y deshacer la devuelve', () => {
    const store = montar();
    const antes = structuredClone(sala(store, 'sala-espera').estructura);
    store.moverPiezaDeMuro('sala-espera', 'v1', { x: 300, y: 350 });
    expect(sala(store, 'sala-espera').estructura!.piezas![0]).toMatchObject({ x: 300, y: 350 });
    expect(sala(store, 'sala-espera').estructura!.piezas![0].muro).toBeUndefined();
    store.deshacer();
    expect(sala(store, 'sala-espera').estructura).toEqual(antes);
    expect(store.puedeDeshacer()).toBe(false);
  });

  it('el cambio llega a todas las escenas que usan la sala', async () => {
    const fuente = casoSinLugar();
    fuente.editor.nodes = fuente.editor.nodes.slice(0, 2);
    fuente.editor.maps = fuente.editor.maps.slice(0, 2);
    const mundos = structuredClone(MUNDO_HOSPITAL);
    mundos.forEach((m, i) => {
      m.nodeId = fuente.editor.nodes[i].id;
      m.map.id = fuente.editor.maps[i].id;
      m.map.ambient['salaId'] = 'sala-espera';
      m.map.structure = structuredClone(mundos[0].map.structure);
    });
    const servidor = new ServidorFalso({ editor: fuente.editor, mundos }, null);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
    const store = TestBed.inject(CasoStore);
    await store.cargar(fuente.editor.caseVersionId);
    servidor.llamadas.length = 0;
    store.moverPiezaDeMuro('sala-espera', 'v1', { muro: 'fondo', pos: 400 });
    await store.sincronizado();
    const guardados = servidor.llamadasA('saveWorld').map((l) => l.args[0] as WorldRoomSaveRequest);
    expect(guardados).toHaveLength(2);
    expect(guardados[0].map.structure).toEqual(guardados[1].map.structure);
    expect(guardados[0].map.structure).toEqual(sala(store, 'sala-espera').estructura);
  });

  it('guardar una puerta sin destino la registra y al elegir destino deja de omitirla', async () => {
    const fuente = casoSinLugar();
    fuente.editor.nodes = fuente.editor.nodes.slice(0, 2).map((n, i) => ({ ...n, key: i ? 'pasillo' : 'sala-espera' }));
    fuente.editor.maps = fuente.editor.maps.slice(0, 2);
    const mundos = structuredClone(MUNDO_HOSPITAL);
    mundos.forEach((m, i) => { m.nodeId = fuente.editor.nodes[i].id; m.map.id = fuente.editor.maps[i].id; });
    const servidor = new ServidorFalso({ editor: fuente.editor, mundos }, null);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }] });
    const store = TestBed.inject(CasoStore);
    await store.cargar(fuente.editor.caseVersionId);
    servidor.llamadas.length = 0;
    const id = store.agregarPuerta('sala-espera', 'madera', 'fondo', 100);
    await store.sincronizado();
    expect(servidor.llamadasA('saveWorld').length).toBeGreaterThan(0);
    expect(store.error()).toBeNull();
    expect(store.puertasSinGuardar().get('sala-espera')).toContain(id);
    servidor.llamadas.length = 0;
    store.fijarDestinoDePuerta('sala-espera', id, 'pasillo');
    await store.sincronizado();
    expect(servidor.llamadasA('saveWorld').length).toBeGreaterThan(0);
    expect(store.error()).toBeNull();
    expect(store.puertasSinGuardar().get('sala-espera') ?? []).not.toContain(id);
  });

  it('no duplica una puerta de regreso existente ni con dos llamadas seguidas', () => {
    const store = montar();
    const antes = sala(store, 'pasillo').puertas.length;
    store.crearPuertaDeRegreso('sala-espera', 'a-pasillo', ficha);
    store.crearPuertaDeRegreso('sala-espera', 'a-pasillo', ficha);
    expect(sala(store, 'pasillo').puertas).toHaveLength(antes);
  });

  it('agregar y quitar puerta se deshacen', () => {
    const store = montar();
    const id = store.agregarPuerta('sala-espera', 'madera', 'fondo', 200);
    expect(sala(store, 'sala-espera').puertas.find((p) => p.id === id)).toMatchObject({
      hacia: null, etiqueta: '', modelo: 'madera', ...llegada('fondo', 200, 'tres-paredes', 1440),
    });
    store.quitarPuerta('sala-espera', id);
    store.deshacer();
    expect(sala(store, 'sala-espera').puertas.some((p) => p.id === id)).toBe(true);
    store.deshacer();
    expect(sala(store, 'sala-espera').puertas.some((p) => p.id === id)).toBe(false);
  });

  it('crear la puerta de regreso enlaza par en las dos', () => {
    const store = montar();
    const caso = structuredClone(store.caso()!);
    caso.salas[1].puertas = caso.salas[1].puertas.filter(p => p.hacia !== 'sala-espera');
    store.fijar(caso);
    const id = store.crearPuertaDeRegreso('sala-espera', 'a-pasillo', ficha);
    expect(sala(store, 'sala-espera').puertas.find((p) => p.id === 'a-pasillo')!.par).toBe(id);
    expect(sala(store, 'pasillo').puertas.find((p) => p.id === id)).toMatchObject({
      par: 'a-pasillo', hacia: 'sala-espera', muro: 'derecha', modelo: 'madera',
    });
    store.deshacer();
    expect(sala(store, 'pasillo').puertas.some((p) => p.id === id)).toBe(false);
    expect(sala(store, 'sala-espera').puertas.find((p) => p.id === 'a-pasillo')!.par).toBe('a-sala-espera');
  });

  it('fijar destino pone como etiqueta el nombre de la sala destino', () => {
    const store = montar();
    store.fijarDestinoDePuerta('sala-espera', 'a-pasillo', 'pasillo');
    expect(sala(store, 'sala-espera').puertas.find((p) => p.id === 'a-pasillo')!.etiqueta)
      .toBe(sala(store, 'pasillo').nombre);
  });

  it('crea identificadores únicos y mueve piezas entre el piso y el muro', () => {
    const store = montar();
    const primero = store.agregarPiezaDeMuro('sala-espera', 'ventana', 'alta', { x: 200, y: 300 });
    const segundo = store.agregarPiezaDeMuro('sala-espera', 'ventana', 'alta', { muro: 'fondo', pos: 80 });
    expect(primero).not.toBe(segundo);
    store.moverPiezaDeMuro('sala-espera', primero, { muro: 'fondo', pos: 160 });
    const pieza = sala(store, 'sala-espera').estructura!.piezas!.find((p) => p.id === primero)!;
    expect(pieza).toMatchObject({ muro: 'fondo', pos: 160 });
    expect(pieza.x).toBeUndefined();
    store.quitarPiezaDeMuro('sala-espera', primero);
    store.deshacer();
    expect(sala(store, 'sala-espera').estructura!.piezas!.some((p) => p.id === primero)).toBe(true);
  });

  it('la puerta de regreso usa el fondo y el centro si no hay muro opuesto ni hueco', () => {
    const store = montar();
    const caso = structuredClone(store.caso()!);
    caso.salas[1].puertas = caso.salas[1].puertas.filter(p => p.hacia !== 'sala-espera');
    caso.salas.find((s) => s.id === 'pasillo')!.encuadre = 'una-pared';
    store.fijar(caso);
    const id = store.crearPuertaDeRegreso('sala-espera', 'a-pasillo', () => ({ ocupa: 5000, franja: [0, 200] }));
    expect(sala(store, 'pasillo').puertas.find((p) => p.id === id)).toMatchObject({ muro: 'fondo', pos: 840 });
  });

  it('mover una puerta recalcula su llegada y se deshace', () => {
    const store = montar();
    const antes = structuredClone(sala(store, 'sala-espera').puertas.find((p) => p.id === 'a-pasillo'));
    store.moverPuerta('sala-espera', 'a-pasillo', 'fondo', 400);
    expect(sala(store, 'sala-espera').puertas.find((p) => p.id === 'a-pasillo')).toMatchObject({
      muro: 'fondo', pos: 400, ...llegada('fondo', 400, 'tres-paredes', 1440),
    });
    store.deshacer();
    expect(sala(store, 'sala-espera').puertas.find((p) => p.id === 'a-pasillo')).toEqual(antes);
  });

  it('en solo lectura no cambia nada', () => {
    const store = montar();
    const caso = structuredClone(store.caso()!);
    caso.estado = 'PUBLISHED';
    store.fijar(caso);
    const antes = structuredClone(store.caso());
    store.moverPiezaDeMuro('sala-espera', 'v1', { muro: 'fondo', pos: 80 });
    store.agregarPiezaDeMuro('sala-espera', 'ventana', 'alta', { muro: 'fondo', pos: 80 });
    store.quitarPiezaDeMuro('sala-espera', 'v1');
    store.agregarPuerta('sala-espera', 'madera', 'fondo', 80);
    store.moverPuerta('sala-espera', 'a-pasillo', 'fondo', 80);
    store.quitarPuerta('sala-espera', 'a-pasillo');
    store.fijarDestinoDePuerta('sala-espera', 'a-pasillo', 'pasillo');
    store.crearPuertaDeRegreso('sala-espera', 'a-pasillo', ficha);
    store.cambiarEstructura('sala-espera', 'Cambio', (e) => { e.ancho = 960; });
    expect(store.caso()).toEqual(antes);
    expect(store.puedeDeshacer()).toBe(false);
  });
});
