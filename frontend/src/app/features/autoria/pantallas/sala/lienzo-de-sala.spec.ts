import { describe, expect, it } from 'vitest';
import type { ManifiestoDePiezas } from '../../../simulator/sala/catalogo';
import type { SalaCaso } from '../../modelo/caso';
import { actoresDeSala, escalaDeSala, repartirActores, salaParaLienzo, type ActorDelLienzo } from './lienzo-de-sala';

describe('escala de la sala por piezas', () => {
  it('entera en la columna y nunca más de 1:1 en escritorio (1200 a 1366 se ve completa)', () => {
    expect(escalaDeSala(960, 765, false)).toBeCloseTo(765 / 960);
    expect(escalaDeSala(1200, 765, false)).toBeCloseTo(765 / 1200);
    expect(escalaDeSala(960, 1500, false)).toBe(1);
  });
  it('en una columna de teléfono no baja de ×0,8: se desplaza en su columna y las piezas no se pisan', () => {
    expect(escalaDeSala(960, 342, false)).toBe(0.8);
    expect(escalaDeSala(1920, 342, false)).toBe(0.8);
  });
  it('«×2» y sin medir', () => {
    expect(escalaDeSala(960, 342, true)).toBe(2);
    expect(escalaDeSala(960, 0, false)).toBe(1);
  });
});

const sala = (): SalaCaso => ({
  id: 's', nombre: '', descripcion: '', encuadre: 'una-pared', fondo: '', entrada: { x: 0, y: 0 },
  estructura: null, puertas: [], muebles: [], objetos: [], personajes: [], choques: {}, origen: null,
});

describe('adaptación al lienzo', () => {
  it('sin estructura no hay sala para el lienzo', () => expect(salaParaLienzo(sala())).toBeNull());
  it('las puertas sin muro no entran al lienzo', () => {
    const s = sala();
    s.estructura = { ancho: 960, acabados: { piso: 'p', muro: 'm', paleta: 'p' } };
    s.puertas = [
      { id: 'a', x: 0, y: 0, hacia: null, etiqueta: 'A' },
      { id: 'b', x: 0, y: 0, hacia: null, etiqueta: 'B', muro: 'fondo', pos: 20, modelo: 'm' },
    ];
    expect(salaParaLienzo(s)?.puertas).toEqual([{ id: 'b', muro: 'fondo', pos: 20, modelo: 'm', etiqueta: 'B' }]);
  });
  it('cada persona usa la fila de su orientación', () => {
    const s = sala();
    s.personajes = [
      { ref: 'a', x: 1, y: 2, mirando: 'izquierda', expresion: 'neutral' },
      { ref: 'b', x: 3, y: 4, mirando: 'derecha', expresion: 'neutral' },
    ];
    expect(actoresDeSala(s).map((a) => a.fila)).toEqual([2, 6]); // filas de idle.png: left y right (VIEW_ROWS)
    expect(actoresDeSala(s)[0].url).toBe('/assets/characters/kit/a/idle.png');
  });
  it('resuelve las piezas y recetas con el catálogo del caso', () => {
    const s = sala();
    s.muebles = [{ ref: 'mesa', x: 12, y: 30, espejo: true }];
    s.objetos = [{ ref: 'nota', x: 14, y: 20 }];
    s.personajes = [{ ref: 'p', x: 3, y: 4, mirando: 'derecha', expresion: 'neutral' }];
    const actores = actoresDeSala(s, {
      lugarId: 'casa',
      catalogo: {
        muebles: [{ id: 'mesa', nombre: '', arte: 'mesa.png', ancho: 32, alto: 40, colision: false }],
        objetos: [{ id: 'nota', nombre: '', tipo: 'NOTE', arte: 'nota.png', textoInteraccion: '' }],
        herramientas: [],
      },
      personajes: [{ id: 'p', nombre: '', rol: '', recipeId: 'kit' }],
    });
    expect(actores.map((a) => a.url)).toEqual([
      '/assets/biblioteca/escenarios/casa/mesa.png', '/assets/biblioteca/escenarios/casa/nota.png',
      '/assets/characters/kit/kit/idle.png',
    ]);
    // Arte del lugar (un dibujo entero): ancho × alto del catálogo es su huella en el piso, no su cuadro. Recortarlo a
    // 32 × 40 dejaba ver solo la franja de arriba (la «Caseta de portería» salía como una losa oscura).
    expect(actores[0]).toMatchObject({ cuadroAncho: 0, cuadroAlto: 0, espejo: true, tipo: 'mueble' });
    expect(actores.map((a) => a.tipo)).toEqual(['mueble', 'objeto', 'personaje']);
  });
  it('una hoja de la biblioteca de piezas conserva su cuadro (ancho × alto del catálogo)', () => {
    const s = sala();
    s.muebles = [{ ref: 'escritorio', x: 12, y: 30 }];
    const [actor] = actoresDeSala(s, {
      lugarId: 'comisaria',
      catalogo: {
        muebles: [{ id: 'escritorio', nombre: '', arte: 'piezas/muebles/comisaria/escritorio.png', ancho: 125, alto: 68, colision: true }],
        objetos: [], herramientas: [],
      },
      personajes: [],
    });
    expect(actor).toMatchObject({ url: '/assets/biblioteca/piezas/muebles/comisaria/escritorio.png', cuadroAncho: 125, cuadroAlto: 68 });
  });
});

