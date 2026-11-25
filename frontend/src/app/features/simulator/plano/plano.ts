/**
 * Plano del lugar (bloque M1, especificación §5.2 y §5.3): del campo `layout` del mundo a rectángulos, marcas de puerta y
 * textos para lector de pantalla. Sin Angular ni Phaser.
 *
 * El servidor ya ubica cada sala (`plan`, contrato `x-siep` 2.2, sección 5.3) y no manda objetos ni personas (VD-19): el
 * plano nunca señala nada por descubrir. Este es el único archivo que conoce los nombres de campo de `layout`.
 */

export type Muro = 'fondo' | 'izquierda' | 'derecha' | 'camara';
export type Encuadre = 'tres-paredes' | 'dos-paredes-izquierda' | 'dos-paredes-derecha' | 'una-pared';

/** Alto de toda sala y línea donde el muro del fondo toca el piso (contrato 2.2, sección 1.1). */
export const ALTO_SALA = 528;
const PISO = 230;
/** Separación entre salas del plano (contrato 2.2, regla 5.3). */
const SEPARACION = 96;
/** Margen alrededor de todas las salas al encuadrar el dibujo. */
const MARGEN_CAJA = 120;

const MUROS: readonly Muro[] = ['fondo', 'izquierda', 'derecha', 'camara'];
const ENCUADRES: readonly Encuadre[] = ['tres-paredes', 'dos-paredes-izquierda', 'dos-paredes-derecha', 'una-pared'];

export interface SalaDelPlano { clave: string; titulo: string; ancho: number; encuadre: Encuadre; x: number; y: number; visitada: boolean }
export interface PuertaDelPlano { origen: string; destino: string; muro: Muro; pos: number; clave?: string }
export interface PlanoDelLugar { actual: string | null; salas: SalaDelPlano[]; puertas: PuertaDelPlano[] }

export type EstadoSala = 'actual' | 'visitada' | 'sin-visitar';
export interface MarcaPuerta { x: number; y: number; muro: Muro; destino: string; esDestino?: boolean }

/**
 * A dónde apunta el «Siguiente paso» de la ficha del objetivo (P9), en términos del plano. El plano solo sabe de salas y
 * puertas (nunca de lo que hay dentro, VD-19): una persona o una herramienta se marcan en la sala donde están (la actual,
 * que es la única que la guía conoce) y una puerta, ella misma y la sala a la que lleva.
 */
export interface DestinoDelPlano {
  tipo: 'persona' | 'herramienta' | 'puerta';
  /** El nombre de la persona, de la herramienta o de la puerta tal como lo muestra la ficha. */
  etiqueta: string;
  /** Sala en la que está lo que se busca (o de la que sale la puerta). */
  sala: string;
  /** Solo en una puerta: su clave en el mundo y la sala a la que lleva (si está en el plano). */
  puerta?: string;
  haciaSala?: string;
}
export interface SalaDibujada {
  clave: string;
  /** null en una sala sin visitar: solo su contorno. */
  titulo: string | null;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  estado: EstadoSala;
  puertas: MarcaPuerta[];
  /** La sala del siguiente paso (P9): donde está la persona o la herramienta, o a la que lleva la puerta. */
  destino: boolean;
}
export interface DibujoDelPlano { caja: { x: number; y: number; ancho: number; alto: number }; salas: SalaDibujada[] }

type Registro = Record<string, unknown>;
const esRegistro = (v: unknown): v is Registro => typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** El `layout` del mundo (contrato 2.2, sección 5.2) en el modelo del plano; null si no hay salas que dibujar. */
export function normalizarLayout(raw: unknown): PlanoDelLugar | null {
  if (!esRegistro(raw) || !Array.isArray(raw['rooms'])) return null;

  const salas: SalaDelPlano[] = [];
  const sinSitio: SalaDelPlano[] = [];
  for (const room of raw['rooms']) {
    if (!esRegistro(room) || !esTexto(room['key'])) continue;
    const clave = room['key'];
    const plan = room['plan'];
    const ubicada = esRegistro(plan) && esNumero(plan['x']) && esNumero(plan['y']);
    const sala: SalaDelPlano = {
      clave,
      titulo: esTexto(room['title']) ? room['title'] : clave,
      ancho: esNumero(room['width']) && room['width'] > 0 ? room['width'] : 960,
      encuadre: ENCUADRES.includes(room['frame'] as Encuadre) ? room['frame'] as Encuadre : 'tres-paredes',
      x: ubicada ? (plan as Registro)['x'] as number : 0,
      y: ubicada ? (plan as Registro)['y'] as number : 0,
      visitada: room['visited'] === true,
    };
    salas.push(sala);
    if (!ubicada) sinSitio.push(sala);
  }
  if (salas.length === 0) return null;

  // Salas sin sitio: en fila a la derecha de todo (contrato 2.2, regla 5.3, paso 5).
  const ubicadas = salas.filter(s => !sinSitio.includes(s));
  let siguienteX = ubicadas.length ? Math.max(...ubicadas.map(s => s.x + s.ancho)) + SEPARACION : 0;
  for (const sala of sinSitio) {
    sala.x = siguienteX;
    sala.y = 0;
    siguienteX += sala.ancho + SEPARACION;
  }

  const claves = new Set(salas.map(s => s.clave));
  const puertas: PuertaDelPlano[] = [];
  for (const door of Array.isArray(raw['doors']) ? raw['doors'] : []) {
    if (!esRegistro(door)) continue;
    const { from, to, wall, pos } = door;
    if (!esTexto(from) || !claves.has(from) || !esTexto(to) || !MUROS.includes(wall as Muro) || !esNumero(pos)) continue;
    puertas.push({ origen: from, destino: to, muro: wall as Muro, pos, ...(esTexto(door['key']) ? { clave: door['key'] } : {}) });
  }

  return { actual: esTexto(raw['currentRoom']) ? raw['currentRoom'] : null, salas, puertas };
}

