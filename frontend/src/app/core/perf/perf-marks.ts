/**
 * Instrumentación del cliente para RNF-05 (plan visual F9-3): cuánto tarda la interfaz en responder. Dos medidas:
 * `decision-to-scene` (decisión elegida → la escena nueva pinta su primer cuadro) e `interaction-to-response`
 * (interacción → siguiente pintado con la respuesta visible). Es la MITAD CLIENTE de lo que pide el requisito; el
 * umbral y la medición en el servidor son del plan estructural.
 *
 * Medir nunca puede romper la pantalla: todo va dentro de `try`, sin reloj no se mide y las muestras se acotan.
 * El resumen (cuenta, p50 y p95 por medida) se expone en `window.__siepPerf()` para que el e2e lo lea.
 */
export const PERF_MAX_SAMPLES = 200;
/** Una medida que tarda más no es una respuesta de la interfaz: se descarta. */
const PERF_STALE_MS = 30_000;

const starts = new Map<string, number>();
const samples = new Map<string, number[]>();

export interface PerfSummary { count: number; p50: number | null; p95: number | null }

/** Percentil por el método del vecino más cercano; `null` sin datos. No modifica la lista recibida. */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

/** Empieza (o reinicia) una medida: una decisión que no cambió de escena no se arrastra a la siguiente. */
export function perfStart(name: string): void {
  try {
    starts.set(name, performance.now());
  } catch {
    starts.delete(name);
  }
}

/** Termina una medida y devuelve su duración en ms, o `null` si no había empezado o no se pudo medir. */
export function perfEnd(name: string): number | null {
  try {
    const start = starts.get(name);
    if (start === undefined) return null;
    starts.delete(name);
    const duration = performance.now() - start;
    if (!Number.isFinite(duration) || duration < 0 || duration > PERF_STALE_MS) return null;
    const list = samples.get(name) ?? [];
    list.push(duration);
    if (list.length > PERF_MAX_SAMPLES) list.splice(0, list.length - PERF_MAX_SAMPLES);
    samples.set(name, list);
    return duration;
  } catch {
    return null;
  }
}

/** Descarta una medida empezada que ya no va a terminar (la interacción o la decisión no llegó a mostrar nada). */
export function perfCancel(name: string): void {
  starts.delete(name);
}

/**
 * Termina la medida en el SEGUNDO fotograma desde ahora: se llama cuando la respuesta ya está puesta en la pantalla
 * (la señal que la muestra ya cambió) y el primer fotograma aún pinta lo de antes. La duración cuenta desde el
 * `perfStart`, así que incluye lo que tardó la red. Sin un `perfStart` previo no mide nada: un diálogo que no nació de
 * una interacción no cuenta.
 */
export function perfEndNextPaint(name: string): void {
  if (!starts.has(name) || typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(() => requestAnimationFrame(() => { perfEnd(name); }));
}

export function perfSummary(): Record<string, PerfSummary> {
  const out: Record<string, PerfSummary> = {};
  for (const [name, list] of samples) out[name] = { count: list.length, p50: percentile(list, 50), p95: percentile(list, 95) };
  return out;
}

export function perfReset(): void {
  starts.clear();
  samples.clear();
}

if (typeof window !== 'undefined') {
  (window as unknown as { __siepPerf?: () => Record<string, PerfSummary> }).__siepPerf = perfSummary;
}
