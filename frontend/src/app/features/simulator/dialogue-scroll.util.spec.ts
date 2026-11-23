import { describe, expect, it } from 'vitest';
import { scrollShiftToUncoverText } from './dialogue-scroll.util';

describe('scrollShiftToUncoverText', () => {
  it('no mueve nada si ningún bloque queda cortado por la cabecera fija', () => {
    expect(scrollShiftToUncoverText(80, [{ top: 20, bottom: 70 }, { top: 90, bottom: 140 }])).toBe(0);
  });

  it('sube el scroll lo justo para que un bloque cortado por la cabecera se vea entero', () => {
    // La cabecera llega hasta 80 y el texto va de 56 a 120: hay que subir 24 px.
    expect(scrollShiftToUncoverText(80, [{ top: 56, bottom: 120 }])).toBe(-24);
  });

  it('con varios bloques cortados elige el que más hay que subir', () => {
    expect(scrollShiftToUncoverText(80, [{ top: 70, bottom: 100 }, { top: 40, bottom: 90 }])).toBe(-40);
  });

  it('un bloque que apenas toca el borde de la cabecera no cuenta', () => {
    expect(scrollShiftToUncoverText(80, [{ top: 80, bottom: 120 }, { top: 40, bottom: 80 }])).toBe(0);
  });

  it('con tope: sube todo lo pedido si las opciones protegidas siguen enteras a la vista', () => {
    expect(scrollShiftToUncoverText(80, [{ top: 56, bottom: 120 }], { protect: { top: 400, bottom: 520 }, viewBottom: 600 })).toBe(-24);
  });

  it('con tope: sube solo lo que deja enteras las opciones protegidas', () => {
    // Faltan 24 px para el texto, pero la opción 2 acaba en 590 y el panel en 600: solo caben 10.
    expect(scrollShiftToUncoverText(80, [{ top: 56, bottom: 120 }], { protect: { top: 470, bottom: 590 }, viewBottom: 600 })).toBe(-10);
  });

  it('con tope: si las opciones protegidas ya no caben, no mueve nada', () => {
    expect(scrollShiftToUncoverText(80, [{ top: 56, bottom: 120 }], { protect: { top: 500, bottom: 640 }, viewBottom: 600 })).toBe(0);
  });
});
