/**
 * Lo que la pantalla de avance muestra de una generación, sin Angular: la lista de partes con su estado y lo que salió de cada
 * una, dónde va la alerta de un error y qué se anuncia en la región viva. Lo consume `AvanceComponent`.
 */
import type { Generation, GenerationErrorKind } from '../../../../core/models/generacion.model';
import type { ValidationIssue } from '../../../../core/models/simulation.model';
import type { ErrorVisible, EtapaVisible } from '../../generacion/generacion.service';

export type EstadoParte = 'hecha' | 'en-curso' | 'error' | 'pendiente';
export type TipoParte = 'esqueleto' | 'escenas-por-saber' | 'escena' | 'reparacion' | 'reglas';

/** Una parte de la generación tal como la ve la docente: qué es, cómo va y qué salió de ella. */
export interface Parte {
  /** `esqueleto`, `escenas`, `escena-<clave>`, `reparacion-<ronda>` o `reglas`. */
  clave: string;
  tipo: TipoParte;
  nombre: string;
  estado: EstadoParte;
  /** Solo las escenas: si el esqueleto la da como final. */
  final: boolean;
  /** Lo que salió o lo que pasó, en una línea. */
  detalle: string | null;
  /** Faltas en palabras (el `message` del servidor, sin su código); `detalle` las presenta. */
  faltas: string[];
}

