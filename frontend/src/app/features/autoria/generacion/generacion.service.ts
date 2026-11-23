/**
 * El orquestador cliente de la generación de un caso: una máquina de estados sobre la API de generación (C1).
 *
 * `continuar(id)` relee la generación y pide la etapa que toca hasta un estado terminal o hasta un error que debe decidir la
 * docente: `created` → esqueleto; `skeleton_ready` → las escenas pendientes o con error, de a `ESCENAS_A_LA_VEZ`;
 * `scenes_ready` → ensamblar; `needs_repair` → las escenas de `repair.scenes` con `repair=1`, de a dos; `imported`, `failed`
 * y `cancelled` terminan. Lo que está en curso en otra pestaña (una escena `running`, un `GENERATION_BUSY`) no se pide otra
 * vez: se relee cada `ESPERA_SI_OCUPADA_MS` y, tras `RELECTURAS_SIN_CAMBIO` relecturas sin cambio, pasa a un error con
 * «Reintentar esta parte», para no dejar nunca un giro eterno.
 *
 * Una parte que ya está en `error` al entrar (una escena o el esqueleto vencidos a los 150 s, un fallo de una visita anterior) no
 * se vuelve a pedir sola: se ofrece con el mensaje que trae («Reintentar esta parte»). El reintento automático único vale solo
 * para un fallo de la propia petición durante la corrida.
 *
 * No escribe `localStorage`: retomar una generación sale de `inProgress` en `estado()`, que es la fuente de verdad.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

import type {
  Generation, GenerationErrorKind, GenerationStatus,
} from '../../../core/models/generacion.model';
import { AutoriaApiService } from '../api/autoria-api.service';

/** Cuántas escenas se piden a la vez (si la medición de C1, H8, lo refuta, pasa a 1). */
export const ESCENAS_A_LA_VEZ = 2;
/** Lo que se espera antes de releer cuando otra pestaña está haciendo esa parte. */
export const ESPERA_SI_OCUPADA_MS = 5000;
/** Relecturas seguidas sin ningún cambio antes de rendirse (36 × 5 s = 3 min, más que los 150 s en que el servidor da una escena por abandonada). */
export const RELECTURAS_SIN_CAMBIO = 36;

/**
 * Lo que se está pidiendo ahora. En `escena` y `reparando`, `claves` son todas las escenas del lote que se pidió a la vez (hasta
 * `ESCENAS_A_LA_VEZ`): la pantalla marca en curso cada una, no solo la primera.
 */
export type EtapaVisible =
  | { tipo: 'esqueleto' }
  | { tipo: 'escena'; n: number; total: number; titulo: string; claves: string[] }
  | { tipo: 'reglas' }
  | { tipo: 'reparando'; ronda: number; titulo: string; claves: string[] }
  | { tipo: 'listo'; caseVersionId: number }
  | { tipo: 'fallo' };

export interface ErrorVisible {
  mensaje: string;
  reintentable: boolean;
  parte: 'esqueleto' | 'escena' | 'ensamblado';
  clave?: string;
  /** No hay nada que reintentar (la generación no existe o la función está apagada): solo queda volver a crear un caso. */
  fatal?: boolean;
}

/** Por qué no pudo empezar una generación (P10): cada rama tiene su manejo en la pantalla. */
export type TipoErrorDeInicio = 'campo' | 'en-curso' | 'limite' | 'apagado' | 'otro';

export class ErrorDeInicio extends Error {
  constructor(
    readonly tipo: TipoErrorDeInicio,
    readonly mensaje: string,
    /** El campo del formulario al que pertenece el mensaje (`tipo: 'campo'`). */
    readonly campo?: 'lugarId' | 'descripcion',
    /** La generación que ya estaba en curso, para retomarla (`tipo: 'en-curso'`). */
    readonly generationId?: string,
  ) {
    super(mensaje);
  }
}