/** redondear(n, d) del contrato 2.2 (sección 1.2): el entero más cercano, mitades hacia +∞. */
function redondear(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/** Donde empieza el muro del fondo dentro de la sala (`limites(enc, ancho).xl`, contrato 2.2, sección 1.3). */
function inicioDelFondo(encuadre: Encuadre, ancho: number): number {
  const conIzquierda = encuadre === 'tres-paredes' || encuadre === 'dos-paredes-izquierda';
  return conIzquierda ? 96 + redondear(19 * (ancho - 960), 240) : 0;
}

/** Dónde cae en el plano una posición de un muro de la sala (lo mismo que la muesca de una puerta allí). */
export function puntoEnElMuro(sala: SalaDelPlano, muro: Muro, pos: number): MarcaPuerta {
  return marca(sala, { origen: sala.clave, destino: '', muro, pos });
}

function marca(sala: SalaDelPlano, puerta: PuertaDelPlano): MarcaPuerta {
  const base = { muro: puerta.muro, destino: puerta.destino };
  const xl = inicioDelFondo(sala.encuadre, sala.ancho);
  switch (puerta.muro) {
    case 'fondo': return { x: sala.x + xl + puerta.pos, y: sala.y, ...base };
    case 'camara': return { x: sala.x + xl + puerta.pos, y: sala.y + ALTO_SALA, ...base };
    case 'izquierda': return { x: sala.x, y: sala.y + PISO + puerta.pos, ...base };
    case 'derecha': return { x: sala.x + sala.ancho, y: sala.y + PISO + puerta.pos, ...base };
  }
}

function visitadasDe(plano: PlanoDelLugar, actual: string, extra: ReadonlySet<string>): Set<string> {
  return new Set(plano.salas.filter(s => s.visitada || extra.has(s.clave) || s.clave === actual).map(s => s.clave));
}

/**
 * El siguiente paso en el plano (P9): una persona o una herramienta quedan en la sala actual; una puerta, la que lleva a su
 * clave en el plano de la sala actual. null si no hay paso o si la puerta no figura en el plano (se marca solo la sala).
 */
export function destinoDelPlano(
  plano: PlanoDelLugar,
  actual: string,
  lugar: { key: string; label: string; tipo: DestinoDelPlano['tipo'] } | null,
): DestinoDelPlano | null {
  if (!lugar || actual === '' || !plano.salas.some(s => s.clave === actual)) return null;
  const base: DestinoDelPlano = { tipo: lugar.tipo, etiqueta: lugar.label, sala: actual };
  if (lugar.tipo !== 'puerta') return base;
  const puerta = plano.puertas.find(p => p.origen === actual && p.clave === lugar.key);
  if (!puerta) return base;
  const llega = plano.salas.some(s => s.clave === puerta.destino);
  return { ...base, puerta: lugar.key, ...(llega ? { haciaSala: puerta.destino } : {}) };
}

/** Rectángulos, estados y marcas de puerta, en px de plano (los de sala), con la caja que los contiene a todos. */
export function dibujarPlano(plano: PlanoDelLugar, actual: string, visitadas: ReadonlySet<string>, destino: DestinoDelPlano | null = null): DibujoDelPlano {
  const vistas = visitadasDe(plano, actual, visitadas);
  const claveDeLaSalaDestino = destino ? (destino.tipo === 'puerta' ? destino.haciaSala ?? null : destino.sala) : null;
  const salas = plano.salas.map((sala): SalaDibujada => {
    const estado: EstadoSala = sala.clave === actual ? 'actual' : vistas.has(sala.clave) ? 'visitada' : 'sin-visitar';
    return {
      destino: sala.clave === claveDeLaSalaDestino,
      clave: sala.clave,
      titulo: estado === 'sin-visitar' ? null : sala.titulo,
      x: sala.x,
      y: sala.y,
      ancho: sala.ancho,
      alto: ALTO_SALA,
      estado,
      puertas: plano.puertas.filter(p => p.origen === sala.clave).map(p => {
        const m = marca(sala, p);
        return destino?.puerta !== undefined && sala.clave === destino.sala && p.clave === destino.puerta ? { ...m, esDestino: true } : m;
      }),
    };
  });
  const minX = Math.min(...salas.map(s => s.x)) - MARGEN_CAJA;
  const minY = Math.min(...salas.map(s => s.y)) - MARGEN_CAJA;
  const maxX = Math.max(...salas.map(s => s.x + s.ancho)) + MARGEN_CAJA;
  const maxY = Math.max(...salas.map(s => s.y + s.alto)) + MARGEN_CAJA;
  return { caja: { x: minX, y: minY, ancho: maxX - minX, alto: maxY - minY }, salas };
}

const enumerar = (items: string[]) => new Intl.ListFormat('es', { style: 'long', type: 'conjunction' }).format(items);

/** «Puertas: A, B y C.» con cada destino una vez, en el orden de las puertas; uno fuera del plano es «Salida». */
function textoDePuertas(plano: PlanoDelLugar, clave: string): string {
  const titulos = new Map(plano.salas.map(s => [s.clave, s.titulo]));
  const destinos: string[] = [];
  for (const puerta of plano.puertas) {
    if (puerta.origen !== clave) continue;
    const nombre = titulos.get(puerta.destino) ?? 'Salida';
    if (!destinos.includes(nombre)) destinos.push(nombre);
  }
  return destinos.length ? `Puertas: ${enumerar(destinos)}.` : 'No tiene puertas.';
}

/**
 * El siguiente paso dicho en palabras (P9), para el lector de pantalla y la lista del plano: «Siguiente paso: habla con
 * Vigilante, en esta sala.». Una puerta se nombra con su propio rótulo y no con el título de la sala a la que lleva: el
 * plano completo no da el nombre de las salas sin visitar.
 */
export function textoDelDestino(destino: DestinoDelPlano): string {
  switch (destino.tipo) {
    case 'persona': return `Siguiente paso: habla con ${destino.etiqueta}, en esta sala.`;
    case 'herramienta': return `Siguiente paso: recoge la herramienta «${destino.etiqueta}», en esta sala.`;
    case 'puerta': return `Siguiente paso: pasa por la puerta «${destino.etiqueta}».`;
  }
}

/**
 * Alternativa en texto del minimapa: «Estás en: Pasillo. Puertas: Sala de espera, Enfermería y Sala de escucha.». Los
 * títulos van tal cual: vienen de la docente o de la IA, y deducir el artículo falla con nombres propios. Los destinos
 * de las puertas ya se ven en el aviso de cada puerta. '' si la sala no está en el plano. Con `destino` suma el siguiente paso.
 */
export function textoDeLaSala(plano: PlanoDelLugar, actual: string, destino: DestinoDelPlano | null = null): string {
  const sala = plano.salas.find(s => s.clave === actual);
  if (!sala) return '';
  const base = `Estás en: ${sala.titulo}. ${textoDePuertas(plano, actual)}`;
  return destino ? `${base} ${textoDelDestino(destino)}` : base;
}

/** Una línea por sala para el plano completo; las no visitadas sin su nombre, igual que en el dibujo. */
export function textoDelPlano(plano: PlanoDelLugar, actual: string, visitadas: ReadonlySet<string>, destino: DestinoDelPlano | null = null): string[] {
  const vistas = visitadasDe(plano, actual, visitadas);
  const titulos = new Map(plano.salas.map(s => [s.clave, s.titulo]));
  // La sala del siguiente paso lo dice en su línea (P9): donde está lo que se busca, o la sala a la que lleva la puerta.
  const claveDeLaSalaDestino = destino ? (destino.tipo === 'puerta' ? destino.haciaSala ?? destino.sala : destino.sala) : null;
  const aviso = (clave: string) => destino && clave === claveDeLaSalaDestino ? ` ${textoDelDestino(destino)}` : '';
  return plano.salas.map(sala => {
    if (sala.clave === actual) return `${sala.titulo}, estás aquí. ${textoDePuertas(plano, sala.clave)}${aviso(sala.clave)}`;
    if (vistas.has(sala.clave)) return `${sala.titulo}, visitada. ${textoDePuertas(plano, sala.clave)}${aviso(sala.clave)}`;
    const desde: string[] = [];
    for (const puerta of plano.puertas) {
      const nombre = titulos.get(puerta.origen);
      if (puerta.destino === sala.clave && vistas.has(puerta.origen) && nombre && !desde.includes(nombre)) desde.push(nombre);
    }
    const llegada = desde.length ? `Sala sin visitar. Se llega desde ${enumerar(desde)}.` : 'Sala sin visitar.';
    return `${llegada}${aviso(sala.clave)}`;
  });
}
