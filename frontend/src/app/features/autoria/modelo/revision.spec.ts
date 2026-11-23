import { CASO_HOSPITAL } from '../testing/hospital';
import { revisarCaminos } from './caminos';
import type { CasoBorrador, Escena, Respuesta } from './caso';
import type { ValidationIssue } from '../../../core/models/simulation.model';
import { faltasDelServidor, puedeEnviar, respuestasSinForma, sugerencias } from './revision';

const resp = (id: string, destinoId: string | null): Respuesta =>
  ({ id, texto: `Respuesta ${id}`, clase: 'RECOMMENDED', razon: '', efectos: {}, retroalimentacion: 'Bien.', destinoId, marcaIa: false });
const esc = (id: string, respuestas: Respuesta[] = [], esFinal = false): Escena =>
  ({ id, titulo: `Escena ${id}`, narracion: '', salaId: 'consultorio', lineas: [], respuestas, esFinal, posicion: { x: 0, y: 0 }, intensidad: 'MEDIUM', advertencia: null });

function completo(): CasoBorrador {
  return {
    id: 'c', revision: 0, hitos: [], nivelRiesgo: null, titulo: 'Caso', lugarId: 'universidad', salas: [], inicioId: 'a', modoFinales: 'automatico', finales: [],
    escenas: [esc('a', [resp('1', 'b'), resp('2', 'c')]), esc('b', [], true), esc('c', [], true)],
    personajes: [], catalogo: { muebles: [], objetos: [], herramientas: [] },
  };
}

