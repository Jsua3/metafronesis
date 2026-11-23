import type { ValidationIssue } from '../../../core/models/simulation.model';
import type { CasoBorrador, Escena, Respuesta } from './caso';
import { faltasDelServidor, puedeEnviar, sugerencias } from './revision';

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

describe('puedeEnviar con las reglas del modelo de métricas', () => {
  const faltasDe = (caso: CasoBorrador) => puedeEnviar(caso).faltas;

  it('una escena con respuestas y ninguna recomendada bloquea y lleva a la escena', () => {
    const caso = completo();
    caso.escenas[0].respuestas.forEach((r) => (r.clase = 'ACCEPTABLE'));
    expect(faltasDe(caso)).toEqual([{
      codigo: 'scene-without-recommended',
      mensaje: 'La escena «Escena a» no tiene ninguna respuesta recomendada: marca al menos una como «Recomendada».',
      ir: { ruta: '/editor/escena/a', ancla: 'respuestas-escena' },
    }]);
  });

  it('con respuestas sin clasificar no se pide además la recomendada: primero se clasifica', () => {
    const caso = completo();
    caso.escenas[0].respuestas.forEach((r) => (r.clase = null));
    expect(faltasDe(caso).map((f) => f.codigo)).toEqual([undefined]);
  });

  it('una contraindicada sin razón bloquea y lleva a esa respuesta', () => {
    const caso = completo();
    caso.escenas[0].respuestas[1].clase = 'CONTRAINDICATED';
    expect(faltasDe(caso)).toEqual([{
      codigo: 'contraindicated-without-reason',
      mensaje: 'La respuesta «Respuesta 2» de la escena «Escena a» es contraindicada y no explica por qué: escribe el motivo de la prohibición.',
      ir: { ruta: '/editor/escena/a', ancla: 'respuesta-2' },
    }]);
    caso.escenas[0].respuestas[1].razon = 'Puede hacer daño.';
    expect(faltasDe(caso)).toEqual([]);
  });

  it('un hito que ninguna respuesta cumple bloquea y lleva al panel de hitos', () => {
    const caso = completo();
    caso.hitos = [{ clave: 'valorar', nombre: 'Valorar el riesgo', descripcion: '', decisivo: true }];
    expect(faltasDe(caso)).toEqual([{
      codigo: 'milestone-unreachable',
      mensaje: 'El hito «Valorar el riesgo» no se puede cumplir: ninguna respuesta de las escenas a las que se llega desde el inicio lo marca.',
      ir: { ruta: '/editor/evaluacion', ancla: 'hito-valorar' },
    }]);
    caso.escenas[0].respuestas[0].efectos = { hitos: ['valorar'] };
    expect(faltasDe(caso)).toEqual([]);
  });

  it('una escena de intensidad alta sin aviso bloquea y lleva al aviso de esa escena', () => {
    const caso = completo();
    caso.escenas[0].intensidad = 'HIGH';
    expect(faltasDe(caso)).toEqual([{
      codigo: 'high-intensity-without-warning',
      mensaje: 'La escena «Escena a» es de intensidad alta y no tiene aviso para el estudiante: escríbelo antes de enviar.',
      ir: { ruta: '/editor/escena/a', ancla: 'aviso-escena' },
    }]);
    caso.escenas[0].advertencia = 'Esta escena trata de violencia.';
    expect(faltasDe(caso)).toEqual([]);
  });

  it('una competencia del caso que ninguna respuesta evidencia solo avisa: no bloquea el envío', () => {
    const caso = completo();
    caso.competencias = [{ codigo: 'ETICA', nombre: 'Ética profesional' }, { codigo: 'ESCUCHA', nombre: 'Escucha activa' }];
    caso.escenas[0].respuestas[0].efectos = { competencias: ['ETICA'] };
    expect(puedeEnviar(caso)).toEqual({ ok: true, faltas: [] }); // la autoridad es la compuerta del servidor
    expect(sugerencias({ ...caso, probadoHastaElFinal: true })).toEqual([{
      codigo: 'competency-without-evidence',
      mensaje: 'La competencia «Escucha activa» de la rúbrica parece no tener evidencia: ninguna respuesta la marca. La compuerta de Psicología lo confirma al enviar.',
      ir: { ruta: '/editor/escena/a', ancla: 'competencias-1' },
    }]);
  });

  it('mientras nadie declare competencias no hay aviso', () => {
    const caso = completo();
    caso.competencias = [{ codigo: 'ETICA', nombre: 'Ética profesional' }];
    expect(sugerencias({ ...caso, probadoHastaElFinal: true })).toEqual([]);
  });

  it('si la compuerta sí bloquea por una competencia, su falta se lista aunque el editor solo avisara', () => {
    const caso = completo();
    caso.competencias = [{ codigo: 'ETICA', nombre: 'Ética profesional' }];
    caso.escenas[0].respuestas[0].efectos = { competencias: ['OTRA'] };
    const faltas = faltasDelServidor(
      [{ code: 'competency-without-evidence', severity: 'error', message: 'La competencia «Ética» no tiene evidencia.', competencyCode: 'ETICA' }],
      caso, { respuestaDeOpcion: () => undefined, faltasLocales: puedeEnviar(caso).faltas },
    );
    expect(faltas).toEqual([{ codigo: 'competency-without-evidence', mensaje: 'La competencia «Ética» no tiene evidencia.', ir: { ruta: '/editor/escena/a', ancla: 'competencias-1' } }]);
  });

  it('un final propio que ningún recorrido cumple bloquea y lleva a ese final', () => {
    const caso = completo();
    caso.modoFinales = 'propio';
    caso.finales = [
      { id: 'inalcanzable', nombre: 'Nunca', texto: 'T', tono: 'neutral', condicion: { milestone: 'no_existe' }, marcaIa: false },
      { id: 'resto', nombre: 'Resto', texto: 'T', tono: 'neutral', condicion: null, marcaIa: false },
    ];
    caso.hitos = [{ clave: 'no_existe', nombre: 'Hito', descripcion: '', decisivo: false }];
    const faltas = faltasDe(caso).filter((f) => f.codigo === 'ending-unreachable');
    expect(faltas).toEqual([{
      codigo: 'ending-unreachable',
      mensaje: 'El final «Nunca» no se puede alcanzar: ningún recorrido completo cumple su condición.',
      ir: { ruta: '/editor/finales', ancla: 'final-inalcanzable' },
    }]);
  });

  it('finales propios sin uno que valga para todos los recorridos piden uno sin condición', () => {
    const caso = completo();
    caso.modoFinales = 'propio';
    caso.finales = [{ id: 'a', nombre: 'A', texto: 'T', tono: 'neutral', condicion: { count: 'recommended', gte: 1 }, marcaIa: false }];
    caso.escenas[0].respuestas[1].clase = 'ACCEPTABLE'; // un recorrido no cumple ningún final
    expect(faltasDe(caso).map((f) => f.codigo)).toEqual(['ending-without-default']);
  });
});

