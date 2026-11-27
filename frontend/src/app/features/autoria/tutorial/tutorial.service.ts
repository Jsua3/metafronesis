import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { CasoStore } from '../estado/caso.store';
import { GuiaService, reducirMovimiento } from '../guia/guia.service';
import { rutaConcreta } from '../guia/ruta-concreta';
import type { CasoBorrador } from '../modelo/caso';
import { RUTA_CASOS, rutaDelEditor } from '../rutas';
import { CAPITULOS, type CapituloTutorial, type PasoTutorial, TOTAL_PASOS } from './capitulos';
import { PROGRESO_INICIAL, type ProgresoTutorial, guardarProgreso, leerProgreso } from './progreso-tutorial';

const ESPERA_MS = 25;
const INTENTOS = 40;
/** En esta pestaña, el caso de práctica cuyo tutorial está abierto: al recargar (F5) se reanuda en el mismo paso. */
const CLAVE_ACTIVO = 'siep.tutorial.activo';

function sesion(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * El tutorial de creación de casos: lleva a la docente por los capítulos de `CAPITULOS` sobre el editor real, señala cada
 * parte y detecta los pasos prácticos comparando el caso con la foto que se tomó al entrar al paso. El progreso vive en
 * `localStorage` (por usuario) y se guarda en cada paso. Solo corre sobre el caso de práctica: en otro caso se pausa.
 *
 * Patrón: State (un solo estado de progreso, `ProgresoTutorial`) con un guion de datos (`CAPITULOS`) que no sabe de UI.
 */
@Injectable({ providedIn: 'root' })
export class TutorialService {
  private readonly router = inject(Router);
  private readonly store = inject(CasoStore);
  private readonly auth = inject(AuthService);
  private readonly guia = inject(GuiaService);

  private readonly progreso = signal<ProgresoTutorial>({ ...PROGRESO_INICIAL });
  private foto: CasoBorrador | null = null;

  readonly activo = signal(false);
  readonly estado = this.progreso.asReadonly();
  readonly elemento = signal<HTMLElement | null>(null);
  /** El paso práctico vigente ya se cumplió. */
  readonly cumplido = signal(false);
  /** El capítulo recién terminado, mientras se muestra su logro. */
  readonly logro = signal<CapituloTutorial | null>(null);
  /** Se terminó el último capítulo: se muestra la pantalla final. */
  readonly final = signal(false);
  /** Sube con Alt+B: la capa lleva el foco a la burbuja. */
  readonly focoBurbuja = signal(0);
  /** La fase vigente del paso práctico (índice en `paso().fases`); `null` = aún en el primer objetivo del paso. */
  readonly fase = signal<number | null>(null);

  readonly capitulo = computed<CapituloTutorial>(() => CAPITULOS[Math.min(this.progreso().capitulo, CAPITULOS.length - 1)]);
  readonly paso = computed<PasoTutorial>(() => {
    const pasos = this.capitulo().pasos;
    return pasos[Math.min(this.progreso().paso, pasos.length - 1)];
  });
  /** Número del paso en todo el tutorial (1…TOTAL_PASOS), para la barra de progreso. */
  readonly pasoGlobal = computed(() =>
    CAPITULOS.slice(0, this.progreso().capitulo).reduce((n, c) => n + c.pasos.length, 0) + this.progreso().paso + 1);
  readonly totalPasos = TOTAL_PASOS;
  readonly pausado = computed(() => this.activo() && this.store.caso()?.id !== this.progreso().casoId);
  /** Lo que se le pide a la docente ahora en un paso práctico: la consigna de la fase vigente o la del paso. */
  readonly consigna = computed(() => {
    const p = this.paso();
    const f = this.fase();
    return (f !== null ? p.fases?.[f]?.consigna : undefined) ?? p.practico?.consigna ?? null;
  });

  constructor() {
    // Paso práctico: cada cambio del caso se compara con la foto tomada al entrar al paso.
    effect(() => {
      const ahora = this.store.caso();
      if (!this.activo() || !ahora || this.pausado()) return;
      const p = untracked(() => this.paso());
      if (!p.practico || untracked(() => this.cumplido()) || !this.foto) return;
      if (p.practico.cumplido(this.foto, ahora)) this.cumplido.set(true);
    });
    if (typeof document !== 'undefined') {
      // Los atajos que anuncia el pie de la burbuja. Ninguno actúa si otra pieza ya atendió la tecla (un menú o un diálogo
      // que se cierra con Esc) ni con Ctrl, Cmd o Mayús. `code` y no `key` para la B: en macOS Opción+B escribe «∫».
      document.addEventListener('keydown', (e) => {
        if (!this.activo() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (e.key === 'Escape' && !e.altKey) {
          // Con un menú, la paleta de Ayuda u otro diálogo abiertos, Esc es de ellos: cierra eso y no el tutorial.
          if (document.querySelector('.cdk-overlay-pane:not(:empty), dialog[open], [aria-modal="true"]')) return;
          e.preventDefault();
          this.salir();
        } else if (e.altKey && e.key === 'ArrowRight') {
          e.preventDefault();
          void this.pasoSiguienteConTeclado();
        } else if (e.altKey && e.key === 'ArrowLeft') {
          e.preventDefault();
          void this.anterior();
        } else if (e.altKey && e.code === 'KeyB') {
          e.preventDefault();
          this.focoBurbuja.update((n) => n + 1);
        }
      });
    }
    // Lo señalado puede desaparecer: un «Cargando…» que se cambia por el contenido, una lista que se redibuja. Entonces se
    // vuelve a buscar en la pantalla del paso (sin navegar) para que el anillo no quede en la nada.
    // Y en un paso con fases, el anillo sigue a la docente hasta el control donde termina la acción.
    if (typeof window !== 'undefined') {
      window.setInterval(() => {
        if (!this.activo() || this.pausado() || this.rebuscando) return;
        if (this.actualizarFase()) return;
        const el = this.elemento();
        if (el && !el.isConnected) void this.reseñalar();
      }, 300);
    }
    // Un cambio del caso (la respuesta nueva, su texto) puede abrir la fase siguiente sin esperar al próximo tic.
    effect(() => {
      this.store.caso();
      if (untracked(() => this.activo())) queueMicrotask(() => this.actualizarFase());
    });
  }

  private rebuscando = false;

  /**
   * Señala la fase más avanzada del paso práctico cuyo elemento está en pantalla. Devuelve si hay una fase vigente; si
   * dejó de haberla (se cerró la lista, se borró la respuesta), vuelve a los objetivos del paso.
   */
  actualizarFase(): boolean {
    const p = this.paso();
    const ahora = this.store.caso();
    if (!this.activo() || this.logro() || this.final() || !p.fases?.length || !this.foto || !ahora) return false;
    for (let i = p.fases.length - 1; i >= 0; i--) {
      for (const s of p.fases[i].objetivos(this.foto, ahora)) {
        const el = this.primeroVisible(s);
        if (!el) continue;
        if (this.fase() !== i) this.fase.set(i);
        if (this.elemento() !== el) {
          this.elemento.set(el);
          el.scrollIntoView?.({ block: 'center', behavior: reducirMovimiento() ? 'auto' : 'smooth' });
        }
        return true;
      }
    }
    if (this.fase() !== null) {
      this.fase.set(null);
      void this.reseñalar();
    }
    return false;
  }

  /** El primer elemento visible para `s`: antes en la pantalla del editor y, si no, en cualquier parte (el inspector). */
  private primeroVisible(s: string): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    const visible = (el: HTMLElement) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true);
    try {
      const propio = document.querySelector<HTMLElement>(`#main-content ${s}`);
      if (propio && visible(propio)) return propio;
      return [...document.querySelectorAll<HTMLElement>(s)].find(visible) ?? null;
    } catch {
      return null; // un selector que este navegador no entiende (p. ej. sin `:has`): la fase no aplica
    }
  }

  private async reseñalar(): Promise<void> {
    this.rebuscando = true;
    try {
      const p = this.paso();
      const el = await this.buscar(p.objetivos);
      if (this.activo() && this.paso() === p) this.elemento.set(el);
    } finally {
      this.rebuscando = false;
    }
  }

  private usuario() {
    return this.auth.currentUser()?.id ?? null;
  }

  private fijar(p: ProgresoTutorial): void {
    this.progreso.set(p);
    guardarProgreso(this.usuario(), p);
  }

  /** Empieza (o retoma) el tutorial sobre el caso de práctica `casoId`. Con `reiniciar`, vuelve al capítulo 1. */
  async iniciar(casoId: string, reiniciar = false): Promise<void> {
    const guardado = leerProgreso(this.usuario());
    const base = reiniciar || guardado.terminado ? { ...PROGRESO_INICIAL, completados: reiniciar ? [] : guardado.completados } : guardado;
    this.fijar({ ...base, casoId, terminado: false });
    sesion()?.setItem(CLAVE_ACTIVO, casoId);
    this.guia.cerrar(false);
    this.logro.set(null);
    this.final.set(false);
    this.activo.set(true);
    await this.entrar();
  }

  async siguiente(): Promise<void> {
    if (!this.activo() || this.logro() || this.final()) return;
    const p = this.paso();
    if (p.practico && !this.cumplido()) return;
    await this.avanzar(p.practico ? p.id : null);
  }

  /**
   * Alt+→ «cambia de paso» siempre que hay uno después: en la insignia de un capítulo, continúa; en un paso práctico sin
   * hacer, lo salta (como «Saltar este paso»); en cualquier otro, es «Siguiente». Antes no hacía nada en esos dos casos.
   */
  async pasoSiguienteConTeclado(): Promise<void> {
    if (!this.activo() || this.final()) return;
    if (this.logro()) return this.continuar();
    if (this.paso().practico && !this.cumplido()) return this.saltarPractico();
    return this.siguiente();
  }

  async saltarPractico(): Promise<void> {
    if (this.activo() && !this.logro() && !this.final() && this.paso().practico) await this.avanzar(null);
  }

  async anterior(): Promise<void> {
    const { capitulo, paso } = this.progreso();
    if (!this.activo() || this.final() || (capitulo === 0 && paso === 0)) return;
    if (this.logro()) {
      // Desde el logro, «Anterior» vuelve al último paso del capítulo recién terminado.
      this.logro.set(null);
      await this.entrar();
      return;
    }
    if (paso > 0) this.fijar({ ...this.progreso(), paso: paso - 1 });
    else this.fijar({ ...this.progreso(), capitulo: capitulo - 1, paso: CAPITULOS[capitulo - 1].pasos.length - 1 });
    await this.entrar();
  }

  /** Cierra el logro del capítulo y entra al siguiente. */
  async continuar(): Promise<void> {
    if (!this.logro()) return;
    this.logro.set(null);
    this.fijar({ ...this.progreso(), capitulo: this.progreso().capitulo + 1, paso: 0 });
    await this.entrar();
  }

  /** ¿El tutorial estaba abierto en esta pestaña sobre `casoId` (y se recargó la página)? */
  estabaActivo(casoId: string): boolean {
    return !this.activo() && sesion()?.getItem(CLAVE_ACTIVO) === casoId;
  }

  salir(): void {
    sesion()?.removeItem(CLAVE_ACTIVO);
    this.activo.set(false);
    this.elemento.set(null);
    this.logro.set(null);
    this.final.set(false);
    this.foto = null;
  }

  /** La docente se fue a otra pantalla a mitad del paso: la vuelve a llevar a la del paso y lo señala de nuevo. */
  async volverAlPaso(): Promise<void> {
    if (this.activo()) await this.entrar();
  }

  /** Desde la pantalla final: a la lista de casos. */
  async irACasos(): Promise<void> {
    await this.router.navigateByUrl(RUTA_CASOS);
  }

  /** Desde la pausa: vuelve al caso de práctica, en el paso donde iba. */
  async volverAlCaso(): Promise<void> {
    const id = this.progreso().casoId;
    if (!id) return;
    await this.router.navigateByUrl(rutaDelEditor('/editor', id));
    // Hasta que el editor no abre el caso de práctica, las pantallas del paso se calcularían con el caso anterior (y la
    // navegación volvería a él): se espera a que el store lo tenga (unos segundos como mucho).
    for (let i = 0; i < 200 && this.store.caso()?.id !== id; i++) await new Promise((r) => setTimeout(r, ESPERA_MS));
    await this.entrar();
  }

  private async avanzar(practicoHecho: string | null): Promise<void> {
    const p = this.progreso();
    const practicos = practicoHecho && !p.practicos.includes(practicoHecho) ? [...p.practicos, practicoHecho] : p.practicos;
    const cap = CAPITULOS[p.capitulo];
    if (p.paso < cap.pasos.length - 1) {
      this.fijar({ ...p, practicos, paso: p.paso + 1 });
      await this.entrar();
      return;
    }
    const completados = p.completados.includes(cap.id) ? p.completados : [...p.completados, cap.id];
    const ultimo = p.capitulo === CAPITULOS.length - 1;
    this.fijar({ ...p, practicos, completados, terminado: ultimo });
    this.elemento.set(null);
    if (ultimo) this.final.set(true);
    else this.logro.set(cap);
  }

  private async entrar(): Promise<void> {
    this.cumplido.set(false);
    this.fase.set(null);
    const p = this.paso();
    const ruta = p.ruta ? rutaConcreta(p.ruta, this.store.caso(), this.router.url) : null;
    if (ruta !== null && this.router.url !== ruta) await this.router.navigateByUrl(ruta);
    const caso = this.store.caso();
    this.foto = caso ? structuredClone(caso) : null;
    const el = await this.buscar(p.objetivos);
    if (this.paso() !== p || !this.activo()) return; // otro paso empezó (o se salió) mientras se buscaba
    this.elemento.set(el);
    el?.scrollIntoView?.({ block: 'center', behavior: reducirMovimiento() ? 'auto' : 'smooth' });
  }

  private async buscar(objetivos: readonly string[]): Promise<HTMLElement | null> {
    if (!objetivos.length || typeof document === 'undefined') return null;
    // Visible de verdad (no `display: none`). Donde el navegador no sabe decirlo (las pruebas), cuenta como visible.
    const visible = (el: HTMLElement) => (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true);
    // La pantalla del editor es `#main-content`: todo el editor (barra incluida) vive dentro del `<main>` del portal, así
    // que un `main X` también encontraría la barra.
    const enMain = (s: string) => `#main-content ${s}`;
    for (let i = 0; i < INTENTOS; i++) {
      // La primera mitad de los intentos solo vale el selector principal y solo dentro de la pantalla (`#main-content`): la
      // pantalla puede tardar en dibujarlo, y la misma ancla en la barra (o un respaldo) se llevaría el anillo antes de
      // tiempo. Después vale cualquiera, también fuera de la pantalla (la barra de arriba).
      const temprano = i < INTENTOS / 2;
      for (const s of temprano ? objetivos.slice(0, 1) : objetivos) {
        const propio = document.querySelector<HTMLElement>(enMain(s));
        if (propio && visible(propio)) return propio;
        if (!temprano) {
          const cualquiera = [...document.querySelectorAll<HTMLElement>(s)].find(visible);
          if (cualquiera) return cualquiera;
        }
      }
      await new Promise((r) => setTimeout(r, ESPERA_MS));
    }
    return null;
  }
}
