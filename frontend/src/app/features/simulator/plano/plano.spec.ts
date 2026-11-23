import { ALTO_SALA, PlanoDelLugar, dibujarPlano, normalizarLayout, textoDeLaSala, textoDelPlano } from './plano';
import { LAYOUT_HOSPITAL } from './plano-ejemplo.testing';

const hospital = (): PlanoDelLugar => normalizarLayout(LAYOUT_HOSPITAL)!;
const NADA = new Set<string>();

describe('plano: normalizarLayout (contrato x-siep 2.2, sección 5.2)', () => {
  it.each([['undefined', undefined], ['null', null], ['sin salas', {}], ['salas vacías', { rooms: [], doors: [] }], ['texto', 'plano']])(
    'sin layout usable (%s) no hay plano', (_nombre, raw) => {
      expect(normalizarLayout(raw)).toBeNull();
    },
  );

  it('lee salas, puertas y la sala actual del ejemplo del hospital', () => {
    const plano = hospital();
    expect(plano.actual).toBe('pasillo');
    expect(plano.salas).toHaveLength(8);
    expect(plano.puertas).toHaveLength(16);
    expect(plano.salas.find(s => s.clave === 'pasillo')).toEqual({
      clave: 'pasillo', titulo: 'Pasillo', ancho: 1680, encuadre: 'tres-paredes', x: 0, y: 0, visitada: true,
    });
  });

  it('nunca lleva objetos ni personas: solo los campos del plano', () => {
    const raw = {
      rooms: [{ key: 'a', title: 'A', width: 960, plan: { x: 0, y: 0 }, visited: true, objects: [{ key: 'carpeta' }], people: ['abuela'] }],
      doors: [],
      objects: [{ key: 'carpeta' }],
    };
    const plano = normalizarLayout(raw)!;
    expect(Object.keys(plano).sort()).toEqual(['actual', 'puertas', 'salas']);
    expect(Object.keys(plano.salas[0]).sort()).toEqual(['ancho', 'clave', 'encuadre', 'titulo', 'visitada', 'x', 'y']);
  });

  it('descarta puertas inválidas y completa lo que falta de una sala', () => {
    const plano = normalizarLayout({
      currentRoom: 'a',
      rooms: [{ key: 'a', plan: { x: 0, y: 0 } }, { key: 'b', title: 'B', width: 960 }, { title: 'sin clave' }],
      doors: [
        { from: 'a', to: 'b', wall: 'derecha', pos: 100 },
        { from: 'a', to: 'b', wall: 'techo', pos: 100 },
        { from: 'zeta', to: 'a', wall: 'fondo', pos: 10 },
        { from: 'a', to: 'b', wall: 'fondo' },
      ],
    })!;
    expect(plano.salas.map(s => s.clave)).toEqual(['a', 'b']);
    expect(plano.salas[0]).toMatchObject({ titulo: 'a', ancho: 960, encuadre: 'tres-paredes', visitada: false });
    // Sin `plan`: en fila a la derecha de todo, con la separación del contrato (regla 5.3, paso 5).
    expect(plano.salas[1]).toMatchObject({ x: 1056, y: 0 });
    expect(plano.puertas).toEqual([{ origen: 'a', destino: 'b', muro: 'derecha', pos: 100 }]);
  });
});

