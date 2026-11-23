import { choiceIndex, digitIndex, letterIndex } from './dialogue-keys.util';

describe('letterIndex y choiceIndex: las opciones se nombran A a D', () => {
  it('a..d y A..D son 0..3', () => {
    expect(letterIndex('a')).toBe(0);
    expect(letterIndex('D')).toBe(3);
    expect(letterIndex('e')).toBeNull();
    expect(letterIndex('Enter')).toBeNull();
  });
  it('la letra o el número nombran la misma opción', () => {
    expect(choiceIndex('b')).toBe(1);
    expect(choiceIndex('2')).toBe(1);
    expect(choiceIndex('x')).toBeNull();
  });
});

describe('digitIndex', () => {
  it('maps 1..9 to 0..8', () => {
    expect(digitIndex('1')).toBe(0);
    expect(digitIndex('3')).toBe(2);
    expect(digitIndex('9')).toBe(8);
  });
  it('returns null for 0, letters, empty, multi-char', () => {
    expect(digitIndex('0')).toBeNull();
    expect(digitIndex('a')).toBeNull();
    expect(digitIndex('')).toBeNull();
    expect(digitIndex('12')).toBeNull();
  });
});
