import type { CasoBorrador } from './caso';
import {
  AVISO_HERRAMIENTA_SIN_ENTREGA, casillasDe, describirCondicion, escribirCondicion, leerCondicion, piezasDeSala,
} from './requisitos';

const talked = (clave: string) => ({ talked: clave });
const inspected = (clave: string) => ({ inspected: clave });

describe('leerCondicion', () => {
  it.each([
    [undefined, { forma: 'ninguna' }],
    [null, { forma: 'ninguna' }],
    [{}, { forma: 'ninguna' }],
    [talked('laura'), { forma: 'todas', hechos: [{ tipo: 'talked', clave: 'laura' }] }],
    [
      { all: [talked('laura'), inspected('carpeta')] },
      { forma: 'todas', hechos: [{ tipo: 'talked', clave: 'laura' }, { tipo: 'inspected', clave: 'carpeta' }] },
    ],
    [{ used: 'PAP' }, { forma: 'todas', hechos: [{ tipo: 'used', clave: 'PAP' }] }],
    [{ milestone: 'x' }, { forma: 'otra', crudo: { milestone: 'x' } }],
    [{ any: [talked('a'), talked('b')] }, { forma: 'otra', crudo: { any: [talked('a'), talked('b')] } }],
    [{ not: inspected('carpeta') }, { forma: 'otra', crudo: { not: inspected('carpeta') } }],
    [{ count: 'risky', gte: 1 }, { forma: 'otra', crudo: { count: 'risky', gte: 1 } }],
    [{ persona: { bond: 'OPEN' } }, { forma: 'otra', crudo: { persona: { bond: 'OPEN' } } }],
    [
      { all: [talked('laura'), { milestone: 'x' }] },
      { forma: 'otra', crudo: { all: [talked('laura'), { milestone: 'x' }] } },
    ],
    [{ all: [] }, { forma: 'otra', crudo: { all: [] } }],
    [{ talked: 'a', inspected: 'b' }, { forma: 'otra', crudo: { talked: 'a', inspected: 'b' } }],
    [{ talked: 7 }, { forma: 'otra', crudo: { talked: 7 } }],
    ['roto', { forma: 'otra', crudo: {} }],
    [[1, 2], { forma: 'otra', crudo: {} }],
  ])('leerCondicion(%j)', (crudo, esperado) => expect(leerCondicion(crudo)).toEqual(esperado));

  // P7: un hecho sin casilla en la interfaz (has, used con @objetivo, talked de ambiente) se conserva y se muestra en palabras.
  it.each([
    [{ has: 'PAP' }],
    [{ used: 'PAP@familia' }],
    [{ all: [talked('laura'), { has: 'PAP' }] }],
  ])('un hecho sin casilla (%j) es otra, con el crudo intacto', (crudo) => {
    expect(leerCondicion(crudo)).toEqual({ forma: 'otra', crudo });
  });

  it('con un predicado de casillas, un hecho que la sala no ofrece (un personaje de ambiente) es otra', () => {
    const solo = (h: { tipo: string; clave: string }) => h.clave === 'laura';
    expect(leerCondicion(talked('laura'), solo).forma).toBe('todas');
    expect(leerCondicion(talked('vecina'), solo)).toEqual({ forma: 'otra', crudo: talked('vecina') });
    expect(leerCondicion({ all: [talked('laura'), talked('vecina')] }, solo).forma).toBe('otra');
  });

  it('la forma otra lleva una copia: cambiar el original no la cambia', () => {
    const original = { any: [talked('a')] };
    const lectura = leerCondicion(original);
    (original.any[0] as Record<string, unknown>)['talked'] = 'z';
    expect(lectura).toEqual({ forma: 'otra', crudo: { any: [talked('a')] } });
  });
});

