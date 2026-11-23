import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { revisionConflictOf } from '../../../core/api/revision-conflict.util';
import type { CaseLifecycle, RubricAdoptRequest, ValidationIssue } from '../../../core/models/simulation.model';
import { AutoriaApiService } from '../api/autoria-api.service';
import { claveDeMueble, crearChoque, fijarClavesDeMuebles, trasladarChoque } from '../modelo/choques-mueble';
import { casoDesdeApi } from '../modelo/desde-api';
import {
  type Cambio, type ResolverIds, type Tocados, aplicarPropuesta as aplicarCambiosIa, resolverLocal,
} from '../ia/propuestas';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { primerHueco } from '../modelo/arrastre-en-muro';
import type { EstructuraDeSala } from '../../simulator/sala/catalogo';
import type {
  CasoBorrador, ClaveFinalPlantilla, Comentario, Escena, Final, Hito, Linea, MovimientoPersonaje, NivelRiesgo, Reaccion, Respuesta, SalaCaso,
} from '../modelo/caso';
import { SEPARACION_ESCENAS } from '../modelo/copiar';
import type { ColocacionPersonaje } from '../modelo/escenario';
import { nuevaRespuesta } from '../modelo/fabricas';
import { centroDeZona, largoMuro, llegada, limitarAZona, zonaCaminable } from '../modelo/geometria';
import type { Muro } from '../modelo/geometria';
import { claveLibre, cuerpoCrearCaso } from '../modelo/hacia-api';
import { hexAleatorio, nuevoId } from '../modelo/ids';
import { revisarPuntoDeIda } from '../modelo/movimiento';
import { posicionLibre, trazarEscenas } from '../modelo/trazado';
import { Historial } from './historial';
import * as persistir from './persistir';
import { casoLeidoDelServidor, firmaDelCaso } from './releer';
import { SesionServidor } from './sesion-servidor';

export type TipoElemento = 'mueble' | 'objeto' | 'personaje';

/** Lo que el docente ve cuando otra sesión cambió el caso: qué pasó y qué cambios suyos no se alcanzaron a guardar. */
export interface Conflicto {
  mensaje: string;
  /** Lo que escribió y no se guardó, en sus palabras (para que no lo pierda al recargar). */
  sinGuardar: string[];
}

/** Una respuesta que se queda en el borrador hasta que se complete, y qué le falta. */
export interface RespuestaSinGuardar {
  escenaId: string;
  respuestaId: string;
  mensaje: string;
}

/**
 * Un cambio al caso. `aplicar` es el cambio sobre el borrador (rápido, sin red y repetible: el store lo vuelve a
 * aplicar sobre el borrador confirmado cuando otro cambio falla); `enviar` pone al día el servidor a partir del
 * borrador ya cambiado.
 */
interface Operacion {
  /** Qué se estaba guardando, para decirlo si falla («la escena», «la sala»…). */
  nombre: string;
  aplicar: (caso: CasoBorrador) => void;
  enviar?: (despues: CasoBorrador, sesion: SesionServidor) => Promise<void>;
  /** Dos cambios seguidos con la misma clave (por ejemplo, teclear en el mismo campo) se mandan en uno. */
  fusion?: string;
  /**
   * Qué hizo el docente, en sus palabras y completo (lo que escribió se copia tal cual): se le muestra si el cambio no se
   * guarda (conflicto o rechazo) para que no lo pierda.
   */
  resumen?: string[];
  /** Qué más hacer si el cambio no se pudo guardar (por ejemplo, apagar «Deshacer lo aplicado» de una propuesta). */
  alFallar?: () => void;
}

function moverEnLista<T extends { id: string }>(lista: T[], id: string, delta: -1 | 1): void {
  const i = lista.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
}

function lista(sala: SalaCaso, tipo: TipoElemento) {
  return tipo === 'mueble' ? sala.muebles : tipo === 'objeto' ? sala.objetos : sala.personajes;
}

/** Las claves de los objetos de una sala (también las de sus puertas), para dar una libre a lo que se agrega. */
function clavesDeSala(sala: SalaCaso): Set<string> {
  const claves = new Set<string>(sala.puertas.map((p) => p.id));
  for (const c of [...sala.muebles, ...sala.objetos, ...sala.personajes]) if (c.clave) claves.add(c.clave);
  return claves;
}

type LugarDePieza = { muro: Muro; pos: number } | { x: number; y: number };
type FichaDeOcupacion = { ocupa: number; franja: readonly [number, number] };

function idDePieza(sala: SalaCaso, tipo: string): string {
  const usadas = new Set([...sala.puertas.map((p) => p.id), ...(sala.estructura?.piezas ?? []).map((p) => p.id)]);
  let n = 1;
  while (usadas.has(`${tipo}-${n}`)) n++;
  return `${tipo}-${n}`;
}

/** `Prefijo: «texto»`, completo (el docente lo puede copiar); nada si no hay texto. */
const textoCompleto = (prefijo: string, texto: string | undefined): string[] =>
  texto && texto.trim() ? [`${prefijo}: «${texto.trim()}»`] : [];

const ARTICULO: Record<TipoElemento, string> = { mueble: 'un mueble', objeto: 'un objeto', personaje: 'un personaje' };

/** Qué falta, dicho en palabras del docente, según el campo que el sistema no aceptó. */
const FALTA_POR_CAMPO: Record<string, string> = {
  responseClass: 'Falta elegir cómo es la respuesta.',
  prohibitionReason: 'Falta escribir por qué es contraindicada.',
  title: 'Falta el nombre.',
  text: 'Falta el texto.',
  nodeKey: 'El nombre de la escena no es válido.',
  context: 'Revisa el contexto: debe ser texto plano, sin enlaces y de hasta 4.000 caracteres.',
  learningObjectives: 'Revisa los objetivos: hasta 12, de 280 caracteres cada uno y en texto plano.',
  warningMessage: 'Una escena de intensidad alta necesita su aviso.',
  intensity: 'Una escena de intensidad alta necesita su aviso.',
};

/** Campos 2.1 cuyo mensaje del servidor ya esta escrito para la docente (una sola linea, sin enlaces, topes...): se muestra tal cual. */
const CAMPOS_CON_MENSAJE_DEL_SERVIDOR: ReadonlySet<string> = new Set(['goal', 'requires', 'reaction', 'comments']);

/** Hasta cuantos comentarios de acercamiento lleva una escena. */
export const MAX_COMENTARIOS = 6;

/** Lo que se le dice al docente cuando un cambio no se pudo guardar: sin códigos ni palabras técnicas. */
export function mensajeDeFallo(error: unknown, nombre: string, aMedias = false): string {
  const base = aMedias
    ? `No se pudo terminar de guardar ${nombre}. Quedó a medias: esto es lo que se guardó.`
    : `No se pudo guardar ${nombre}. Lo dejamos como estaba.`;
  if (!(error instanceof HttpErrorResponse)) return base;
  if (error.status === 0) return `${base} No hay conexión. Revisa tu internet y vuelve a intentarlo.`;
  if (error.status === 403) return `${base} No tienes permiso para cambiar este caso.`;
  if (error.status === 404) return `${base} Esa parte del caso ya no existe; recarga el caso para verlo al día.`;
  if (error.status >= 500) return `${base} Hubo un problema al guardar; vuelve a intentarlo en un momento.`;
  const campo = (error.error as { field?: unknown } | null)?.field;
  const delServidor = (error.error as { message?: unknown } | null)?.message;
  if (typeof campo === 'string' && CAMPOS_CON_MENSAJE_DEL_SERVIDOR.has(campo) && typeof delServidor === 'string' && delServidor.trim()) {
    return `${base} ${delServidor.trim()}`;
  }
  const falta = typeof campo === 'string' ? FALTA_POR_CAMPO[campo] : undefined;
  return `${base} ${falta ?? 'Revisa lo que escribiste: así no se puede guardar.'}`;
}

export function mensajeDeCarga(error: unknown): string {
  const estado = error instanceof HttpErrorResponse ? error.status : -1;
  if (estado === 403) return 'No tienes permiso para abrir este caso.';
  if (estado === 404) return 'No encontramos ese caso. Puede que ya no exista.';
  if (estado === 0) return 'No pudimos abrir el caso: no hay conexión. Revisa tu internet y vuelve a intentarlo.';
  return 'No pudimos abrir el caso. Vuelve a intentarlo en un momento.';
}

/**
 * Estado del caso en borrador. Las pantallas lo leen y lo cambian por aquí.
 *
 * Con el caso abierto desde el servidor (`cargar`), cada cambio se **ve al instante** en el borrador y se manda a la API
 * de autoría con la revisión vigente. Los cambios se mandan uno tras otro (cada uno con la revisión que devolvió el
 * anterior). Si el servidor rechaza uno, solo ese cambio se deshace; si dice que otra sesión cambió el caso (409), no se
 * deshace nada: el borrador se conserva, se avisa por `conflicto` y se espera a que el docente decida recargar.
 *
 * Sin servidor (`fijar`) el borrador solo vive en memoria; así lo usan las pantallas en sus pruebas.
 */
@Injectable({ providedIn: 'root' })
export class CasoStore {
  private readonly injector = inject(Injector);
  /**
   * Va a una dirección del portal en esta misma pestaña (`state` viaja con la navegación). Lo usa el ensayo («Probar»), que
   * se pulsa desde varias pantallas; el router se pide aquí, al usarlo, para que el store no dependa de él al crearse.
   */
  navegar(url: string, state?: Record<string, unknown>): Promise<boolean> {
    return this.injector.get(Router).navigateByUrl(url, state ? { state } : undefined);
  }
  private readonly estado = signal<CasoBorrador | null>(null);
  private readonly puertasPendientes = signal<ReadonlyMap<string, readonly string[]>>(new Map());
  readonly puertasSinGuardar = this.puertasPendientes.asReadonly();

  private async guardarSala(sesion: SesionServidor, caso: CasoBorrador, salaId: string): Promise<void> {
    const pendientes = await persistir.guardarSala(sesion, caso, salaId);
    if (this.sesion === sesion) this.puertasPendientes.update(actual => new Map(actual).set(salaId, pendientes));
  }
  /** El borrador tal como lo confirmó el servidor; `estado` es este más los cambios que aún viajan. */
  private base: CasoBorrador | null = null;
  private sesion: SesionServidor | null = null;
  private cola: Operacion[] = [];
  private procesando = false;
  private esperas: Array<() => void> = [];
  private historial: Historial<SalaCaso[]> | null = null;
  private readonly version = signal(0);
  /** Cuántas veces se abrió o se releyó el caso (no cambia con cada edición): las pantallas con texto propio parten de nuevo del caso. */
  private readonly lecturaAhora = signal(0);
  readonly lectura = this.lecturaAhora.asReadonly();
  private readonly enLinea = signal(false);

