import { MAX_CONTEXTO, MAX_LARGO_OBJETIVO, MAX_NOMBRE, MAX_OBJETIVOS, objetivosDeTexto, problemaDeNombre, revisarFicha } from './ficha';

describe('datos del caso: contexto y objetivos de aprendizaje', () => {
  it('los objetivos escritos se leen como lista: sin espacios sobrantes ni renglones vacíos', () => {
    expect(objetivosDeTexto(' Escuchar con atención. \n\n  Nombrar la emoción.  \r\n')).toEqual(['Escuchar con atención.', 'Nombrar la emoción.']);
    expect(objetivosDeTexto('')).toEqual([]);
  });

  it('un contexto y unos objetivos normales no tienen nada que corregir', () => {
    expect(revisarFicha('Una estudiante llega a Bienestar.', 'Valorar el riesgo.\nValidar sin juzgar.')).toEqual({ contexto: null, objetivos: null });
    expect(revisarFicha('', '')).toEqual({ contexto: null, objetivos: null });
  });

  it('un contexto de más de 4.000 caracteres se rechaza y dice cuántos tiene', () => {
    expect(MAX_CONTEXTO).toBe(4000);
    expect(revisarFicha('a'.repeat(4000), '').contexto).toBeNull();
    expect(revisarFicha('a'.repeat(4001), '').contexto).toBe('El contexto admite hasta 4.000 caracteres (ahora tiene 4.001).');
  });

  it('más de 12 objetivos, o uno de más de 280 caracteres, se rechazan', () => {
    expect(MAX_OBJETIVOS).toBe(12);
    expect(MAX_LARGO_OBJETIVO).toBe(280);
    const trece = Array.from({ length: 13 }, (_, i) => `Objetivo ${i + 1}`).join('\n');
    expect(revisarFicha('', trece).objetivos).toBe('Un caso admite hasta 12 objetivos de aprendizaje.');
    expect(revisarFicha('', 'a'.repeat(280)).objetivos).toBeNull();
    expect(revisarFicha('', `Corto.\n${'a'.repeat(281)}`).objetivos).toBe('El objetivo 2 admite hasta 280 caracteres.');
  });

  it('solo texto plano: nada de etiquetas ni enlaces, en el contexto ni en los objetivos', () => {
    expect(revisarFicha('Hola <b>mundo</b>', '').contexto).toBe('Escribe texto plano, sin etiquetas ni formato.');
    expect(revisarFicha('Mira https://ejemplo.org', '').contexto).toBe('Escribe texto plano, sin enlaces.');
    expect(revisarFicha('Ver www.ejemplo.org', '').contexto).toBe('Escribe texto plano, sin enlaces.');
    expect(revisarFicha('', 'Bien\nUsar <script>').objetivos).toBe('El objetivo 2 debe ser texto plano, sin etiquetas ni formato.');
    expect(revisarFicha('', 'Entrar a mailto:a@b.co').objetivos).toBe('El objetivo 1 debe ser texto plano, sin enlaces.');
  });

  it('un «<» que no abre una etiqueta es texto («edad < 18»)', () => {
    expect(revisarFicha('Tiene edad < 18 años.', 'Si a < b, decir "menor".').contexto).toBeNull();
  });

  it('los caracteres de control no se admiten', () => {
    expect(revisarFicha('Hola\u0007', '').contexto).toBe('Hay caracteres que no se admiten.');
  });
});

describe('nombre del caso (RK-8)', () => {
  it('un nombre normal está bien', () => {
    expect(problemaDeNombre('  Primera atención  ')).toBeNull();
    expect(problemaDeNombre('a'.repeat(MAX_NOMBRE))).toBeNull();
  });

  it('vacío, muy largo, con etiquetas o con enlaces no se admite', () => {
    expect(problemaDeNombre('   ')).toBe('El caso necesita un nombre.');
    expect(problemaDeNombre('a'.repeat(MAX_NOMBRE + 1))).toBe('El nombre admite hasta 255 caracteres (ahora tiene 256).');
    expect(problemaDeNombre('Caso <b>1</b>')).toBe('Escribe el nombre como texto plano, sin etiquetas ni formato.');
    expect(problemaDeNombre('Ver https://ejemplo.org')).toBe('Escribe el nombre como texto plano, sin enlaces.');
    expect(problemaDeNombre('Hola')).toBe('El nombre tiene caracteres que no se admiten.');
  });
});
