import { conNombre } from './plantilla-nombre';
import { type EntornoDeRuta, type Punto, rutaEsquivando, tramoLibre } from './acompanantes';

interface Linea { quien: string; texto: string; duracionMs: number }
export interface ConversacionDeFondo {
  personas: [string, string];
  lineas: Linea[];
  pausaMs: number;
  modo: 'quietos' | 'caminan';
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : null;
}

export function leerConversaciones(crudo: unknown, personas: ReadonlySet<string>, nombre = ''): ConversacionDeFondo[] {
  if (!Array.isArray(crudo)) return [];
  const resultado: ConversacionDeFondo[] = [];
  for (const entrada of crudo) {
    const datos = objeto(entrada);
    const par = datos?.['personas'];
    const frases = datos?.['lineas'];
    if (!Array.isArray(par) || par.length !== 2 || par[0] === par[1]
      || !par.every(p => typeof p === 'string' && personas.has(p)) || !Array.isArray(frases)) continue;
    const lineas: Linea[] = [];
    for (const frase of frases) {
      const linea = objeto(frase);
      const quien = linea?.['quien'];
      const texto = typeof linea?.['texto'] === 'string' ? conNombre(linea['texto'].trim(), nombre) : '';
      if (typeof quien !== 'string' || !par.includes(quien) || !texto) continue;
      const duracionMs = Math.max(2500, 400 * texto.split(/\s+/).length);
      lineas.push({ quien, texto, duracionMs });
    }
    if (!lineas.length) continue;
    const pausa = datos?.['pausaMs'];
    resultado.push({ personas: [par[0], par[1]], lineas,
      pausaMs: typeof pausa === 'number' && Number.isFinite(pausa) && pausa >= 0 ? pausa : 9000,
      modo: datos?.['modo'] === 'caminan' ? 'caminan' : 'quietos' });
  }
  return resultado;
}

export class RelojDeConversacion {
  private transcurrido = 0;
  private indice = 0;

  constructor(readonly datos: ConversacionDeFondo) {}

  avanzar(delta: number): void {
    this.transcurrido += delta;
    const lineas = this.datos.lineas;
    const duracion = lineas[this.indice]?.duracionMs ?? this.datos.pausaMs;
    if (this.transcurrido >= duracion) {
      this.transcurrido -= duracion;
      this.indice = this.indice < lineas.length ? this.indice + 1 : 0;
    }
  }

  get linea(): Linea | null { return this.datos.lineas[this.indice] ?? null; }
}

export type PasoEnPareja = readonly [Punto, Punto];

function trasladar(punto: Punto, lado: Punto): Punto {
  return { x: punto.x + lado.x, y: punto.y + lado.y };
}

/** El rodeo se calcula para ambos, conservando una separación lateral en toda la ruta. */
export function rutaEnPareja(desde: PasoEnPareja, meta: Punto, entorno: EntornoDeRuta): PasoEnPareja[] {
  const dx = meta.x - desde[0].x, dy = meta.y - desde[0].y;
  const largo = Math.hypot(dx, dy);
  if (largo < 4) return [];
  const separacion = 28;
  const lado = { x: Math.round(-dy / largo * separacion), y: Math.round(dx / largo * separacion) };
  const contrario = { x: -lado.x, y: -lado.y };
  const distancia = (o: Punto) => Math.hypot(desde[0].x + o.x - desde[1].x, desde[0].y + o.y - desde[1].y);
  const { limites } = entorno;
  const bloqueado = (x: number, y: number) =>
    x < limites.minX || x > limites.maxX || y < limites.minY || y > limites.maxY || entorno.bloqueado(x, y);
  for (const offset of [lado, contrario].sort((a, b) => distancia(a) - distancia(b))) {
    const junto = trasladar(desde[0], offset);
    const reunion = rutaEsquivando(desde[1], junto, { limites, bloqueado }, true);
    if (!reunion.length) continue;
    const ruta = rutaEsquivando(desde[0], meta, {
      limites, bloqueado: (x, y) => bloqueado(x, y) || bloqueado(x + offset.x, y + offset.y),
    }, true);
    if (!ruta.length) continue;
    // También se comprueba el primer tramo desde las coordenadas reales, fuera de la rejilla del A*.
    const ambos = { limites, bloqueado: (x: number, y: number) => bloqueado(x, y) || bloqueado(x + offset.x, y + offset.y) };
    if (!tramoLibre(desde[0], ruta[0], ambos)) continue;
    return [...reunion.map(p => [desde[0], p] as const), ...ruta.map(p => [p, trasladar(p, offset)] as const)];
  }
  return [];
}
