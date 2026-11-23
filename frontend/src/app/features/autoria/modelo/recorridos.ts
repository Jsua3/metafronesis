/**
 * Los recorridos completos de un caso (de la escena de inicio a una final) y qué final le toca a cada uno. Sirve para
 * decir, con las respuestas de ahora, qué finales aparecen en algún recorrido. Es la misma idea que usa el servidor al
 * publicar (`casedef/publication_rules.py`) y con los mismos topes: si el caso tiene demasiados recorridos no se afirma
 * nada (`omitido`).
 */
import type { CasoBorrador, Final, Respuesta } from './caso';
import { type ContextoCondicion, evaluarCondicion } from './condiciones';
import { contextoDeRecorrido, finalesDePlantilla } from './finales';

const MAX_RECORRIDOS = 2000;
const MAX_ESCENAS = 64;
const MAX_PASOS = 20_000;

/** Cómo quedan los hitos, los conteos y la persona al final de cada recorrido distinto. `omitido`: el tope impidió contarlos todos. */
export function contextosDeRecorridos(caso: Pick<CasoBorrador, 'escenas' | 'inicioId'>): { contextos: ContextoCondicion[]; omitido: boolean } {
  const porId = new Map(caso.escenas.map((e) => [e.id, e]));
  const inicio = caso.inicioId ? porId.get(caso.inicioId) : undefined;
  if (!inicio) return { contextos: [], omitido: false };
  const contextos: ContextoCondicion[] = [];
  const vistos = new Set<string>();
  let recorridos = 0;
  let pasos = 0;
  let omitido = false;

  const caminar = (escena: (typeof caso.escenas)[number], visitadas: Set<string>, elegidas: Respuesta[]): void => {
    if (omitido) return;
    if (escena.esFinal) {
      if (++recorridos > MAX_RECORRIDOS) {
        omitido = true;
        return;
      }
      const ctx = contextoDeRecorrido(elegidas);
      const huella = JSON.stringify([[...ctx.hitos].sort(), ctx.conteos, ctx.persona]);
      if (!vistos.has(huella)) {
        vistos.add(huella);
        contextos.push(ctx);
      }
      return;
    }
    if (visitadas.size >= MAX_ESCENAS) {
      omitido = true;
      return;
    }
    for (const r of escena.respuestas) {
      if (++pasos > MAX_PASOS) {
        omitido = true;
        return;
      }
      const destino = r.destinoId ? porId.get(r.destinoId) : undefined;
      if (!destino || visitadas.has(destino.id)) continue; // un reencuentro con una escena ya vista corta el recorrido
      caminar(destino, new Set([...visitadas, destino.id]), [...elegidas, r]);
    }
  };
  caminar(inicio, new Set([inicio.id]), []);
  return { contextos, omitido };
}

/**
 * Los finales del caso que le tocan a algún recorrido (gana el primero cuya condición se cumple, como en el juego).
 * En modo propio, si ninguno aplica vale el de plantilla; esos cuatro no se listan aquí.
 */
export function finalesAlcanzados(caso: CasoBorrador): { finales: Record<string, boolean>; omitido: boolean } {
  const { contextos, omitido } = contextosDeRecorridos(caso);
  const lista: Final[] = caso.modoFinales === 'propio' ? caso.finales : finalesDePlantilla(caso);
  const finales: Record<string, boolean> = Object.fromEntries(lista.map((f) => [f.id, false]));
  for (const ctx of contextos) {
    const toca = lista.find((f) => f.condicion === null || evaluarCondicion(f.condicion, ctx));
    if (toca) finales[toca.id] = true;
  }
  return { finales, omitido };
}
