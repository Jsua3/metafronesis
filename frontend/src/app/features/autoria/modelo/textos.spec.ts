import { readFileSync } from 'fs';
import { join } from 'path';

import { TEMAS, nombreTema, plural } from './textos';

describe('plural', () => {
  it('escribe singular con 1 y plural con el resto', () => {
    expect(plural(1, 'línea', 'líneas')).toBe('1 línea');
    expect(plural(0, 'línea', 'líneas')).toBe('0 líneas');
    expect(plural(3, 'respuesta', 'respuestas')).toBe('3 respuestas');
  });
});

describe('TEMAS', () => {
  // La biblioteca es la fuente: si un lugar trae un tema que aquí no tiene nombre, el filtro queda muerto y la píldora muestra la clave cruda.
  const indice = JSON.parse(readFileSync(join(__dirname, '../../../../../../biblioteca/escenarios/indice.json'), 'utf8')) as {
    lugares: { id: string; temas: string[] }[];
  };
  const delIndice = [...new Set(indice.lugares.flatMap((l) => l.temas))];

  it('cada tema de la biblioteca tiene su nombre para el docente', () => {
    expect(delIndice.length).toBeGreaterThan(0);
    const sinNombre = delIndice.filter((id) => !TEMAS.some((t) => t.id === id));
    expect(sinNombre).toEqual([]);
    for (const id of delIndice) expect(nombreTema(id)).not.toBe(id);
  });

  it('no sobra ningún filtro: cada tema de la lista lo usa algún lugar', () => {
    expect(TEMAS.map((t) => t.id).filter((id) => !delIndice.includes(id))).toEqual([]);
  });

  it('ningún nombre se parece a una clave', () => {
    for (const t of TEMAS) expect(t.nombre).not.toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});
