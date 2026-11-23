import { DestroyRef, Injectable, inject, signal } from '@angular/core';

import { CasoStore, MAX_COMENTARIOS } from '../estado/caso.store';
import type { Comentario, Linea } from '../modelo/caso';

/** Cuánto se ofrece «Deshacer» después de borrar (EDITOR.md §4.6). */
export const PLAZO_DESHACER_MS = 8000;

export interface AvisoDeshacer {
  /** Qué se borró, en palabras de la docente («Borraste una línea de Laura»). */
  texto: string;
  /** `false` cuando el aviso solo explica por qué no se pudo deshacer: entonces no lleva el botón. */
  deshacible: boolean;
}

/**
 * «Deshacer» de los borrados del guion que nada del caso referencia: una línea, una frase al acercarse y una pista
 * (EDITOR.md §4.6, revisado tras Codex, hallazgo 5). El borrado va al store EN EL ACTO —así el modelo, los pendientes, la
 * vista del estudiante y el servidor nunca difieren de la pantalla— y durante 8 s se ofrece «Deshacer», que VUELVE A CREAR
 * el elemento con la API pública del store (la línea con `agregarLinea` + `editarLinea` + `moverLinea` hasta su sitio; las
 * frases y las pistas se vuelven a insertar en su sitio, sobre la lista de ese momento). Que lo recreado tenga otro
 * identificador no rompe nada: nada apunta a ellos.
 *
 * Reemplaza al borrado diferido de la primera versión, que ocultaba el elemento sin decírselo al store: mientras duraba el
 * plazo, la validación, el riel y la mini simulación leían algo que la pantalla ya no mostraba, y el borrado dependía de que
 * `pagehide` alcanzara a encolarlo. Las respuestas y las escenas no pasan por aquí: piden confirmación (las referencian otras
 * partes del caso y rehacerlas a mano no es fiel).
 *
 * Un solo «Deshacer» a la vez: borrar otra cosa reemplaza el aviso (como en iOS y en Gmail). Cerrar la pestaña no pierde
 * nada: el borrado ya está en la cola de siempre y el aviso simplemente deja de ofrecerse.
 */
