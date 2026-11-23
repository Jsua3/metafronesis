import { caraDeReaccion, DURACION_MAX_REACCION_MS, msDeFrase, pasosDeReaccion } from './reaccion';

const ANTES = { bond: 'GUARDED', activation: 'TENSE', label: 'La persona se muestra cautelosa y tensa' } as const;
const DESPUES = { bond: 'OPEN', activation: 'CALM', label: 'La persona se abre y está serena' } as const;
const REACCION = { line: 'Gracias por quedarse.', emotion: 'triste', gesture: 'se-acerca', objectKey: 'familia-duelo' };

it('con movimiento: encuadre, gesto, cara, frase y etiqueta, en ese orden', () => {
  const pasos = pasosDeReaccion({ reaction: REACCION, personaAntes: ANTES, personaDespues: DESPUES, reduceMotion: false });
  expect(pasos.map(p => p.tipo)).toEqual(['encuadrar', 'gesto', 'cara', 'frase', 'etiqueta']);
  expect(pasos.find(p => p.tipo === 'cara')).toMatchObject({ emocion: 'triste' });
});

it('con movimiento reducido no hay encuadre ni gesto', () => {
  const pasos = pasosDeReaccion({ reaction: REACCION, personaAntes: ANTES, personaDespues: DESPUES, reduceMotion: true });
  expect(pasos.map(p => p.tipo)).toEqual(['cara', 'frase', 'etiqueta']);
});

it('la reacción muda no inventa frase; sin emoción, la cara sale del estado de la persona', () => {
  const pasos = pasosDeReaccion({ reaction: { ...REACCION, line: '  ', emotion: null }, personaAntes: ANTES, personaDespues: ANTES, reduceMotion: false });
  expect(pasos.some(p => p.tipo === 'frase')).toBe(false);
  expect(pasos.some(p => p.tipo === 'etiqueta')).toBe(false);
  expect(pasos.find(p => p.tipo === 'cara')).toMatchObject({ emocion: caraDeReaccion(null, ANTES) });
});

it('sin objectKey no hay encuadre ni gesto, pero sí cara y frase', () => {
  const pasos = pasosDeReaccion({ reaction: { ...REACCION, objectKey: null }, personaAntes: ANTES, personaDespues: ANTES, reduceMotion: false });
  expect(pasos.map(p => p.tipo)).toEqual(['cara', 'frase']);
});

it('sin reacción solo cambia la etiqueta, si cambió', () => {
  expect(pasosDeReaccion({ reaction: null, personaAntes: ANTES, personaDespues: DESPUES, reduceMotion: false }).map(p => p.tipo)).toEqual(['etiqueta']);
  expect(pasosDeReaccion({ reaction: null, personaAntes: ANTES, personaDespues: ANTES, reduceMotion: false })).toEqual([]);
});

it('un gesto o una emoción fuera del vocabulario se tratan como ausentes', () => {
  const pasos = pasosDeReaccion({ reaction: { ...REACCION, gesture: 'salta', emotion: 'furiosa' }, personaAntes: ANTES, personaDespues: ANTES, reduceMotion: false });
  expect(pasos.some(p => p.tipo === 'gesto')).toBe(false);
  expect(pasos.find(p => p.tipo === 'cara')).toMatchObject({ emocion: caraDeReaccion(null, ANTES) });
});

it('nunca pasa de tres segundos y pico, aunque la frase sea larga', () => {
  const larga = { ...REACCION, line: 'x'.repeat(400) };
  const pasos = pasosDeReaccion({ reaction: larga, personaAntes: ANTES, personaDespues: DESPUES, reduceMotion: false });
  expect(pasos.reduce((ms, p) => ms + p.ms, 0)).toBeLessThanOrEqual(DURACION_MAX_REACCION_MS);
  expect(pasos.find(p => p.tipo === 'frase')!.ms).toBeGreaterThanOrEqual(1200);
});

it('la frase dura 900 ms más 30 por carácter, entre 1.200 y 2.000', () => {
  expect(msDeFrase('hola')).toBe(1200);
  expect(msDeFrase('x'.repeat(20))).toBe(1500);
  expect(msDeFrase('x'.repeat(400))).toBe(2000);
});