describe('puedeEnviar', () => {
  it('un caso completo puede enviarse', () => {
    expect(puedeEnviar(completo())).toEqual({ ok: true, faltas: [] });
  });

  it('una línea con marcaIa bloquea el envío', () => {
    const caso = completo();
    caso.escenas[0].lineas = [{ id: 'l1', personajeId: 'p', texto: 'Hola', expresion: 'neutral', marcaIa: true }];
    const r = puedeEnviar(caso);
    expect(r.ok).toBe(false);
    expect(r.faltas).toEqual([{ mensaje: '1 parte generada por IA sin revisar.', ir: { ruta: '/editor/escena/a', accionId: 'aceptar-ia' } }]);
  });

  it('varias partes de IA se cuentan juntas, incluidos finales y escenas', () => {
    const caso = completo();
    caso.escenas[0].respuestas[0].marcaIa = true;
    caso.escenas[1].marcaIa = true;
    caso.finales = [{ id: 'f', nombre: 'F', texto: 'T', tono: 'neutral', condicion: { count: 'contraindicated', gte: 1 }, marcaIa: true }];
    expect(puedeEnviar(caso).faltas.map((f) => f.mensaje)).toEqual(['3 partes generadas por IA sin revisar.']);
  });

  it('A7 · una persona o un mueble que la IA puso o movió sin aceptar bloquea el envío y lleva a su sala', () => {
    const caso = completo();
    caso.salas = [{
      id: 'consultorio', nombre: 'Consultorio', descripcion: '', encuadre: 'tres-paredes', fondo: '', entrada: { x: 0, y: 0 }, puertas: [], origen: null, estructura: null, choques: {},
      muebles: [{ ref: 'silla', x: 1, y: 1, marcaIa: true }], objetos: [], personajes: [{ ref: 'camila', x: 2, y: 2, mirando: 'izquierda', expresion: 'neutral', marcaIa: true }],
    }];
    caso.escenas[0].marcaIa = true;
    const r = puedeEnviar(caso);
    expect(r.ok).toBe(false);
    expect(r.faltas.map((f) => f.mensaje)).toEqual(['3 partes generadas por IA sin revisar.']);
    caso.escenas[0].marcaIa = false;
    expect(puedeEnviar(caso).faltas[0].ir).toEqual({ ruta: '/editor/sala/consultorio', accionId: 'aceptar-ia' });
  });

  it('cada aviso de camino bloquea el envío con su mensaje', () => {
    const casos: CasoBorrador[] = [];
    const sinSalida = completo(); sinSalida.escenas[1].esFinal = false; casos.push(sinSalida);
    const inalcanzable = completo(); inalcanzable.escenas.push(esc('d', [], true)); casos.push(inalcanzable);
    const sinDestino = completo(); sinDestino.escenas[0].respuestas.push(resp('3', null)); casos.push(sinDestino);
    const sinInicio = completo(); sinInicio.inicioId = null; casos.push(sinInicio);
    const sinFinal = completo(); sinFinal.escenas[1].esFinal = false; sinFinal.escenas[2].esFinal = false;
    sinFinal.escenas[1].respuestas = [resp('4', 'a')]; sinFinal.escenas[2].respuestas = [resp('5', 'a')]; casos.push(sinFinal);
    const tipos = new Set<string>();
    for (const caso of casos) {
      const r = puedeEnviar(caso);
      expect(r.ok).toBe(false);
      for (const aviso of revisarCaminos(caso)) {
        tipos.add(aviso.tipo);
        expect(r.faltas.map((f) => f.mensaje)).toContain(aviso.mensaje);
      }
    }
    expect([...tipos].sort()).toEqual(['inalcanzable', 'respuesta-sin-destino', 'sin-final', 'sin-inicio', 'sin-salida']);
  });

  it('un final que espera un hito que ya no existe lleva a la pantalla de finales', () => {
    const caso = completo();
    caso.modoFinales = 'propio';
    caso.finales = [{ id: 'f1', nombre: 'Cierre', texto: 'Fin', tono: 'neutral', condicion: { milestone: 'borrado' }, marcaIa: false }];
    expect(puedeEnviar(caso).faltas).toEqual([
      { mensaje: 'El final «Cierre» espera un paso del caso que ya no existe.', ir: { ruta: '/editor/finales', accionId: 'definir-finales' } },
    ]);
  });

  it('las respuestas sin clasificar bloquean el envío y llevan a la escena', () => {
    const caso = completo();
    caso.escenas[0].respuestas[1].clase = null;
    const r = puedeEnviar(caso);
    expect(r.ok).toBe(false);
    expect(r.faltas).toEqual([{ mensaje: 'Hay 1 respuesta sin clasificar.', ir: { ruta: '/editor/escena/a' } }]);
    caso.escenas[0].respuestas[0].clase = null;
    expect(puedeEnviar(caso).faltas[0].mensaje).toBe('Hay 2 respuestas sin clasificar.');
  });

  describe('una escena con respuestas en una sala sin nadie con quien hablar', () => {
    const sala = (personajes: number) => ({
      id: 'consultorio', nombre: 'Consultorio', descripcion: '', encuadre: 'tres-paredes' as const, fondo: '', entrada: { x: 480, y: 440 },
      muebles: [], objetos: [], puertas: [], origen: null, estructura: null, choques: {},
      personajes: Array.from({ length: personajes }, (_, i) => ({ ref: `p${i}`, x: 300, y: 300, mirando: 'derecha' as const, expresion: 'neutral' as const })),
    });

    it('es una falta que bloquea y lleva al catálogo de la sala para agregar a alguien', () => {
      const caso = completo();
      caso.salas = [sala(0)];
      const r = puedeEnviar(caso);
      expect(r.ok).toBe(false);
      expect(r.faltas).toEqual([{
        mensaje: 'La escena «Escena a» tiene respuestas pero en su sala no hay nadie con quien hablar. Agrega una persona.',
        ir: { ruta: '/editor/sala/consultorio', ancla: 'catalogo' },
      }]);
    });

    /** Un objeto de la sala que ofrece la respuesta con ese número (la forma en que el servidor acepta ofrecerla sin una persona). */
    const objetoQueOfrece = (opcion: number) => ({ ref: `opcion-${opcion}`, x: 300, y: 300, clave: `opcion-${opcion}`, decisionOptionId: opcion });

    it('si un objeto de la sala ofrece las respuestas, no hace falta ninguna persona', () => {
      const caso = completo();
      caso.salas = [{ ...sala(0), objetos: [objetoQueOfrece(1), objetoQueOfrece(2)] }];
      expect(puedeEnviar(caso)).toEqual({ ok: true, faltas: [] });
    });

    it('si un objeto ofrece solo algunas, las que no se ofrecen siguen faltando', () => {
      const caso = completo();
      caso.salas = [{ ...sala(0), objetos: [objetoQueOfrece(1)] }];
      expect(puedeEnviar(caso).faltas.map((f) => f.mensaje)).toEqual([
        'La escena «Escena a» tiene respuestas pero en su sala no hay nadie con quien hablar. Agrega una persona.',
      ]);
    });

    it('un objeto que ofrece la respuesta de OTRA escena no cuenta', () => {
      const caso = completo();
      caso.salas = [{ ...sala(0), objetos: [objetoQueOfrece(99)] }];
      expect(puedeEnviar(caso).ok).toBe(false);
    });

    it('un mueble que ofrece la respuesta también cuenta', () => {
      const caso = completo();
      caso.salas = [{ ...sala(0), muebles: [objetoQueOfrece(1), objetoQueOfrece(2)] }];
      expect(puedeEnviar(caso).ok).toBe(true);
    });

    it('respuestasSinForma dice cuáles respuestas no se pueden ofrecer', () => {
      const caso = completo();
      caso.salas = [{ ...sala(0), objetos: [objetoQueOfrece(2)] }];
      expect(respuestasSinForma(caso.escenas[0], caso.salas[0]).map((r) => r.id)).toEqual(['1']);
      expect(respuestasSinForma(caso.escenas[0], { ...caso.salas[0], personajes: sala(1).personajes })).toEqual([]);
      // una respuesta recién escrita (aún sin número del servidor) solo la ofrece una persona
      const nueva = { ...resp('respuesta-ab12', 'b') };
      expect(respuestasSinForma({ ...caso.escenas[0], respuestas: [nueva] }, caso.salas[0])).toEqual([nueva]);
    });

    it('una escena con solo líneas y sin persona no bloquea: es una sugerencia', () => {
      const caso = completo();
      caso.salas = [sala(0)];
      caso.escenas[0].respuestas = [];
      caso.escenas[0].esFinal = true;
      caso.escenas[0].lineas = [{ id: 'l1', personajeId: 'x', texto: 'Hola.', expresion: 'neutral', marcaIa: false }];
      caso.escenas[1].esFinal = false;
      expect(puedeEnviar(caso).faltas.map((f) => f.mensaje)).not.toContain(expect.stringContaining('nadie'));
      expect(sugerencias({ ...caso, probadoHastaElFinal: true }).map((f) => [f.mensaje, f.ir.ruta])).toContainEqual([
        'La escena «Escena a» tiene diálogo pero en su sala no hay nadie que lo diga. Agrega una persona.', '/editor/sala/consultorio',
      ]);
    });

    it('con una persona en la sala no hay sugerencia de agregar a nadie', () => {
      const caso = completo();
      caso.salas = [sala(1)];
      caso.escenas[0].lineas = [{ id: 'l1', personajeId: 'x', texto: 'Hola.', expresion: 'neutral', marcaIa: false }];
      expect(sugerencias({ ...caso, probadoHastaElFinal: true }).map((f) => f.mensaje).join(' ')).not.toContain('nadie que lo diga');
    });

    it('con una persona en la sala no falta nada', () => {
      const caso = completo();
      caso.salas = [sala(1)];
      expect(puedeEnviar(caso)).toEqual({ ok: true, faltas: [] });
    });

    it('una escena sin líneas ni respuestas (un final) no necesita a nadie', () => {
      const caso = completo();
      caso.salas = [sala(0)];
      caso.escenas = [esc('b', [], true)];
      caso.inicioId = 'b';
      expect(puedeEnviar(caso).faltas.map((f) => f.mensaje)).not.toContain(expect.stringContaining('nadie con quien hablar'));
    });

    it('una falta por escena, con el título de cada una', () => {
      const caso = completo();
      caso.salas = [sala(0)];
      caso.escenas.push(esc('d', [resp('9', 'b')]));
      const mensajes = puedeEnviar(caso).faltas.map((f) => f.mensaje).filter((m) => m.includes('nadie con quien hablar'));
      expect(mensajes).toEqual([
        'La escena «Escena a» tiene respuestas pero en su sala no hay nadie con quien hablar. Agrega una persona.',
        'La escena «Escena d» tiene respuestas pero en su sala no hay nadie con quien hablar. Agrega una persona.',
      ]);
    });
  });
});

