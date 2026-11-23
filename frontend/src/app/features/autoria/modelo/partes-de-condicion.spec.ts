import type { CondicionFinal } from './caso';
import { type ParteDeCondicion, condicionDePartes, describirParte, partesDeCondicion, parteNueva } from './partes-de-condicion';

const hitos = [{ clave: 'valorar', nombre: 'Valorar el riesgo' }, { clave: 'derivar', nombre: 'Derivar a salud mental' }];

describe('las condiciones de un final, en frases que la docente combina con «y»', () => {
  it('una condición sencilla es una sola frase', () => {
    expect(partesDeCondicion({ milestone: 'valorar' })).toEqual([{ tipo: 'hito', clave: 'valorar' }]);
    expect(partesDeCondicion({ count: 'contraindicated', gte: 2 })).toEqual([{ tipo: 'contraindicadas', n: 2 }]);
    expect(partesDeCondicion({ count: 'risky', gte: 1 })).toEqual([{ tipo: 'riesgo', n: 1 }]);
    expect(partesDeCondicion({ persona: { bond: 'OPEN' } })).toEqual([{ tipo: 'persona', bond: 'OPEN' }]);
  });

  it('sin condición es «ninguna condición en particular»', () => {
    expect(partesDeCondicion(null)).toEqual([]);
    expect(condicionDePartes([])).toBeNull();
  });

  it('«todas» de frases sencillas son frases unidas con «y», y vuelven a la misma condición', () => {
    const condicion: CondicionFinal = {
      all: [{ milestone: 'valorar' }, { milestone: 'derivar' }, { count: 'contraindicated', eq: 0 }, { not: { milestone: 'informar' } }],
    };
    const partes = partesDeCondicion(condicion)!;
    expect(partes).toEqual([
      { tipo: 'hito', clave: 'valorar' }, { tipo: 'hito', clave: 'derivar' }, { tipo: 'ninguna-contraindicada' }, { tipo: 'sin-hito', clave: 'informar' },
    ]);
    expect(condicionDePartes(partes)).toEqual(condicion);
  });

  it('una sola frase no se envuelve en «todas»', () => {
    expect(condicionDePartes([{ tipo: 'hito', clave: 'valorar' }])).toEqual({ milestone: 'valorar' });
  });

  it('lo que el editor no sabe decir en frases queda como «condición combinada» (no se representa)', () => {
    expect(partesDeCondicion({ any: [{ milestone: 'valorar' }, { count: 'risky', gte: 3 }] })).toBeNull();
    expect(partesDeCondicion({ not: { all: [{ milestone: 'valorar' }] } })).toBeNull();
    expect(partesDeCondicion({ count: 'risky', gte: 1, lt: 4 })).toBeNull();
    expect(partesDeCondicion({ all: [{ milestone: 'valorar' }, { any: [{ milestone: 'derivar' }, { milestone: 'informar' }] }] })).toBeNull();
    expect(partesDeCondicion({ all: [] })).toBeNull();
  });

  it('cada frase se dice como la lee la docente', () => {
    const decir = (p: ParteDeCondicion) => describirParte(p, hitos);
    expect(decir({ tipo: 'hito', clave: 'valorar' })).toBe('Si cumplió el hito «Valorar el riesgo»');
    expect(decir({ tipo: 'sin-hito', clave: 'derivar' })).toBe('Si no cumplió el hito «Derivar a salud mental»');
    expect(decir({ tipo: 'contraindicadas', n: 2 })).toBe('Si eligió al menos 2 respuestas contraindicadas');
    expect(decir({ tipo: 'contraindicadas', n: 1 })).toBe('Si eligió al menos 1 respuesta contraindicada');
    expect(decir({ tipo: 'ninguna-contraindicada' })).toBe('Si no eligió ninguna respuesta contraindicada');
    expect(decir({ tipo: 'riesgo', n: 3 })).toBe('Si eligió al menos 3 respuestas con riesgo');
    expect(decir({ tipo: 'persona', bond: 'OPEN', activation: 'CALM' })).toBe('Si la persona terminó abierta y serena');
    expect(decir({ tipo: 'persona', activation: 'CRISIS' })).toBe('Si la persona terminó en crisis');
    expect(decir({ tipo: 'hito', clave: 'borrado' })).toBe('Si cumplió el hito «borrado»');
  });

  it('una frase nueva de cada tipo trae valores que ya se pueden guardar', () => {
    expect(parteNueva('hito', hitos)).toEqual({ tipo: 'hito', clave: 'valorar' });
    expect(parteNueva('sin-hito', hitos)).toEqual({ tipo: 'sin-hito', clave: 'valorar' });
    expect(parteNueva('contraindicadas', hitos)).toEqual({ tipo: 'contraindicadas', n: 1 });
    expect(parteNueva('persona', hitos)).toEqual({ tipo: 'persona', bond: 'OPEN' });
    expect(parteNueva('hito', [])).toBeNull(); // sin hitos no hay hito que elegir
  });
});