describe('reparto de los actores entre la escena y los sprites', () => {
  const ficha = (ruta: string, extra: Record<string, unknown> = {}) => ({ nombre: '', ruta, ancho: 122, alto: 86, cuadros: 1, ...extra });
  const manifiesto = {
    muebles: {
      'universidad/porteria': ficha('piezas/muebles/universidad/porteria.png', { reemplaza: 'escenarios/universidad/arte/muebles/porteria.png' }),
      'comisaria/escritorio': ficha('piezas/muebles/comisaria/escritorio.png', { ancho: 125, alto: 68, cuadros: 6 }),
    },
    objetos: {}, herramientas: {},
  } as unknown as ManifiestoDePiezas;
  const actor = (clave: string, url: string, tipo: ActorDelLienzo['tipo'], extra: Partial<ActorDelLienzo> = {}): ActorDelLienzo =>
    ({ clave, url, tipo, cuadroAncho: 0, cuadroAlto: 0, fila: 0, x: 100, y: 200, espejo: false, ...extra });

  it('el arte viejo que una pieza reemplaza lo dibuja la escena con la pieza, como en el juego', () => {
    const { muebles, sprites } = repartirActores([
      actor('mueble-0', '/assets/biblioteca/escenarios/universidad/arte/muebles/porteria.png', 'mueble', { espejo: true }),
    ], manifiesto);
    expect(sprites).toEqual([]);
    expect(muebles).toEqual([{
      id: 'mueble-0', clave: 'universidad/porteria', ficha: (manifiesto.muebles as Record<string, unknown>)['universidad/porteria'],
      x: 100, y: 200, espejo: true,
    }]);
  });
  it('una hoja de piezas por su ruta también va a la escena (con su animación)', () => {
    const { muebles } = repartirActores([actor('mueble-0', '/assets/biblioteca/piezas/muebles/comisaria/escritorio.png', 'mueble')], manifiesto);
    expect(muebles.map((m) => m.clave)).toEqual(['comisaria/escritorio']);
  });
  it('lo que no es de la biblioteca y las personas siguen como sprites', () => {
    const otros = [
      actor('mueble-0', '/assets/biblioteca/escenarios/casa/arte/muebles/sofa.png', 'mueble'),
      actor('personaje-0', '/assets/biblioteca/escenarios/universidad/arte/muebles/porteria.png', 'personaje', { cuadroAncho: 48, cuadroAlto: 72 }),
    ];
    const { muebles, sprites } = repartirActores(otros, manifiesto);
    expect(muebles).toEqual([]);
    expect(sprites).toEqual(otros);
  });
});
