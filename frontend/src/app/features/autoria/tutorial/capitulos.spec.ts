import type { CasoBorrador, Respuesta } from '../modelo/caso';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import { universidad } from '../testing/universidad';
import {
  CAPITULOS, TOTAL_PASOS, cambioUnaExpresion, contextoEscrito, hayEscenaNueva, respuestaGanoPaso, respuestaNuevaClasificada,
} from './capitulos';

const base = (): CasoBorrador => copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
const respuesta = (id: string, cambios: Partial<Respuesta> = {}): Respuesta => ({
  id, texto: 'Hola', clase: null, razon: '', retroalimentacion: '', efectos: {}, destinoId: null, marcaIa: false, ...cambios,
});

describe('guion del tutorial', () => {
  it('ocho capítulos, ids únicos y cada paso con texto', () => {
    expect(CAPITULOS.map((c) => c.id)).toEqual(['bienvenida', 'datos', 'lugar', 'escenas', 'sala', 'guion', 'evaluacion', 'enviar']);
    const ids = CAPITULOS.flatMap((c) => c.pasos.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(TOTAL_PASOS).toBe(ids.length);
    for (const p of CAPITULOS.flatMap((c) => c.pasos)) {
      expect(p.titulo.trim()).not.toBe('');
      expect(p.texto.trim()).not.toBe('');
      expect(p.ruta === '' || p.ruta.startsWith('/editor')).toBe(true);
    }
  });

  it('hay exactamente cinco pasos prácticos y ninguno en Bienvenida, Lugar ni Enviar', () => {
    const practicos = CAPITULOS.flatMap((c) => c.pasos.filter((p) => p.practico).map((p) => `${c.id}/${p.id}`));
    expect(practicos).toEqual(['datos/d-contexto', 'escenas/e-agregar', 'sala/s-expresion', 'guion/g-agregar', 'evaluacion/v-marcar']);
  });

  it('contextoEscrito: solo cuando el contexto cambia a algo no vacío', () => {
    const a = base();
    expect(contextoEscrito(a, structuredClone(a))).toBe(false);
    expect(contextoEscrito(a, { ...structuredClone(a), contexto: '   ' })).toBe(false);
    expect(contextoEscrito(a, { ...structuredClone(a), contexto: 'Una madre llega a consulta.' })).toBe(true);
  });

  it('hayEscenaNueva: una escena más que al empezar', () => {
    const a = base();
    const b = structuredClone(a);
    expect(hayEscenaNueva(a, b)).toBe(false);
    b.escenas.push({ ...structuredClone(a.escenas[0]), id: 'nueva' });
    expect(hayEscenaNueva(a, b)).toBe(true);
  });

  it('cambioUnaExpresion: algún personaje de alguna sala cambió de cara', () => {
    const a = base();
    const b = structuredClone(a);
    expect(cambioUnaExpresion(a, b)).toBe(false);
    const sala = b.salas.find((s) => s.personajes.length > 0)!;
    sala.personajes[0].expresion = sala.personajes[0].expresion === 'triste' ? 'alegre' : 'triste';
    expect(cambioUnaExpresion(a, b)).toBe(true);
  });

  it('respuestaNuevaClasificada: una respuesta que no estaba y ya tiene clase', () => {
    const a = base();
    a.escenas[0].respuestas = [respuesta('vieja', { clase: 'ACCEPTABLE' })];
    const b = structuredClone(a);
    expect(respuestaNuevaClasificada(a, b)).toBe(false);
    b.escenas[0].respuestas.push(respuesta('nueva'));
    expect(respuestaNuevaClasificada(a, b)).toBe(false);
    b.escenas[0].respuestas[1].clase = 'RISKY';
    expect(respuestaNuevaClasificada(a, b)).toBe(true);
  });

  it('respuestaGanoPaso: alguna respuesta ganó una clave en efectos.hitos', () => {
    const a = base();
    a.escenas[0].respuestas = [respuesta('r1', { efectos: { hitos: ['valorar'] } })];
    const b = structuredClone(a);
    expect(respuestaGanoPaso(a, b)).toBe(false);
    b.escenas[0].respuestas[0].efectos.hitos = ['valorar', 'derivar'];
    expect(respuestaGanoPaso(a, b)).toBe(true);
  });
});