describe('escribirCondicion', () => {
  it('ninguna es {}; un hecho es el hecho; varios son all', () => {
    expect(escribirCondicion({ forma: 'ninguna' })).toEqual({});
    expect(escribirCondicion({ forma: 'todas', hechos: [] })).toEqual({});
    expect(escribirCondicion({ forma: 'todas', hechos: [{ tipo: 'talked', clave: 'laura' }] })).toEqual(talked('laura'));
    expect(escribirCondicion({
      forma: 'todas', hechos: [{ tipo: 'talked', clave: 'laura' }, { tipo: 'used', clave: 'PAP' }],
    })).toEqual({ all: [talked('laura'), { used: 'PAP' }] });
  });

  it('ida y vuelta: leer y escribir sin cambios deja el mismo JSON, también en la forma otra', () => {
    const casos: unknown[] = [
      {}, talked('laura'), { all: [talked('laura'), inspected('carpeta')] },
      { milestone: 'informar' }, { any: [talked('a'), { not: inspected('b') }] }, { not: talked('a') },
      { count: 'risky', gte: 1, lt: 3 }, { persona: { bond: 'OPEN', activation: 'CALM' } },
      { all: [talked('laura'), { milestone: 'x' }] }, { has: 'PAP' }, { used: 'PAP@familia' },
    ];
    for (const crudo of casos) expect(escribirCondicion(leerCondicion(crudo))).toEqual(crudo);
  });

  it('lo escrito en la forma otra no comparte referencias con la lectura', () => {
    const lectura = leerCondicion({ any: [talked('a')] });
    const escrito = escribirCondicion(lectura);
    expect(escrito).toEqual({ any: [talked('a')] });
    expect(lectura.forma === 'otra' && escrito === lectura.crudo).toBe(false);
  });
});

describe('describirCondicion', () => {
  const nombres = (tipo: string, clave: string) => ({ laura: 'Laura', carpeta: 'la carpeta', informar: 'Informar derechos', PAP: 'Primeros auxilios' })[clave as 'laura'] ?? clave;

  it('describe en palabras un hito, un any y un not', () => {
    expect(describirCondicion({ all: [talked('laura'), { milestone: 'informar' }] }, nombres))
      .toBe('habló con Laura y cumplió el hito “Informar derechos”');
    expect(describirCondicion({ any: [talked('laura'), inspected('carpeta')] }, nombres))
      .toBe('alguna de estas: habló con Laura; revisó la carpeta');
    expect(describirCondicion({ not: inspected('carpeta') }, nombres)).toBe('no revisó la carpeta');
  });

  it('describe herramientas, conteos y el estado de la persona', () => {
    expect(describirCondicion({ has: 'PAP' }, nombres)).toBe('tiene Primeros auxilios');
    expect(describirCondicion({ used: 'PAP' }, nombres)).toBe('usó Primeros auxilios');
    expect(describirCondicion({ count: 'risky', gte: 2 }, nombres)).toBe('eligió al menos 2 respuestas con riesgo');
    expect(describirCondicion({ persona: { bond: 'OPEN', activation: 'CALM' } }, nombres))
      .toBe('la persona usuaria quedó abierta y serena');
  });

  it('un not sobre algo compuesto y un grupo dentro de otro se leen con paréntesis', () => {
    expect(describirCondicion({ not: { any: [talked('laura'), inspected('carpeta')] } }, nombres))
      .toBe('no ocurre que (alguna de estas: habló con Laura; revisó la carpeta)');
    expect(describirCondicion({ all: [talked('laura'), { any: [inspected('carpeta'), { used: 'PAP' }] }] }, nombres))
      .toBe('habló con Laura y (alguna de estas: revisó la carpeta; usó Primeros auxilios)');
  });

  it('un dato roto da el aviso fijo', () => {
    for (const roto of ['roto', 7, null, [], { raro: 1 }, { all: [talked('a'), { raro: 1 }] }, { talked: 3 }]) {
      expect(describirCondicion(roto, nombres)).toBe('un requisito que el editor no puede leer');
    }
  });
});