// BORRADOR: textos de la tabla «Mensajes fijos» del contrato de C1, pendientes de la aprobación de Psicología.
const MENSAJES: Record<string, string> = {
  timeout: 'La IA tardó demasiado en responder. Vuelve a intentarlo.',
  http: 'No pudimos hablar con la IA. Vuelve a intentarlo en un momento.',
  malformed: 'La IA respondió algo que no pudimos usar. Vuelve a intentarlo.',
  refusal: 'La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.',
  GENERATION_IN_PROGRESS: 'Ya tienes un caso generándose. Retómalo o cancélalo para empezar otro.',
  GENERATION_CALLS_EXHAUSTED: 'Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo.',
  AI_LIMIT_EXCEEDED: 'Llegaste al límite de casos generados por hoy.',
  NOT_FOUND: 'La generación con IA no está disponible.',
};
// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
const MENSAJE_TARDA_MUCHO = 'Esta parte tarda más de lo normal en escribirse. Vuelve a intentarlo.';

type Parte = ErrorVisible['parte'];

/** Lo que pasó al pedir una parte: salió bien, hay que esperar y releer, o hay un error que decide la docente. */
type Paso =
  | { tipo: 'avanzo'; g: Generation }
  | { tipo: 'espera'; dormir: boolean }
  | { tipo: 'error'; error: ErrorVisible };

@Injectable({ providedIn: 'root' })
export class GeneracionService {
  private readonly autoria = inject(AutoriaApiService);

  readonly generacion = signal<Generation | null>(null);
  readonly etapa = signal<EtapaVisible | null>(null);
  readonly error = signal<ErrorVisible | null>(null);
  readonly trabajando = signal(false);

  /** Cada corrida (y `detener`) la incrementa: una corrida vieja deja de pedir y de escribir al ver que ya no es la vigente. */
  private vuelta = 0;
  /** La última generación que se corrió: `reintentar` la usa aunque la primera lectura haya fallado y no haya `generacion()`. */
  private ultimoId: string | null = null;
  private espera: { temporizador: ReturnType<typeof setTimeout>; despertar: () => void } | null = null;

  estado(): Promise<GenerationStatus> {
    return firstValueFrom(this.autoria.api.generationStatus());
  }

  /** Crea la generación (sin pedir ninguna etapa) y devuelve su id. Falla con `ErrorDeInicio`. */
  async empezar(lugarId: string, descripcion: string): Promise<string> {
    try {
      const g = await firstValueFrom(this.autoria.api.startGeneration({ lugarId, descripcion }));
      this.generacion.set(g);
      this.error.set(null);
      this.etapa.set(null);
      return g.id;
    } catch (e) {
      throw this.errorDeInicio(e);
    }
  }

  continuar(id: string): Promise<void> {
    return this.correr(id, false);
  }

  /** Vuelve a pedir la parte que falló; también las que figuran en curso, por si quedaron abandonadas. */
  async reintentar(): Promise<void> {
    const id = this.ultimoId ?? this.generacion()?.id;
    const error = this.error();
    if (!id || (error && !error.reintentable)) return;
    await this.correr(id, true);
  }

  /** Cancela la generación dada o la actual y deja de pedir etapas. */
  async cancelar(id?: string): Promise<void> {
    const objetivo = id ?? this.generacion()?.id;
    if (!objetivo) return;
    this.detener();
    try {
      await firstValueFrom(this.autoria.api.cancelGeneration(objetivo));
    } catch (e) {
      // Ya terminada o inexistente: para la docente da igual, ya no hay nada que cancelar.
      if (!(e instanceof HttpErrorResponse) || (e.status !== 409 && e.status !== 404)) throw e;
    }
    this.generacion.set(null);
    this.etapa.set(null);
    this.error.set(null);
  }

  /** Al salir de la pantalla: no se piden etapas nuevas y lo que siga en vuelo ya no se refleja. */
  detener(): void {
    this.vuelta++;
    this.despertar();
    this.trabajando.set(false);
  }

  // ─── Por dentro ─────────────────────────────────────────────────────────────

