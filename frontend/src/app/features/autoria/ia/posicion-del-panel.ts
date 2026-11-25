import { DestroyRef, computed, signal } from '@angular/core';

import { reducirMovimiento } from '../guia/guia.service';
import { RESORTE_SUAVE, RESORTE_VIVO, deslizarDesde } from './resortes';

/** Dónde va el panel de la IA en escritorio (diseño §6): acoplado a un lado o flotando donde lo deje el docente. */
export type ModoPosicion = 'derecha' | 'izquierda' | 'flotante';

export const CLAVE_POSICION = 'metafronesis.autoria.ia.posicion';
/** A menos de esto de un borde, soltar el panel lo acopla a ese lado (imán). */
export const IMAN_PX = 48;
/** Hay que mover el puntero al menos esto para que cuente como arrastre (un clic en la cabeza no lo mueve). */
const UMBRAL_PX = 4;
const MARGEN_PX = 12;
/** Cuánto «vuela» el panel al soltarlo: la velocidad final (px/ms) por este tiempo (ms) es el impulso. */
const IMPULSO_MS = 140;
/** Inclinación máxima (grados) mientras se arrastra rápido: el panel se «cuelga» del puntero. */
const INCLINACION_MAX = 4;
const ESCRITORIO = '(min-width: 64rem)';
/** Las propiedades de posición que este módulo escribe en el panel. */
const PROPIEDADES = ['inset-inline-start', 'inset-block-start', 'inset-inline-end', 'inset-block-end', 'max-block-size'] as const;

interface Guardada {
  modo: ModoPosicion;
  x?: number;
  y?: number;
}

function leer(): Guardada {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE_POSICION) ?? 'null') as Guardada | null;
    if (crudo && ['derecha', 'izquierda', 'flotante'].includes(crudo.modo)) return crudo;
  } catch {
    // sin almacenamiento o con algo ilegible: se queda a la derecha
  }
  return { modo: 'derecha' };
}

const limitar = (valor: number, minimo: number, maximo: number) => Math.max(minimo, Math.min(valor, Math.max(minimo, maximo)));

/**
 * La posición del panel de la IA. Solo aplica en escritorio, donde el estudio lo pone como una tarjeta absoluta sobre el
 * área de trabajo (`.columna-ia` del armazón): aquí se cambian sus bordes con estilos en línea, sin tocar el armazón.
 *
 * El movimiento tiene física (SIEP-269, «que se sienta vivo»): mientras se arrastra, el panel se levanta y se inclina según
 * la velocidad; al soltarlo sigue con su impulso, y si va hacia un borde se acopla con un resorte que rebota. Cambiar la
 * posición desde el menú también desliza el panel con resorte. Con «reducir movimiento», todo es inmediato.
 * Arrastrar no es la única forma: el menú «Mover el asistente» elige la posición con teclado (WCAG 2.5.7).
 */
export class PosicionDelPanel {
  readonly modo = signal<ModoPosicion>('derecha');
  /** En escritorio el panel se puede mover; en pantallas angostas va en su lugar de siempre. */
  readonly movible = signal(false);
  /** Mientras el puntero lo lleva: el panel se ve levantado. */
  readonly arrastrando = signal(false);
  private readonly inclinacion = signal(0);
  private readonly punto = signal<{ x: number; y: number } | null>(null);

  /** Los bordes del panel según el modo (estilos en línea del anfitrión). */
  readonly posicion = computed((): Record<string, string> => {
    if (!this.movible()) return {};
    const modo = this.modo();
    if (modo === 'izquierda') return { 'inset-inline-start': '0.75rem', 'inset-inline-end': 'auto' };
    const p = this.punto();
    if (modo === 'flotante' && p) {
      return {
        'inset-inline-start': `${p.x}px`, 'inset-block-start': `${p.y}px`, 'inset-inline-end': 'auto', 'inset-block-end': 'auto',
        'max-block-size': `calc(100% - ${p.y + MARGEN_PX}px)`,
      };
    }
    return {};
  });

  /** Posición más el «levantado» del arrastre (inclinación y escala, que el CSS del panel suaviza con un resorte). */
  readonly estilos = computed((): Record<string, string> => {
    const base = this.posicion();
    if (!this.arrastrando()) return base;
    return { ...base, rotate: `${this.inclinacion().toFixed(2)}deg`, scale: '1.02' };
  });

  constructor(private readonly host: HTMLElement, destroyRef: DestroyRef) {
    const guardada = leer();
    this.modo.set(guardada.modo);
    if (guardada.modo === 'flotante' && typeof guardada.x === 'number' && typeof guardada.y === 'number') {
      this.punto.set({ x: Math.max(MARGEN_PX, guardada.x), y: Math.max(MARGEN_PX, guardada.y) });
    }
    if (typeof matchMedia === 'function') {
      const consulta = matchMedia(ESCRITORIO);
      this.movible.set(consulta.matches);
      const cambio = (e: MediaQueryListEvent) => this.movible.set(e.matches);
      consulta.addEventListener?.('change', cambio);
      destroyRef.onDestroy(() => consulta.removeEventListener?.('change', cambio));
    }
  }

