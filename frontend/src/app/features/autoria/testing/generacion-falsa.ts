/**
 * La API de generación de casos (C1) en memoria, para probar el orquestador y las pantallas del editor sin servidor.
 * Sigue la tabla de estados del contrato: `created` → `skeleton_ready` → `scenes_ready` → `imported`, con
 * `needs_repair` (hasta dos rondas), `failed` y `cancelled`; los mismos códigos de error y los mismos mensajes fijos.
 *
 * Como `HttpClient`, cada método es frío: no hace nada hasta que alguien se suscribe, y entonces registra la llamada.
 * Una etapa se completa al instante salvo que la prueba la retenga (`retener`) para simular que sigue en curso; mientras
 * está retenida, pedir la misma parte otra vez da `GENERATION_BUSY`, y `liberar` la termina.
 *
 * `imported` no es un cuento: crea el caso (escenas, respuestas con `requires` y `reaction`, `goal`, `comments`, pistas y
 * todo marcado `aiSuggested`) y se lo entrega al `ServidorFalso` (`alImportar`), que lo vuelve su caso.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, ReplaySubject, defer, of } from 'rxjs';
import { take } from 'rxjs/operators';

import type {
  Generation as GenerationApi, GenerationErrorKind, GenerationScene as GenerationSceneApi, GenerationStartRequest, GenerationStatus,
} from '../../../core/models/generacion.model';
import type {
  CaseEditorView, DecisionEdgeState, HintEditorState, MapEditorState, NodeEditorState, ValidationIssue,
} from '../../../core/models/simulation.model';

/** El contrato generado es de solo lectura; el servidor falso sí cambia sus generaciones. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends ReadonlyArray<infer U> ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };
type Generation = Mutable<GenerationApi>;
type GenerationScene = Mutable<GenerationSceneApi>;

export type EtapaGeneracion = 'skeleton' | 'scene' | 'assemble';
export type ResultadoEnsamblado = 'imported' | 'needs_repair' | 'failed';

export interface LlamadaGeneracion {
  metodo: string;
  args: unknown[];
}

/** Los mensajes fijos del contrato (BORRADOR: pendientes de la aprobación de Psicología), por `kind` o por código. */
const MENSAJES: Record<string, string> = {
  timeout: 'La IA tardó demasiado en responder. Vuelve a intentarlo.',
  http: 'No pudimos hablar con la IA. Vuelve a intentarlo en un momento.',
  malformed: 'La IA respondió algo que no pudimos usar. Vuelve a intentarlo.',
  refusal: 'La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.',
  GENERATION_IN_PROGRESS: 'Ya tienes un caso generándose. Retómalo o cancélalo para empezar otro.',
  GENERATION_BUSY: 'Esta parte ya se está escribiendo. Espera un momento.',
  GENERATION_STATE: 'Ese paso no corresponde ahora. Vuelve a cargar el avance.',
  GENERATION_CALLS_EXHAUSTED: 'Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo.',
  AI_LIMIT_EXCEEDED: 'Llegaste al límite de casos generados por hoy.',
  NOT_FOUND: 'La generación con IA no está disponible.',
  generacionNoExiste: 'La generación no existe.',
  limiteGlobal: 'La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana.',
  lugarSinElegir: 'Elige el lugar donde pasa el caso.',
  descripcionPlana: 'La descripción debe ser texto plano, sin etiquetas, enlaces ni caracteres especiales.',
  datosPersonales: 'La descripción parece traer datos reales de una persona (correo, teléfono o número de documento). Cuéntala sin datos que identifiquen a nadie.',
  repair: 'El parámetro repair solo admite 1.',
  descripcionCorta: 'Cuéntanos un poco más: al menos 40 caracteres.',
  descripcionLarga: 'La descripción puede tener hasta 2000 caracteres.',
};

const NO_TERMINALES = ['created', 'skeleton_ready', 'scenes_ready', 'needs_repair'];

