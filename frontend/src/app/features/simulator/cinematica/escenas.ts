/**
 * El guion de cada escena genérica de la cinemática: dado un plano y el momento dentro de él, qué se ve en ese cuadro
 * (decorado, cámara, personas, la ventana, las luces). Pura y determinista: el lienzo la pinta y las pruebas la leen.
 *
 * Reglas de dirección:
 * - La agresión NUNCA se muestra: la casa se ve por fuera, dos siluetas quietas tras la ventana; después, las luces de la
 *   calle, la camilla que pasa y la familia que llega. Nada de armas, golpes ni sangre.
 * - Con «movimiento reducido» cada plano es una placa fija (el cuadro no cambia con el tiempo): sin paneo, sin caminatas,
 *   sin luces que alternan ni parpadeo. Solo quedan los fundidos entre planos.
 * - Las luces de emergencia alternan a 0,7 Hz con transición suave y poca amplitud (muy por debajo de 3 destellos por
 *   segundo, WCAG 2.3.1), sobre las paredes y no a pantalla completa.
 *
 * Las posiciones están en píxeles del decorado (los mismos del arte de las salas: 528 de alto). Las del decorado «calle»
 * salen de `decorados.ts` (la casa A es la fachada de la biblioteca, con su ventana `corrediza-1`).
 */
import type { MomentoDeCinematica } from '../../../core/models/simulation.model';
import type { ViewId } from '../../character/kit/kit-engine';
import type { PlanoLeido } from './lectura';

export type Decorado = 'calle' | 'urgencias' | 'negro' | 'titulo';

/** Una persona del kit en el cuadro: (x, y) es donde pisa. */
export interface ActorEnCuadro {
  receta: string;
  recetaDeRespaldo?: string;
  hoja: 'idle' | 'walk';
  vista: ViewId;
  cuadro: number;
  x: number;
  y: number;
  /** Sombra larga del sol de la tarde, tendida en el piso. */
  sombraLarga?: boolean;
}

/** Un mueble de la biblioteca que se mueve en el cuadro: (x, y) es el centro de su base. */
export interface MuebleEnCuadro {
  clave: 'camilla';
  x: number;
  y: number;
  /** Una manta sobre la camilla (sin forma de cuerpo: solo sugiere que alguien va en ella). */
  manta?: boolean;
}

/** La ventana de la casa en primer plano: su luz (0 apagada, 1 encendida) y quién se ve detrás, en silueta. */
export interface VentanaEnCuadro {
  luz: number;
  siluetas: ActorEnCuadro[];
}

export interface CuadroDeCinematica {
  decorado: Decorado;
  momento: MomentoDeCinematica;
  /** Centro de la cámara en el decorado y su acercamiento entero (1 o 2). */
  camara: { x: number; y: number; zoom: 1 | 2 };
  actores: ActorEnCuadro[];
  muebles: MuebleEnCuadro[];
  /** La luz de la ventana de la casa en el decorado «calle» (0 a 1) y, en el primer plano, las siluetas. */
  ventana: VentanaEnCuadro | null;
  /**
   * Luces de emergencia sobre las paredes, de 0 a 1 cada una. `barrido` (0 a 1, opcional) es la vuelta de las balizas: el
   * haz rojo y el azul recorren la fachada en sentidos contrarios. Sin barrido (movimiento reducido), un tinte quieto.
   */
  luces: { rojo: number; azul: number; barrido?: number };
}

/** Lo que mide la vista en píxeles del decorado (sin acercamiento): el guion lo usa para entrar y salir de cuadro. */
export interface VistaDeCinematica {
  ancho: number;
  alto: number;
}

/** Las recetas del kit que pide cada silueta (genéricas: hombre, mujer, niña). */
export const RECETA_DE_SILUETA = { hombre: 'andres', mujer: 'sobreviviente', nina: 'nina-casa' } as const;
const PASEANTES = ['paciente-espera', 'vecina'] as const;
const VECINA = 'vecina';
const EQUIPO_DE_URGENCIAS = ['medico-guardia', 'enfermera-urgencias'] as const;
const FAMILIA = ['abuela-familia', 'estudiante-consultante', 'adolescente'] as const;