  private async correr(id: string, forzar: boolean): Promise<void> {
    const mia = ++this.vuelta;
    this.ultimoId = id;
    this.despertar();
    this.trabajando.set(true);
    this.error.set(null);
    let ultima: Generation | null = null;
    try {
      let g = await this.leer(id);
      ultima = g;
      let sinCambio = 0;
      // Una parte que el servidor marca en error (al entrar o en cualquier relectura: por ejemplo, vencida en otra pestaña
      // mientras esta esperaba) se ofrece y no se pide: pedirla otra vez es una llamada a la IA con costo, y eso solo lo
      // dispara «Reintentar». Ese permiso alcanza para una petición aceptada; después, lo que vuelva a fallar se ofrece.
      let permitido = forzar;
      while (this.vigente(mia)) {
        ultima = g;
        this.generacion.set(g);
        if (this.terminal(g)) return;
        const paso = await this.paso(g, permitido, !permitido, mia);
        if (!this.vigente(mia)) return;
        if (paso.tipo === 'error') {
          // Se relee antes de publicar: la pantalla debe mostrar el estado de cada escena tal como quedó, no el de antes de pedirla.
          await this.releerSiSePuede(id, mia);
          if (this.vigente(mia)) this.error.set(paso.error);
          return;
        }
        if (paso.tipo === 'avanzo') {
          sinCambio = 0;
          permitido = false;
          g = paso.g;
          continue;
        }
        if (sinCambio >= RELECTURAS_SIN_CAMBIO) {
          this.error.set(this.errorDeEspera(g));
          return;
        }
        if (paso.dormir) await this.dormir(ESPERA_SI_OCUPADA_MS);
        if (!this.vigente(mia)) return;
        const releida = await this.leer(id);
        sinCambio = this.firma(releida) === this.firma(g) ? sinCambio + 1 : 0;
        g = releida;
      }
    } catch (e) {
      if (this.vigente(mia)) {
        await this.releerSiSePuede(id, mia);
        if (this.vigente(mia)) this.error.set(this.errorVisible(e, ultima ? this.parteEnCurso(ultima) : 'esqueleto'));
      }
    } finally {
      if (this.vigente(mia)) this.trabajando.set(false);
    }
  }

  /** Marca la etapa visible de un estado terminal. Devuelve si lo era. */
  private terminal(g: Generation): boolean {
    switch (g.status) {
      case 'imported':
        this.etapa.set({ tipo: 'listo', caseVersionId: g.caseVersionId ?? 0 });
        return true;
      case 'failed':
        this.etapa.set({ tipo: 'fallo' });
        return true;
      case 'cancelled':
        this.generacion.set(null);
        this.etapa.set(null);
        return true;
      default:
        return false;
    }
  }

  private paso(g: Generation, forzar: boolean, ofrecer: boolean, mia: number): Promise<Paso> {
    switch (g.status) {
      case 'created':
        if (ofrecer && g.lastError?.stage === 'skeleton') return Promise.resolve(this.ofrecerError(g.lastError.message, 'esqueleto'));
        this.etapa.set({ tipo: 'esqueleto' });
        return this.pedir(() => this.autoria.api.generationSkeleton(g.id), 'esqueleto', mia);
      case 'scenes_ready':
        if (ofrecer && g.lastError?.stage === 'assemble') return Promise.resolve(this.ofrecerError(g.lastError.message, 'ensamblado'));
        this.etapa.set({ tipo: 'reglas' });
        return this.pedir(() => this.autoria.api.generationAssemble(g.id), 'ensamblado', mia);
      case 'skeleton_ready':
        return this.escenas(g, false, forzar, mia);
      case 'needs_repair':
        return this.escenas(g, true, forzar, mia);
      default:
        return Promise.resolve({ tipo: 'espera', dormir: false });
    }
  }