  readonly caso = this.estado.asReadonly();
  /** El caso ya no es un borrador (está en revisión o publicado): se puede ver, pero no cambiar. */
  readonly soloLectura = computed(() => {
    const estado = this.estado()?.estado;
    return estado !== undefined && estado !== 'DRAFT';
  });
  readonly puedeDeshacer = computed(() => (this.version(), this.historial?.puedeDeshacer ?? false));
  readonly puedeRehacer = computed(() => (this.version(), this.historial?.puedeRehacer ?? false));

  private readonly cargandoAhora = signal(false);
  private readonly errorCarga = signal<string | null>(null);
  private readonly guardandoAhora = signal(false);
  private readonly errorAhora = signal<string | null>(null);
  private readonly conflictoAhora = signal<Conflicto | null>(null);
  private readonly recuperadoAhora = signal<string[]>([]);
  private readonly descartadoAhora = signal<string[]>([]);
  private readonly propuestaAplicada = signal<{ antes: CasoBorrador; tocados: Tocados } | null>(null);
  /** Se está abriendo el caso. */
  readonly cargando = this.cargandoAhora.asReadonly();
  /** Por qué no se pudo abrir el caso (en lenguaje del docente), o `null`. */
  readonly errorDeCarga = this.errorCarga.asReadonly();
  /** Hay cambios viajando al servidor. */
  readonly guardando = this.guardandoAhora.asReadonly();
  /** El último cambio que el sistema rechazó, ya deshecho; `null` si no hay. */
  readonly error = this.errorAhora.asReadonly();
  /** Lo que el docente había hecho en el cambio rechazado, para que lo pueda volver a escribir. */
  readonly descartado = this.descartadoAhora.asReadonly();
  /** Hay una propuesta del asistente recién aplicada que se puede deshacer de un paso. */
  readonly puedeDeshacerPropuesta = computed(() => this.propuestaAplicada() !== null);
  /** Otra sesión cambió el caso: mientras esté, no se manda nada más y se ofrece recargar. */
  readonly conflicto = this.conflictoAhora.asReadonly();
  /** Lo que el docente había escrito y no se guardó, después de recargar tras un conflicto. */
  readonly recuperado = this.recuperadoAhora.asReadonly();
  /** Las respuestas que siguen solo en el borrador porque les falta algo (la clase, la razón o el destino). */
  readonly sinGuardar = computed<RespuestaSinGuardar[]>(() => {
    const caso = this.estado();
    if (!caso || !this.enLinea()) return [];
    return caso.escenas.flatMap((e) =>
      e.respuestas.flatMap((r) => {
        const mensaje = persistir.motivoSinGuardar(r);
        // Sin texto ni clase la respuesta acaba de nacer: solo molesta cuando ya se empezó a escribir.
        return mensaje && (r.texto.trim() || r.clase) ? [{ escenaId: e.id, respuestaId: r.id, mensaje }] : [];
      }));
  });

  /**
   * Hay algo que no está a salvo en el sistema: cambios viajando, un conflicto sin resolver o respuestas que solo están en
   * pantalla porque les falta la clase, la razón o a dónde llevan. Salir ahora lo perdería.
   */
  readonly haySinGuardar = computed(() => this.guardandoAhora() || this.conflictoAhora() !== null || this.sinGuardar().length > 0);

  /**
   * Relee del servidor si el ensayo de esta versión llegó a un final (`rehearsedToEnd`) y lo pone en `probadoHastaElFinal`, sin
   * tocar nada más del borrador ni mandar nada. El ensayo corre en otra pestaña, así que la revisión lo pregunta al entrar y
   * cuando su pestaña vuelve a estar a la vista. Si la lectura falla, queda lo que había.
   */
  async releerProbado(): Promise<void> {
    const sesion = this.sesion;
    if (!sesion) return;
    try {
      const vista = await firstValueFrom(sesion.api.caseEditor(sesion.caseVersionId));
      if (this.sesion !== sesion) return;
      const probado = vista.rehearsedToEnd === true;
      this.estado.update((c) => (c ? { ...c, probadoHastaElFinal: probado } : c));
      if (this.base) this.base = { ...this.base, probadoHastaElFinal: probado };
    } catch {
      // sin conexión o sin permiso: el aviso de la revisión sigue como estaba
    }
  }

  private get servicio(): AutoriaApiService {
    return this.injector.get(AutoriaApiService);
  }

  private get biblioteca(): BibliotecaService {
    return this.injector.get(BibliotecaService);
  }

  // ─── Abrir, recargar y cerrar ───────────────────────────────────────────────

  /** Abre el caso `caseVersionId` desde el servidor (si ya es el abierto, no lo vuelve a leer). */
  async cargar(caseVersionId: number, forzar = false): Promise<void> {
    if (!forzar && this.sesion?.caseVersionId === caseVersionId && this.base) return;
    this.cargandoAhora.set(true);
    this.errorCarga.set(null);
    try {
      const lectura = await firstValueFrom(this.servicio.abrirCaso(caseVersionId));
      this.empezarCon(lectura.caso, new SesionServidor(this.servicio.api, caseVersionId, lectura));
    } catch (error) {
      this.errorCarga.set(mensajeDeCarga(error));
      if (this.sesion?.caseVersionId !== caseVersionId) this.empezarCon(null, null);
    } finally {
      this.cargandoAhora.set(false);
    }
  }

  /**
   * Vuelve a leer el caso del servidor, tras un conflicto. Lo que el docente había escrito y no se guardó no se pierde
   * de vista: queda en `recuperado` para que lo vuelva a poner.
   */
  async recargar(): Promise<void> {
    const sesion = this.sesion;
    if (!sesion) return;
    const perdido = [...(this.conflictoAhora()?.sinGuardar ?? []), ...this.cola.flatMap((op) => op.resumen ?? []), ...this.resumenDePendientes()];
    this.cola = [];
    this.conflictoAhora.set(null);
    await this.cargar(sesion.caseVersionId, true);
    this.recuperadoAhora.set([...new Set(perdido)]);
  }

  descartarRecuperado(): void {
    this.recuperadoAhora.set([]);
  }

  descartarError(): void {
    this.errorAhora.set(null);
    this.descartadoAhora.set([]);
  }

  /** Cierra el caso (al salir del editor): el store queda vacío. */
  cerrar(): void {
    this.empezarCon(null, null);
    this.errorCarga.set(null);
  }

  /**
   * Se sale del editor: espera a que lo pendiente llegue al servidor y cierra el caso (salvo que mientras tanto se haya
   * abierto otro).
   */
  async liberar(): Promise<void> {
    const sesion = this.sesion;
    await this.sincronizado();
    if (this.sesion === sesion) this.cerrar();
  }

  /** El nombre del lugar de la biblioteca del que salió el caso; `null` si el caso no tiene lugar o aún no se leyó. */
  nombreDelLugar(): string | null {
    const lugar = this.sesion?.lugar;
    return lugar && lugar.id === this.estado()?.lugarId ? lugar.nombre : null;
  }

  /** El número que el servidor le dio a una escena; null si aún no está allí o el caso no viene del servidor. */
  nodoDeEscena(escenaId: string): number | null {
    return this.sesion?.nodoDe(escenaId) ?? null;
  }

  /** Crea un caso en el servidor, con las salas elegidas de un lugar y la descripción que lee el estudiante, y devuelve su id. */
  async crearCaso(titulo: string, lugarId: string | null, salas: string[], descripcion = ''): Promise<number> {
    const vista = await firstValueFrom(this.servicio.api.createCase(cuerpoCrearCaso(titulo, lugarId, salas, descripcion)));
    return vista.caseVersionId;
  }

  /** Reemplaza el caso en curso por un borrador que no está en el servidor (el historial empieza de cero). */
  fijar(caso: CasoBorrador): void {
    this.empezarCon(caso, null);
  }

  private empezarCon(caso: CasoBorrador | null, sesion: SesionServidor | null): void {
    this.puertasPendientes.set(new Map());
    this.sesion = sesion;
    this.cola = [];
    this.base = caso;
    this.historial = caso ? new Historial(structuredClone(caso.salas)) : null;
    this.estado.set(caso ? structuredClone(caso) : null);
    this.conflictoAhora.set(null);
    this.errorAhora.set(null);
    this.descartadoAhora.set([]);
    this.propuestaAplicada.set(null);
    this.recuperadoAhora.set([]);
    this.guardandoAhora.set(false);
    this.enLinea.set(sesion !== null);
    this.version.update((v) => v + 1);
    this.lecturaAhora.update((v) => v + 1);
  }

  /** Espera a que todo lo que se cambió haya llegado al servidor (o a que algo lo detenga). */
  sincronizado(): Promise<void> {
    if (!this.procesando && (this.cola.length === 0 || this.conflictoAhora())) return Promise.resolve();
    return new Promise((resolver) => this.esperas.push(resolver));
  }

  // ─── Cómo viaja un cambio ───────────────────────────────────────────────────

  /**
   * Aplica el cambio al borrador al instante y lo pone en la cola del servidor. Si no cuadra con el borrador, lanza el
   * error y nada cambia.
   */
  private ejecutar(op: Operacion, opciones: { sala?: boolean; propuesta?: boolean } = {}): void {
    const actual = this.estado();
    if (!actual || this.soloLectura()) return;
    const nuevo = structuredClone(actual);
    op.aplicar(nuevo); // si lanza, nada cambió
    if (!opciones.propuesta) this.propuestaAplicada.set(null); // lo aplicado por el asistente solo se deshace de un paso si nada más cambió
    if (opciones.sala) this.historial?.hacer(structuredClone(nuevo.salas));
    this.estado.set(nuevo);
    this.version.update((v) => v + 1);

    if (!this.sesion) {
      this.base = structuredClone(nuevo);
      return;
    }
    const ultima = this.cola.at(-1);
    const enVuelo = this.procesando && this.cola.length === 1;
    if (op.fusion && ultima && ultima.fusion === op.fusion && !enVuelo) {
      const antes = ultima.aplicar;
      ultima.aplicar = (caso) => {
        antes(caso);
        op.aplicar(caso);
      };
      ultima.resumen = [...new Set([...(ultima.resumen ?? []), ...(op.resumen ?? [])])];
    } else {
      this.cola.push(op);
    }
    void this.procesar();
  }

