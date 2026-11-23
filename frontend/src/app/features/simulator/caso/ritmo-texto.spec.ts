import { MS_POR_CARACTER, pausaTras, tramos } from './ritmo-texto';

describe('ritmo del texto del diálogo', () => {
  it('escribe a 30 caracteres por segundo', () => {
    expect(MS_POR_CARACTER).toBe(33);
    expect(pausaTras('a', 'b')).toBe(0);
  });

  it('pausa en la puntuación: coma 120, punto y cierre de pregunta o exclamación 300, puntos suspensivos 420', () => {
    expect(pausaTras(',', ' ')).toBe(120);
    expect(pausaTras('.', ' ')).toBe(300);
    expect(pausaTras('?', ' ')).toBe(300);
    expect(pausaTras('!', ' ')).toBe(300);
    expect(pausaTras('…', ' ')).toBe(420);
    expect(pausaTras(';', ' ')).toBe(180);
    expect(pausaTras(':', ' ')).toBe(180);
    expect(pausaTras(')', ' ')).toBe(200);
  });

  it('no pausa dentro de una serie ni en un número decimal', () => {
    expect(pausaTras('.', '.')).toBe(0);
    expect(pausaTras('!', '?')).toBe(300);
    expect(pausaTras('.', '5')).toBe(0);
    expect(pausaTras('?', undefined)).toBe(0);
  });

  it('separa las acotaciones entre paréntesis del resto', () => {
    expect(tramos('(Toma aire.) Sí. Dígannos todo.')).toEqual([
      { texto: '(Toma aire.)', acotacion: true },
      { texto: ' Sí. Dígannos todo.', acotacion: false },
    ]);
    expect(tramos('Hola')).toEqual([{ texto: 'Hola', acotacion: false }]);
    expect(tramos('')).toEqual([]);
    expect(tramos('Que hubo una pelea. (Te mira.) Sí.').map(t => t.acotacion)).toEqual([false, true, false]);
  });

  it('un paréntesis sin cerrar no es acotación', () => {
    expect(tramos('Dice (algo')).toEqual([{ texto: 'Dice (algo', acotacion: false }]);
  });
});