describe('faltasDelServidor: lo que dice la compuerta, en lenguaje del docente y con «Llévame ahí»', () => {
  const issue = (cambios: Partial<ValidationIssue> & { code: string }): ValidationIssue =>
    ({ severity: 'error', message: 'Mensaje del servidor.', ...cambios }) as ValidationIssue;
  const opciones = (caso: CasoBorrador, sinLocales = false) => ({
    respuestaDeOpcion: (clave: string) => (clave === 'opcion-1' ? '1' : undefined),
    faltasLocales: sinLocales ? [] : puedeEnviar(caso).faltas,
  });

  it('cada una de las reglas del modelo lleva a la escena, la respuesta, el hito o el final concretos', () => {
    const caso = completo();
    const faltas = faltasDelServidor([
      issue({ code: 'scene-without-recommended', sceneKey: 'a', nodeId: 1, message: 'La escena «A» no tiene recomendada.' }),
      issue({ code: 'contraindicated-without-reason', sceneKey: 'a', nodeId: 1, optionKey: 'opcion-1', message: 'La respuesta «x» no explica.' }),
      issue({ code: 'milestone-unreachable', milestoneKey: 'valorar', message: 'El hito «Valorar» no se puede cumplir.' }),
      issue({ code: 'ending-unreachable', endingKey: 'protectora', message: 'El final «P» no se alcanza.' }),
      issue({ code: 'competency-without-evidence', competencyCode: 'ETICA', message: 'La competencia «Ética» no tiene evidencia.' }),
      issue({ code: 'high-intensity-without-warning', sceneKey: 'a', nodeId: 1, message: 'La escena «A» es alta sin aviso.' }),
    ], caso, opciones(caso));
    expect(faltas.map((f) => f.mensaje)).toEqual([
      'La escena «A» no tiene recomendada.', 'La respuesta «x» no explica.', 'El hito «Valorar» no se puede cumplir.',
      'El final «P» no se alcanza.', 'La competencia «Ética» no tiene evidencia.', 'La escena «A» es alta sin aviso.',
    ]);
    expect(faltas.map((f) => f.ir)).toEqual([
      { ruta: '/editor/escena/1', ancla: 'respuestas-escena' },
      { ruta: '/editor/escena/1', ancla: 'respuesta-1' },
      { ruta: '/editor/evaluacion', ancla: 'hito-valorar' },
      { ruta: '/editor/finales', ancla: 'final-protectora' },
      { ruta: '/editor/escena/a', ancla: 'competencias-1' },
      { ruta: '/editor/escena/1', ancla: 'aviso-escena' },
    ]);
    expect(faltas.every((f) => f.codigo && f.ir.ruta)).toBe(true);
  });

  it('la falta de recursos de apoyo lleva al campo del guion de la primera escena', () => {
    const caso = completo();
    const [falta] = faltasDelServidor([
      issue({ code: 'ETHICS.NO_SUPPORT_RESOURCES', message: 'La casilla «protocolos de seguridad» está marcada, pero ninguna escena tiene recursos de apoyo.' }),
    ], caso, opciones(caso));
    expect(falta.ir).toEqual({ ruta: '/editor/escena/a', ancla: 'recursos-escena' });
    expect(falta.mensaje).toContain('recursos de apoyo');
  });

  it('el final sin condición para el resto se lista; el aviso de demasiados recorridos no bloquea', () => {
    const caso = completo();
    const faltas = faltasDelServidor([
      issue({ code: 'ending-without-default', message: 'Ningún final aplica a todos.' }),
      issue({ code: 'ending-reachability-skipped', severity: 'warning', message: 'Demasiados recorridos.' }),
    ], caso, opciones(caso));
    expect(faltas.map((f) => f.mensaje)).toEqual(['Ningún final aplica a todos.']);
    expect(faltas[0].ir).toEqual({ ruta: '/editor/finales', accionId: 'definir-finales' });
  });

  it('un hallazgo que el editor ya listó por su cuenta no se repite', () => {
    const caso = completo();
    caso.escenas[0].respuestas.forEach((r) => (r.clase = 'ACCEPTABLE'));
    const locales = puedeEnviar(caso).faltas;
    expect(locales.map((f) => f.codigo)).toEqual(['scene-without-recommended']);
    const faltas = faltasDelServidor(
      [issue({ code: 'scene-without-recommended', sceneKey: 'a', nodeId: 1, message: 'Lo mismo.' })],
      caso, { respuestaDeOpcion: () => undefined, faltasLocales: locales },
    );
    expect(faltas).toEqual([]);
  });

  it('un error del mundo se lista con su mensaje y lleva a la escena si el servidor la nombra', () => {
    const caso = completo();
    const faltas = faltasDelServidor([
      issue({ code: 'WORLD.NO_SAFE_EXIT', message: 'El caso necesita una salida segura.' }),
      issue({ code: 'WORLD.NODE_WITHOUT_MAP', nodeId: 2, message: 'La escena «B» no tiene mapa.' }),
    ], caso, opciones(caso));
    expect(faltas.map((f) => f.ir)).toEqual([{ ruta: '/editor' }, { ruta: '/editor/escena/2' }]);
  });

  it('lo que el editor ya cubre con sus propios avisos de caminos no se repite', () => {
    const inalcanzable = completo();
    inalcanzable.escenas.push(esc('d', [], true));
    const sinInicio = completo();
    sinInicio.inicioId = null;
    const delServidor = [
      issue({ code: 'WORLD.UNREACHABLE_NODE', nodeId: 4, message: 'No hay camino hasta «D».' }),
      issue({ code: 'WORLD.NO_START_NODE', message: 'Marca una de inicio.' }),
    ];
    expect(faltasDelServidor(delServidor, inalcanzable, opciones(inalcanzable)).map((f) => f.mensaje)).toEqual(['Marca una de inicio.']);
    expect(faltasDelServidor(delServidor, sinInicio, opciones(sinInicio)).map((f) => f.mensaje)).toEqual(['No hay camino hasta «D».']);
  });

  it('la lista de verificación ética y las partes de IA sin revisar tienen su propia salida', () => {
    const caso = completo();
    const faltas = faltasDelServidor([
      issue({ code: 'CHECKLIST_INCOMPLETE', message: 'El checklist ético y académico debe estar al 100% antes de enviar el caso a revisión.' }),
      issue({ code: 'AI_SUGGESTED_UNREVIEWED', message: '2 parte(s) sugeridas por la IA sin revisar.' }),
    ], caso, opciones(caso));
    expect(faltas.map((f) => f.codigo)).toEqual(['CHECKLIST_INCOMPLETE', 'AI_SUGGESTED_UNREVIEWED']);
    expect(faltas[0].ir).toEqual({ ruta: '/revision', ancla: 'lista-verificacion' }); // la lista se completa en esta misma pantalla
    expect(faltas[1].ir).toEqual({ ruta: '/editor', accionId: 'aceptar-ia' });
  });

  it('con la lista de verificación en el borrador, un ítem obligatorio sin marcar bloquea y lleva a la lista', () => {
    const caso = completo();
    const item = (codigo: string, obligatorio: boolean, cumplido: boolean) =>
      ({ codigo, texto: codigo, obligatorio, cumplido, enBorrador: false, respaldo: null, respaldado: null });
    caso.lista = { items: [item('a', true, true), item('b', true, false), item('c', false, false)], constanciaRegistrada: false };
    expect(puedeEnviar(caso).faltas).toEqual([{
      codigo: 'CHECKLIST_INCOMPLETE',
      mensaje: 'Falta completar la lista de verificación: marca todos los ítems obligatorios.',
      ir: { ruta: '/revision', ancla: 'lista-verificacion' },
    }]);
    caso.lista.items[1].cumplido = true; // el opcional no hace falta
    expect(puedeEnviar(caso)).toEqual({ ok: true, faltas: [] });
  });

  it('lo que la compuerta dice de la lista no se repite si el borrador ya la listó', () => {
    const caso = completo();
    caso.lista = { items: [{ codigo: 'b', texto: 'b', obligatorio: true, cumplido: false, enBorrador: false, respaldo: null, respaldado: null }], constanciaRegistrada: false };
    const locales = puedeEnviar(caso).faltas;
    expect(faltasDelServidor([issue({ code: 'CHECKLIST_INCOMPLETE', message: 'Lo mismo.' })], caso, { respuestaDeOpcion: () => undefined, faltasLocales: locales })).toEqual([]);
  });
});

describe('sugerencias: «todavía no probaste el caso completo en el juego»', () => {
  const mensaje = 'Todavía no probaste el caso completo en el juego.';

  it('sale con probadoHastaElFinal falso o ausente y la guía señala el botón «Probar» de la barra', () => {
    const caso = completo();
    for (const probado of [undefined, false]) {
      const lista = sugerencias({ ...caso, probadoHastaElFinal: probado });
      expect(lista.find((f) => f.mensaje === mensaje)?.ir).toEqual({ ruta: '/editor', accionId: 'probar' });
    }
  });

  it('desaparece con probadoHastaElFinal verdadero', () => {
    expect(sugerencias({ ...completo(), probadoHastaElFinal: true }).map((f) => f.mensaje)).not.toContain(mensaje);
  });
});
