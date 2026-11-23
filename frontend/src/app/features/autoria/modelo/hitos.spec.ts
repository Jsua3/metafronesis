import type { CasoBorrador, ClaseRespuesta, Respuesta } from './caso';
import { dondeSeCumple, hitosInalcanzables } from './hitos';

const r = (id: string, destinoId: string | null, hitos: string[] = [], clase: ClaseRespuesta = 'RECOMMENDED'): Respuesta => ({
  id, texto: `Respuesta ${id}`, clase, razon: '', retroalimentacion: '', efectos: hitos.length ? { hitos } : {}, destinoId, marcaIa: false,
});

function caso(): CasoBorrador {
  const escena = (id: string, respuestas: Respuesta[], esFinal = false) => ({
    id, titulo: `Escena ${id}`, narracion: '', salaId: null, lineas: [], respuestas, esFinal, posicion: { x: 0, y: 0 },
    intensidad: 'MEDIUM' as const, advertencia: null,
  });
  return {
    id: 'c', revision: 1, titulo: 'C', lugarId: null, salas: [], inicioId: 'e0', modoFinales: 'automatico', finales: [],
    // e0 → e1 (final); e2 no la alcanza nadie y es la única que marca «derivar»
    escenas: [escena('e0', [r('r1', 'e1', ['valorar'])]), escena('e1', [], true), escena('e2', [r('r2', 'e1', ['derivar'])])],
    hitos: [
      { clave: 'valorar', nombre: 'Valorar el riesgo', descripcion: '', decisivo: true },
      { clave: 'derivar', nombre: 'Derivar a salud mental', descripcion: '', decisivo: true },
      { clave: 'informar', nombre: 'Informar derechos', descripcion: '', decisivo: false },
    ],
    nivelRiesgo: null, personajes: [], catalogo: { muebles: [], objetos: [], herramientas: [] },
  };
}

describe('hitos del caso: dónde se cumplen y cuáles no se pueden cumplir', () => {
  it('«dónde se cumple» lista la escena y la respuesta que marcan el hito', () => {
    expect(dondeSeCumple(caso(), 'valorar')).toEqual([{ escenaId: 'e0', escenaTitulo: 'Escena e0', respuestaId: 'r1', respuestaTexto: 'Respuesta r1' }]);
    expect(dondeSeCumple(caso(), 'informar')).toEqual([]);
  });

  it('un hito que ninguna respuesta marca es inalcanzable', () => {
    expect(hitosInalcanzables(caso()).map((h) => h.clave)).toContain('informar');
  });

  it('un hito que solo marca una respuesta de una escena a la que no se llega también es inalcanzable', () => {
    const inalcanzables = hitosInalcanzables(caso()).map((h) => h.clave);
    expect(inalcanzables).toContain('derivar');
    expect(inalcanzables).not.toContain('valorar');
  });

  it('sin escena de inicio ningún hito se puede cumplir (igual que lo dice el servidor)', () => {
    const c = caso();
    c.inicioId = null;
    expect(hitosInalcanzables(c)).toHaveLength(3);
  });
});