describe('faltasDelServidor: las faltas de requisitos, reacciones y comentarios (OCL-09 a OCL-12) llevan a lo concreto', () => {
  const issue = (code: string, path: string): ValidationIssue => ({ code, severity: 'error', message: `Mensaje del servidor para ${code}.`, nodeId: 7, path });
  /** La escena 7 (la 2.ª del documento): tiene respuestas guardadas (números del servidor), una sin guardar en medio y comentarios. */
  const casoCon = (respuestas: Respuesta[]): CasoBorrador => {
    const caso = completo();
    caso.escenas.push({ ...esc('7', respuestas), comentarios: [] });
    return caso;
  };
  const llevar = (caso: CasoBorrador, code: string, path: string, extra: { respuestasGuardadas?: (escenaId: string) => string[] } = {}) =>
    faltasDelServidor([issue(code, path)], caso, { respuestaDeOpcion: () => undefined, faltasLocales: [], ...extra })[0];

  it.each([
    ['DSL.OCL-09', 'x-siep.escenas[1].opciones', 'respuestas-escena'],
    ['DSL.OCL-10', 'x-siep.escenas[1].opciones[1].requiere', 'aparece-si-31'],
    ['DSL.OCL-10', 'x-siep.escenas[1].opciones[0].requiere.all[0]', 'aparece-si-12'],
    ['DSL.OCL-11', 'x-siep.escenas[1].opciones[0].reaccion.emocion', 'reaccion-12'],
    ['DSL.OCL-11', 'x-siep.escenas[1].opciones[1].reaccion', 'reaccion-31'],
    ['DSL.OCL-12', 'x-siep.escenas[1].opciones[0].reaccion.personaje', 'reaccion-12'], // el servidor emite OCL-12 también para reacciones
    ['DSL.OCL-12', 'x-siep.escenas[1].opciones[1].reaccion', 'reaccion-31'],
    ['DSL.OCL-10', 'x-siep.escenas[1].comentarios[1].cuando', 'comentario-1'], // y OCL-10/11 también para comentarios
    ['DSL.OCL-11', 'x-siep.escenas[1].comentarios[0].emocion', 'comentario-0'],
    ['DSL.OCL-12', 'x-siep.escenas[1].comentarios[2].personaje', 'comentario-2'],
    ['DSL.OCL-12', 'x-siep.escenas[1].comentarios[0]', 'comentario-0'],
  ])('%s (%s) lleva a la escena con el ancla %s y con el mensaje del servidor', (code, path, ancla) => {
    // las dos guardadas llegan en desorden: la j-ésima es por su número de servidor (12 antes que 31)
    const caso = casoCon([resp('31', 'b'), resp('12', 'b')]);
    const falta = llevar(caso, code, path);
    expect(falta).toEqual({ codigo: code, mensaje: `Mensaje del servidor para ${code}.`, ir: { ruta: '/editor/escena/7', ancla } });
  });

  it('con una respuesta sin guardar en la escena, el índice cuenta solo las guardadas', () => {
    const caso = casoCon([resp('31', 'b'), resp('nueva-abc', 'b'), resp('12', 'b')]);
    expect(llevar(caso, 'DSL.OCL-10', 'x-siep.escenas[1].opciones[1].requiere').ir.ancla).toBe('aparece-si-31'); // no 'nueva-abc'
    expect(llevar(caso, 'DSL.OCL-11', 'x-siep.escenas[1].opciones[0].reaccion.linea').ir.ancla).toBe('reaccion-12');
  });

  it('si no se halla la respuesta, el ancla es la lista de respuestas', () => {
    const caso = casoCon([resp('12', 'b'), resp('nueva-abc', 'b')]);
    expect(llevar(caso, 'DSL.OCL-10', 'x-siep.escenas[1].opciones[1].requiere').ir.ancla).toBe('respuestas-escena');
    expect(llevar(caso, 'DSL.OCL-11', 'x-siep.escenas[1].opciones[5].reaccion').ir.ancla).toBe('respuestas-escena');
    expect(llevar(caso, 'DSL.OCL-10', 'sin-ruta-conocida').ir.ancla).toBe('respuestas-escena');
  });

  it('si quien llama sabe cuáles respuestas ya están en el servidor (incluidas las creadas en esta visita), usa ese orden', () => {
    const caso = casoCon([resp('ab-local', 'b'), resp('12', 'b')]);
    const respuestasGuardadas = (escenaId: string) => (escenaId === '7' ? ['12', 'ab-local'] : []);
    expect(llevar(caso, 'DSL.OCL-10', 'x-siep.escenas[1].opciones[1].requiere', { respuestasGuardadas }).ir.ancla).toBe('aparece-si-ab-local');
  });

  it('un comentario sin posición en la ruta lleva al título de la sección y sin escena va al mapa', () => {
    const caso = casoCon([resp('12', 'b')]);
    expect(llevar(caso, 'DSL.OCL-12', 'x-siep.escenas[1].comentarios').ir).toEqual({ ruta: '/editor/escena/7', ancla: 'comentarios-titulo' });
    const sinEscena = faltasDelServidor([{ code: 'DSL.OCL-12', severity: 'error', message: 'X.', path: 'x-siep.escenas[1].comentarios[0]' }], caso, { respuestaDeOpcion: () => undefined, faltasLocales: [] })[0];
    expect(sinEscena.ir).toEqual({ ruta: '/editor' });
  });
});