/** Segundos que una escena o el esqueleto pueden llevar en curso antes de que el servidor los dé por abandonados. */
const VENCE_EN_SEGUNDOS = 150;
/** Escenas de una misma generación que pueden estar en curso a la vez. */
const ESCENAS_SIMULTANEAS = 2;

const CORREO = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const CELULAR = /(?<!\d)(?:\+?57[\s-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
const DOCUMENTO = /(?<![\d.])(?:\d{8,10}|\d{1,3}(?:\.\d{3}){2,3})(?![\d])/;
const NO_PLANO = /[<>]|https?:\/\/|www\./i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const tieneDatosPersonales = (texto: string): boolean => CORREO.test(texto) || CELULAR.test(texto) || DOCUMENTO.test(texto);

/** Las escenas que el esqueleto falso trae: cuatro, la última es el final. */
const ESCENAS: Array<{ clave: string; titulo: string }> = [
  { clave: 'recepcion', titulo: 'Recepción' },
  { clave: 'consulta', titulo: 'Primera escucha' },
  { clave: 'orientacion', titulo: 'Orientación' },
  { clave: 'cierre', titulo: 'Cierre' },
];

interface FalloProgramado {
  estado: number;
  codigo: string;
  kind?: GenerationErrorKind;
  veces: number;
}

const clonar = <T>(valor: T): T => structuredClone(valor);

function errorHttp(
  estado: number, codigo: string, kind?: GenerationErrorKind, extra: Record<string, unknown> = {}, mensajePropio?: string,
): HttpErrorResponse {
  const mensaje = mensajePropio ?? MENSAJES[kind ?? codigo] ?? 'Falló.';
  const conKind = kind && codigo === 'AI_PROVIDER_ERROR' ? { kind } : {};
  return new HttpErrorResponse({ status: estado, error: { success: false, code: codigo, message: mensaje, ...conKind, ...extra } });
}

export class GeneracionFalsa {
  readonly llamadas: LlamadaGeneracion[] = [];
  /** Falso = apagada: todo menos `generationStatus` da 404 y el estado dice `enabled: false`. */
  habilitada = true;

  private readonly porId = new Map<string, Generation>();
  private readonly creadas: string[] = [];
  private readonly enCurso = new Set<string>();
  private readonly porRetener = new Set<string>();
  private readonly retenidas = new Map<string, ReplaySubject<void>>();
  private readonly fallos: Record<EtapaGeneracion, FalloProgramado[]> = { skeleton: [], scene: [], assemble: [] };
  private readonly ensamblados: ResultadoEnsamblado[] = [];
  private siguiente = 1;
  /** Los segundos que la prueba adelantó con `avanzarReloj`: lo único que cuenta para el vencimiento de 150 s. */
  private reloj = 0;
  /** Una marca por cambio, para que `updatedAt` distinga dos lecturas sin adelantar el reloj de la prueba. */
  private marca = 0;
  /** Cuándo (según `reloj`) empezó cada parte que sigue en curso. */
  private readonly inicios = new Map<string, number>();
  private readonly cupoDiario: number;
  private readonly cupoGlobal: number;
  private readonly creadasPorOtras: number;
  private readonly tope: number;

  /**
   * @param alImportar recibe el caso que crea un `imported` (el `ServidorFalso` lo vuelve el suyo).
   * @param nuevoId entrega ids únicos para lo que el caso trae.
   */
  constructor(
    private readonly alImportar: (caso: CaseEditorView) => void = () => undefined,
    private readonly nuevoId: () => number = (() => { let n = 9000; return () => n++; })(),
    opciones: { cupoDiario?: number; cupoGlobal?: number; creadasPorOtras?: number; tope?: number } = {},
  ) {
    this.cupoDiario = opciones.cupoDiario ?? 5;
    this.cupoGlobal = opciones.cupoGlobal ?? 30;
    this.creadasPorOtras = opciones.creadasPorOtras ?? 0;
    this.tope = opciones.tope ?? 20;
  }

  // ─── Lo que la prueba programa ──────────────────────────────────────────────

  /**
   * Que la etapa falle `veces` veces seguidas, una por llamada. `AI_REFUSED` es una negativa (`kind: refusal`);
   * `AI_PROVIDER_ERROR` pide su `kind` (`http` si no se da). Los demás códigos (`GENERATION_BUSY`…) no dejan `lastError`.
   */
  fallar(etapa: EtapaGeneracion, estado: number, codigo: string, kind?: GenerationErrorKind, veces = 1): void {
    const efectivo = codigo === 'AI_REFUSED' ? 'refusal' : codigo === 'AI_PROVIDER_ERROR' ? kind ?? 'http' : undefined;
    this.fallos[etapa].push({ estado, codigo, kind: efectivo, veces });
  }

  /** Lo que devuelven los próximos ensamblados, uno por llamada; sin más resultados, `imported`. */
  resultadoDelEnsamblado(...resultados: ResultadoEnsamblado[]): void {
    this.ensamblados.push(...resultados);
  }

  /** Que la próxima llamada a esa parte (el esqueleto, el ensamblado o una escena por su clave) se quede en curso. */
  retener(etapa: EtapaGeneracion, clave?: string): void {
    this.porRetener.add(this.parte(etapa, clave));
  }

  /** Termina la llamada retenida de esa parte. */
  liberar(etapa: EtapaGeneracion, clave?: string): void {
    const puerta = this.retenidas.get(this.parte(etapa, clave));
    if (!puerta) throw new Error(`No hay una llamada retenida en «${this.parte(etapa, clave)}».`);
    puerta.next();
  }

  /** Adelanta el reloj de la generación: una parte en curso 150 s o más se ve abandonada (`timeout`). */
  avanzarReloj(segundos: number): void {
    this.reloj += segundos;
  }

  /** La generación tal como está ahora (sin contar como llamada). */
  actual(id: string): Generation | undefined {
    const g = this.porId.get(id);
    return g ? clonar(g) : undefined;
  }

  // ─── Los siete métodos de `AuthoringApi` ────────────────────────────────────

  generationStatus(): Observable<GenerationStatus> {
    return defer(() => {
      this.llamadas.push({ metodo: 'generationStatus', args: [] });
      const enCurso = this.noTerminal();
      return of<GenerationStatus>({
        enabled: this.habilitada,
        remainingToday: Math.max(0, this.cupoDiario - this.creadas.length),
        inProgress: enCurso ? clonar(enCurso) : null,
      });
    });
  }

  startGeneration(cuerpo: GenerationStartRequest): Observable<Generation> {
    return defer(() => {
      this.llamadas.push({ metodo: 'startGeneration', args: [clonar(cuerpo)] });
      this.exigirHabilitada();
      const descripcion = cuerpo.descripcion.trim();
      if (!cuerpo.lugarId.trim()) throw this.validacion('lugarId', MENSAJES['lugarSinElegir']);
      if (descripcion.length < 40) throw this.validacion('descripcion', MENSAJES['descripcionCorta']);
      if (descripcion.length > 2000) throw this.validacion('descripcion', MENSAJES['descripcionLarga']);
      if (NO_PLANO.test(descripcion) || CONTROL.test(descripcion)) throw this.validacion('descripcion', MENSAJES['descripcionPlana']);
      if (tieneDatosPersonales(descripcion)) throw this.validacion('descripcion', MENSAJES['datosPersonales']);
      // Como el servidor: los topes del día se miran antes de crear, y «ya hay una en curso» sale al intentar crear.
      if (this.creadas.length >= this.cupoDiario) throw errorHttp(429, 'AI_LIMIT_EXCEEDED', undefined, { scope: 'daily' });
      if (this.creadasPorOtras + this.creadas.length >= this.cupoGlobal) {
        throw errorHttp(429, 'AI_LIMIT_EXCEEDED', undefined, { scope: 'daily' }, MENSAJES['limiteGlobal']);
      }
      const enCurso = this.noTerminal();
      if (enCurso) throw errorHttp(409, 'GENERATION_IN_PROGRESS', undefined, { generationId: enCurso.id });
      const id = `generacion-${this.siguiente++}`;
      const g: Generation = {
        id, lugarId: cuerpo.lugarId, descripcion, status: 'created', skeleton: null, scenes: [], repairRounds: 0, repair: null,
        lastError: null, caseVersionId: null, issues: [], callsUsed: 0, callsLimit: this.tope,
        createdAt: this.ahora(), updatedAt: this.ahora(),
      };
      this.porId.set(id, g);
      this.creadas.push(id);
      return of(this.vista(g));
    });
  }

  generation(id: string): Observable<Generation> {
    return defer(() => {
      this.llamadas.push({ metodo: 'generation', args: [id] });
      this.exigirHabilitada();
      return of(this.vista(this.buscar(id)));
    });
  }

  generationSkeleton(id: string): Observable<Generation> {
    return defer(() => {
      this.llamadas.push({ metodo: 'generationSkeleton', args: [id] });
      this.exigirHabilitada();
      const g = this.buscar(id);
      return this.correr(g, 'skeleton', null, () => g.status === 'created', () => {
        g.skeleton = {
          titulo: `Caso de ${g.lugarId}`,
          escenas: ESCENAS.map((e, i) => ({ clave: e.clave, titulo: e.titulo, final: i === ESCENAS.length - 1 })),
        };
        g.scenes = ESCENAS.map((e): GenerationScene => ({ clave: e.clave, titulo: e.titulo, state: 'pending', error: null }));
        g.status = 'skeleton_ready';
      });
    });
  }

  /** `repair` es el valor del parámetro: `true`, `'1'` o `'true'` repara; vacío o ausente no; cualquier otro es un 400. */
  generationScene(id: string, clave: string, repair: boolean | string = false): Observable<Generation> {
    return defer(() => {
      this.llamadas.push({ metodo: 'generationScene', args: [id, clave, repair] });
      this.exigirHabilitada();
      const g = this.buscar(id);
      const reparar = repair === true || repair === '1' || repair === 'true';
      if (!reparar && repair !== false && repair !== '') throw this.validacion('repair', MENSAJES['repair']);
      if (g.skeleton && !g.skeleton.escenas.some((e) => e.clave === clave)) {
        throw new HttpErrorResponse({ status: 404, error: { success: false, code: 'NOT_FOUND', message: 'La escena no existe en este caso.' } });
      }
      const escena = g.scenes.find((s) => s.clave === clave);
      const admitida = () => {
        if (!escena || escena.state === 'done' || (escena.state === 'running' && !this.vencida(g, this.parte('scene', clave)))) return false;
        return reparar ? g.status === 'needs_repair' && !!g.repair?.scenes.includes(clave) : g.status === 'skeleton_ready';
      };
      return this.correr(g, 'scene', clave, admitida, () => {
        escena!.state = 'done';
        escena!.error = null;
        if (g.scenes.every((s) => s.state === 'done')) {
          g.status = 'scenes_ready';
          g.repair = null;
        }
      });
    });
  }

  generationAssemble(id: string): Observable<Generation> {
    return defer(() => {
      this.llamadas.push({ metodo: 'generationAssemble', args: [id] });
      this.exigirHabilitada();
      const g = this.buscar(id);
      return this.correr(g, 'assemble', null, () => g.status === 'scenes_ready', () => this.ensamblar(g));
    });
  }

  cancelGeneration(id: string): Observable<Generation> {
    return defer(() => {
      this.llamadas.push({ metodo: 'cancelGeneration', args: [id] });
      this.exigirHabilitada();
      const g = this.buscar(id);
      if (!NO_TERMINALES.includes(g.status)) throw errorHttp(409, 'GENERATION_STATE');
      g.status = 'cancelled';
      g.repair = null;
      g.updatedAt = this.ahora();
      return of(this.vista(g));
    });
  }

  // ─── Por dentro ─────────────────────────────────────────────────────────────

  /**
   * Una etapa: busy → estado → tope de llamadas → fallo programado → (retención) → efecto. Cada paso que falla lo hace como
   * el servidor: sin cambiar `status` y, si fue la IA, dejando `lastError` (y la escena en `error`).
   */
  private correr(
    g: Generation, etapa: EtapaGeneracion, clave: string | null, admitida: () => boolean, efecto: () => void,
  ): Observable<Generation> {
    const parte = this.parte(etapa, clave ?? undefined);
    const llave = `${g.id}/${parte}`;
    if (this.enCurso.has(llave) && !this.vencida(g, parte)) throw errorHttp(409, 'GENERATION_BUSY');
    if (!admitida()) throw errorHttp(409, 'GENERATION_STATE');
    if (etapa === 'scene' && this.escenasEnCurso(g) >= ESCENAS_SIMULTANEAS) throw errorHttp(409, 'GENERATION_BUSY');
    if (etapa !== 'assemble' && g.callsUsed >= g.callsLimit) throw errorHttp(429, 'GENERATION_CALLS_EXHAUSTED');
    const escena = clave === null ? undefined : g.scenes.find((s) => s.clave === clave);
    const fallo = this.siguienteFallo(etapa);
    if (fallo) {
      if (fallo.kind) {
        g.callsUsed += 1;
        const error = { kind: fallo.kind, message: MENSAJES[fallo.kind] };
        g.lastError = { stage: etapa, clave, ...error };
        if (escena) {
          escena.state = 'error';
          escena.error = error;
        }
      }
      g.updatedAt = this.ahora();
      throw errorHttp(fallo.estado, fallo.codigo, fallo.kind);
    }
    if (etapa !== 'assemble') g.callsUsed += 1;
    if (escena) escena.state = 'running';
    this.enCurso.add(llave);
    this.inicios.set(llave, this.reloj);
    const terminar = (): Generation => {
      this.enCurso.delete(llave);
      this.inicios.delete(llave);
      // Una generación cancelada mientras la llamada seguía en curso no se toca: el efecto llegaría tarde.
      if (g.status === 'cancelled') return this.vista(g);
      efecto();
      if (g.lastError?.stage === etapa && g.lastError.clave === clave) g.lastError = null;
      g.updatedAt = this.ahora();
      return this.vista(g);
    };
    if (!this.porRetener.delete(parte)) return of(terminar());
    // Como el servidor real, la petición termina aunque quien la pidió ya no escuche (`switchMap`, `detener()`): el efecto
    // se suscribe a la puerta aquí, no en la suscripción del llamador, y el llamador solo recibe su resultado.
    const puerta = new ReplaySubject<void>(1);
    const resultado = new ReplaySubject<Generation>(1);
    this.retenidas.set(parte, puerta);
    puerta.pipe(take(1)).subscribe(() => {
      this.retenidas.delete(parte);
      resultado.next(terminar());
    });
    return resultado.pipe(take(1));
  }

  private ensamblar(g: Generation): void {
    const resultado = this.ensamblados.shift() ?? 'imported';
    if (resultado === 'failed') {
      g.status = 'failed';
      g.issues = [{ code: 'DSL.FORMA', severity: 'error', message: 'El documento no tiene la forma esperada.' }];
      return;
    }
    if (resultado === 'needs_repair' && g.repairRounds < 2) {
      const clave = g.skeleton!.escenas[1].clave;
      g.repairRounds += 1;
      g.repair = {
        round: g.repairRounds as 1 | 2, scenes: [clave],
        issues: { [clave]: [{ code: 'DSL.OCL-09', severity: 'error', message: 'Una respuesta no tiene reacción.' }] },
      };
      g.scenes.find((s) => s.clave === clave)!.state = 'pending';
      g.status = 'needs_repair';
      return;
    }
    // Sin rondas, el servidor importa y deja las faltas editoriales para «Por resolver».
    g.issues = resultado === 'needs_repair'
      ? [{ code: 'DSL.OCL-09', severity: 'error', message: 'Una respuesta no tiene reacción.' } satisfies ValidationIssue]
      : [];
    const caso = casoGenerado(g, this.nuevoId);
    this.alImportar(caso);
    g.caseVersionId = caso.caseVersionId;
    g.status = 'imported';
  }

  private siguienteFallo(etapa: EtapaGeneracion): FalloProgramado | undefined {
    const cola = this.fallos[etapa];
    const fallo = cola[0];
    if (!fallo) return undefined;
    if (--fallo.veces <= 0) cola.shift();
    return fallo;
  }

  private parte(etapa: EtapaGeneracion, clave?: string): string {
    return etapa === 'scene' ? `scene:${clave}` : etapa;
  }

  private noTerminal(): Generation | undefined {
    return this.creadas.map((id) => this.porId.get(id)!).find((g) => NO_TERMINALES.includes(g.status));
  }

  private buscar(id: string): Generation {
    const g = this.porId.get(id);
    if (!g) throw new HttpErrorResponse({ status: 404, error: { success: false, code: 'NOT_FOUND', message: MENSAJES['generacionNoExiste'] } });
    return g;
  }

  private exigirHabilitada(): void {
    if (!this.habilitada) throw errorHttp(404, 'NOT_FOUND');
  }

  private validacion(campo: string, mensaje: string): HttpErrorResponse {
    return new HttpErrorResponse({ status: 400, error: { success: false, code: 'VALIDATION_ERROR', message: mensaje, field: campo } });
  }

  private ahora(): string {
    return new Date(Date.UTC(2026, 10, 20, 15, 0, this.reloj + this.marca++)).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /** ¿La parte lleva en curso 150 s o más (según el reloj de la prueba)? El servidor la da entonces por abandonada. */
  private vencida(g: Generation, parte: string): boolean {
    const inicio = this.inicios.get(`${g.id}/${parte}`);
    return inicio !== undefined && this.reloj - inicio >= VENCE_EN_SEGUNDOS;
  }

  private escenasEnCurso(g: Generation): number {
    return g.scenes.filter((s) => s.state === 'running' && !this.vencida(g, this.parte('scene', s.clave))).length;
  }

  /**
   * Lo que el servidor devuelve al leer: lo guardado, salvo que una parte vencida se ve ya como error `timeout` (la escena en
   * `error`; el esqueleto, como `lastError` de etapa `skeleton`), sin cambiar lo guardado.
   */
  private vista(g: Generation): Generation {
    const copia = clonar(g);
    const error = { kind: 'timeout' as const, message: MENSAJES['timeout'] };
    for (const escena of copia.scenes) {
      if (escena.state === 'running' && this.vencida(g, this.parte('scene', escena.clave))) {
        escena.state = 'error';
        escena.error = { ...error };
      }
    }
    if (copia.status === 'created' && this.vencida(g, this.parte('skeleton'))) {
      copia.lastError = { stage: 'skeleton', clave: null, ...error };
    }
    return copia;
  }
}

/** El caso que crea un `imported`: una escena por clave del esqueleto, cada una con su guion 2.1 y todo marcado de la IA. */
function casoGenerado(g: Generation, nuevoId: () => number): CaseEditorView {
  const escenas = g.skeleton!.escenas;
  const caseVersionId = nuevoId();
  const nodes: NodeEditorState[] = escenas.map((e, i) => ({
    id: nuevoId(), key: e.clave, title: e.titulo, narrative: `Narración de ${e.titulo}.`, supportResources: [], requiredTools: [],
    sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: e.final, startNode: i === 0,
    positionX: 180 + i * 280, positionY: 180, intensity: 'MEDIUM', decisionPrompt: e.final ? '' : '¿Qué haces?', displayOrder: i,
    aiSuggested: true, goal: `Objetivo de ${e.titulo}.`,
    comments: e.final ? [] : [{
      personaje: 'persona', linea: `Vengo por ${e.titulo.toLowerCase()}.`, cuando: { inspected: 'cuaderno' }, emocion: 'cautelosa', gesto: 'se-acerca',
    }],
  }));
  const maps: MapEditorState[] = nodes.map((n) => ({
    id: nuevoId(), key: `sala-${n.key}`, title: n.title, width: 960, height: 528, theme: 'clinical-soft', spawnX: 100, spawnY: 400,
    nodeId: n.id, nodeKey: n.key,
  }));
  const hints: HintEditorState[] = maps.flatMap((m, i) => escenas[i].final ? [] : [
    { id: nuevoId(), mapId: m.id, order: 0, text: 'Mira con calma lo que hay en la sala.' },
    { id: nuevoId(), mapId: m.id, order: 1, text: 'Habla con la persona antes de decidir.' },
  ]);
  const decisiones: DecisionEdgeState[] = nodes.flatMap((origen, i) => {
    if (escenas[i].final) return [];
    const destino = nodes[i + 1];
    const base = {
      sourceNodeId: origen.id, sourceKey: origen.key, targetNodeId: destino.id, targetKey: destino.key, immediateFeedback: '',
      effects: {}, consequenceText: '', theoryBasis: '', feedbackText: '', aiSuggested: true,
    };
    return [
      {
        ...base, id: nuevoId(), optionKey: `${origen.key}-escuchar`, text: 'Te escucho, tómate tu tiempo.', responseClass: 'RECOMMENDED',
        prohibitedConduct: false, prohibitionReason: null, requires: {},
        reaction: { linea: 'Gracias por escucharme.', emocion: 'alegre', gesto: 'asiente', personaje: 'persona' },
        effects: { persona: { bond: 1, activation: 0 } },
      },
      {
        ...base, id: nuevoId(), optionKey: `${origen.key}-explorar`, text: 'Cuéntame qué ha pasado.', responseClass: 'ACCEPTABLE',
        prohibitedConduct: false, prohibitionReason: null, requires: { all: [{ talked: 'persona' }] },
        reaction: { linea: 'Está bien, sigamos.', emocion: 'neutral' },
      },
      {
        ...base, id: nuevoId(), optionKey: `${origen.key}-apurar`, text: 'Necesito que me lo digas ya.', responseClass: 'CONTRAINDICATED',
        prohibitedConduct: true, prohibitionReason: 'Presiona a la persona.', requires: {},
        reaction: { linea: 'No me presiones.', emocion: 'en-crisis', gesto: 'se-aparta', personaje: 'persona' },
      },
    ] satisfies DecisionEdgeState[];
  });
  return {
    caseVersionId, revision: 1, title: g.skeleton!.titulo, semanticVersion: '0.1.0', status: 'DRAFT', context: g.descripcion,
    learningObjectives: [], nodes, decisions: decisiones, maps, objects: [], tools: [], hints,
    characters: [{ id: nuevoId(), key: 'persona', displayName: 'Persona', roleLabel: 'Consultante', portraitKey: '', showInBrief: true, displayOrder: 0 }],
    rules: { milestones: [{ key: 'primer_contacto', label: 'Primer contacto', description: 'Se logró un primer contacto.', decisive: false }], riskLevel: null, endings: [] },
    rubrics: [], checklistCompletion: 0, publishable: false,
    checklist: { items: [], contentReview: { fulfilled: false }, strict: false },
  };
}
