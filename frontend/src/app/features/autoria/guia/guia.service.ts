import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { CasoStore } from '../estado/caso.store';
import { rutaDelEditor } from '../rutas';
import { ACCIONES, type Accion } from './acciones';

export type ModoGuia = 'resaltar' | 'foco' | 'recorrido';

export interface GuiaActiva {
  accionId: string;
  modo: ModoGuia;
  paso: number;
  /** Textos de los pasos (solo en recorrido). */
  pasos: string[];
  mensaje: string;
  nombre: string;
  /** Si se encontró el elemento en la pantalla. */
  encontrado: boolean;
}

const ESPERA_MS = 25;
const INTENTOS = 60;

const enfocable = (el: HTMLElement) =>
  el.matches('a[href], button, input, select, textarea, [tabindex]') && !el.hasAttribute('disabled');

/** «¿Reducir movimiento?» según el sistema (sin matchMedia, como en las pruebas, no se reduce). */
export function reducirMovimiento(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * La guía (tablero 30): lleva al docente a la pantalla de una acción, marca el elemento en
 * morado y le pasa el foco. Tres formas: resaltar, foco (pantalla oscurecida) y recorrido
 * paso a paso. Esc la cierra y devuelve el foco a donde estaba.
 */
@Injectable({ providedIn: 'root' })
export class GuiaService {
  private readonly router = inject(Router);
  private readonly store = inject(CasoStore);
  private readonly estado = signal<GuiaActiva | null>(null);
  private readonly el = signal<HTMLElement | null>(null);
  private focoPrevio: HTMLElement | null = null;

  readonly activa = this.estado.asReadonly();
  readonly elemento = this.el.asReadonly();

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.estado()) {
          e.preventDefault();
          this.cerrar();
        } else if (e.altKey && this.estado()?.modo === 'recorrido' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          // Con el foco en el elemento señalado no se llega a la burbuja: Alt + flechas avanzan y retroceden.
          e.preventDefault();
          if (e.key === 'ArrowRight') this.siguiente();
          else this.anterior();
        }
      });
    }
  }

  accion(id: string): Accion | undefined {
    return ACCIONES.find((a) => a.id === id);
  }

  /**
   * La dirección concreta de una acción en el programa: «:sala» y «:escena» toman lo elegido o lo primero del caso. Las
   * acciones guardan su pantalla con la dirección corta del editor (`/editor/sala/:sala`); aquí se vuelve la real.
   */
  ruta(a: Accion): string | null {
    if (!a.ruta) return null;
    const caso = this.store.caso();
    const partes = this.router.url.split('?')[0].split('/').filter(Boolean);
    const i = partes.indexOf('editor');
    const salaActual = i >= 0 && partes[i + 1] === 'sala' ? decodeURIComponent(partes[i + 2] ?? '') : null;
    const escenaActual = i >= 0 && partes[i + 1] === 'escena' ? decodeURIComponent(partes[i + 2] ?? '') : null;
    const sala = salaActual ?? caso?.salas[0]?.id ?? '';
    const escena = escenaActual ?? caso?.inicioId ?? caso?.escenas[0]?.id ?? '';
    if ((a.ruta.includes(':sala') && !sala) || (a.ruta.includes(':escena') && !escena)) return rutaDelEditor('/', null);
    const corta = a.ruta.replace(':sala', encodeURIComponent(sala)).replace(':escena', encodeURIComponent(escena));
    return rutaDelEditor(corta, caso?.id ?? null);
  }

  async mostrar(accionId: string, modo: ModoGuia): Promise<void> {
    const a = this.accion(accionId);
    if (!a) return;
    if (!this.estado()) {
      const activo = document.activeElement;
      this.focoPrevio = activo instanceof HTMLElement && activo !== document.body ? activo : null;
    }
    const ruta = this.ruta(a);
    if (ruta !== null && (!this.router.navigated || this.router.url.split('?')[0] !== ruta)) {
      await this.router.navigateByUrl(ruta);
    }
    const elemento = await this.buscarElemento(a.id);
    const pasos = modo === 'recorrido' ? (a.pasos?.length ? a.pasos : [a.ayuda]) : [];
    this.el.set(elemento);
    this.estado.set({
      accionId: a.id, modo, paso: 0, pasos, nombre: a.nombre, encontrado: !!elemento,
      mensaje: elemento ? a.ayuda : `No encontré «${a.nombre}» en esta pantalla. Prueba con el buscador.`,
    });
    if (elemento) {
      if (!enfocable(elemento)) elemento.setAttribute('tabindex', '-1');
      elemento.scrollIntoView?.({ block: 'center', behavior: reducirMovimiento() ? 'auto' : 'smooth' });
      elemento.focus();
    }
  }

  siguiente(): void {
    const g = this.estado();
    if (!g) return;
    if (g.paso >= g.pasos.length - 1) {
      this.cerrar(false);
      return;
    }
    this.estado.set({ ...g, paso: g.paso + 1 });
    this.señalarPaso(g.accionId, g.paso + 1);
  }

  anterior(): void {
    const g = this.estado();
    if (g && g.paso > 0) {
      this.estado.set({ ...g, paso: g.paso - 1 });
      this.señalarPaso(g.accionId, g.paso - 1);
    }
  }

  /** Mueve el anillo y el foco al elemento del paso (si el paso no tiene uno que exista, queda el anterior). */
  private señalarPaso(accionId: string, paso: number): void {
    const selectores = this.accion(accionId)?.objetivos?.[paso] ?? [];
    for (const s of selectores) {
      const elemento = document.querySelector<HTMLElement>(`main ${s}`) ?? document.querySelector<HTMLElement>(s);
      if (!elemento) continue;
      this.el.set(elemento);
      if (!enfocable(elemento)) elemento.setAttribute('tabindex', '-1');
      elemento.scrollIntoView?.({ block: 'center', behavior: reducirMovimiento() ? 'auto' : 'smooth' });
      elemento.focus();
      return;
    }
  }

  /** Cierra la guía. Por defecto devuelve el foco a donde estaba antes de abrirla. */
  cerrar(devolverFoco = true): void {
    const previo = this.focoPrevio;
    this.estado.set(null);
    this.el.set(null);
    this.focoPrevio = null;
    if (devolverFoco && previo?.isConnected) previo.focus();
  }

  private async buscarElemento(id: string): Promise<HTMLElement | null> {
    const selector = `[data-accion~="${id}"]`;
    for (let i = 0; i < INTENTOS; i++) {
      const el = document.querySelector<HTMLElement>(`main ${selector}`) ?? document.querySelector<HTMLElement>(selector);
      if (el) return el;
      await new Promise((r) => setTimeout(r, ESPERA_MS));
    }
    return null;
  }
}