describe('faltas del servidor de salas por piezas', () => {
  const caso = () => {
    const borrador = structuredClone(CASO_HOSPITAL);
    borrador.escenas[0].id = '7';
    return borrador;
  };
  const llevar = (borrador: CasoBorrador, code: string, path: string, nodeId = 7) =>
    faltasDelServidor([{ code, severity: 'error', message: 'Mensaje íntegro del servidor.', nodeId, path }], borrador,
      { respuestaDeOpcion: () => undefined, faltasLocales: [] })[0];

  it('OCL-14 lleva a la sala y a la pieza', () => {
    const borrador = caso();
    const salaId = borrador.escenas[0].salaId!;
    expect(llevar(borrador, 'DSL.OCL-14', 'x-siep.escenas[9].mapa.estructura.piezas[0].x')).toEqual({
      codigo: 'DSL.OCL-14', mensaje: 'Mensaje íntegro del servidor.',
      ir: { ruta: `/editor/sala/${salaId}`, ancla: `pieza-${salaId}-v1` },
    });
  });

  it('OCL-15 de una puerta lleva a su botón', () => {
    const borrador = caso();
    const salaId = borrador.escenas[0].salaId!;
    // El índice de objetos del servidor no identifica de forma segura el botón del editor.
    expect(llevar(borrador, 'DSL.OCL-15', 'x-siep.escenas[9].mapa.objetos[0].metadatos').ir)
      .toEqual({ ruta: `/editor/sala/${salaId}` });
  });

  it('OCL-18 sin catálogo lleva a la sala sin ancla', () => {
    const borrador = caso();
    expect(llevar(borrador, 'DSL.OCL-18', 'x-siep.escenas[9].mapa').ir)
      .toEqual({ ruta: `/editor/sala/${borrador.escenas[0].salaId}` });
  });

  it('una pieza inexistente o una escena desconocida conserva el destino predeterminado', () => {
    const borrador = caso();
    expect(llevar(borrador, 'DSL.OCL-13', 'x-siep.escenas[9].mapa.estructura.piezas[999]').ir)
      .toEqual({ ruta: '/editor/escena/7' });
    expect(llevar(borrador, 'DSL.OCL-16', 'x-siep.escenas[0].mapa.aparicion', 999).ir)
      .toEqual({ ruta: '/editor/escena/999' });
  });
});