  /** El borrador visible: el confirmado más los cambios que aún no llegan. Un cambio que ya no cuadra se descarta. */
  private recomputar(): void {
    if (!this.base) return;
    const visible = structuredClone(this.base);
    const vivas: Operacion[] = [];
    for (const op of this.cola) {
      try {
        op.aplicar(visible);
        vivas.push(op);
      } catch {
        // depende de algo que ya no está (por ejemplo, de una escena que el servidor rechazó): se descarta con ella
      }
    }
    this.cola = vivas;
    this.estado.set(visible);
    this.version.update((v) => v + 1);
  }

  private async procesar(): Promise<void> {
    if (this.procesando) return;
    this.procesando = true;
    this.guardandoAhora.set(true);
    try {
      while (this.cola.length > 0 && !this.conflictoAhora() && this.sesion && this.base) {
        const sesion = this.sesion;
        const op = this.cola[0];
        const despues = structuredClone(this.base);
        const revisionAntes = sesion.revision;
        try {
          op.aplicar(despues);
          await op.enviar?.(despues, sesion);
          if (this.sesion !== sesion) return; // mientras tanto se abrió otro caso
          despues.revision = sesion.revision;
          this.base = despues;
          this.cola.shift();
        } catch (error) {
          if (this.sesion !== sesion) return;
          if (revisionConflictOf(error) || this.esCasoVencido(error)) {
            this.avisarConflicto([...new Set([...this.cola.flatMap((o) => o.resumen ?? []), ...this.resumenDePendientes()])]);
            break;
          }
          this.cola.shift(); // se revierte solo este cambio
          const aMedias = await this.reflejarLoQueQuedo(error, sesion, revisionAntes);
          if (this.sesion !== sesion) return; // mientras se releía se abrió otro caso
          this.errorAhora.set(this.mensajeDe(error, op, aMedias));
          this.descartadoAhora.set(op.resumen ?? []);
          op.alFallar?.();
        }
        this.recomputar();
      }
    } finally {
      this.procesando = false;
      this.guardandoAhora.set(false);
      const esperas = this.esperas;
      this.esperas = [];
      for (const resolver of esperas) resolver();
    }
  }

  /** Las respuestas que solo están en pantalla (les falta algo para guardarse), con todo lo que el docente escribió en ellas. */
  private resumenDePendientes(): string[] {
    return this.sinGuardar().flatMap((p) => {
      const respuesta = this.estado()?.escenas.find((e) => e.id === p.escenaId)?.respuestas.find((r) => r.id === p.respuestaId);
      if (!respuesta) return [];
      return [
        ...this.resumenDeRespuesta(p.escenaId, { texto: respuesta.texto, razon: respuesta.razon, retroalimentacion: respuesta.retroalimentacion }),
        `Esa respuesta no se había guardado: ${p.mensaje}`,
      ];
    });
  }

  /** El mensaje de un cambio que no se guardó; dos casos dejan el caso a medias y lo dicen. */
  private mensajeDe(error: unknown, op: Operacion, aMedias = false): string {
    if (error instanceof persistir.SalaDesalineada) return 'Algunas escenas de esta sala pueden mostrarla distinta. Vuelve a guardarla.';
    if (error instanceof persistir.AceptacionAMedias) {
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      return `Se aceptaron ${error.hechas} de ${error.total} ${error.total === 1 ? 'parte' : 'partes'}. Vuelve a pulsar para terminar.`;
    }
    if (error instanceof persistir.BorradoAMedias) {
      return 'Se quitaron los caminos que llevaban a esa escena, pero la escena no se pudo borrar. Vuelve a conectar esos caminos si hace falta.';
    }
    return mensajeDeFallo(error, op.nombre, aMedias);
  }

  /**
   * Cuando un cambio falló a medias, el borrador confirmado muestra lo que quedó en el sistema, no lo de antes. Dos fallos
   * conocidos se arreglan en el sitio (una sala desalineada, un borrado a medias); en cualquier otro, si el servidor ya había
   * aceptado algo (la revisión cambió), se vuelve a leer el caso y se conserva lo local que aún no se puede guardar.
   * Devuelve si quedó a medias (el servidor tiene algo que el editor no mostraba).
   */
  private async reflejarLoQueQuedo(error: unknown, sesion: SesionServidor, revisionAntes: number): Promise<boolean> {
    if (!this.base) return false;
    if (error instanceof persistir.SalaDesalineada) {
      const leido = casoDesdeApi(sesion.vista, [...sesion.mundos.values()], sesion.lugar);
      const sala = leido.salas.find((s) => s.id === error.salaId);
      const i = this.base.salas.findIndex((s) => s.id === error.salaId);
      if (sala && i >= 0) this.base.salas[i] = sala;
    } else if (error instanceof persistir.BorradoAMedias) {
      for (const e of this.base.escenas) {
        for (const r of e.respuestas) if (error.respuestas.includes(r.id)) r.destinoId = null;
      }
    } else if (sesion.revision !== revisionAntes) {
      try {
        await sesion.releerTodo();
      } catch {
        return false; // sin poder leer, el borrador se queda como estaba (el aviso no promete más)
      }
      if (this.sesion !== sesion || !this.base) return false;
      const leido = casoLeidoDelServidor(sesion, this.base);
      if (firmaDelCaso(leido) !== firmaDelCaso(this.base)) {
        this.base = leido;
        this.lecturaAhora.update((v) => v + 1); // las pantallas con texto propio parten de nuevo del caso
        return true;
      }
    }
    return false;
  }

  /** Un 409 que no trae la revisión pero dice que el estado del caso cambió (por ejemplo, ya no es un borrador). */
  private esCasoVencido(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409;
  }

  private nombreSala(id: string | null): string {
    return this.estado()?.salas.find((s) => s.id === id)?.nombre ?? 'sin nombre';
  }

  private tituloEscena(id: string): string {
    return this.estado()?.escenas.find((e) => e.id === id)?.titulo ?? 'sin título';
  }

  private escenaDeRespuesta(respuestaId: string): string {
    const escena = this.estado()?.escenas.find((e) => e.respuestas.some((r) => r.id === respuestaId));
    return escena?.titulo ?? 'sin título';
  }

  private sala(caso: CasoBorrador, salaId: string): SalaCaso {
    const sala = caso.salas.find((s) => s.id === salaId);
    if (!sala) throw new Error(`La sala «${salaId}» no está en el caso.`);
    return sala;
  }

  private escena(caso: CasoBorrador, id: string): Escena {
    const e = caso.escenas.find((x) => x.id === id);
    if (!e) throw new Error(`La escena «${id}» no está en el caso.`);
    return e;
  }

  // ─── Deshacer y rehacer (solo la sala) ──────────────────────────────────────

  deshacer(): void {
    const previo = this.historial?.deshacer();
    if (previo) this.restaurarSalas(previo);
  }

  rehacer(): void {
    const siguiente = this.historial?.rehacer();
    if (siguiente) this.restaurarSalas(siguiente);
  }

  /** Deja las salas como estaban en el historial y guarda las que cambiaron. */
  private restaurarSalas(salas: SalaCaso[]): void {
    const actual = this.estado();
    if (!actual || this.soloLectura()) return;
    this.propuestaAplicada.set(null);
    const cambiadas = salas.filter((s) => JSON.stringify(s) !== JSON.stringify(actual.salas.find((x) => x.id === s.id))).map((s) => s.id);
    const nuevo = structuredClone(actual);
    nuevo.salas = structuredClone(salas);
    this.estado.set(nuevo);
    this.version.update((v) => v + 1);
    if (!this.sesion) {
      this.base = structuredClone(nuevo);
      return;
    }
    this.cola.push({
      nombre: 'la sala',
      resumen: [`Deshiciste o rehiciste un cambio en ${cambiadas.length === 1 ? `la sala «${this.nombreSala(cambiadas[0])}»` : 'una sala'}`],
      aplicar: (caso) => { caso.salas = structuredClone(salas); },
      enviar: async (despues, sesion) => {
        for (const id of cambiadas) await this.guardarSala(sesion, despues, id);
      },
    });
    void this.procesar();
  }

  // ─── Sala ───────────────────────────────────────────────────────────────────

  private cambiarSala(
    salaId: string, que: string, cambio: (caso: CasoBorrador, sala: SalaCaso) => void, otraSalaId?: string,
  ): void {
    this.ejecutar({
      nombre: 'la sala',
      resumen: [`${que} en la sala «${this.nombreSala(salaId)}»`],
      aplicar: (caso) => cambio(caso, this.sala(caso, salaId)),
      enviar: async (despues, sesion) => {
        await this.guardarSala(sesion, despues, salaId);
        if (otraSalaId && otraSalaId !== salaId) await this.guardarSala(sesion, despues, otraSalaId);
      },
      fusion: otraSalaId ? undefined : `sala:${salaId}`,
    }, { sala: true });
  }

  cambiarEstructura(salaId: string, resumen: string, cambio: (e: EstructuraDeSala) => void): void {
    if (!this.estado()?.salas.find((s) => s.id === salaId)?.estructura) return;
    this.cambiarSala(salaId, resumen, (_caso, sala) => { if (sala.estructura) cambio(sala.estructura); });
  }

