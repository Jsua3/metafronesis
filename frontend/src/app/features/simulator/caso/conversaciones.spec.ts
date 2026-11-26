import { leerConversaciones, RelojDeConversacion, rutaEnPareja } from './conversaciones';
import { tramoLibre } from './acompanantes';

const personas = new Set(['a', 'b']);
const datos = {
  personas: ['a', 'b'],
  lineas: [
    { quien: 'a', texto: 'Hola, {nombre}.' },
    { quien: 'b', texto: 'Uno dos tres cuatro cinco seis siete ocho' },
  ],
};

describe('conversaciones de fondo', () => {
  it('omite pares ausentes o repetidos y conversaciones sin líneas válidas', () => {
    expect(leerConversaciones([null, { ...datos, personas: ['a', 'c'] }, { ...datos, personas: ['a', 'a'] },
      { ...datos, lineas: [] }, { ...datos, lineas: [{ quien: 'c', texto: 'Hola' }] }], personas)).toEqual([]);
  });

  it('muestra cada frase por su tiempo de lectura y conserva la pausa antes de repetir', () => {
    const [conversacion] = leerConversaciones([datos], personas, 'Lina');
    expect(conversacion).toMatchObject({ modo: 'quietos', pausaMs: 9000 });
    const reloj = new RelojDeConversacion(conversacion);
    expect(reloj.linea).toMatchObject({ texto: 'Hola, Lina.', duracionMs: 2500 });
    reloj.avanzar(2499);
    expect(reloj.linea?.quien).toBe('a');
    reloj.avanzar(1);
    expect(reloj.linea).toMatchObject({ quien: 'b', duracionMs: 3200 });
    reloj.avanzar(3200);
    expect(reloj.linea).toBeNull();
    reloj.avanzar(8999);
    expect(reloj.linea).toBeNull();
    reloj.avanzar(1);
    expect(reloj.linea?.quien).toBe('a');
  });

  it('rodea un mueble en pareja por tramos libres, con el acompañante separado 28 píxeles', () => {
    const entorno = { limites: { minX: 0, minY: 0, maxX: 160, maxY: 160 },
      bloqueado: (x: number, y: number) => x >= 60 && x <= 94 && y >= 55 && y <= 103 };
    const inicio = [{ x: 20, y: 60 }, { x: 20, y: 88 }] as const;
    const ruta = rutaEnPareja(inicio, { x: 140, y: 60 }, entorno);
    expect(ruta.length).toBeGreaterThan(2);
    const [lider, lado] = ruta.at(-1)!;
    expect(lider).toEqual({ x: 140, y: 60 });
    expect(Math.hypot(lider.x - lado.x, lider.y - lado.y)).toBe(28);
    let prev: readonly [{ x: number; y: number }, { x: number; y: number }] = inicio;
    for (const paso of ruta) {
      expect(tramoLibre(prev[0], paso[0], entorno)).toBe(true);
      expect(tramoLibre(prev[1], paso[1], entorno)).toBe(true);
      prev = paso;
    }
  });
});