describe('faltas del servidor del trayecto de una persona (OCL-19)', () => {
  const MENSAJE = 'El camino recto hasta este punto atraviesa un mueble, una pared u otra persona: la persona camina en línea recta entre sus puntos; agrega un punto intermedio para rodearlo.';
  const llevar = (borrador: CasoBorrador, message: string, nodeId = 7) =>
    faltasDelServidor([{ code: 'DSL.OCL-19', severity: 'error', message, nodeId, path: 'x-siep.escenas[4].mapa.objetos[11].metadatos.movimiento.puntos[0]' }],
      borrador, { respuestaDeOpcion: () => undefined, faltasLocales: [] })[0];
  const conTrayecto = (puntos: { x: number; y: number }[]) => {
    const borrador = structuredClone(CASO_HOSPITAL);
    borrador.escenas[0].id = '7';
    const sala = borrador.salas.find(s => s.id === borrador.escenas[0].salaId)!;
    // Una persona quieta primero: el índice del servidor (objetos[11]) no coincide con el del editor.
    sala.personajes = [
      { ref: 'quieta', clave: 'quieta', x: 300, y: 300, mirando: 'derecha', expresion: 'neutral', movimiento: 'quieto' },
      { ref: 'caminante', clave: 'caminante', x: 500, y: 300, mirando: 'derecha', expresion: 'neutral',
        movimiento: { tipo: 'ruta', modo: 'ida-y-vuelta', puntos } },
    ];
    return { borrador, salaId: sala.id, clave: 'caminante' };
  };

  it('lleva a la sala y a la persona del trayecto aunque el servidor numere los objetos de otra forma', () => {
    const { borrador, salaId, clave } = conTrayecto([{ x: 10, y: 10 }, { x: 20, y: 20 }]);
    expect(llevar(borrador, MENSAJE).ir).toEqual({ ruta: `/editor/sala/${salaId}`, ancla: `objeto-${salaId}-${clave}` });
  });

  it('con dos personas que tienen la misma falta no adivina: lleva a la sala sin ancla', () => {
    const { borrador, salaId } = conTrayecto([{ x: 10, y: 10 }, { x: 20, y: 20 }]);
    const sala = borrador.salas.find(s => s.id === salaId)!;
    sala.personajes[0] = { ...sala.personajes[0], movimiento: { tipo: 'ruta', modo: 'ida-y-vuelta', puntos: [{ x: 10, y: 10 }, { x: 20, y: 20 }] } };
    expect(llevar(borrador, MENSAJE).ir).toEqual({ ruta: `/editor/sala/${salaId}` });
  });

  it('una escena desconocida conserva el destino predeterminado', () => {
    const { borrador } = conTrayecto([{ x: 10, y: 10 }, { x: 20, y: 20 }]);
    expect(llevar(borrador, MENSAJE, 999).ir).toEqual({ ruta: '/editor/escena/999' });
  });
});