  /** Las escenas que faltan (o las que hay que reparar), de a `ESCENAS_A_LA_VEZ`. Una `running` no se pide otra vez. */
  private async escenas(g: Generation, reparar: boolean, forzar: boolean, mia: number): Promise<Paso> {
    const enAlcance = (clave: string) => !reparar || (g.repair?.scenes.includes(clave) ?? false);
    // Una escena en `error` no se pide sola (se ofrece); solo «Reintentar esta parte» la pide, y también las que figuran en curso.
    const pedibles = g.scenes.filter((s) => enAlcance(s.clave) && (s.state === 'pending' || (forzar && (s.state === 'error' || s.state === 'running'))));
    if (pedibles.length === 0) {
      // Nada que pedir: o sigue en curso en otra pestaña (se espera), o quedó una en error (se ofrece), o el estado está por cambiar (se relee ya).
      if (g.scenes.some((s) => s.state === 'running')) return { tipo: 'espera', dormir: true };
      const rota = g.scenes.find((s) => enAlcance(s.clave) && s.state === 'error');
      if (rota) return this.ofrecerError(rota.error?.message ?? MENSAJES[rota.error?.kind ?? 'http'] ?? MENSAJES['http'], 'escena', rota.clave);
      return { tipo: 'espera', dormir: false };
    }
    const lote = pedibles.slice(0, ESCENAS_A_LA_VEZ);
    const hechas = g.scenes.filter((s) => s.state === 'done').length;
    const claves = lote.map((s) => s.clave);
    this.etapa.set(reparar
      ? { tipo: 'reparando', ronda: g.repair?.round ?? g.repairRounds, titulo: lote[0].titulo, claves }
      : { tipo: 'escena', n: Math.min(hechas + 1, g.scenes.length), total: g.scenes.length, titulo: lote[0].titulo, claves });

    const pasos = await Promise.all(lote.map((s) =>
      this.pedir(() => this.autoria.api.generationScene(g.id, s.clave, reparar), 'escena', mia, s.clave)));
    const conError = pasos.find((p): p is Extract<Paso, { tipo: 'error' }> => p.tipo === 'error');
    if (conError) return conError;
    // Si la docente ya salió de la pantalla, no se relee: la corrida se termina en la vuelta siguiente.
    if (!this.vigente(mia)) return { tipo: 'espera', dormir: false };
    if (pasos.some((p) => p.tipo === 'avanzo')) return { tipo: 'avanzo', g: await this.leer(g.id) };
    return { tipo: 'espera', dormir: pasos.some((p) => p.tipo === 'espera' && p.dormir) };
  }

  /**
   * Pide una parte. Un 502 (o un corte de red) se reintenta una vez sola; una negativa no se reintenta; `GENERATION_BUSY` y
   * `GENERATION_STATE` piden esperar y releer; el tope de llamadas termina sin reintento.
   */
  private async pedir(accion: () => Observable<Generation>, parte: Parte, mia: number, clave?: string): Promise<Paso> {
    for (let intento = 1; ; intento++) {
      try {
        return { tipo: 'avanzo', g: await firstValueFrom(accion()) };
      } catch (e) {
        if (!this.vigente(mia)) return { tipo: 'espera', dormir: false };
        if (!(e instanceof HttpErrorResponse)) throw e;
        const codigo = this.cuerpo(e)['code'];
        if (e.status === 409 && codigo === 'GENERATION_BUSY') return { tipo: 'espera', dormir: true };
        if (e.status === 409 && codigo === 'GENERATION_STATE') return { tipo: 'espera', dormir: false };
        const transitorio = e.status === 0 || (e.status === 502 && codigo === 'AI_PROVIDER_ERROR');
        if (transitorio && intento === 1) continue;
        return { tipo: 'error', error: this.errorVisible(e, parte, clave) };
      }
    }
  }

  /** Una parte que ya estaba en error: se ofrece con el mensaje que trae el servidor. */
  private ofrecerError(mensaje: string, parte: Parte, clave?: string): Paso {
    return { tipo: 'error', error: { mensaje, reintentable: true, parte, ...(clave ? { clave } : {}) } };
  }

  private async leer(id: string): Promise<Generation> {
    return firstValueFrom(this.autoria.api.generation(id));
  }

  private vigente(mia: number): boolean {
    return this.vuelta === mia;
  }

  /** Lo que identifica el avance de una generación: si no cambia entre dos lecturas, nadie la está moviendo. */
  private firma(g: Generation): string {
    return `${g.status}|${g.updatedAt}|${g.scenes.map((s) => s.state).join(',')}`;
  }

  /** La parte que se estaba pidiendo según el estado de la generación. */
  private parteEnCurso(g: Generation): Parte {
    return g.status === 'created' ? 'esqueleto' : g.status === 'scenes_ready' ? 'ensamblado' : 'escena';
  }