  /** El rectángulo del área donde se mueve el panel (su contenedor posicionado). */
  private area(): DOMRect {
    const padre = this.host.offsetParent as HTMLElement | null;
    return padre?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
  }

  /** Escribe ya la posición en el panel (la vinculación de Angular escribirá lo mismo): así se puede medir y animar sin
   *  esperar al siguiente ciclo. */
  private aplicarYa(): void {
    const estilos = this.posicion();
    for (const nombre of PROPIEDADES) {
      if (estilos[nombre]) this.host.style.setProperty(nombre, estilos[nombre]);
      else this.host.style.removeProperty(nombre);
    }
  }

  /** Cambia de posición deslizando el panel con un resorte desde donde estaba. */
  private moverCon(cambio: () => void, resorte = RESORTE_SUAVE): void {
    const antes = this.host.getBoundingClientRect();
    cambio();
    this.aplicarYa();
    deslizarDesde(this.host, antes, resorte);
    this.guardar();
  }

  poner(modo: ModoPosicion): void {
    this.moverCon(() => {
      if (modo === 'flotante' && !this.punto()) {
        const caja = this.host.getBoundingClientRect();
        const area = this.area();
        this.punto.set({ x: Math.max(MARGEN_PX, caja.left - area.left - 48), y: Math.max(MARGEN_PX, caja.top - area.top + 40) });
      }
      this.modo.set(modo);
    });
  }

  empezarArrastre(evento: PointerEvent): void {
    if (!this.movible() || evento.button !== 0) return;
    const objetivo = evento.target as HTMLElement | null;
    if (objetivo?.closest('button, a, input, select, textarea, [role="menu"]')) return;
    evento.preventDefault(); // sin esto, arrastrar la cabeza selecciona texto en vez de mover el panel
    const caja = this.host.getBoundingClientRect();
    const area = this.area();
    const inicio = { x: evento.clientX, y: evento.clientY };
    const origen = { x: caja.left - area.left, y: caja.top - area.top };
    const maxX = area.width - caja.width - MARGEN_PX;
    const maxY = area.height - 160;
    let arrastrando = false;
    // Las últimas muestras del puntero, para saber con qué velocidad lo suelta.
    let muestras: { x: number; y: number; t: number }[] = [];
    const vivo = !reducirMovimiento();

    const mover = (e: PointerEvent) => {
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      if (!arrastrando && Math.hypot(dx, dy) < UMBRAL_PX) return;
      if (!arrastrando) {
        arrastrando = true;
        this.host.getAnimations?.().forEach((a) => a.cancel());
        this.arrastrando.set(vivo);
      }
      const ahora = performance.now();
      muestras = [...muestras.filter((m) => ahora - m.t < 90), { x: e.clientX, y: e.clientY, t: ahora }];
      const primera = muestras[0];
      const vx = muestras.length > 1 ? (e.clientX - primera.x) / Math.max(1, ahora - primera.t) : 0;
      this.inclinacion.set(limitar(vx * 3, -INCLINACION_MAX, INCLINACION_MAX));
      this.modo.set('flotante');
      this.punto.set({ x: limitar(origen.x + dx, MARGEN_PX, maxX), y: limitar(origen.y + dy, MARGEN_PX, maxY) });
    };

    const soltar = () => {
      removeEventListener('pointermove', mover);
      removeEventListener('pointerup', soltar);
      removeEventListener('pointercancel', soltar);
      if (!arrastrando) return;
      const p = this.punto();
      const ahora = performance.now();
      const recientes = muestras.filter((m) => ahora - m.t < 90);
      let vx = 0;
      let vy = 0;
      if (recientes.length > 1) {
        const [a, b] = [recientes[0], recientes[recientes.length - 1]];
        const dt = Math.max(1, b.t - a.t);
        vx = (b.x - a.x) / dt;
        vy = (b.y - a.y) / dt;
      }
      this.moverCon(() => {
        this.arrastrando.set(false);
        this.inclinacion.set(0);
        if (!p) return;
        // Con impulso: donde iría si siguiera; si va hacia un borde, se acopla ahí.
        const lanzado = { x: p.x + (vivo ? vx * IMPULSO_MS : 0), y: p.y + (vivo ? vy * IMPULSO_MS : 0) };
        if (lanzado.x <= IMAN_PX) this.modo.set('izquierda');
        else if (area.width - (lanzado.x + caja.width) <= IMAN_PX) this.modo.set('derecha');
        else this.punto.set({ x: limitar(lanzado.x, MARGEN_PX, maxX), y: limitar(lanzado.y, MARGEN_PX, maxY) });
      }, RESORTE_VIVO);
    };
    addEventListener('pointermove', mover);
    addEventListener('pointerup', soltar);
    addEventListener('pointercancel', soltar);
  }

  private guardar(): void {
    const p = this.punto();
    const valor: Guardada = this.modo() === 'flotante' && p ? { modo: 'flotante', x: Math.round(p.x), y: Math.round(p.y) } : { modo: this.modo() };
    try {
      localStorage.setItem(CLAVE_POSICION, JSON.stringify(valor));
    } catch {
      // sin almacenamiento: la posición dura lo que dure la página
    }
  }
}