export interface EntradaPartes {
  g: Generation | null;
  error: ErrorVisible | null;
  etapa: EtapaVisible | null;
  trabajando: boolean;
  /** La parte que la docente mandó reintentar (se ve en curso al instante). */
  reintentando: string | null;
  /** Las escenas de cada ronda de corrección que la pantalla vio: al terminar la ronda el servidor ya no las trae. */
  rondasVistas: Record<number, readonly string[]>;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
/** «1», «1 y 2», «1, 2 y 3». */
const enumerar = (cosas: string[]) => (cosas.length < 2 ? cosas.join('') : `${cosas.slice(0, -1).join(', ')} y ${cosas.at(-1)}`);
const escenas = (n: number) => plural(n, 'escena', 'escenas');

/** Los mensajes de las faltas, sin repetir: una que aparece tres veces se dice una vez con «(3 veces)». */
function faltasEnPalabras(faltas: readonly ValidationIssue[]): string[] {
  const cuenta = new Map<string, number>();
  for (const f of faltas) cuenta.set(f.message, (cuenta.get(f.message) ?? 0) + 1);
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
  return [...cuenta].map(([mensaje, n]) => (n > 1 ? `${mensaje} (${n} veces)` : mensaje));
}

const nueva = (p: Omit<Parte, 'final' | 'detalle' | 'faltas'> & Partial<Parte>): Parte => ({ final: false, detalle: null, faltas: [], ...p });

/**
 * Las partes, en orden: el esqueleto, las escenas (o «Las escenas», pendiente, mientras no hay esqueleto), una por ronda de
 * corrección y la revisión de las reglas. Sin generación ni error (leyendo el avance), ninguna.
 */
export function partesDeLaGeneracion({ g, error, etapa, trabajando, reintentando, rondasVistas }: EntradaPartes): Parte[] {
  if (!g && !error) return [];
  // Lo que se está pidiendo ahora mismo; con un error a la vista, nada.
  const activa = trabajando && !error;
  const reintento = activa ? reintentando : null;
  const lote = activa && (etapa?.tipo === 'escena' || etapa?.tipo === 'reparando') ? etapa.claves : [];
  const partes: Parte[] = [];

  // BORRADOR: textos nuevos de esta lista, pendientes de la aprobación de Psicología
  const esqueleto: EstadoParte = g && g.status !== 'created' ? 'hecha'
    : reintento === 'esqueleto' || (activa && (etapa?.tipo === 'esqueleto' || !!g)) ? 'en-curso'
    : error && (error.parte === 'esqueleto' || !g) ? 'error'
    : 'pendiente';
  const totalEscenas = g?.scenes.length ?? 0;
  const finales = g?.skeleton?.escenas.filter((e) => e.final).length ?? 0;
  partes.push(nueva({
    clave: 'esqueleto', tipo: 'esqueleto', nombre: 'El esqueleto del caso', estado: esqueleto,
    // El título ya se ve arriba, en grande: aquí basta con decir qué trajo.
    detalle: g?.skeleton ? `Trajo el título y ${escenas(totalEscenas)}${finales ? `, ${plural(finales, 'final', 'finales')}` : ''}.` : null,
  }));

  if (!g || totalEscenas === 0) {
    partes.push(nueva({
      clave: 'escenas', tipo: 'escenas-por-saber', nombre: 'Las escenas', estado: 'pendiente',
      detalle: 'Aparecerán aquí en cuanto el esqueleto esté listo.',
    }));
  } else {
    const corrigiendo = g.status === 'needs_repair';
    g.scenes.forEach((s, i) => {
      const clave = `escena-${s.clave}`;
      const conLaAlerta = error?.parte === 'escena' && error.clave === s.clave;
      // En una ronda de corrección todas las escenas ya se escribieron una vez: la corrección es su propia parte.
      const estado: EstadoParte = corrigiendo || s.state === 'done' ? 'hecha'
        : reintento === clave || lote.includes(s.clave) ? 'en-curso'
        : s.state === 'error' || conLaAlerta ? 'error'
        : s.state === 'running' ? 'en-curso' : 'pendiente';
      // Una escena con error que no trae la alerta dice por qué y cuándo se vuelve a pedir: mientras se escriben otras, se
      // ofrece después; con la alerta en otra parte, «Reintentar esta parte» la pide también.
      const cuando = activa ? ' Podrás reintentarla cuando terminen las demás.' : error ? ' Se vuelve a pedir con «Reintentar esta parte».' : '';
      partes.push(nueva({
        clave, tipo: 'escena', nombre: `Escena ${i + 1} de ${totalEscenas}: ${s.titulo}`, estado,
        final: g.skeleton?.escenas.find((e) => e.clave === s.clave)?.final ?? false,
        detalle: estado === 'error' && s.error && !conLaAlerta ? `${s.error.message}${cuando}` : null,
      }));
    });
  }

  for (let ronda = 1; g && ronda <= g.repairRounds; ronda++) {
    const actual = g.status === 'needs_repair' && ronda === g.repairRounds;
    const claves = actual ? g.repair?.scenes ?? [] : rondasVistas[ronda] ?? [];
    const enRonda = g.scenes.filter((s) => claves.includes(s.clave));
    const clave = `reparacion-${ronda}`;
    let estado: EstadoParte = 'hecha';
    if (actual) {
      const fallo = (error?.parte === 'escena' && (!error.clave || claves.includes(error.clave))) || enRonda.some((s) => s.state === 'error');
      estado = reintento === clave || (activa && etapa?.tipo === 'reparando') ? 'en-curso'
        : fallo ? 'error'
        : activa || enRonda.some((s) => s.state === 'running') ? 'en-curso' : 'pendiente';
    }
    const titulos = enRonda.map((s) => `«${s.titulo}»`);
    partes.push(nueva({
      clave, tipo: 'reparacion', estado,
      nombre: claves.length ? `Corrección de ${escenas(claves.length)} (ronda ${ronda} de 2)` : `Corrección de escenas (ronda ${ronda} de 2)`,
      detalle: actual && titulos.length ? `La revisión pidió corregir ${enumerar(titulos)}.` : null,
      faltas: actual ? faltasEnPalabras(claves.flatMap((c) => g.repair?.issues[c] ?? [])) : [],
    }));
  }

  // La revisión solo puede estar en curso con la generación lista para revisarse: un reintento o una etapa de revisión que
  // ya terminó en `needs_repair` no la dejan «Revisándose» junto a la corrección.
  const revisable = g?.status === 'scenes_ready';
  const reglas: EstadoParte = g?.status === 'imported' ? 'hecha'
    : g?.status === 'failed' ? 'error'
    : revisable && (reintento === 'reglas' || (activa && etapa?.tipo === 'reglas')) ? 'en-curso'
    : error?.parte === 'ensamblado' ? 'error'
    : 'pendiente';
  const terminada = g?.status === 'imported' || g?.status === 'failed';
  const n = g?.issues.length ?? 0;
  partes.push(nueva({
    clave: 'reglas', tipo: 'reglas', nombre: 'Revisión de las reglas del caso', estado: reglas,
    faltas: terminada ? faltasEnPalabras(g.issues) : [],
    detalle: g?.status === 'imported' ? (n ? `${plural(n, 'cosa', 'cosas')} por resolver en el editor:` : 'Sin faltas.')
      : g?.status === 'failed' ? (n ? 'Estas faltas impidieron abrir el caso:' : 'El caso no pasó la revisión de las reglas.')
      : null,
  }));
  return partes;
}

/** Dónde va la alerta de un error: la clave de la parte que falló, o `null` si no se sabe cuál (va arriba, en el resumen). */
export function parteConError(g: Generation | null, error: ErrorVisible | null, partes: Parte[]): string | null {
  if (!error || error.fatal) return null;
  const clave = error.parte === 'esqueleto' ? 'esqueleto'
    : error.parte === 'ensamblado' ? 'reglas'
    : g?.status === 'needs_repair' ? `reparacion-${g.repairRounds}`
    : error.clave ? `escena-${error.clave}` : null;
  if (clave && partes.some((p) => p.clave === clave)) return clave;
  return partes.find((p) => p.estado === 'error')?.clave ?? null;
}

/** ¿La IA se negó a escribir la parte que falló (`refusal`)? Lo dice el servidor en la escena o en `lastError` de esa etapa. */
export function esNegativa(g: Generation | null, error: ErrorVisible | null): boolean {
  if (!error || !g) return false;
  const etapaDelError = { esqueleto: 'skeleton', escena: 'scene', ensamblado: 'assemble' }[error.parte];
  const deLaEscena = error.clave ? g.scenes.find((s) => s.clave === error.clave)?.error?.kind : undefined;
  const kind: GenerationErrorKind | undefined = deLaEscena ?? (g.lastError?.stage === etapaDelError ? g.lastError.kind : undefined);
  return kind === 'refusal';
}

/** Lo que se está haciendo ahora, en palabras, para la región viva: depende de qué partes están en curso, nunca del tiempo. */
export function anuncioDeLasPartes(g: Generation, partes: Parte[]): string {
  const enCurso = partes.filter((p) => p.estado === 'en-curso');
  const primera = enCurso[0];
  // BORRADOR: textos nuevos, pendientes de la aprobación de Psicología
  switch (primera?.tipo) {
    case 'esqueleto': return 'Armando el esqueleto del caso';
    case 'reglas': return 'Revisando las reglas del caso';
    case 'reparacion': return primera.nombre.replace(/^Corrección de/, 'Corrigiendo');
    case 'escena': {
      const total = g.scenes.length;
      const escritas = enCurso.filter((p) => p.tipo === 'escena').map((p) => g.scenes.findIndex((s) => `escena-${s.clave}` === p.clave));
      const numeros = enumerar(escritas.map((i) => String(i + 1)));
      // Con varias a la vez no se leen sus títulos (están en la lista): el anuncio queda corto.
      return escritas.length > 1 ? `Escribiendo las escenas ${numeros} de ${total}` : `Escribiendo la escena ${numeros} de ${total}: ${g.scenes[escritas[0]].titulo}`;
    }
    default: return '';
  }
}