/** Geometría del decorado «calle» (la casa A ocupa de 0 a 960; la B, de 960 a 1920). */
export const CALLE = {
  ancho: 1920,
  /** Centro del cristal de la ventana `corrediza-1` de la casa A. */
  ventana: { x: 232, y: 131 },
  /** Línea donde pisan quienes van por el andén. */
  anden: [262, 276] as const,
  centroY: 176,
};
export const URGENCIAS = { ancho: 1200, centroY: 262, suelo: 352 };

const CUADROS = { idle: 4, walk: 6 } as const;

function suave(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 0.5 - Math.cos(Math.PI * x) / 2;
}

function entre(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cuadroDeHoja(hoja: 'idle' | 'walk', ms: number, fps: number, desfase = 0): number {
  return Math.floor(Math.max(0, ms + desfase) * fps / 1000) % CUADROS[hoja];
}

const vacio = (decorado: Decorado, momento: MomentoDeCinematica): CuadroDeCinematica => ({
  decorado, momento, camara: { x: 0, y: 0, zoom: 1 }, actores: [], muebles: [], ventana: null, luces: { rojo: 0, azul: 0 },
});

/**
 * La luz de la ventana en este momento. `luzVentana` explícito manda; si no, se enciende cuando hay siluetas (sin luz no
 * se verían). De noche, la que se pidió encendida se ENCIENDE en el plano (un parpadeo breve y queda), salvo con
 * movimiento reducido, donde ya está encendida.
 */
function luzDeVentana(plano: PlanoLeido, ms: number, reducido: boolean): number {
  const pedida = plano.luzVentana ?? (plano.siluetas.length > 0 ? true : plano.escena === 'casa-ventana' && plano.momento === 'tarde' ? null : false);
  if (pedida === null) return 0.45;   // la tarde sin nadie a la vista: el interior en penumbra cálida
  if (!pedida) return 0;
  if (plano.momento !== 'noche' || reducido) return 1;
  // Se enciende a los 1,4 s: dos destellos cortos (no repetitivos) y queda encendida.
  if (ms < 1400) return 0;
  if (ms < 1480) return 0.85;
  if (ms < 1560) return 0.2;
  if (ms < 1700) return 1;
  return 1;
}

function barrio(plano: PlanoLeido, ms: number, reducido: boolean): CuadroDeCinematica {
  const t = reducido ? 0.5 : ms / plano.duracionMs;
  const cuadro = vacio('calle', plano.momento);
  if (plano.momento === 'noche') {
    // La misma calle de noche, quieta, encuadrada en la casa: la ventana a la vista.
    cuadro.camara = { x: reducido ? 430 : entre(470, 400, suave(t)), y: CALLE.centroY, zoom: 1 };
  } else {
    // La tarde: la cámara recorre la cuadra y se detiene en la casa.
    cuadro.camara = { x: reducido ? 760 : entre(1300, 520, suave(t)), y: CALLE.centroY, zoom: 1 };
    // Dos personas pasan por el andén, despacio, con su sombra larga (el sol bajo viene de la izquierda): una se va por la
    // derecha al empezar el paneo y la otra camina hacia la casa cuando la cámara llega a ella.
    const [cerca, lejos] = [CALLE.anden[1], CALLE.anden[0]];
    const caminar = (receta: string, x0: number, v: number, y: number, desfase: number): ActorEnCuadro => ({
      receta,
      hoja: reducido ? 'idle' : 'walk',
      vista: v < 0 ? 'left' : 'right',
      cuadro: reducido ? 0 : cuadroDeHoja('walk', ms, 7, desfase),
      x: Math.round(reducido ? x0 : x0 + v * ms / 1000),
      y,
      sombraLarga: true,
    });
    cuadro.actores.push(caminar(PASEANTES[0], reducido ? 980 : 1250, 32, cerca, 0));
    cuadro.actores.push(caminar(PASEANTES[1], reducido ? 640 : 720, -28, lejos, 380));
  }
  cuadro.ventana = { luz: luzDeVentana(plano, ms, reducido), siluetas: [] };
  return cuadro;
}

function casaVentana(plano: PlanoLeido, ms: number, reducido: boolean): CuadroDeCinematica {
  const t = reducido ? 0.5 : ms / plano.duracionMs;
  const cuadro = vacio('calle', plano.momento);
  // Primer plano de la ventana (×2), con una deriva lenta de pocos píxeles: la cámara respira, no se mueve.
  cuadro.camara = {
    x: CALLE.ventana.x + (reducido ? 0 : entre(-6, 6, suave(t))),
    y: CALLE.ventana.y + (reducido ? 0 : entre(2, -2, suave(t))),
    zoom: 2,
  };
  const siluetas: ActorEnCuadro[] = [];
  const pocas = plano.siluetas;
  const adultos = pocas.filter(s => s !== 'nina');
  const fps = 3;
  // De noche, una sola persona ENTRA al cuarto después de que se enciende la luz (el regreso de él): camina desde el borde
  // izquierdo del cristal hasta quedar de frente. Es lo único que se ve: la agresión nunca se muestra.
  if (plano.momento === 'noche' && adultos.length === 1 && !pocas.includes('nina')) {
    const s = adultos[0];
    const llega = CALLE.ventana.x - 4, desde = CALLE.ventana.x - 46;
    const t0 = 1900, dura = 1700;
    const f = reducido ? 1 : Math.min(1, Math.max(0, (ms - t0) / dura));
    if (reducido || ms >= t0) {
      siluetas.push({
        receta: RECETA_DE_SILUETA[s as 'hombre' | 'mujer'],
        hoja: f < 1 ? 'walk' : 'idle',
        vista: f < 1 ? 'right' : 'down-right',
        cuadro: reducido ? 0 : f < 1 ? cuadroDeHoja('walk', ms, 8) : cuadroDeHoja('idle', ms, fps),
        x: Math.round(entre(desde, llega, suave(f))),
        y: s === 'hombre' ? 166 : 179,
      });
    }
    cuadro.ventana = { luz: luzDeVentana(plano, ms, reducido), siluetas };
    return cuadro;
  }
  adultos.forEach((s, n) => {
    // Con dos adultos, uno frente al otro: el más alto a la izquierda. Él se inclina hacia ella y ella retrocede un paso:
    // la tensión se dice con la distancia, nunca con un golpe.
    const solo = adultos.length === 1;
    const izquierda = n === 0;
    const base = solo ? CALLE.ventana.x - 2 : izquierda ? 212 : 250;
    // Él avanza (8 px) y ella retrocede (6 px) hasta quedar contra el marco: la distancia que se cierra es la amenaza.
    const deriva = reducido || solo ? 0 : izquierda ? Math.round(8 * suave(t * 1.5)) : Math.round(6 * suave((t - 0.2) * 1.6));
    siluetas.push({
      receta: RECETA_DE_SILUETA[s as 'hombre' | 'mujer'],
      hoja: 'idle',
      vista: solo ? 'down-left' : izquierda ? 'right' : 'left',
      cuadro: reducido ? 0 : cuadroDeHoja('idle', ms, fps, n * 333),
      x: Math.round(base + deriva),
      // Él, una cabeza más alto que ella (la ventana corta los pies de los dos).
      y: s === 'hombre' ? 166 : 179,
    });
  });
  if (pocas.includes('nina')) {
    // La niña juega en el suelo: solo asoma la cabeza sobre el antepecho y se mueve un poco, distinta cada vez.
    const vaiven = reducido ? 0 : Math.round(Math.sin(ms / 640) * 2);
    siluetas.push({
      receta: RECETA_DE_SILUETA.nina,
      hoja: 'idle',
      vista: reducido || Math.floor(ms / 2600) % 2 === 0 ? 'down-left' : 'left',
      cuadro: reducido ? 0 : cuadroDeHoja('idle', ms, fps),
      x: adultos.length ? 266 : 226,
      y: 204 + vaiven,
    });
  }
  cuadro.ventana = { luz: luzDeVentana(plano, ms, reducido), siluetas };
  return cuadro;
}

function calleEmergencia(plano: PlanoLeido, ms: number, reducido: boolean): CuadroDeCinematica {
  const t = reducido ? 0.5 : ms / plano.duracionMs;
  const cuadro = vacio('calle', 'noche');
  cuadro.camara = { x: reducido ? 620 : entre(650, 590, suave(t)), y: CALLE.centroY, zoom: 1 };
  // La casa sigue con la luz encendida; la vecina mira hacia ella desde el andén.
  cuadro.ventana = { luz: 1, siluetas: [] };
  const vecina = plano.personas[0] ?? VECINA;
  cuadro.actores.push({ receta: vecina, recetaDeRespaldo: VECINA, hoja: 'idle', vista: 'left',
    cuadro: reducido ? 0 : cuadroDeHoja('idle', ms, 3), x: 905, y: CALLE.anden[0] + 6 });
  if (reducido) {
    cuadro.luces = { rojo: 0.45, azul: 0.45 };
  } else {
    // Las balizas giran una vez cada 1,6 s (0,6 Hz por color, muy lejos de los 3 destellos por segundo) y entran poco a poco.
    const entrada = Math.min(1, ms / 900);
    cuadro.luces = { rojo: entrada, azul: entrada, barrido: (ms % 1600) / 1600 };
  }
  return cuadro;
}

function urgenciasLlegada(plano: PlanoLeido, ms: number, vista: VistaDeCinematica, reducido: boolean): CuadroDeCinematica {
  const cuadro = vacio('urgencias', 'noche');
  const t = reducido ? 0.5 : ms / plano.duracionMs;
  cuadro.camara = { x: reducido ? 600 : entre(585, 615, suave(t)), y: URGENCIAS.centroY, zoom: 1 };
  // La camilla cruza rápido de izquierda a derecha, con el médico delante y la enfermera empujando.
  const desde = cuadro.camara.x - vista.ancho / 2 - 140;
  const hasta = cuadro.camara.x + vista.ancho / 2 + 170;
  const inicio = 700, dura = 3600;
  const avance = reducido ? 0.5 : (ms - inicio) / dura;
  if (avance >= 0 && avance <= 1) {
    const x = Math.round(reducido ? cuadro.camara.x : entre(desde, hasta, avance));
    const y = URGENCIAS.suelo;
    const hoja = reducido ? 'idle' : 'walk';
    const fps = 13;
    cuadro.muebles.push({ clave: 'camilla', x, y: y + 4, manta: true });
    cuadro.actores.push(
      { receta: EQUIPO_DE_URGENCIAS[0], hoja, vista: 'right', cuadro: reducido ? 0 : cuadroDeHoja('walk', ms, fps), x: x + 64, y: y - 2 },
      { receta: EQUIPO_DE_URGENCIAS[1], hoja, vista: 'right', cuadro: reducido ? 0 : cuadroDeHoja('walk', ms, fps, 230), x: x - 64, y: y + 2 },
    );
  }
  // El rojo de la ambulancia que quedó afuera entra débil por la izquierda.
  const pulso = 0.25 + 0.25 * Math.sin((ms / 1800) * Math.PI * 2);
  cuadro.luces = { rojo: reducido ? 0.25 : Math.min(1, ms / 600) * pulso, azul: 0 };
  return cuadro;
}

function urgenciasFamilia(plano: PlanoLeido, ms: number, vista: VistaDeCinematica, reducido: boolean): CuadroDeCinematica {
  const cuadro = vacio('urgencias', 'noche');
  const t = reducido ? 0.5 : ms / plano.duracionMs;
  cuadro.camara = { x: reducido ? 600 : entre(615, 595, suave(t)), y: URGENCIAS.centroY, zoom: 1 };
  // Tres personas entran desde la calle (abajo, del lado de la cámara), caminan hacia la recepción y se quedan mirando.
  const abajo = cuadro.camara.y + vista.alto / 2 + 20;
  const metas: readonly (readonly [number, number])[] = [[540, 330], [592, 346], [646, 332]];
  const salidas: readonly (readonly [number, number])[] = [[430, abajo + 10], [470, abajo + 40], [520, abajo + 18]];
  const velocidad = 72;   // px por segundo: prisa, sin correr
  FAMILIA.forEach((recetaDeRespaldo, n) => {
    const receta = (plano.personas.length === FAMILIA.length ? plano.personas[n] : null) ?? recetaDeRespaldo;
    const [mx, my] = metas[n];
    const [sx, sy] = salidas[n];
    const largo = Math.hypot(mx - sx, my - sy);
    const empieza = 300 + n * 520;
    const recorrido = reducido ? largo : Math.max(0, (ms - empieza) * velocidad / 1000);
    if (recorrido < largo) {
      const f = recorrido / largo;
      cuadro.actores.push({
        receta, recetaDeRespaldo, hoja: 'walk', vista: 'up-right', cuadro: cuadroDeHoja('walk', ms, 9, n * 170),
        x: Math.round(entre(sx, mx, f)), y: Math.round(entre(sy, my, f)),
      });
      return;
    }
    // Ya llegó: mira la puerta de la sala de espera; al rato, uno busca a alguien con la mirada.
    const llego = reducido ? 0 : ms - empieza - (largo / velocidad) * 1000;
    const busca = !reducido && n === 1 && llego > 1400 && llego < 3600;
    cuadro.actores.push({
      receta, recetaDeRespaldo, hoja: 'idle', vista: busca ? 'up-left' : n === 2 && llego > 2200 ? 'left' : 'up',
      cuadro: reducido ? 0 : cuadroDeHoja('idle', ms, 4, n * 250), x: mx, y: my,
    });
  });
  return cuadro;
}

/** El cuadro de un plano a los `ms` de empezar. */
export function cuadroDelPlano(plano: PlanoLeido, ms: number, vista: VistaDeCinematica, reducido: boolean): CuadroDeCinematica {
  switch (plano.escena) {
    case 'barrio': return barrio(plano, ms, reducido);
    case 'casa-ventana': return casaVentana(plano, ms, reducido);
    case 'calle-emergencia': return calleEmergencia(plano, ms, reducido);
    case 'urgencias-llegada': return urgenciasLlegada(plano, ms, vista, reducido);
    case 'urgencias-familia': return urgenciasFamilia(plano, ms, vista, reducido);
    case 'titulo': return vacio('titulo', plano.momento);
    case 'negro':
    default: return vacio('negro', plano.momento);
  }
}

/** Las recetas del kit que un plano necesita (para pedirlas antes de empezar). */
export function recetasDelPlano(plano: PlanoLeido): string[] {
  switch (plano.escena) {
    case 'barrio': return plano.momento === 'tarde' ? [...PASEANTES] : [];
    case 'casa-ventana': return plano.siluetas.map(s => RECETA_DE_SILUETA[s]);
    case 'calle-emergencia': return [...new Set([plano.personas[0] ?? VECINA, VECINA])];
    case 'urgencias-llegada': return [...EQUIPO_DE_URGENCIAS];
    case 'urgencias-familia': {
      const escritas = plano.personas.length === FAMILIA.length ? plano.personas.filter(p => p !== null) : [];
      return [...new Set([...escritas, ...FAMILIA])];
    }
    default: return [];
  }
}

/** El decorado (y su momento) que un plano pinta: la clave con que el lienzo lo compone una sola vez. */
export function decoradoDelPlano(plano: PlanoLeido): `${Decorado}:${MomentoDeCinematica}` {
  const cuadro = cuadroDelPlano(plano, 0, { ancho: 640, alto: 268 }, true);
  return `${cuadro.decorado}:${cuadro.momento}`;
}

/**
 * Cómo se pasa de un plano al siguiente: al negro se CORTA (el silencio pesa más sin fundido); lo demás funde. Devuelve los
 * ms del fundido (0 = corte).
 */
export function fundidoHacia(siguiente: PlanoLeido): number {
  return siguiente.escena === 'negro' ? 0 : siguiente.escena === 'titulo' ? 1100 : 850;
}
