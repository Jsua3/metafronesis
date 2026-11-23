import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AutoriaApiService } from '../api/autoria-api.service';
import { CasoStore } from '../estado/caso.store';
import type { CasoBorrador } from '../modelo/caso';
import { type Cambio, MENSAJE_PROPUESTA_INVALIDA, validarPropuesta } from './propuestas';

/**
 * Cómo está el asistente para quien edita: `listo` (puede pedir), `apagado` (el programa no lo tiene encendido o no tiene
 * clave), `sin-cupo` (ya usó su ayuda de hoy, o el programa la del mes) o `error` (no se pudo preguntar).
 */
export type EstadoIa = 'cargando' | 'listo' | 'apagado' | 'sin-cupo' | 'error';

export interface ContextoIa {
  pantalla: string;
  seleccion: string | null;
}

export interface RespuestaIa {
  mensaje: string;
  /** Cambios revisados contra el borrador (vacío si solo explica; null si no hay propuesta usable). */
  cambios: Cambio[] | null;
  invalida: boolean;
  error?: boolean;
}

export interface AccionGuia {
  id: string;
  nombre: string;
  pantalla: string;
}

export const MENSAJE_APAGADO = 'El asistente de IA no está disponible por ahora. Puedes seguir editando a mano: todo lo demás del editor funciona igual.';
export const MENSAJE_SIN_CUPO = 'Llegaste al límite de ayuda de la IA. Puedes seguir editando a mano.';
const MENSAJE_FALLO = 'La IA no respondió. Inténtalo de nuevo en un momento.';
export const MENSAJE_SOLO_LECTURA = 'El caso está en revisión: no se puede cambiar.';
const MENSAJE_RECHAZO = 'El asistente no pudo ayudar con esa petición. Prueba pidiéndolo con otras palabras.';

const abandono = (senal?: AbortSignal): Promise<never> =>
  new Promise((_, rechazar) => {
    if (!senal) return;
    const abortar = () => rechazar(new DOMException('Petición detenida', 'AbortError'));
    if (senal.aborted) abortar();
    else senal.addEventListener('abort', abortar, { once: true });
  });

/**
 * Habla con el asistente de autoría del servidor (`assistant/status`, `propose` y `guide`). Proponer no escribe nada:
 * el store aplica lo que el docente marque con las rutas de siempre. Si el asistente está apagado o sin cupo, lo dice y
 * el resto del editor sigue funcionando; no hay respuestas de ejemplo.
 */
@Injectable({ providedIn: 'root' })
export class IaService {
  private readonly api = inject(AutoriaApiService).api;
  private readonly store = inject(CasoStore);
  private readonly estadoActual = signal<EstadoIa>('cargando');
  private readonly restantesHoy = signal<number | null>(null);
  readonly estado = this.estadoActual.asReadonly();
  /** Cuántas ayudas le quedan hoy a quien edita; `null` si no se sabe. */
  readonly restantes = this.restantesHoy.asReadonly();

