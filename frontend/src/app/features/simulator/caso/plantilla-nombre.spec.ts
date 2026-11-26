import { comentarioConNombre, conNombre, dialogoConNombre, nombreDePila, tieneNombre } from './plantilla-nombre';

describe('plantilla {nombre}', () => {
  describe('nombreDePila', () => {
    it('toma la primera palabra del nombre, sin espacios', () => {
      expect(nombreDePila('María José Ruiz')).toBe('María');
      expect(nombreDePila('  Ana  ')).toBe('Ana');
    });

    it('sin nombre da cadena vacía', () => {
      expect(nombreDePila('')).toBe('');
      expect(nombreDePila('   ')).toBe('');
      expect(nombreDePila(null)).toBe('');
      expect(nombreDePila(undefined)).toBe('');
    });
  });

  describe('con nombre', () => {
    it('reemplaza cada marca por el nombre de pila', () => {
      expect(conNombre('Hola, {nombre}. Eres {nombre}, del equipo.', 'Laura Gómez')).toBe('Hola, Laura. Eres Laura, del equipo.');
    });

    it('acepta espacios y mayúsculas dentro de las llaves', () => {
      expect(conNombre('Hola, { nombre }. {Nombre}, entra.', 'Ana')).toBe('Hola, Ana. Ana, entra.');
    });

    it('un nombre con signos no rompe el reemplazo ($ no es un patrón)', () => {
      expect(conNombre('Hola, {nombre}.', '$&Ana')).toBe('Hola, $&Ana.');
    });

    it('un texto sin la marca vuelve igual', () => {
      const texto = 'Viernes, 4 de la tarde.';
      expect(conNombre(texto, 'Ana')).toBe(texto);
      expect(conNombre(texto, '')).toBe(texto);
    });
  });

  describe('sin nombre: la marca se quita y la frase queda limpia', () => {
    it.each([
      ['Hola, {nombre}. Lo que acabas de ver pasa.', 'Hola. Lo que acabas de ver pasa.'],
      ['¡Hola, {nombre}!', '¡Hola!'],
      ['11:20 p. m. Eres {nombre}, del equipo de psicología de urgencias.', '11:20 p. m. Eres del equipo de psicología de urgencias.'],
      ['Ahora eres {nombre}, del equipo psicosocial.', 'Ahora eres del equipo psicosocial.'],
      ['Gracias, {nombre}, por venir.', 'Gracias por venir.'],
      ['{nombre}, mira esto.', 'Mira esto.'],
      ['{nombre}, ¡qué bueno!', '¡Qué bueno!'],
      ['¿Usted sabe algo, {nombre}?', '¿Usted sabe algo?'],
      ['Hola. {nombre}, entra.', 'Hola. Entra.'],
      ['¿{nombre}, me escuchas?', '¿Me escuchas?'],
      ['Hola {nombre}!', 'Hola!'],
      ['Bien hecho, {nombre}', 'Bien hecho'],
      ['{nombre}', ''],
    ])('«%s» → «%s»', (entrada, salida) => {
      expect(conNombre(entrada, '')).toBe(salida);
      expect(conNombre(entrada, null)).toBe(salida);
    });

    it('conserva los saltos de línea del texto', () => {
      expect(conNombre('Hola, {nombre}.\nEntra.', '')).toBe('Hola.\nEntra.');
    });
  });

  it('deja pasar null y undefined', () => {
    expect(conNombre(null, 'Ana')).toBeNull();
    expect(conNombre(undefined, 'Ana')).toBeUndefined();
  });

  it('tieneNombre reconoce la marca', () => {
    expect(tieneNombre('Eres {nombre}.')).toBe(true);
    expect(tieneNombre('Eres tú.')).toBe(false);
    expect(tieneNombre(null)).toBe(false);
  });
});

describe('dialogoConNombre y comentarioConNombre', () => {
  const dialogo = {
    key: 'npc-gloria', speakerName: 'Gloria', portraitKey: null, emotion: 'neutral', notice: null,
    lines: [{ order: 1, speakerName: 'Gloria', text: '¿Usted es la psicóloga, {nombre}?', emotion: 'neutral' }],
    choices: [{ key: 'a', text: 'Sí, soy {nombre}.', decisionOptionId: 4, requiredToolCode: null, effect: {} }],
  };

  it('pone el nombre en líneas y opciones sin tocar el original', () => {
    const con = dialogoConNombre(dialogo, 'Ana María');
    expect(con?.lines[0].text).toBe('¿Usted es la psicóloga, Ana?');
    expect(con?.choices[0].text).toBe('Sí, soy Ana.');
    expect(con?.choices[0].decisionOptionId).toBe(4);
    expect(dialogo.lines[0].text).toContain('{nombre}');
  });

  it('sin marcas devuelve el mismo objeto', () => {
    const sin = { ...dialogo, lines: [{ ...dialogo.lines[0], text: 'Hola.' }], choices: [{ ...dialogo.choices[0], text: 'Sí.' }] };
    expect(dialogoConNombre(sin, 'Ana')).toBe(sin);
    expect(dialogoConNombre(null, 'Ana')).toBeNull();
  });

  it('el comentario lleva el nombre en su línea', () => {
    const c = { id: '1', objectKey: 'abuela', line: '{nombre}, ¿usted sabe algo?', emotion: null, gesture: null };
    expect(comentarioConNombre(c, 'Luis')?.line).toBe('Luis, ¿usted sabe algo?');
    expect(comentarioConNombre(c, '')?.line).toBe('¿Usted sabe algo?');
    const sin = { ...c, line: 'Hola.' };
    expect(comentarioConNombre(sin, 'Luis')).toBe(sin);
  });
});