describe('plano: dibujarPlano', () => {
  it('cada sala es un rectángulo proporcional a su ancho y del alto de una sala', () => {
    const dibujo = dibujarPlano(hospital(), 'pasillo', NADA);
    const pasillo = dibujo.salas.find(s => s.clave === 'pasillo')!;
    const triaje = dibujo.salas.find(s => s.clave === 'triaje')!;
    expect(pasillo.ancho / triaje.ancho).toBe(1.75);
    expect(pasillo.alto).toBe(ALTO_SALA);
  });

  it('la actual resaltada, las visitadas con nombre y las no visitadas sin nombre', () => {
    const dibujo = dibujarPlano(hospital(), 'pasillo', NADA);
    const estado = (clave: string) => dibujo.salas.find(s => s.clave === clave)!;
    expect(estado('pasillo')).toMatchObject({ estado: 'actual', titulo: 'Pasillo' });
    expect(estado('entrada-urgencias')).toMatchObject({ estado: 'visitada', titulo: 'Entrada de urgencias' });
    expect(estado('triaje')).toMatchObject({ estado: 'sin-visitar', titulo: null });
  });

  it('una sala visitada en esta sesión cuenta aunque el servidor aún no lo sepa', () => {
    const dibujo = dibujarPlano(hospital(), 'triaje', new Set(['sala-escucha']));
    expect(dibujo.salas.find(s => s.clave === 'triaje')!.estado).toBe('actual');
    expect(dibujo.salas.find(s => s.clave === 'sala-escucha')!.estado).toBe('visitada');
  });

  it('cada puerta se marca sobre su muro en su posición real', () => {
    const pasillo = dibujarPlano(hospital(), 'pasillo', NADA).salas.find(s => s.clave === 'pasillo')!;
    const marca = (destino: string, muro: string) => pasillo.puertas.find(p => p.destino === destino && p.muro === muro);
    expect(marca('triaje', 'fondo')).toEqual({ x: 313, y: 0, muro: 'fondo', destino: 'triaje' });
    expect(marca('habitacion-recuperacion', 'camara')).toEqual({ x: 497, y: 528, muro: 'camara', destino: 'habitacion-recuperacion' });
    expect(marca('entrada-urgencias', 'izquierda')).toEqual({ x: 0, y: 390, muro: 'izquierda', destino: 'entrada-urgencias' });
    expect(marca('sala-espera', 'derecha')).toEqual({ x: 1680, y: 390, muro: 'derecha', destino: 'sala-espera' });
  });

  it('en una sala de una pared el muro del fondo empieza en el borde', () => {
    const plano = normalizarLayout({
      rooms: [{ key: 'a', title: 'A', width: 960, frame: 'una-pared', plan: { x: 40, y: 80 } }],
      doors: [{ from: 'a', to: 'b', wall: 'fondo', pos: 100 }],
    })!;
    expect(dibujarPlano(plano, 'a', NADA).salas[0].puertas[0]).toMatchObject({ x: 140, y: 80 });
  });

  it('la caja envuelve todas las salas con margen', () => {
    expect(dibujarPlano(hospital(), 'pasillo', NADA).caja).toEqual({ x: -1416, y: -744, ancho: 4752, alto: 2016 });
  });
});

describe('plano: textos para lector de pantalla', () => {
  it('dice dónde está el estudiante y a dónde llevan las puertas, una vez cada destino', () => {
    expect(textoDeLaSala(hospital(), 'pasillo')).toBe(
      'Estás en: Pasillo. Puertas: Triaje, Estación de enfermería, Sala de escucha, Oficina de trabajo social, '
      + 'Entrada de urgencias, Sala de espera y Habitación de recuperación.',
    );
  });

  it('una puerta hacia una sala fuera del plano es una salida', () => {
    expect(textoDeLaSala(hospital(), 'entrada-urgencias')).toBe('Estás en: Entrada de urgencias. Puertas: Pasillo y Salida.');
  });

  it('una sala sin puertas lo dice; una sala desconocida no dice nada', () => {
    const plano = normalizarLayout({ rooms: [{ key: 'a', title: 'Consultorio', width: 960, plan: { x: 0, y: 0 } }], doors: [] })!;
    expect(textoDeLaSala(plano, 'a')).toBe('Estás en: Consultorio. No tiene puertas.');
    expect(textoDeLaSala(plano, 'zeta')).toBe('');
  });

  it('el plano completo: una línea por sala, y las no visitadas sin su nombre', () => {
    const lineas = textoDelPlano(hospital(), 'pasillo', NADA);
    expect(lineas).toHaveLength(8);
    expect(lineas[0]).toBe('Entrada de urgencias, visitada. Puertas: Pasillo y Salida.');
    expect(lineas[2]).toBe('Sala sin visitar. Se llega desde Pasillo.');
    expect(lineas[3]).toMatch(/^Pasillo, estás aquí\. Puertas: Triaje, /);
  });
});

describe('normalizarLayout para el editor (P4)', () => {
  it('conserva la clave de cada puerta y la omite si no viene', () => {
    const plano = normalizarLayout({ rooms: [{ key: 'a', plan: { x: 0, y: 0 } }, { key: 'b', plan: { x: 1200, y: 0 } }],
      doors: [{ key: 'a-b', from: 'a', to: 'b', wall: 'derecha', pos: 100 }, { from: 'b', to: 'a', wall: 'izquierda', pos: 100 }] })!;
    expect(plano.puertas.map(p => p.clave)).toEqual(['a-b', undefined]);
  });
});
