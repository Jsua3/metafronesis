import type { CasoBorrador, ClaseRespuesta, Respuesta } from './caso';
import { FINALES_AUTOMATICOS, finalesDePlantilla, plantillaEditada, reglasDePlantilla, textosDeLaPlantillaGuardada } from './finales';
import { finalesAlcanzados } from './recorridos';

const r = (id: string, destinoId: string | null, clase: ClaseRespuesta, hitos: string[] = []): Respuesta => ({
  id, texto: `Respuesta ${id}`, clase, razon: clase === 'CONTRAINDICATED' ? 'Daña.' : '', retroalimentacion: '', efectos: hitos.length ? { hitos } : {},
  destinoId, marcaIa: false,
});

function caso(opciones: Partial<CasoBorrador> = {}): CasoBorrador {
  const escena = (id: string, respuestas: Respuesta[], esFinal = false) => ({
    id, titulo: `Escena ${id}`, narracion: '', salaId: null, lineas: [], respuestas, esFinal, posicion: { x: 0, y: 0 },
    intensidad: 'MEDIUM' as const, advertencia: null,
  });
  return {
    id: 'c', revision: 1, titulo: 'C', lugarId: null, salas: [], inicioId: 'e0', modoFinales: 'automatico', finales: [],
    escenas: [
      escena('e0', [r('buena', 'e1', 'RECOMMENDED', ['valorar']), r('mala', 'e1', 'CONTRAINDICATED')]),
      escena('e1', [], true),
    ],
    hitos: [
      { clave: 'valorar', nombre: 'Valorar el riesgo', descripcion: '', decisivo: true },
      { clave: 'informar', nombre: 'Informar derechos', descripcion: '', decisivo: false },
    ],
    nivelRiesgo: null, personajes: [], catalogo: { muebles: [], objetos: [], herramientas: [] },
    ...opciones,
  };
}

describe('los cuatro finales de plantilla con texto editable', () => {
  it('sin ediciones son los del modelo, con la condición armada con los hitos decisivos', () => {
    const finales = finalesDePlantilla(caso());
    expect(finales.map((f) => f.id)).toEqual(['critica', 'protectora', 'riesgo_persistente', 'con_brechas']);
    expect(finales[0].texto).toBe(FINALES_AUTOMATICOS.critica.texto);
    expect(JSON.stringify(finales[1].condicion)).toContain('valorar');
    expect(finales[3].condicion).toBeNull();
    expect(plantillaEditada(caso())).toBe(false);
  });

  it('el texto que editó la docente se conserva y la condición sigue a los hitos decisivos', () => {
    const editado = caso({ textosPlantilla: { protectora: { texto: 'Acompañaste bien a la persona.' } } });
    expect(plantillaEditada(editado)).toBe(true);
    expect(finalesDePlantilla(editado)[1].texto).toBe('Acompañaste bien a la persona.');
    expect(finalesDePlantilla(editado)[1].nombre).toBe(FINALES_AUTOMATICOS.protectora.nombre);
    // al marcar otro hito como decisivo cambia la condición, no el texto
    editado.hitos[1].decisivo = true;
    const regenerados = finalesDePlantilla(editado);
    expect(JSON.stringify(regenerados[1].condicion)).toContain('informar');
    expect(regenerados[1].texto).toBe('Acompañaste bien a la persona.');
  });

  it('un texto vacío o igual al del modelo no cuenta como edición', () => {
    expect(plantillaEditada(caso({ textosPlantilla: { critica: { texto: FINALES_AUTOMATICOS.critica.texto } } }))).toBe(false);
    expect(plantillaEditada(caso({ textosPlantilla: { critica: {} } }))).toBe(false);
  });

  it('reconoce los cuatro finales guardados en el servidor y devuelve solo lo que cambió', () => {
    const base = caso();
    const guardados = finalesDePlantilla(caso({ textosPlantilla: { con_brechas: { nombre: 'Con pendientes' } } }));
    expect(textosDeLaPlantillaGuardada(guardados, base.hitos)).toEqual({ con_brechas: { nombre: 'Con pendientes' } });
  });

  it('no los toma por la plantilla si la condición ya no es la que arman los hitos decisivos', () => {
    const base = caso();
    const guardados = finalesDePlantilla(base);
    guardados[2].condicion = { count: 'risky', gte: 7 };
    expect(textosDeLaPlantillaGuardada(guardados, base.hitos)).toBeNull();
    expect(textosDeLaPlantillaGuardada(finalesDePlantilla(base).slice(0, 3), base.hitos)).toBeNull();
    expect(textosDeLaPlantillaGuardada([], base.hitos)).toBeNull();
  });

  it('dice la regla de cada final con los nombres de los hitos decisivos', () => {
    const reglas = reglasDePlantilla(caso().hitos.filter((h) => h.decisivo));
    expect(reglas.protectora).toContain('«Valorar el riesgo»');
    expect(reglas.critica).toContain('contraindicadas');
    expect(reglas.con_brechas).toBe('En cualquier otro caso.');
  });

  it('sin hitos decisivos la regla no habla de ellos', () => {
    const reglas = reglasDePlantilla([]);
    expect(reglas.protectora).not.toContain('decisivo');
    expect(reglas.riesgo_persistente).toBe('Elige 3 o más respuestas con riesgo.');
  });
});

describe('qué final alcanza algún recorrido', () => {
  it('con un hito decisivo, la buena lleva a la protectora y la mala a la crítica', () => {
    const alcanzados = finalesAlcanzados(caso());
    expect(alcanzados).toEqual({ finales: { critica: true, protectora: true, riesgo_persistente: false, con_brechas: false }, omitido: false });
  });

  it('sin hitos decisivos, una sola contraindicada no alcanza para la crítica', () => {
    const c = caso();
    c.hitos.forEach((h) => (h.decisivo = false));
    expect(finalesAlcanzados(c).finales).toEqual({ critica: false, protectora: true, riesgo_persistente: false, con_brechas: true });
  });

  it('con finales propios dice cuáles aparecen en algún recorrido', () => {
    const c = caso({
      modoFinales: 'propio',
      finales: [
        { id: 'a', nombre: 'A', texto: 't', tono: 'neutral', condicion: { milestone: 'valorar' }, marcaIa: false },
        { id: 'b', nombre: 'B', texto: 't', tono: 'neutral', condicion: { milestone: 'informar' }, marcaIa: false },
        { id: 'c', nombre: 'C', texto: 't', tono: 'neutral', condicion: null, marcaIa: false },
      ],
    });
    expect(finalesAlcanzados(c).finales).toEqual({ a: true, b: false, c: true });
  });

  it('si hay demasiados recorridos no afirma nada', () => {
    const escenas = Array.from({ length: 14 }, (_, i) => ({
      id: `e${i}`, titulo: `E${i}`, narracion: '', salaId: null, lineas: [], esFinal: i === 13, posicion: { x: 0, y: 0 },
      intensidad: 'MEDIUM' as const, advertencia: null,
      respuestas: i === 13 ? [] : [r(`a${i}`, `e${i + 1}`, 'RECOMMENDED'), r(`b${i}`, `e${i + 1}`, 'RISKY'), r(`c${i}`, `e${i + 1}`, 'ACCEPTABLE')],
    }));
    const resultado = finalesAlcanzados(caso({ escenas }));
    expect(resultado.omitido).toBe(true);
  });
});
