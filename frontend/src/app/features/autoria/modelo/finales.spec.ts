import type { CasoBorrador, ClaseRespuesta, Respuesta } from './caso';
import { esCondicionValida, evaluarCondicion, hitosDeCondicion } from './condiciones';
import { FINALES_AUTOMATICOS, condicionesDePlantilla, contextoDeRecorrido, evaluarFinal, finalesDePlantilla } from './finales';

const r = (clase: ClaseRespuesta, id: string = clase, hitos: string[] = []): Respuesta => ({
  id, texto: id, clase, razon: '', retroalimentacion: '', efectos: hitos.length ? { hitos } : {}, destinoId: null, marcaIa: false,
});

function caso(modo: 'automatico' | 'propio', escenas: Respuesta[][]): CasoBorrador {
  return {
    id: 'c', revision: 1, titulo: 'C', lugarId: null, salas: [], inicioId: 'e0', modoFinales: modo,
    escenas: escenas.map((respuestas, i) => ({
      id: `e${i}`, titulo: `e${i}`, narracion: '', salaId: 's', lineas: [], respuestas, esFinal: false, posicion: { x: 0, y: 0 },
      intensidad: 'MEDIUM', advertencia: null,
    })),
    hitos: [
      { clave: 'valorar', nombre: 'Valorar', descripcion: '', decisivo: true },
      { clave: 'derivar', nombre: 'Derivar', descripcion: '', decisivo: true },
      { clave: 'informar', nombre: 'Informar', descripcion: '', decisivo: false },
    ],
    nivelRiesgo: null,
    finales: [
      { id: 'dos_malas', nombre: 'Demasiadas contraindicadas', texto: 'Muchos errores.', tono: 'critical', condicion: { count: 'contraindicated', gte: 2 }, marcaIa: false },
      { id: 'con_hito', nombre: 'Informó', texto: 'Informó.', tono: 'positive', condicion: { milestone: 'informar' }, marcaIa: false },
    ],
    personajes: [], catalogo: { muebles: [], objetos: [], herramientas: [] },
  };
}

const recorridoDe = (c: CasoBorrador, ...ids: string[]) =>
  ids.map((id) => ({ escenaId: c.escenas.find((e) => e.respuestas.some((x) => x.id === id))!.id, respuestaId: id }));

describe('finales por hitos en modo automático', () => {
  const buenas = [r('RECOMMENDED', 'v', ['valorar']), r('RECOMMENDED', 'd', ['derivar']), r('ACCEPTABLE', 'a')];
  const c = (...r: Respuesta[]) => caso('automatico', [r, []]);

  it('cumplir todos los hitos decisivos, sin contraindicadas y con a lo más una con riesgo → protectora', () => {
    const caso1 = c(...buenas, r('RISKY', 'k'));
    expect(evaluarFinal(caso1, recorridoDe(caso1, 'v', 'd', 'a', 'k')).nombre).toBe(FINALES_AUTOMATICOS.protectora.nombre);
  });

  it('dos contraindicadas → crítica, aunque se hayan cumplido los hitos', () => {
    const caso1 = c(...buenas, r('CONTRAINDICATED', 'x'), r('CONTRAINDICATED', 'y'));
    expect(evaluarFinal(caso1, recorridoDe(caso1, 'v', 'd', 'x', 'y')).nombre).toBe(FINALES_AUTOMATICOS.critica.nombre);
  });

  it('una contraindicada con algún hito decisivo sin cumplir → crítica', () => {
    const caso1 = c(...buenas, r('CONTRAINDICATED', 'x'));
    expect(evaluarFinal(caso1, recorridoDe(caso1, 'v', 'x')).nombre).toBe(FINALES_AUTOMATICOS.critica.nombre);
  });

  it('una contraindicada con todos los hitos decisivos cumplidos no es crítica ni protectora', () => {
    const caso1 = c(...buenas, r('CONTRAINDICATED', 'x'));
    expect(evaluarFinal(caso1, recorridoDe(caso1, 'v', 'd', 'x')).nombre).toBe(FINALES_AUTOMATICOS.con_brechas.nombre);
  });

  it('falta un hito decisivo, sin contraindicadas → el riesgo sigue abierto', () => {
    const caso1 = c(...buenas);
    expect(evaluarFinal(caso1, recorridoDe(caso1, 'v', 'a')).nombre).toBe(FINALES_AUTOMATICOS.riesgo_persistente.nombre);
  });

  it('tres respuestas con riesgo → el riesgo sigue abierto, aunque estén los hitos', () => {
    const caso1 = c(...buenas, r('RISKY', 'k1'), r('RISKY', 'k2'), r('RISKY', 'k3'));
    expect(evaluarFinal(caso1, recorridoDe(caso1, 'v', 'd', 'k1', 'k2', 'k3')).nombre).toBe(FINALES_AUTOMATICOS.riesgo_persistente.nombre);
  });

  it('sin hitos decisivos en el caso: dos contraindicadas siguen siendo críticas y nada falta para la protectora', () => {
    const sinHitos = c(r('ACCEPTABLE', 'a'), r('CONTRAINDICATED', 'x'), r('CONTRAINDICATED', 'y'));
    sinHitos.hitos = [];
    expect(evaluarFinal(sinHitos, recorridoDe(sinHitos, 'a')).nombre).toBe(FINALES_AUTOMATICOS.protectora.nombre);
    expect(evaluarFinal(sinHitos, recorridoDe(sinHitos, 'a', 'x', 'y')).nombre).toBe(FINALES_AUTOMATICOS.critica.nombre);
  });

  it('sin respuestas elegidas, con hitos decisivos por cumplir → el riesgo sigue abierto', () => {
    expect(evaluarFinal(c(...buenas), []).nombre).toBe(FINALES_AUTOMATICOS.riesgo_persistente.nombre);
  });

  it('en modo automático ignora los finales propios', () => {
    const caso1 = caso('automatico', [[r('RECOMMENDED', 'v', ['valorar']), r('CONTRAINDICATED', 'x'), r('CONTRAINDICATED', 'y')], []]);
    const final = evaluarFinal(caso1, recorridoDe(caso1, 'v', 'x', 'y'));
    expect(final.nombre).toBe(FINALES_AUTOMATICOS.critica.nombre);
    expect(final.texto.length).toBeGreaterThan(10);
  });

  it('los cuatro finales de plantilla salen en su orden y el último no tiene condición', () => {
    const finales = finalesDePlantilla(c());
    expect(finales.map((f) => f.id)).toEqual(['critica', 'protectora', 'riesgo_persistente', 'con_brechas']);
    expect(finales.map((f) => f.condicion === null)).toEqual([false, false, false, true]);
    expect(finales.every((f) => f.condicion === null || esCondicionValida(f.condicion))).toBe(true);
  });

  it('las condiciones de plantilla nombran los hitos decisivos y solo esos', () => {
    const condiciones = condicionesDePlantilla(['valorar', 'derivar']);
    expect(hitosDeCondicion(condiciones.protectora)).toEqual(['valorar', 'derivar']);
    expect(hitosDeCondicion(condiciones.critica)).toEqual(['valorar', 'derivar']);
  });
});