describe('piezasDeSala', () => {
  function caso(extra: Partial<CasoBorrador> = {}): CasoBorrador {
    return {
      id: '1', revision: 1, titulo: 'x', lugarId: null, inicioId: null, hitos: [], nivelRiesgo: null, modoFinales: 'automatico',
      finales: [], escenas: [],
      personajes: [{ id: 'laura-ref', nombre: 'Laura', rol: 'Estudiante', recipeId: '' }],
      catalogo: {
        muebles: [],
        objetos: [{ id: 'carpeta-ref', nombre: 'Carpeta', tipo: 'NOTE', arte: '', textoInteraccion: '' }],
        herramientas: [],
      },
      salas: [
        {
          id: 'consultorio', nombre: 'Consultorio', descripcion: '', encuadre: 'tres-paredes', fondo: '', entrada: { x: 0, y: 0 }, origen: null,
          muebles: [], puertas: [],
          objetos: [
            { ref: 'carpeta-ref', clave: 'carpeta', x: 1, y: 1 },
            { ref: 'carpeta-ref', x: 2, y: 2 }, // aún sin guardar: sin clave
            { ref: 'kit', clave: 'kit-1', x: 3, y: 3, toolCode: 'PAP' },
          ],
          personajes: [
            { ref: 'laura-ref', clave: 'laura', x: 1, y: 1, mirando: 'derecha', expresion: 'neutral' },
            { ref: 'laura-ref', x: 5, y: 5, mirando: 'derecha', expresion: 'neutral' }, // sin guardar
          ],
        },
        {
          id: 'pasillo', nombre: 'Pasillo', descripcion: '', encuadre: 'tres-paredes', fondo: '', entrada: { x: 0, y: 0 }, origen: null,
          muebles: [], puertas: [], objetos: [{ ref: 'folleto', clave: 'folleto', x: 1, y: 1 }], personajes: [],
        },
      ],
      herramientas: [{ codigo: 'PAP', nombre: 'Primeros auxilios' }, { codigo: 'FICHA', nombre: 'Ficha de derivación' }],
      ...extra,
    } as CasoBorrador;
  }

  it('ofrece las personas y objetos de la sala con su clave y su nombre, y no las piezas sin clave', () => {
    const { personas, objetos } = piezasDeSala(caso(), 'consultorio');
    expect(personas).toEqual([{ tipo: 'talked', clave: 'laura', ref: 'laura-ref', nombre: 'Laura', aviso: null }]);
    expect(objetos.map((o) => [o.tipo, o.clave, o.nombre])).toEqual([['inspected', 'carpeta', 'Carpeta'], ['inspected', 'kit-1', 'kit']]);
  });

  it('solo la sala pedida: otra sala trae sus propias piezas', () => {
    const { personas, objetos } = piezasDeSala(caso(), 'pasillo');
    expect(personas).toEqual([]);
    expect(objetos.map((o) => o.clave)).toEqual(['folleto']);
    expect(piezasDeSala(caso(), 'no-existe')).toMatchObject({ personas: [], objetos: [] });
  });

  it('piezasDeSala no ofrece piezas sin clave y avisa de las herramientas que nadie entrega', () => {
    const { herramientas } = piezasDeSala(caso(), 'pasillo');
    expect(herramientas).toEqual([
      { tipo: 'used', clave: 'PAP', ref: 'PAP', nombre: 'Primeros auxilios', aviso: null },
      { tipo: 'used', clave: 'FICHA', ref: 'FICHA', nombre: 'Ficha de derivación', aviso: AVISO_HERRAMIENTA_SIN_ENTREGA },
    ]);
    expect(AVISO_HERRAMIENTA_SIN_ENTREGA).toBe('Nadie entrega esta herramienta en el caso: el estudiante no podrá conseguirla.');
  });

  it('sin herramientas del caso no hay herramientas que ofrecer', () => {
    expect(piezasDeSala(caso({ herramientas: undefined }), 'consultorio').herramientas).toEqual([]);
  });

  it('casillasDe: solo lo que la sala ofrece tiene casilla', () => {
    const tiene = casillasDe(piezasDeSala(caso(), 'consultorio'));
    expect(tiene({ tipo: 'talked', clave: 'laura' })).toBe(true);
    expect(tiene({ tipo: 'talked', clave: 'vecina' })).toBe(false);
    expect(tiene({ tipo: 'inspected', clave: 'carpeta' })).toBe(true);
    expect(tiene({ tipo: 'used', clave: 'PAP' })).toBe(true);
    expect(tiene({ tipo: 'used', clave: 'PAP@familia' })).toBe(false);
    expect(tiene({ tipo: 'has', clave: 'PAP' })).toBe(false);
  });
});