  private get caseVersionId(): number | null {
    const id = Number(this.store.caso()?.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  /** Pregunta al servidor si el asistente está listo y cuánto cupo queda. No gasta ayuda. */
  async comprobar(): Promise<EstadoIa> {
    const cv = this.caseVersionId;
    if (cv === null) {
      this.estadoActual.set('cargando');
      return 'cargando';
    }
    this.estadoActual.set('cargando');
    try {
      const estado = await firstValueFrom(this.api.assistantStatus(cv));
      this.restantesHoy.set(estado.remainingToday);
      this.estadoActual.set(!estado.enabled || estado.mode !== 'connected' ? 'apagado' : estado.remainingToday <= 0 ? 'sin-cupo' : 'listo');
    } catch (error) {
      this.restantesHoy.set(null);
      // Apagado, las rutas del asistente responden 404.
      this.estadoActual.set(error instanceof HttpErrorResponse && error.status === 404 ? 'apagado' : 'error');
    }
    return this.estadoActual();
  }

  async proponer(caso: CasoBorrador, peticion: string, contexto: ContextoIa, senal?: AbortSignal): Promise<RespuestaIa> {
    const cv = this.caseVersionId;
    if (cv === null) return { mensaje: MENSAJE_FALLO, cambios: [], invalida: false, error: true };
    // Un caso en revisión no se cambia: ni se le pide nada al asistente (cada petición gasta cupo) ni se promete que se agregó algo.
    if (this.store.soloLectura()) return { mensaje: MENSAJE_SOLO_LECTURA, cambios: [], invalida: false, error: true };
    // El servidor propone sobre lo que tiene guardado: primero que lo que se está escribiendo llegue.
    await this.store.sincronizado();
    // En el guion la selección es una escena del borrador: se nombra con el número que el servidor le dio. Si esa escena
    // no llegó al servidor, el servidor no la conoce y no se manda nada en su lugar.
    let seleccion = contexto.seleccion;
    if (contexto.pantalla === 'guion' && seleccion) {
      const nodo = this.store.nodoDeEscena(seleccion);
      seleccion = nodo !== null ? String(nodo) : null;
    }
    try {
      const resultado = await Promise.race([
        firstValueFrom(this.api.assistantPropose(cv, { pantalla: contexto.pantalla, peticion, seleccion })),
        abandono(senal),
      ]);
      this.estadoActual.set('listo');
      const casoAhora = this.store.caso() ?? caso;
      const validacion = validarPropuesta(casoAhora, resultado.cambios, this.store.resolver(casoAhora));
      if (!validacion.ok) return { mensaje: MENSAJE_PROPUESTA_INVALIDA, cambios: null, invalida: true };
      void this.comprobar(); // el cupo bajó
      return { mensaje: resultado.mensaje || 'Aquí tienes mi propuesta.', cambios: validacion.cambios, invalida: false };
    } catch (error) {
      if (senal?.aborted) throw error;
      return this.respuestaDeError(error);
    }
  }

  private respuestaDeError(error: unknown): RespuestaIa {
    const estado = error instanceof HttpErrorResponse ? error.status : 0;
    const cuerpo = error instanceof HttpErrorResponse ? (error.error as { code?: string; message?: string } | null) : null;
    if (estado === 404) {
      this.estadoActual.set('apagado');
      return { mensaje: MENSAJE_APAGADO, cambios: [], invalida: false };
    }
    if (estado === 429) {
      this.estadoActual.set('sin-cupo');
      return { mensaje: cuerpo?.message || MENSAJE_SIN_CUPO, cambios: [], invalida: false };
    }
    if (estado === 422) {
      return cuerpo?.code === 'AI_REFUSED'
        ? { mensaje: MENSAJE_RECHAZO, cambios: [], invalida: false }
        : { mensaje: MENSAJE_PROPUESTA_INVALIDA, cambios: null, invalida: true };
    }
    return { mensaje: MENSAJE_FALLO, cambios: [], invalida: false, error: true };
  }

  /** La guía con IA: qué acción responde la pregunta. null si no hay IA o no respondió. */
  async guia(pregunta: string, acciones: AccionGuia[]): Promise<{ accionId: string | null; modo: 'resaltar' | 'foco' | 'recorrido'; mensaje: string } | null> {
    const cv = this.caseVersionId;
    if (cv === null || this.estadoActual() === 'apagado' || this.estadoActual() === 'sin-cupo') return null; // el buscador lo hace mejor
    try {
      const r = await firstValueFrom(this.api.assistantGuide(cv, { pregunta, acciones }));
      return { accionId: r.accionId, modo: r.modo, mensaje: r.mensaje };
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) this.estadoActual.set('apagado');
      if (error instanceof HttpErrorResponse && error.status === 429) this.estadoActual.set('sin-cupo');
      return null;
    }
  }
}