describe('finales por hitos en modo propio', () => {
  it('gana el primer final del docente cuya condición se cumple', () => {
    const c = caso('propio', [[r('CONTRAINDICATED', 'x'), r('CONTRAINDICATED', 'y'), r('ACCEPTABLE', 'i', ['informar'])], []]);
    expect(evaluarFinal(c, recorridoDe(c, 'x', 'y', 'i'))).toEqual({ nombre: 'Demasiadas contraindicadas', texto: 'Muchos errores.' });
    expect(evaluarFinal(c, recorridoDe(c, 'i'))).toEqual({ nombre: 'Informó', texto: 'Informó.' });
  });

  it('si ninguno se cumple, cae a los cuatro del modelo', () => {
    const c = caso('propio', [[r('RECOMMENDED', 'a')], []]);
    expect(evaluarFinal(c, recorridoDe(c, 'a')).nombre).toBe(FINALES_AUTOMATICOS.riesgo_persistente.nombre);
  });

  it('un final propio sin condición aplica siempre', () => {
    const c = caso('propio', [[r('RECOMMENDED', 'a')], []]);
    c.finales = [{ id: 'por_defecto', nombre: 'Por defecto', texto: 'Fin.', tono: 'neutral', condicion: null, marcaIa: false }];
    expect(evaluarFinal(c, recorridoDe(c, 'a')).nombre).toBe('Por defecto');
  });
});

describe('condiciones: el mismo vocabulario que el servidor', () => {
  const ctx = (extra: Partial<ReturnType<typeof contextoDeRecorrido>> = {}) => ({
    ...contextoDeRecorrido([r('RISKY'), r('RISKY'), r('RECOMMENDED', 'a', ['valorar'])]), ...extra,
  });

  it('cuenta las clases, mira los hitos y lee la persona', () => {
    expect(evaluarCondicion({ count: 'risky', eq: 2 }, ctx())).toBe(true);
    expect(evaluarCondicion({ count: 'risky', gte: 1, lt: 2 }, ctx())).toBe(false);
    expect(evaluarCondicion({ milestone: 'valorar' }, ctx())).toBe(true);
    expect(evaluarCondicion({ not: { milestone: 'derivar' } }, ctx())).toBe(true);
    expect(evaluarCondicion({ persona: { bond: 'WITHDRAWN' } }, ctx())).toBe(false);
  });

  it('la persona parte de cautelosa y tensa, y se mueve con el paso de cada respuesta', () => {
    expect(contextoDeRecorrido([]).persona).toEqual({ bond: 'GUARDED', activation: 'TENSE' });
    expect(contextoDeRecorrido([r('RECOMMENDED')]).persona).toEqual({ bond: 'OPEN', activation: 'CALM' });
    expect(contextoDeRecorrido([r('CONTRAINDICATED'), r('CONTRAINDICATED'), r('CONTRAINDICATED')]).persona).toEqual({ bond: 'WITHDRAWN', activation: 'CRISIS' });
    const declarado: Respuesta = { ...r('RECOMMENDED'), efectos: { persona: { bond: -1 } } };
    expect(contextoDeRecorrido([declarado]).persona).toEqual({ bond: 'WITHDRAWN', activation: 'TENSE' });
  });

  it('lo desconocido o mal formado nunca se cumple', () => {
    for (const mala of [null, 'x', [], {}, { count: 'otra', gte: 1 }, { milestone: '' }, { all: 'x' }, { eval: '1' }, { persona: {} }, { flag: 'a' }]) {
      expect(esCondicionValida(mala)).toBe(false);
      expect(evaluarCondicion(mala, ctx())).toBe(false);
    }
  });

  it('un «no» de algo mal formado no lo vuelve verdadero', () => {
    expect(evaluarCondicion({ not: { count: 'otra', gte: 1 } }, ctx())).toBe(false);
  });

  it('una lista vacía de «todas» se cumple y una de «alguna» no', () => {
    expect(evaluarCondicion({ all: [] }, ctx())).toBe(true);
    expect(evaluarCondicion({ any: [] }, ctx())).toBe(false);
  });
});
