import { esRecetaValida } from '../cinematica/lectura';

interface PasoDeRevision {
  numero: number;
  titulo: string;
  hitos: string[];
  logrado: string;
  pendiente: string;
}

interface CapituloDeRevision {
  titulo: string;
  pasos: PasoDeRevision[];
}

export interface RevisionLeida {
  nombre: string;
  rol: string;
  recipeId: string | null;
  entrada: string;
  capitulos: CapituloDeRevision[];
  cierre: string;
}

const MAX_CAPITULOS = 12;
const MAX_PASOS = 24;
const MAX_HITOS = 24;
const MAX_CLAVE = 120;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown, maximo: number): string {
  return typeof valor === 'string' ? valor.trim().slice(0, maximo) : '';
}

function esClave(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= MAX_CLAVE && valor === valor.trim();
}

function leerPaso(valor: unknown): PasoDeRevision | null {
  if (!esObjeto(valor)) return null;
  const { numero, hitos } = valor;
  const titulo = texto(valor['titulo'], 120);
  const logrado = texto(valor['logrado'], 900);
  const pendiente = texto(valor['pendiente'], 900);
  if (typeof numero !== 'number' || !Number.isInteger(numero) || numero < 1 || numero > 99) return null;
  if (!titulo || !logrado || !pendiente) return null;
  // Cada clave cuenta. Una lista incompleta podría marcar como logrado un paso que todavía falta.
  if (!Array.isArray(hitos) || !hitos.length || hitos.length > MAX_HITOS || !Array.from(hitos).every(esClave)) return null;
  return { numero, titulo, hitos: [...hitos], logrado, pendiente };
}

function leerCapitulo(valor: unknown): CapituloDeRevision | null {
  if (!esObjeto(valor) || !Array.isArray(valor['pasos'])) return null;
  const titulo = texto(valor['titulo'], 120);
  const pasos = valor['pasos'].slice(0, MAX_PASOS).map(leerPaso).filter(paso => paso !== null);
  return titulo && pasos.length ? { titulo, pasos } : null;
}

/** Lee la revisión de la sala terminal y conserva las plantillas para aplicarlas al pintar. */
export function leerRevision(ambient: unknown): RevisionLeida | null {
  const datos = esObjeto(ambient) ? ambient['revision'] : null;
  if (!esObjeto(datos) || !Array.isArray(datos['capitulos'])) return null;
  const capitulos = datos['capitulos'].slice(0, MAX_CAPITULOS).map(leerCapitulo).filter(capitulo => capitulo !== null);
  if (!capitulos.length) return null;
  return {
    nombre: texto(datos['nombre'], 80) || 'Profesor',
    rol: texto(datos['rol'], 140),
    recipeId: esRecetaValida(datos['recipeId']) ? datos['recipeId'] : null,
    entrada: texto(datos['entrada'], 900),
    capitulos,
    cierre: texto(datos['cierre'], 900),
  };
}

/** Evalúa en el orden del caso por clave del hito y elige la frase de cada paso. */
export function evaluarRevision(revision: RevisionLeida, hitosCumplidos: Iterable<string>) {
  const cumplidos = new Set(hitosCumplidos);
  return revision.capitulos.map(capitulo => ({
    titulo: capitulo.titulo,
    pasos: capitulo.pasos.map(paso => {
      const logrado = paso.hitos.every(clave => cumplidos.has(clave));
      return { numero: paso.numero, titulo: paso.titulo, logrado, texto: logrado ? paso.logrado : paso.pendiente };
    }),
  }));
}