  moverPiezaDeMuro(salaId: string, piezaId: string, destino: LugarDePieza): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarEstructura(salaId, 'Moviste una pieza', (estructura) => {
      const pieza = estructura.piezas?.find((p) => p.id === piezaId);
      if (!pieza) return;
      delete pieza.muro; delete pieza.pos; delete pieza.x; delete pieza.y;
      Object.assign(pieza, destino);
    });
  }

  agregarPiezaDeMuro(salaId: string, tipo: string, modelo: string, lugar: LugarDePieza): string {
    const sala = this.estado()?.salas.find((s) => s.id === salaId);
    if (!sala?.estructura || this.soloLectura()) return '';
    const id = idDePieza(sala, tipo);
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarEstructura(salaId, 'Agregaste una pieza', (e) => {
      (e.piezas ??= []).push({ id, tipo, modelo, ...lugar });
    });
    return id;
  }

  quitarPiezaDeMuro(salaId: string, piezaId: string): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarEstructura(salaId, 'Quitaste una pieza', (e) => {
      if (e.piezas) e.piezas = e.piezas.filter((p) => p.id !== piezaId);
    });
  }

  moverPuerta(salaId: string, puertaId: string, muro: Muro, pos: number): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarSala(salaId, 'Moviste una puerta', (_caso, sala) => {
      const puerta = sala.puertas.find((p) => p.id === puertaId);
      if (puerta) Object.assign(puerta, { muro, pos, ...llegada(muro, pos, sala.encuadre, sala.estructura?.ancho) });
    });
  }

  agregarPuerta(salaId: string, modelo: string, muro: Muro, pos: number): string {
    const sala = this.estado()?.salas.find((s) => s.id === salaId);
    if (!sala || this.soloLectura()) return '';
    const id = idDePieza(sala, 'puerta');
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarSala(salaId, 'Agregaste una puerta', (_caso, s) => {
      s.puertas.push({ id, modelo, muro, pos, hacia: null, etiqueta: '', ...llegada(muro, pos, s.encuadre, s.estructura?.ancho) });
    });
    return id;
  }

  quitarPuerta(salaId: string, puertaId: string): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarSala(salaId, 'Quitaste una puerta', (_caso, sala) => {
      sala.puertas = sala.puertas.filter((p) => p.id !== puertaId);
    });
  }

  editarPuerta(salaId: string, puertaId: string, cambios: { modelo?: string; sentidoUnico?: boolean }): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarSala(salaId, 'Cambiaste una puerta', (_caso, sala) => {
      const puerta = sala.puertas.find(p => p.id === puertaId);
      if (puerta) Object.assign(puerta, cambios);
    });
  }

  fijarDestinoDePuerta(salaId: string, puertaId: string, hacia: string): void {
    if (!this.estado()?.salas.some((s) => s.id === hacia)) return;
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarSala(salaId, 'Cambiaste a dónde lleva una puerta', (caso, sala) => {
      const puerta = sala.puertas.find((p) => p.id === puertaId);
      if (puerta) { puerta.hacia = hacia; puerta.etiqueta = this.sala(caso, hacia).nombre; }
    });
  }

  crearPuertaDeRegreso(salaId: string, puertaId: string, fichaDe: (clave: string) => FichaDeOcupacion | null): string {
    const origen = this.estado()?.salas.find((s) => s.id === salaId);
    const puerta = origen?.puertas.find((p) => p.id === puertaId);
    const destino = this.estado()?.salas.find((s) => s.id === puerta?.hacia);
    if (!origen || !puerta || !destino || this.soloLectura()) return '';
    if (destino.puertas.some((p) => p.id === puerta.par || p.hacia === salaId)) return '';
    const id = idDePieza(destino, 'puerta');
    const opuestos: Record<Muro, Muro> = { fondo: 'camara', camara: 'fondo', izquierda: 'derecha', derecha: 'izquierda' };
    const modelo = puerta.modelo ?? '';
    const propuesto = opuestos[puerta.muro ?? 'fondo'];
    const ancho = destino.estructura?.ancho;
    const muro = largoMuro(propuesto, destino.encuadre, ancho) ? propuesto : 'fondo';
    const largo = largoMuro(muro, destino.encuadre, ancho);
    const ficha = (clave: string): FichaDeOcupacion => fichaDe(clave) ?? { ocupa: 0, franja: [0, 0] };
    const ocupadas = [
      ...(destino.estructura?.piezas ?? []).filter((p) => p.muro === muro && p.pos !== undefined)
        .map((p) => ({ ...ficha(`${p.tipo}/${p.modelo}`), esPuerta: false, pos: p.pos! })),
      ...destino.puertas.filter((p) => p.muro === muro && p.pos !== undefined)
        .map((p) => ({ ...ficha(`puerta/${p.modelo ?? ''}`), esPuerta: true, pos: p.pos! })),
    ];
    const pos = primerHueco(muro, { ...ficha(`puerta/${modelo}`), esPuerta: true }, ocupadas, largo) ?? Math.floor(largo / 2);
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.cambiarSala(salaId, 'Agregaste la puerta de regreso', (caso, sala) => {
      const original = sala.puertas.find((p) => p.id === puertaId);
      if (!original) return;
      const otra = this.sala(caso, destino.id);
      original.par = id;
      otra.puertas.push({
        id, modelo, muro, pos, hacia: salaId, par: puertaId, etiqueta: sala.nombre,
        ...llegada(muro, pos, otra.encuadre, otra.estructura?.ancho),
      });
    }, destino.id);
    return id;
  }

  moverElemento(salaId: string, tipo: TipoElemento, indice: number, x: number, y: number): void {
    this.cambiarSala(salaId, `Moviste ${ARTICULO[tipo]}`, (caso, sala) => {
      if (tipo === 'mueble') fijarClavesDeMuebles(sala);
      const elemento = lista(sala, tipo)[indice];
      if (!elemento) return;
      const medio = tipo === 'mueble' ? (caso.catalogo.muebles.find((m) => m.id === elemento.ref)?.ancho ?? 0) / 2 : 0;
      const antes = { x: elemento.x, y: elemento.y };
      Object.assign(elemento, limitarAZona(zonaCaminable(sala.encuadre), x, y, medio));
      if (tipo === 'mueble') trasladarChoque(sala, claveDeMueble(sala, indice), elemento.x - antes.x, elemento.y - antes.y);
    });
  }

  quitarElemento(salaId: string, tipo: TipoElemento, indice: number): void {
    this.cambiarSala(salaId, `Quitaste ${ARTICULO[tipo]}`, (_caso, sala) => {
      if (tipo === 'mueble' && sala.muebles[indice]) {
        fijarClavesDeMuebles(sala);
        delete sala.choques[claveDeMueble(sala, indice)];
      }
      lista(sala, tipo).splice(indice, 1);
    });
  }

  /** Agrega una pieza del catálogo (o un personaje del lugar) en el centro de la zona caminable. */
  agregarElemento(salaId: string, tipo: TipoElemento, ref: string): void {
    this.cambiarSala(salaId, `Agregaste ${ARTICULO[tipo]}`, (caso, sala) => {
      // Un caso sin lugar no tiene catálogo: no se agrega una pieza que el servidor no sabría copiar.
      const hayPieza = tipo === 'mueble' ? caso.catalogo.muebles.some((m) => m.id === ref)
        : tipo === 'objeto' ? caso.catalogo.objetos.some((o) => o.id === ref) : caso.personajes.some((p) => p.id === ref);
      if (!hayPieza) return;
      const { x, y } = centroDeZona(zonaCaminable(sala.encuadre));
      if (tipo === 'mueble') fijarClavesDeMuebles(sala);
      const clave = claveLibre(ref, clavesDeSala(sala));
      if (tipo === 'mueble') {
        sala.muebles.push({ ref, x, y, espejo: false, clave });
        crearChoque(sala, clave, ref, x, y, caso.catalogo);
      }
      else if (tipo === 'objeto') sala.objetos.push({ ref, x, y, clave });
      else sala.personajes.push({ ref, x, y, mirando: 'izquierda', expresion: 'neutral', clave });
    });
  }

  editarPersonajeEnSala(
    salaId: string,
    indice: number,
    cambios: Partial<Pick<ColocacionPersonaje, 'mirando' | 'expresion'>>,
  ): void {
    this.cambiarSala(salaId, 'Cambiaste a un personaje', (_caso, sala) => {
      const personaje = sala.personajes[indice];
      if (personaje) Object.assign(personaje, cambios);
    });
  }

  /**
   * Cómo se mueve una persona de la sala. Un «va y viene» necesita su punto y este se revisa antes: dentro de la zona por
   * donde se camina, fuera de los muebles y lejos de donde está la persona; si no sirve, no se cambia nada y se dice por qué.
   */
  fijarMovimiento(salaId: string, indice: number, movimiento: MovimientoPersonaje): { ok: true } | { ok: false; motivo: string } {
    const caso = this.estado();
    const sala = caso?.salas.find((s) => s.id === salaId);
    const persona = sala?.personajes[indice];
    if (!caso || !sala || !persona) return { ok: false, motivo: 'Esa persona ya no está en la sala.' };
    if (typeof movimiento !== 'string' && movimiento.tipo === 'va-y-viene') {
      const revisado = revisarPuntoDeIda(sala, caso.catalogo, persona, movimiento.hasta);
      if (!revisado.ok) return revisado;
    }
    const nuevo: MovimientoPersonaje = structuredClone(movimiento);
    this.cambiarSala(salaId, 'Cambiaste cómo se mueve una persona', (_caso, s) => {
      const p = s.personajes[indice];
      if (p) p.movimiento = structuredClone(nuevo);
    });
    return { ok: true };
  }

  /**
   * Marca o desmarca a la persona a atender de la sala. Hay a lo sumo una por sala: marcar a otra desmarca a la anterior, y
   * se devuelve el nombre de quien dejó de serlo (o `null`) para que el editor lo diga.
   */
  marcarPersonaAAtender(salaId: string, indice: number, marcada: boolean): string | null {
    const caso = this.estado();
    const sala = caso?.salas.find((s) => s.id === salaId);
    if (!caso || !sala?.personajes[indice]) return null;
    const anterior = marcada ? sala.personajes.findIndex((p, i) => i !== indice && p.personaClave === true) : -1;
    const nombreAnterior = anterior >= 0
      ? (caso.personajes.find((p) => p.id === sala.personajes[anterior].ref)?.nombre ?? sala.personajes[anterior].ref)
      : null;
    this.cambiarSala(salaId, marcada ? 'Marcaste a la persona a atender' : 'Quitaste la marca de la persona a atender', (_caso, s) => {
      s.personajes.forEach((p, i) => {
        if (i === indice) p.personaClave = marcada;
        else if (marcada) p.personaClave = false;
      });
    });
    return nombreAnterior;
  }

  /** Gira un mueble (espejo). */
  voltearMueble(salaId: string, indice: number): void {
    this.cambiarSala(salaId, 'Volteaste un mueble', (_caso, sala) => {
      const mueble = sala.muebles[indice];
      if (mueble) mueble.espejo = !mueble.espejo;
    });
  }

  /** La herramienta del caso que el objeto entrega al revisarlo (`null`: ninguna). Se puede deshacer. */
  herramientaDeObjeto(salaId: string, indice: number, codigo: string | null): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    const que = codigo ? 'Elegiste la herramienta que entrega un objeto' : 'Quitaste la herramienta que entregaba un objeto';
    this.cambiarSala(salaId, que, (_caso, sala) => {
      const objeto = sala.objetos[indice];
      if (!objeto) return;
      if (codigo) objeto.toolCode = codigo;
      else delete objeto.toolCode;
    });
  }

  /** Deja la sala como viene en la biblioteca (vuelve a leerla). Se puede deshacer. */
  async volverSalaOriginal(salaId: string): Promise<void> {
    const caso = this.estado();
    if (!caso) return;
    const origen = this.sala(caso, salaId).origen;
    if (!origen) return; // una sala sin lugar no tiene original al que volver
    const escenario = await this.biblioteca.escenario(origen.lugarId);
    const original = escenario.salas.find((s) => s.id === origen.salaId);
    if (!original) return;
    this.cambiarSala(salaId, 'Volviste la sala a como viene en el lugar', (caso, sala) => {
      const copia = structuredClone(original);
      const usadas = new Set<string>(sala.puertas.map((p) => p.id));
      const conClave = <T extends { ref: string }>(piezas: T[]) => piezas.map((p) => ({ ...p, clave: claveLibre(p.ref, usadas) }));
      const anteriores = sala.muebles.map((m, i) => ({ ...m, clave: claveDeMueble(sala, i) }));
      const choquesAnteriores = { ...sala.choques };
      for (const m of anteriores) delete sala.choques[m.clave];
      sala.muebles = conClave(copia.muebles);
      for (const [i, m] of sala.muebles.entries()) {
        const clave = claveDeMueble(sala, i);
        const anterior = anteriores.find(a => a.clave === clave);
        const choque = choquesAnteriores[clave];
        if (anterior && choque) {
          sala.choques[clave] = choque;
          trasladarChoque(sala, clave, m.x - anterior.x, m.y - anterior.y);
        } else crearChoque(sala, clave, m.ref, m.x, m.y, caso.catalogo);
      }
      sala.objetos = conClave(copia.objetos);
      sala.personajes = conClave(copia.personajes);
      sala.entrada = copia.entrada;
    });
  }

  // ─── Escenas y caminos ──────────────────────────────────────────────────────

  private nuevaEscena(caso: CasoBorrador, id: string, salaId: string | null, despuesDe?: string): Escena {
    // Una escena sin sala (sin mapa) abre la siguiente sin sala: no hay una sala de la cual copiar.
    const sala = salaId === null ? null : this.sala(caso, salaId);
    const ref = despuesDe ? caso.escenas.find((e) => e.id === despuesDe) : undefined;
    const masDerecha = Math.max(0, ...caso.escenas.map((e) => e.posicion.x));
    const escena: Escena = {
      id,
      titulo: sala ? `Escena nueva en ${sala.nombre.charAt(0).toLowerCase()}${sala.nombre.slice(1)}` : 'Escena nueva',
      narracion: '',
      salaId,
      lineas: [],
      respuestas: [],
      esFinal: false,
      intensidad: 'MEDIUM',
      advertencia: null,
      posicion: posicionLibre(caso.escenas.map((e) => e.posicion),
        ref ? { x: ref.posicion.x + SEPARACION_ESCENAS, y: ref.posicion.y + 120 } : { x: masDerecha + SEPARACION_ESCENAS, y: 0 }),
    };
    caso.escenas.push(escena);
    if (!caso.inicioId) caso.inicioId = escena.id;
    return escena;
  }

  /** Agrega una escena en una sala del caso y devuelve su id. */
  agregarEscena(salaId: string | null, despuesDe?: string): string {
    const id = nuevoId('escena');
    this.ejecutar({
      nombre: 'la escena nueva',
      resumen: [`Agregaste una escena nueva en la sala «${this.nombreSala(salaId)}»`],
      aplicar: (caso) => { this.nuevaEscena(caso, id, salaId, despuesDe); },
      enviar: (despues, sesion) => persistir.crearEscena(sesion, despues, id),
    });
    return id;
  }

  duplicarEscena(id: string): string {
    const nueva = nuevoId('escena');
    const lineas = new Map<string, string>();
    const respuestas = new Map<string, string>();
    const pistas = new Map<string, string>();
    this.ejecutar({
      nombre: 'la copia de la escena',
      resumen: [`Duplicaste la escena «${this.tituloEscena(id)}»`],
      aplicar: (caso) => {
        const original = this.escena(caso, id);
        const copia: Escena = structuredClone(original);
        copia.id = nueva;
        copia.titulo = `${original.titulo} (copia)`;
        copia.posicion = { x: original.posicion.x + 40, y: original.posicion.y + 40 };
        copia.marcaIa = false;
        if (copia.pistas) copia.pistas = copia.pistas.map((p) => ({ ...p, id: pistas.get(p.id) ?? pistas.set(p.id, nuevoId('pista')).get(p.id)! }));
        copia.lineas = copia.lineas.map((l) => ({ ...l, id: lineas.get(l.id) ?? lineas.set(l.id, nuevoId('linea')).get(l.id)! }));
        copia.respuestas = copia.respuestas.map((r) => ({
          ...r,
          id: respuestas.get(r.id) ?? respuestas.set(r.id, nuevoId('respuesta')).get(r.id)!,
          destinoId: r.destinoId === original.id ? copia.id : r.destinoId,
        }));
        caso.escenas.splice(caso.escenas.indexOf(original) + 1, 0, copia);
      },
      enviar: async (despues, sesion) => {
        await persistir.crearEscena(sesion, despues, nueva);
        await persistir.sincronizarGuion(sesion, despues, nueva);
        for (const r of this.escena(despues, nueva).respuestas) await persistir.sincronizarRespuesta(sesion, despues, r.id);
      },
    });
    return nueva;
  }

  /** Borra una escena: las respuestas que llevaban a ella quedan sin destino. */
  borrarEscena(id: string): void {
    this.ejecutar({
      nombre: 'el borrado de la escena',
      resumen: [`Borraste la escena «${this.tituloEscena(id)}»`],
      aplicar: (caso) => {
        caso.escenas = caso.escenas.filter((e) => e.id !== id);
        for (const e of caso.escenas) {
          for (const r of e.respuestas) if (r.destinoId === id) r.destinoId = null;
        }
        if (caso.inicioId === id) caso.inicioId = caso.escenas[0]?.id ?? null;
      },
      enviar: (despues, sesion) => persistir.borrarEscena(sesion, despues, id),
    });
  }

  moverEscena(id: string, x: number, y: number): void {
    this.ejecutar({
      nombre: 'la posición de la escena',
      resumen: [`Moviste la escena «${this.tituloEscena(id)}» en el mapa`],
      aplicar: (caso) => { this.escena(caso, id).posicion = { x: Math.round(x), y: Math.round(y) }; },
      enviar: (despues, sesion) => persistir.actualizarEscena(sesion, despues, id),
      fusion: `escena:${id}`,
    });
  }

  /** Cambia a dónde lleva una respuesta (null: a ninguna escena). */
  conectar(respuestaId: string, destinoId: string | null): void {
    this.ejecutar({
      nombre: 'el camino de la respuesta',
      resumen: [`Cambiaste a dónde lleva una respuesta de la escena «${this.escenaDeRespuesta(respuestaId)}»`],
      aplicar: (caso) => {
        for (const e of caso.escenas) {
          const r = e.respuestas.find((x) => x.id === respuestaId);
          if (r) r.destinoId = destinoId;
        }
      },
      enviar: (despues, sesion) => persistir.sincronizarRespuesta(sesion, despues, respuestaId),
    });
  }

  /**
   * «Conectar con…» del mapa: agrega a la escena una respuesta (por escribir) que lleva a otra
   * escena, o a una escena nueva en la misma sala. Devuelve el id de la escena de destino.
   */
  conectarEscena(origenId: string, destino: string | 'nueva'): string {
    const destinoId = destino === 'nueva' ? nuevoId('escena') : destino;
    const respuestaId = nuevoId('respuesta');
    this.ejecutar({
      nombre: 'el camino nuevo',
      resumen: [`Conectaste la escena «${this.tituloEscena(origenId)}» con otra`],
      aplicar: (caso) => {
        const origen = this.escena(caso, origenId);
        if (destino === 'nueva') this.nuevaEscena(caso, destinoId, origen.salaId, origen.id);
        origen.respuestas.push(nuevaRespuesta(respuestaId, destinoId));
      },
      enviar: async (despues, sesion) => {
        if (destino === 'nueva') await persistir.crearEscena(sesion, despues, destinoId);
        await persistir.sincronizarRespuesta(sesion, despues, respuestaId);
      },
    });
    return destinoId;
  }

  marcarFinal(id: string, esFinal: boolean): void {
    this.ejecutar({
      nombre: 'la escena',
      resumen: [`${esFinal ? 'Marcaste' : 'Quitaste la marca de final a'} la escena «${this.tituloEscena(id)}»` + (esFinal ? ' como final' : '')],
      aplicar: (caso) => { this.escena(caso, id).esFinal = esFinal; },
      enviar: (despues, sesion) => persistir.actualizarEscena(sesion, despues, id),
    });
  }

  /** Reordena el mapa con un trazado de izquierda a derecha. */
  ordenarAutomaticamente(): void {
    this.ejecutar({
      nombre: 'el orden del mapa',
      resumen: ['Ordenaste el mapa de escenas'],
      aplicar: (caso) => {
        const posiciones = trazarEscenas(caso);
        for (const e of caso.escenas) e.posicion = posiciones.get(e.id) ?? e.posicion;
      },
      enviar: async (despues, sesion) => {
        for (const e of despues.escenas) await persistir.actualizarEscena(sesion, despues, e.id);
      },
    });
  }

  editarEscena(id: string, cambios: Partial<Pick<Escena, 'titulo' | 'intensidad' | 'advertencia' | 'recursosApoyo'>>): void {
    const escena = this.tituloEscena(id);
    this.ejecutar({
      nombre: 'la escena',
      aplicar: (caso) => { Object.assign(this.escena(caso, id), cambios); },
      enviar: (despues, sesion) => persistir.actualizarEscena(sesion, despues, id),
      fusion: `escena:${id}`,
      resumen: [
        ...textoCompleto('Título de una escena', cambios.titulo),
        ...(cambios.intensidad ? [`Cambiaste la intensidad de la escena «${escena}»`] : []),
        ...textoCompleto(`Aviso para el estudiante de la escena «${escena}»`, cambios.advertencia ?? undefined),
        ...(cambios.recursosApoyo ? [`Cambiaste los recursos de apoyo de la escena «${escena}»${cambios.recursosApoyo.length ? `: ${cambios.recursosApoyo.map((r) => `«${r}»`).join(', ')}` : ''}`] : []),
      ],
    });
  }

  /** El objetivo de la escena (hasta 200 caracteres; el servidor lo valida). Vacío = no lo declara. */
  editarObjetivo(escenaId: string, texto: string): void {
    const titulo = this.tituloEscena(escenaId);
    this.ejecutar({
      nombre: 'el objetivo de la escena',
      aplicar: (caso) => { this.escena(caso, escenaId).objetivo = texto; },
      enviar: (despues, sesion) => persistir.actualizarEscena(sesion, despues, escenaId),
      fusion: `escena:${escenaId}`,
      resumen: texto.trim() ? textoCompleto(`Objetivo de la escena «${titulo}»`, texto) : [`Quitaste el objetivo de la escena «${titulo}»`],
    });
  }

  /**
   * Deja en la escena exactamente estas pistas, en este orden (crea, cambia o borra las del servidor para que coincidan). Las
   * que ya estaban conservan su id; las nuevas nacen con uno propio. Una pista en blanco se queda en el borrador sin guardarse.
   */
  fijarPistas(escenaId: string, textos: string[]): void {
    const titulo = this.tituloEscena(escenaId);
    // La cola reaplica el cambio al guardarlo y al recomponer el borrador: la pista nueva tiene que nacer con el mismo id
    // todas las veces, o su campo se rehace y se pierde lo que la docente está escribiendo.
    const nuevas = new Map<number, string>();
    this.ejecutar({
      nombre: 'las pistas',
      aplicar: (caso) => {
        const escena = this.escena(caso, escenaId);
        const previas = escena.pistas ?? [];
        escena.pistas = textos.map((texto, i) => ({ id: previas[i]?.id ?? nuevas.get(i) ?? nuevas.set(i, nuevoId('pista')).get(i)!, texto }));
      },
      enviar: (despues, sesion) => persistir.guardarPistas(sesion, despues, escenaId),
      fusion: `pistas:${escenaId}`,
      resumen: textos.length
        ? textos.flatMap((t, i) => textoCompleto(`Pista ${i + 1} de la escena «${titulo}»`, t))
        : [`Quitaste las pistas de la escena «${titulo}»`],
    });
  }

  /** Cuándo aparece una respuesta: la condición del documento tal cual (`{}` = siempre). */
  editarRequisito(escenaId: string, respuestaId: string, condicion: Record<string, unknown>): void {
    this.ejecutar({
      nombre: 'el requisito de la respuesta',
      aplicar: (caso) => {
        const r = this.escena(caso, escenaId).respuestas.find((x) => x.id === respuestaId);
        if (r) r.requiere = structuredClone(condicion);
      },
      enviar: (despues, sesion) => persistir.sincronizarRespuesta(sesion, despues, respuestaId),
      fusion: `respuesta:${respuestaId}`,
      resumen: [`Cambiaste cuándo aparece una respuesta de la escena «${this.tituloEscena(escenaId)}»`],
    });
  }

  /** Cómo reacciona el personaje a una respuesta; las claves vacías no se guardan y `{}` quita la reacción. */
  editarReaccion(escenaId: string, respuestaId: string, reaccion: Reaccion): void {
    const limpia: Reaccion = {};
    for (const [clave, valor] of Object.entries(reaccion)) {
      if (valor !== undefined && valor !== null && valor !== '') (limpia as Record<string, unknown>)[clave] = valor;
    }
    const titulo = this.tituloEscena(escenaId);
    this.ejecutar({
      nombre: 'la reacción de la respuesta',
      aplicar: (caso) => {
        const r = this.escena(caso, escenaId).respuestas.find((x) => x.id === respuestaId);
        if (r) r.reaccion = { ...limpia };
      },
      enviar: (despues, sesion) => persistir.sincronizarRespuesta(sesion, despues, respuestaId),
      fusion: `respuesta:${respuestaId}`,
      resumen: limpia.linea
        ? textoCompleto(`Lo que dice el personaje al reaccionar a una respuesta de «${titulo}»`, limpia.linea)
        : [`Cambiaste cómo reacciona el personaje a una respuesta de la escena «${titulo}»`],
    });
  }

  /** Lo que dicen los personajes al acercarse el jugador (hasta 6). Con más, lanza y no cambia nada. */
  fijarComentarios(escenaId: string, comentarios: Comentario[]): void {
    if (comentarios.length > MAX_COMENTARIOS) throw new Error(`Una escena lleva hasta ${MAX_COMENTARIOS} comentarios.`);
    const titulo = this.tituloEscena(escenaId);
    this.ejecutar({
      nombre: 'lo que dicen al acercarse',
      aplicar: (caso) => { this.escena(caso, escenaId).comentarios = structuredClone(comentarios); },
      enviar: (despues, sesion) => persistir.actualizarEscena(sesion, despues, escenaId),
      fusion: `comentarios:${escenaId}`, // propia: un 400 de comentarios no debe llevarse el objetivo ni el título
      resumen: comentarios.length
        ? comentarios.flatMap((c, i) => textoCompleto(`Comentario ${i + 1} al acercarse en la escena «${titulo}»`, c.linea))
        : [`Quitaste lo que dicen al acercarse en la escena «${titulo}»`],
    });
  }

  // ─── Guion ──────────────────────────────────────────────────────────────────

  private guion(escenaId: string, que: string, cambio: (escena: Escena, caso: CasoBorrador) => void, textos: string[] = []): void {
    this.ejecutar({
      nombre: 'el guion',
      aplicar: (caso) => cambio(this.escena(caso, escenaId), caso),
      enviar: (despues, sesion) => persistir.sincronizarGuion(sesion, despues, escenaId),
      fusion: `guion:${escenaId}`,
      resumen: textos.length ? textos : [`${que} en la escena «${this.tituloEscena(escenaId)}»`],
    });
  }

  /** Agrega una línea; el personaje por defecto es el primero de la sala de la escena. */
  agregarLinea(escenaId: string): string {
    const id = nuevoId('linea');
    this.guion(escenaId, 'Agregaste una línea', (escena, caso) => {
      const enSala = caso.salas.find((s) => s.id === escena.salaId)?.personajes[0]?.ref;
      const anterior = escena.lineas.at(-1)?.personajeId;
      escena.lineas.push({
        id, personajeId: anterior ?? enSala ?? caso.personajes[0]?.id ?? '', texto: '', expresion: 'neutral', marcaIa: false,
      });
    });
    return id;
  }

  editarLinea(escenaId: string, lineaId: string, cambios: Partial<Omit<Linea, 'id'>>): void {
    this.guion(escenaId, 'Cambiaste una línea', (escena) => {
      const linea = escena.lineas.find((l) => l.id === lineaId);
      if (linea) Object.assign(linea, cambios);
    }, textoCompleto(`Una línea del guion de «${this.tituloEscena(escenaId)}»`, cambios.texto));
  }

  borrarLinea(escenaId: string, lineaId: string): void {
    this.guion(escenaId, 'Borraste una línea', (escena) => {
      escena.lineas = escena.lineas.filter((l) => l.id !== lineaId);
    });
  }

  /** Sube (-1) o baja (+1) una línea. */
  moverLinea(escenaId: string, lineaId: string, delta: -1 | 1): void {
    this.guion(escenaId, 'Moviste una línea', (escena) => moverEnLista(escena.lineas, lineaId, delta));
  }

  duplicarLinea(escenaId: string, lineaId: string): string {
    const id = nuevoId('linea');
    this.guion(escenaId, 'Duplicaste una línea', (escena) => {
      const i = escena.lineas.findIndex((l) => l.id === lineaId);
      if (i >= 0) escena.lineas.splice(i + 1, 0, { ...escena.lineas[i], id });
    });
    return id;
  }

  // ─── Respuestas ─────────────────────────────────────────────────────────────

  /** Una respuesta nueva nace en el borrador y no se guarda hasta tener clase y destino. */
  agregarRespuesta(escenaId: string): string {
    const id = nuevoId('respuesta');
    this.ejecutar({
      nombre: 'la respuesta',
      resumen: [`Agregaste una respuesta en la escena «${this.tituloEscena(escenaId)}»`],
      aplicar: (caso) => { this.escena(caso, escenaId).respuestas.push(nuevaRespuesta(id)); },
    });
    return id;
  }

  editarRespuesta(escenaId: string, respuestaId: string, cambios: Partial<Omit<Respuesta, 'id'>>): void {
    this.ejecutar({
      nombre: 'la respuesta',
      aplicar: (caso) => {
        const r = this.escena(caso, escenaId).respuestas.find((x) => x.id === respuestaId);
        if (r) Object.assign(r, cambios);
      },
      enviar: (despues, sesion) => persistir.sincronizarRespuesta(sesion, despues, respuestaId),
      fusion: `respuesta:${respuestaId}`,
      resumen: this.resumenDeRespuesta(escenaId, cambios),
    });
  }

  /** Todo lo que el docente escribió en la respuesta, completo; si no escribió texto, qué hizo. */
  private resumenDeRespuesta(escenaId: string, cambios: Partial<Omit<Respuesta, 'id'>>): string[] {
    const escena = this.tituloEscena(escenaId);
    const textos = [
      ...textoCompleto(`Una respuesta de «${escena}»`, cambios.texto),
      ...textoCompleto(`Por qué es contraindicada una respuesta de «${escena}»`, cambios.razon),
      ...textoCompleto(`Lo que lee el estudiante después de una respuesta de «${escena}»`, cambios.retroalimentacion),
    ];
    return textos.length ? textos : [`Cambiaste una respuesta en la escena «${escena}»`];
  }

  borrarRespuesta(escenaId: string, respuestaId: string): void {
    this.ejecutar({
      nombre: 'el borrado de la respuesta',
      resumen: [`Borraste una respuesta en la escena «${this.tituloEscena(escenaId)}»`],
      aplicar: (caso) => {
        const escena = this.escena(caso, escenaId);
        escena.respuestas = escena.respuestas.filter((r) => r.id !== respuestaId);
      },
      enviar: (despues, sesion) => persistir.sincronizarRespuesta(sesion, despues, respuestaId),
    });
  }

  /** Crea una escena en la misma sala, la conecta a la respuesta y devuelve su id. */
  respuestaAEscenaNueva(escenaId: string, respuestaId: string): string {
    const id = nuevoId('escena');
    this.ejecutar({
      nombre: 'la escena nueva',
      resumen: [`Hiciste que una respuesta de la escena «${this.tituloEscena(escenaId)}» abra una escena nueva`],
      aplicar: (caso) => {
        const origen = this.escena(caso, escenaId);
        const nueva = this.nuevaEscena(caso, id, origen.salaId, origen.id);
        const r = origen.respuestas.find((x) => x.id === respuestaId);
        if (r) r.destinoId = nueva.id;
      },
      enviar: async (despues, sesion) => {
        await persistir.crearEscena(sesion, despues, id);
        await persistir.sincronizarRespuesta(sesion, despues, respuestaId);
      },
    });
    return id;
  }

  /**
   * El docente revisó algo generado por IA: deja de estar marcado. Con solo `escenaId` se
   * acepta la escena misma (la que creó la IA).
   */
  aceptarIa(ruta: { escenaId: string; lineaId?: string; respuestaId?: string } | { finalId: string } | { salaId: string; tipo: TipoElemento; indice: number }): void {
    const pieza = 'tipo' in ruta ? lista(this.sala(this.estado()!, ruta.salaId), ruta.tipo)[ruta.indice] : undefined;
    this.ejecutar({
      nombre: 'la revisión',
      resumen: ['Aceptaste una parte sugerida por el asistente'],
      aplicar: (caso) => {
        if ('tipo' in ruta) {
          const elemento = lista(this.sala(caso, ruta.salaId), ruta.tipo)[ruta.indice];
          if (elemento) elemento.marcaIa = false;
          return;
        }
        if ('finalId' in ruta) {
          const f = caso.finales.find((x) => x.id === ruta.finalId);
          if (f) f.marcaIa = false;
          return;
        }
        const escena = this.escena(caso, ruta.escenaId);
        if (!ruta.lineaId && !ruta.respuestaId) {
          escena.marcaIa = false;
          return;
        }
        const elemento = ruta.lineaId
          ? escena.lineas.find((l) => l.id === ruta.lineaId)
          : escena.respuestas.find((r) => r.id === ruta.respuestaId);
        if (elemento) elemento.marcaIa = false;
      },
      enviar: async (despues, sesion) => {
        if ('tipo' in ruta) return pieza?.clave ? persistir.aceptarPieza(sesion, despues, ruta.salaId, pieza.clave) : undefined;
        if ('finalId' in ruta) return persistir.guardarFinales(sesion, despues);
        if (ruta.lineaId) return persistir.sincronizarGuion(sesion, despues, ruta.escenaId);
        if (ruta.respuestaId) {
          const decision = sesion.decisionDe(ruta.respuestaId);
          if (decision !== undefined) await sesion.aceptarDecision(decision);
          return;
        }
        const nodo = sesion.nodoDe(ruta.escenaId);
        if (nodo !== undefined) await sesion.aceptarNodo(nodo);
      },
    });
  }

  /** Cuántas partes sugeridas por la IA quedan por aceptar en la escena: ella, sus líneas, sus respuestas y las personas marcadas de su sala. */
  partesIaDeEscena(escenaId: string): number {
    const plan = persistir.planDeAceptacion(this.estado(), escenaId);
    return plan ? persistir.partesPorAceptar(plan) : 0;
  }

  /**
   * Acepta de una vez todo lo sugerido por la IA en la escena. En el servidor van varias rutas, una tras otra; si una falla, lo
   * aceptado queda aceptado, el aviso dice cuántas faltan y volver a pulsar termina (aceptar lo aceptado no cambia nada).
   */
  aceptarEscenaIa(escenaId: string): void {
    const plan = persistir.planDeAceptacion(this.estado(), escenaId);
    if (!plan || persistir.partesPorAceptar(plan) === 0) return;
    this.ejecutar({
      nombre: 'la revisión',
      resumen: ['Aceptaste todo lo sugerido por el asistente en una escena'],
      aplicar: (caso) => {
        const escena = this.escena(caso, escenaId);
        escena.marcaIa = false;
        for (const linea of escena.lineas) linea.marcaIa = false;
        for (const respuesta of escena.respuestas) respuesta.marcaIa = false;
        for (const persona of caso.salas.find((s) => s.id === escena.salaId)?.personajes ?? []) persona.marcaIa = false;
      },
      enviar: async (despues, sesion) => {
        try {
          await persistir.aceptarEscena(sesion, despues, plan);
        } catch (error) {
          // un choque de revisión no es «a medias»: lo trata el aviso de conflicto
          if (error instanceof persistir.AceptacionAMedias && (revisionConflictOf(error.causa) || this.esCasoVencido(error.causa))) throw error.causa;
          throw error;
        }
      },
    });
  }

  /** Las respuestas de la escena que ya están en el servidor, en el orden de su número (el orden en que este exporta las opciones). */
  respuestasGuardadasDe(escenaId: string): string[] {
    const sesion = this.sesion;
    const escena = this.estado()?.escenas.find((e) => e.id === escenaId);
    if (!sesion || !escena) return [];
    return escena.respuestas
      .flatMap((r) => { const numero = sesion.decisionDe(r.id); return numero === undefined ? [] : [{ id: r.id, numero }]; })
      .sort((a, b) => a.numero - b.numero)
      .map((r) => r.id);
  }

  /**
   * Aplica las partes marcadas de una propuesta de la IA en un solo paso. Si no cuadra, lanza un error y el caso no
   * cambia. Lo que se agrega queda marcado «sugerido por la IA» hasta que el docente lo acepte.
   */
  aplicarPropuesta(cambios: Cambio[], seleccion: boolean[]): void {
    const semilla = hexAleatorio(6);
    let tocados: Tocados | null = null;
    const antes = this.estado() ? structuredClone(this.estado()!) : null;
    this.ejecutar({
      nombre: 'la propuesta del asistente',
      resumen: [`Aplicaste una propuesta del asistente (${seleccion.filter(Boolean).length} ${seleccion.filter(Boolean).length === 1 ? 'parte' : 'partes'})`],
      alFallar: () => this.propuestaAplicada.set(null), // lo aplicado a medias ya no se puede deshacer de un paso
      aplicar: (caso) => {
        let n = 0;
        const resultado = aplicarCambiosIa(caso, cambios, seleccion, this.resolver(caso), (prefijo) => `${prefijo}-${semilla}${n++}`);
        Object.assign(caso, resultado.caso);
        tocados = resultado.tocados;
      },
      enviar: async (despues, sesion) => {
        const t = tocados;
        if (!t) return;
        for (const id of t.escenasNuevas) await persistir.crearEscena(sesion, despues, id);
        for (const id of t.escenas) await persistir.actualizarEscena(sesion, despues, id);
        for (const id of t.guiones) await persistir.sincronizarGuion(sesion, despues, id);
        for (const id of t.respuestas) await persistir.sincronizarRespuesta(sesion, despues, id);
        for (const id of t.salas) await this.guardarSala(sesion, despues, id);
        if (t.finales) await persistir.guardarFinales(sesion, despues);
      },
    }, { propuesta: true });
    const t = tocados as Tocados | null;
    if (antes && t) this.propuestaAplicada.set({ antes, tocados: t });
  }

  /**
   * Deshace de un solo paso la última propuesta del asistente, si no se cambió nada después: el caso vuelve a como estaba
   * y, con las mismas rutas, se borra lo que la propuesta creó y se restaura lo que cambió.
   */
  deshacerPropuesta(): void {
    const aplicada = this.propuestaAplicada();
    if (!aplicada) return;
    const { antes, tocados: t } = aplicada;
    this.ejecutar({
      nombre: 'el deshacer de la propuesta',
      resumen: ['Deshiciste la propuesta del asistente'],
      aplicar: (caso) => { Object.assign(caso, structuredClone(antes)); },
      enviar: async (despues, sesion) => {
        for (const id of t.respuestas) await persistir.sincronizarRespuesta(sesion, despues, id);
        for (const id of t.escenasNuevas) await persistir.borrarEscena(sesion, despues, id);
        for (const id of t.escenas) await persistir.actualizarEscena(sesion, despues, id);
        for (const id of t.guiones) await persistir.sincronizarGuion(sesion, despues, id);
        for (const id of t.salas) await this.guardarSala(sesion, despues, id);
        if (t.finales) await persistir.guardarFinales(sesion, despues);
      },
    });
  }

  /** Cómo traducir los números del servidor (escena, personaje, mapa, objeto, opción) a lo que hay en el borrador. */
  resolver(caso: CasoBorrador): ResolverIds {
    const sesion = this.sesion;
    if (!sesion) return resolverLocal(caso);
    return {
      escena: (nodoId) => sesion.escenaDeNodo(nodoId, caso.escenas),
      personaje: (id) => sesion.vista.characters.find((c) => c.id === id)?.key,
      sala: (mapaId) => {
        const nodo = sesion.vista.maps.find((m) => m.id === mapaId)?.nodeId;
        const escena = nodo === undefined ? undefined : sesion.escenaDeNodo(nodo, caso.escenas);
        return caso.escenas.find((e) => e.id === escena)?.salaId ?? undefined;
      },
      objeto: (objetoId) => {
        for (const mundo of sesion.mundos.values()) {
          const clave = mundo.objects.find((o) => o.id === objetoId)?.key;
          if (!clave) continue;
          for (const sala of caso.salas) {
            for (const tipo of ['mueble', 'objeto', 'personaje'] as const) {
              const indice = lista(sala, tipo).findIndex((c) => c.clave === clave);
              if (indice >= 0) return { salaId: sala.id, tipo, indice };
            }
          }
        }
        return undefined;
      },
      respuesta: (decisionId) => {
        const id = sesion.respuestaDeDecision(decisionId, caso.escenas.flatMap((e) => e.respuestas));
        const escena = caso.escenas.find((e) => e.respuestas.some((r) => r.id === id));
        return id && escena ? { escenaId: escena.id, respuestaId: id } : undefined;
      },
    };
  }

  // ─── Revisión y envío a Psicología ──────────────────────────────────────────

  /** La clave de la opción en el servidor → la respuesta del borrador que es (para llevar al docente a ella). */
  respuestaDeOpcion(optionKey: string): string | undefined {
    const caso = this.estado();
    const sesion = this.sesion;
    const decision = sesion?.vista.decisions.find((d) => d.optionKey === optionKey);
    if (!caso || !sesion || !decision) return undefined;
    return sesion.respuestaDeDecision(decision.id, caso.escenas.flatMap((e) => e.respuestas));
  }

  /**
   * Lo que el servidor opina del caso ahora: los hallazgos de la compuerta y el ciclo de vida (estado y qué se puede hacer).
   * Primero espera a que lo pendiente haya llegado, para que opine sobre lo que el docente ve.
   */
  async revisarConServidor(): Promise<{ hallazgos: ValidationIssue[]; ciclo: CaseLifecycle }> {
    await this.sincronizado();
    const sesion = this.sesion;
    if (!sesion) throw new Error('Este caso todavía no se guardó.');
    const validacion = await firstValueFrom(sesion.api.validateCase(sesion.caseVersionId));
    const ciclo = await firstValueFrom(sesion.api.lifecycle(sesion.caseVersionId));
    return { hallazgos: validacion.issues, ciclo };
  }

  /**
   * Envía el caso a revisión de Psicología (la transición de envío) con la revisión vigente y vuelve a leer el caso: queda
   * «En revisión» y solo se puede ver. Si la compuerta tiene bloqueadores, lanza el 409 con ellos y el caso sigue editable.
   */
  async enviarARevision(nota = ''): Promise<CaseLifecycle> {
    await this.sincronizado();
    const sesion = this.sesion;
    if (!sesion) throw new Error('Este caso todavía no se guardó.');
    const cuerpo = { action: 'submit' as const, ...(nota.trim() ? { note: nota.trim() } : {}) };
    let ciclo: CaseLifecycle;
    try {
      ciclo = await firstValueFrom(sesion.api.transitionCase(sesion.caseVersionId, cuerpo, sesion.revision));
    } catch (error) {
      // Con la revisión vencida el envío tampoco entra: se avisa igual que en un cambio cualquiera (ofrece recargar el caso).
      if (this.sesion === sesion && revisionConflictOf(error)) this.avisarConflicto([]);
      throw error;
    }
    await this.cargar(sesion.caseVersionId, true);
    return ciclo;
  }

  /**
   * E5 · El caso adopta una rúbrica (RK-1): una copia propia de la versión, de una rúbrica que la docente ve o de las
   * competencias del programa. Viaja POR LA COLA, como cualquier cambio: así lo que la docente escriba mientras la petición
   * va y viene espera su turno y sale después con la revisión nueva, en vez de chocar con ella o perderse en una recarga.
   * El servidor responde con la vista del editor ya con la rúbrica nueva, de modo que no hace falta otra lectura (que
   * podría fallar después de que la adopción sí entró): esa vista pasa a ser la base y los cambios en cola se reaplican
   * encima. Si mientras tanto se abrió otro caso, nada se aplica. Con la revisión vencida avisa el conflicto de siempre.
   */
  async adoptarRubrica(cuerpo: RubricAdoptRequest): Promise<void> {
    const sesion = this.sesion;
    if (!sesion || !this.estado()) throw new Error('Este caso todavía no se guardó.');
    if (this.soloLectura()) throw new Error('El caso ya no es un borrador: su rúbrica no se puede cambiar.');
    let adoptada = false;
    let fallo: unknown = null;
    this.ejecutar({
      nombre: 'la rúbrica del caso',
      aplicar: () => undefined, // en el borrador no cambia nada hasta que el servidor responde
      enviar: async (despues, s) => {
        try {
          const vista = await firstValueFrom(s.api.adoptRubric(s.caseVersionId, cuerpo, s.revision));
          s.vista = vista;
          s.revision = vista.revision;
          // `despues` es lo que la cola toma como base: se vuelve lo que el servidor dice ahora (con los ids locales).
          const leido = casoLeidoDelServidor(s, despues);
          for (const clave of Object.keys(despues)) delete (despues as unknown as Record<string, unknown>)[clave];
          Object.assign(despues, leido);
          adoptada = true;
        } catch (error) {
          fallo = error;
          throw error;
        }
      },
    });
    await this.sincronizado();
    if (this.sesion !== sesion) throw new Error('Se abrió otro caso antes de que la rúbrica quedara guardada.');
    if (adoptada) {
      this.lecturaAhora.update((v) => v + 1); // las pantallas que leen la rúbrica del servidor la vuelven a pedir
      return;
    }
    // Con conflicto la operación queda en la cola hasta que la docente recargue; el error de revisión lo dice el marco.
    throw fallo ?? new Error('No se pudo cambiar la rúbrica del caso.');
  }

  /** Otra sesión cambió el caso: se avisa, no se manda nada más y se espera a que el docente decida recargar. */
  private avisarConflicto(sinGuardar: string[]): void {
    this.conflictoAhora.set({
      mensaje: 'Otra persona (u otra pestaña) cambió este caso mientras lo editabas. Para no pisar su trabajo, tus últimos cambios no se guardaron todavía. Si recargas el caso, verás la versión guardada y estos cambios no se aplicarán.',
      sinGuardar,
    });
  }

  // ─── Lista de verificación ética ────────────────────────────────────────────

  /** Marca o desmarca un ítem de la lista de verificación; se guarda la lista completa con la revisión vigente. */
  marcarItemLista(codigo: string, cumplido: boolean): void {
    const item = this.estado()?.lista?.items.find((i) => i.codigo === codigo);
    if (!item) return;
    this.ejecutar({
      nombre: 'la lista de verificación',
      resumen: [`${cumplido ? 'Marcaste' : 'Desmarcaste'} en la lista de verificación: «${item.texto}»`],
      aplicar: (caso) => {
        const i = caso.lista?.items.find((x) => x.codigo === codigo);
        if (!i) throw new Error('Ese ítem ya no está en la lista.');
        i.cumplido = cumplido;
      },
      enviar: (despues, sesion) => persistir.guardarLista(sesion, despues),
      fusion: 'lista',
    });
  }

  // ─── Datos del caso ─────────────────────────────────────────────────────────

  /**
   * El contexto que lee el estudiante y los objetivos de aprendizaje del caso (texto plano; el servidor pone los topes).
   * `extra` (opcional) lleva los temas sensibles (RK-7) y el nombre (RK-8); lo que no se pasa no se toca.
   */
  editarFicha(contexto: string, objetivos: string[], extra: { temas?: string[]; titulo?: string } = {}): void {
    const limpio = contexto.trim();
    const lista = objetivos.map((o) => o.trim()).filter(Boolean);
    const temas = extra.temas?.map((t) => t.trim()).filter(Boolean);
    const titulo = extra.titulo?.trim();
    this.ejecutar({
      nombre: 'los datos del caso',
      resumen: [
        ...textoCompleto('Contexto del caso', limpio),
        ...(lista.length ? [`Objetivos de aprendizaje: ${lista.map((o) => `«${o}»`).join(', ')}`] : []),
        ...(temas?.length ? [`Temas sensibles: ${temas.map((t) => `«${t}»`).join(', ')}`] : []),
        ...(titulo ? [`Nombre del caso: «${titulo}»`] : []),
      ],
      aplicar: (caso) => {
        caso.contexto = limpio;
        caso.objetivos = [...lista];
        if (temas) caso.temasSensibles = [...temas];
        if (titulo) caso.titulo = titulo;
      },
      enviar: (despues, sesion) => persistir.guardarFicha(sesion, despues),
      fusion: 'ficha',
    });
  }

  // ─── Hitos y nivel de riesgo ────────────────────────────────────────────────

  agregarHito(hito: Hito): void {
    this.ejecutar({
      nombre: 'los hitos',
      resumen: [`Agregaste el hito «${hito.nombre}»`],
      aplicar: (caso) => {
        if (caso.hitos.some((h) => h.clave === hito.clave)) throw new Error('Ya hay un hito con ese nombre.');
        caso.hitos.push({ ...hito });
      },
      enviar: (despues, sesion) => persistir.guardarHitosYFinales(sesion, despues, false),
    });
  }

  editarHito(clave: string, cambios: Partial<Omit<Hito, 'clave'>>): void {
    this.ejecutar({
      nombre: 'los hitos',
      aplicar: (caso) => {
        const h = caso.hitos.find((x) => x.clave === clave);
        if (h) Object.assign(h, cambios);
      },
      // Marcar o desmarcar un hito decisivo regenera la condición de los cuatro finales de plantilla (su texto no cambia).
      enviar: (despues, sesion) => persistir.guardarHitosYFinales(sesion, despues, false),
      fusion: 'hitos',
      resumen: [
        ...textoCompleto('Nombre de un hito', cambios.nombre), ...textoCompleto('Descripción de un hito', cambios.descripcion),
        ...(cambios.decisivo !== undefined ? ['Cambiaste qué hitos deciden el final'] : []),
      ],
    });
  }

  borrarHito(clave: string): void {
    this.ejecutar({
      nombre: 'los hitos',
      resumen: ['Borraste un hito'],
      aplicar: (caso) => { caso.hitos = caso.hitos.filter((h) => h.clave !== clave); },
      // Con los finales de plantilla guardados, el servidor no deja quitar un hito que sus condiciones nombran: primero los finales.
      enviar: (despues, sesion) => persistir.guardarHitosYFinales(sesion, despues, true),
    });
  }

  fijarNivelRiesgo(nivel: NivelRiesgo | null): void {
    this.ejecutar({
      nombre: 'el nivel de riesgo',
      resumen: ['Cambiaste el nivel de riesgo del caso'],
      aplicar: (caso) => { caso.nivelRiesgo = nivel; },
      enviar: (despues, sesion) => persistir.guardarRiesgo(sesion, despues),
    });
  }

  // ─── Finales ────────────────────────────────────────────────────────────────

  private finales(que: string, cambio: (caso: CasoBorrador) => void, fusion?: string, textos: string[] = []): void {
    this.ejecutar({
      nombre: 'los finales',
      aplicar: cambio,
      enviar: (despues, sesion) => persistir.guardarFinales(sesion, despues),
      fusion,
      resumen: textos.length ? textos : [que],
    });
  }

  fijarModoFinales(modo: CasoBorrador['modoFinales']): void {
    this.finales('Cambiaste cómo se deciden los finales', (caso) => { caso.modoFinales = modo; });
  }

  agregarFinal(): string {
    const id = nuevoId('final');
    this.finales('Agregaste un final', (caso) => {
      const decisivo = caso.hitos.find((h) => h.decisivo) ?? caso.hitos[0];
      caso.finales.push({
        id, nombre: `Final ${caso.finales.length + 1}`, texto: '', tono: 'neutral', marcaIa: false,
        condicion: decisivo ? { milestone: decisivo.clave } : { count: 'contraindicated', gte: 1 },
      });
    });
    return id;
  }

  editarFinal(id: string, cambios: Partial<Omit<Final, 'id'>>): void {
    this.finales('Cambiaste un final', (caso) => {
      const f = caso.finales.find((x) => x.id === id);
      if (f) Object.assign(f, cambios);
    }, `final:${id}`, [...textoCompleto('Nombre de un final', cambios.nombre), ...textoCompleto('Texto de un final', cambios.texto)]);
  }

  /** Reescribe el nombre o el texto de uno de los cuatro finales de plantilla (modo automático); la condición sigue a los hitos decisivos. */
  editarTextoPlantilla(id: ClaveFinalPlantilla, cambios: { nombre?: string; texto?: string }): void {
    this.finales('Cambiaste un final que se calcula solo', (caso) => {
      caso.textosPlantilla = { ...caso.textosPlantilla, [id]: { ...caso.textosPlantilla?.[id], ...cambios } };
    }, `plantilla:${id}`, [...textoCompleto('Nombre de un final', cambios.nombre), ...textoCompleto('Texto de un final', cambios.texto)]);
  }

  /** Vuelve al nombre y al texto del modelo en un final de plantilla. */
  restaurarTextoPlantilla(id: ClaveFinalPlantilla): void {
    this.finales('Volviste un final al texto original', (caso) => {
      const { [id]: _quitado, ...resto } = caso.textosPlantilla ?? {};
      caso.textosPlantilla = resto;
    });
  }

  moverFinal(id: string, delta: -1 | 1): void {
    this.finales('Moviste un final', (caso) => moverEnLista(caso.finales, id, delta));
  }

  borrarFinal(id: string): void {
    this.finales('Borraste un final', (caso) => {
      caso.finales = caso.finales.filter((f) => f.id !== id);
    });
  }
}