  /** Relee la generación para que la pantalla no muestre estados viejos junto a un error; si la relectura falla, no importa. */
  private async releerSiSePuede(id: string, mia: number): Promise<void> {
    try {
      const g = await this.leer(id);
      if (this.vigente(mia)) this.generacion.set(g);
    } catch {
      // el error que ya se tiene es el que se muestra
    }
  }

  private errorDeEspera(g: Generation): ErrorVisible {
    const parte = this.parteEnCurso(g);
    const clave = parte === 'escena' ? g.scenes.find((s) => s.state === 'running')?.clave : undefined;
    return { mensaje: MENSAJE_TARDA_MUCHO, reintentable: true, parte, ...(clave ? { clave } : {}) };
  }

  private cuerpo(e: HttpErrorResponse): Record<string, unknown> {
    return e.error && typeof e.error === 'object' ? e.error as Record<string, unknown> : {};
  }

  /** El error que ve la docente: el `message` de la respuesta si lo trae, si no el fijo de su `kind` o código. */
  private errorVisible(e: unknown, parte: Parte, clave?: string): ErrorVisible {
    const h = e instanceof HttpErrorResponse ? e : null;
    const cuerpo = h ? this.cuerpo(h) : {};
    const codigo = cuerpo['code'] as string | undefined;
    const kind = (cuerpo['kind'] as GenerationErrorKind | undefined) ?? (codigo === 'AI_REFUSED' ? 'refusal' : 'http');
    const agotado = h?.status === 429 && codigo === 'GENERATION_CALLS_EXHAUSTED';
    // 404: la generación no existe o la función se apagó. No hay nada que reintentar; el servidor dice cuál de las dos.
    const fatal = h?.status === 404;
    const fijo = agotado ? MENSAJES['GENERATION_CALLS_EXHAUSTED'] : fatal ? MENSAJES['NOT_FOUND'] : MENSAJES[kind] ?? MENSAJES['http'];
    const mensaje = typeof cuerpo['message'] === 'string' && cuerpo['message'] ? cuerpo['message'] : fijo;
    return { mensaje, reintentable: !agotado && !fatal, ...(fatal ? { fatal: true } : {}), parte, ...(clave ? { clave } : {}) };
  }

  private errorDeInicio(e: unknown): ErrorDeInicio {
    if (!(e instanceof HttpErrorResponse)) return new ErrorDeInicio('otro', MENSAJES['http']);
    const cuerpo = this.cuerpo(e);
    const codigo = cuerpo['code'] as string | undefined;
    const texto = (fijo: string) => (typeof cuerpo['message'] === 'string' && cuerpo['message'] ? cuerpo['message'] : fijo);
    if (e.status === 400 && (cuerpo['field'] === 'lugarId' || cuerpo['field'] === 'descripcion')) {
      return new ErrorDeInicio('campo', texto(MENSAJES['http']), cuerpo['field']);
    }
    if (e.status === 409 && codigo === 'GENERATION_IN_PROGRESS') {
      const id = typeof cuerpo['generationId'] === 'string' ? cuerpo['generationId'] : undefined;
      return new ErrorDeInicio('en-curso', texto(MENSAJES['GENERATION_IN_PROGRESS']), undefined, id);
    }
    if (e.status === 429 && codigo === 'AI_LIMIT_EXCEEDED') return new ErrorDeInicio('limite', texto(MENSAJES['AI_LIMIT_EXCEEDED']));
    if (e.status === 404) return new ErrorDeInicio('apagado', texto(MENSAJES['NOT_FOUND']));
    return new ErrorDeInicio('otro', texto(MENSAJES['http']));
  }

  private dormir(ms: number): Promise<void> {
    return new Promise((resolver) => {
      const temporizador = setTimeout(() => {
        this.espera = null;
        resolver();
      }, ms);
      this.espera = { temporizador, despertar: resolver };
    });
  }

  /** Despierta una espera en curso (al detener o relanzar), para que su corrida vea que ya no es la vigente y termine. */
  private despertar(): void {
    if (!this.espera) return;
    clearTimeout(this.espera.temporizador);
    this.espera.despertar();
    this.espera = null;
  }
}