@Injectable({ providedIn: 'root' })
export class DeshacerBorrado {
  private readonly store = inject(CasoStore);
  private readonly avisoActual = signal<AvisoDeshacer | null>(null);
  /** El aviso con «Deshacer» que pinta el marco, o `null`. */
  readonly aviso = this.avisoActual.asReadonly();
  /** Vuelve a poner lo borrado; devuelve por qué no pudo, o `null` si lo hizo. */
  private restaurar: (() => string | null) | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.descartar());
  }

  /** Borra una línea del guion y ofrece recrearla igual (personaje, expresión, texto y posición). */
  linea(escenaId: string, lineaId: string): void {
    const escena = this.store.caso()?.escenas.find((e) => e.id === escenaId);
    const posicion = escena?.lineas.findIndex((l) => l.id === lineaId) ?? -1;
    if (!escena || posicion < 0) return;
    const { id: _id, ...campos } = structuredClone(escena.lineas[posicion]);
    const nombre = this.store.caso()?.personajes.find((p) => p.id === campos.personajeId)?.nombre;
    this.store.borrarLinea(escenaId, lineaId);
    this.ofrecer(nombre ? `Borraste una línea de ${nombre}` : 'Borraste una línea', () => {
      this.recrearLinea(escenaId, posicion, campos);
      return null;
    });
  }

  /**
   * Borra una frase al acercarse (por su posición) y ofrece volver a ponerla. Se guarda SOLO la frase y su sitio, no la lista
   * entera: si entre el borrado y «Deshacer» la docente edita o agrega otra frase, restaurar la lista vieja se llevaría esos
   * cambios (revisión de Codex de la pasada final, hallazgo 1).
   */
  comentario(escenaId: string, indice: number): void {
    const antes = this.store.caso()?.escenas.find((e) => e.id === escenaId)?.comentarios;
    if (!antes || indice < 0 || indice >= antes.length) return;
    const borrada: Comentario = structuredClone(antes[indice]);
    this.store.fijarComentarios(escenaId, antes.filter((_, i) => i !== indice));
    this.ofrecer('Borraste una frase al acercarse', () => {
      const ahora = this.store.caso()?.escenas.find((e) => e.id === escenaId)?.comentarios;
      if (!ahora) return null;
      // El tope del servidor manda: con la escena otra vez llena no se puede volver a poner (el store lanzaría un error).
      if (ahora.length >= MAX_COMENTARIOS) return `No se pudo deshacer: la escena ya tiene ${MAX_COMENTARIOS} frases al acercarse.`;
      this.store.fijarComentarios(escenaId, insertar(ahora, indice, borrada));
      return null;
    });
  }

  /**
   * Borra una pista (por su posición) y ofrece volver a ponerla en su sitio, sobre la lista que haya en ese momento (igual que
   * las frases). `tope` es el máximo de pistas de la pantalla que las pinta.
   */
  pista(escenaId: string, indice: number, tope = Number.POSITIVE_INFINITY): void {
    const antes = this.store.caso()?.escenas.find((e) => e.id === escenaId)?.pistas?.map((p) => p.texto);
    if (!antes || indice < 0 || indice >= antes.length) return;
    const borrada = antes[indice];
    this.store.fijarPistas(escenaId, antes.filter((_, i) => i !== indice));
    this.ofrecer('Borraste una pista', () => {
      const ahora = this.store.caso()?.escenas.find((e) => e.id === escenaId)?.pistas?.map((p) => p.texto);
      if (!ahora) return null;
      if (ahora.length >= tope) return `No se pudo deshacer: la escena ya tiene ${tope} pistas.`;
      this.store.fijarPistas(escenaId, insertar(ahora, indice, borrada));
      return null;
    });
  }

  /** Vuelve a crear lo último que se borró (si el plazo no venció) y retira el aviso. */
  deshacer(): void {
    const accion = this.restaurar;
    this.descartar();
    const impedimento = accion?.() ?? null;
    // Si no se pudo, se dice por qué en el mismo aviso (sin botón «Deshacer»): nunca un clic que no hace nada en silencio.
    if (impedimento) this.mostrar({ texto: impedimento, deshacible: false });
  }

  /** Retira el aviso sin deshacer: el borrado se queda. */
  descartar(): void {
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.restaurar = null;
    this.avisoActual.set(null);
  }

  private ofrecer(texto: string, restaurar: () => string | null): void {
    this.descartar();
    this.restaurar = restaurar;
    this.mostrar({ texto, deshacible: true });
  }

  private mostrar(aviso: AvisoDeshacer): void {
    this.avisoActual.set(aviso);
    this.temporizador = setTimeout(() => this.descartar(), PLAZO_DESHACER_MS);
  }

  /** La línea nueva nace al final: se le ponen sus campos y se sube hasta la posición que tenía. */
  private recrearLinea(escenaId: string, posicion: number, campos: Omit<Linea, 'id'>): void {
    if (!this.store.caso()?.escenas.some((e) => e.id === escenaId)) return; // la escena ya no está: no hay dónde volver
    const id = this.store.agregarLinea(escenaId);
    const definidos = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined)) as Partial<Omit<Linea, 'id'>>;
    this.store.editarLinea(escenaId, id, definidos);
    const lugar = () => this.store.caso()?.escenas.find((e) => e.id === escenaId)?.lineas.findIndex((l) => l.id === id) ?? -1;
    for (let actual = lugar(); actual > posicion; actual = lugar()) {
      this.store.moverLinea(escenaId, id, -1);
      if (lugar() === actual) break; // no se movió: no insistir
    }
  }
}

/** Una copia de la lista con el elemento puesto en `indice` (o al final, si la lista ahora es más corta). */
function insertar<T>(lista: readonly T[], indice: number, elemento: T): T[] {
  const copia = [...lista];
  copia.splice(Math.min(indice, copia.length), 0, elemento);
  return copia;
}
