import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { CasoBorrador, Respuesta } from '../../modelo/caso';
import { universidad } from '../../testing/universidad';
import { dependenciasDeEscena, dependenciasDeRespuesta, respuestaEnBlanco } from './dependencias';

/** Lo que depende de una respuesta o de una escena, para la confirmación de borrado (EDITOR.md §4.6). */
const respuesta = (cambios: Partial<Respuesta> = {}): Respuesta => ({
  id: 'r', texto: '', clase: null, razon: '', retroalimentacion: '', efectos: {}, destinoId: null, marcaIa: false, ...cambios,
});

function caso(): CasoBorrador {
  return copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
}

describe('dependencias de un borrado', () => {
  it('una respuesta en blanco no pierde nada; con texto o clase, sí', () => {
    const c = caso();
    expect(respuestaEnBlanco(c, respuesta())).toBe(true);
    expect(respuestaEnBlanco(c, respuesta({ texto: 'Hola' }))).toBe(false);
    expect(respuestaEnBlanco(c, respuesta({ clase: 'RISKY' }))).toBe(false);
  });

  it('sin texto pero con competencias, o la ofrece un objeto de la sala, no está en blanco: pide confirmación (Codex, hallazgo 2)', () => {
    const c = caso();
    expect(respuestaEnBlanco(c, respuesta({ efectos: { competencias: ['C1'] } }))).toBe(false);
    expect(respuestaEnBlanco(c, respuesta({ efectos: { competencias: {} } }))).toBe(true);
    const sala = c.salas[0];
    sala.objetos = [{ ...sala.objetos[0], decisionOptionId: 9 }];
    expect(respuestaEnBlanco(c, respuesta({ id: '9' }))).toBe(false);
  });

  it('nombra el objeto de la sala que ofrece la respuesta (por el número de su opción)', () => {
    const c = caso();
    const sala = c.salas[0];
    sala.objetos = [{ ...sala.objetos[0], decisionOptionId: 9 }];
    const nombre = c.catalogo.objetos.find((o) => o.id === sala.objetos[0].ref)?.nombre ?? sala.objetos[0].ref;
    expect(dependenciasDeRespuesta(c, respuesta({ id: '9' }))).toContain(`La ofrece «${nombre}» de la sala ${sala.nombre}.`);
    expect(dependenciasDeRespuesta(c, respuesta({ id: 'respuesta-nueva' }))).toEqual([]);
  });

  it('avisa si la respuesta es el único camino hacia su destino', () => {
    const c = caso();
    const [a, b] = c.escenas;
    const r = respuesta({ id: 'x', destinoId: b.id });
    a.respuestas = [r];
    expect(dependenciasDeRespuesta(c, r).join(' ')).toContain('esa escena quedará sin conexión');
    a.respuestas.push(respuesta({ id: 'y', destinoId: b.id }));
    expect(dependenciasDeRespuesta(c, r)).toEqual([]);
  });

  it('una escena nombra las respuestas que llegan a ella con su letra y su escena', () => {
    const c = caso();
    const [a, b] = c.escenas;
    a.respuestas = [respuesta({ id: 'p' }), respuesta({ id: 'q', destinoId: b.id })];
    expect(dependenciasDeEscena(c, b)[0]).toBe(`Llegan aquí: Respuesta B de 1 · ${a.titulo}. Quedarán sin destino.`);
  });
});
