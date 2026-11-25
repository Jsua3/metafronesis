import { DestroyRef, computed, signal } from '@angular/core';

/** Dónde va el panel de la IA en escritorio (diseño §6): acoplado a un lado o flotando donde lo deje el docente. */
export type ModoPosicion = 'derecha' | 'izquierda' | 'flotante';

export const CLAVE_POSICION = 'metafronesis.autoria.ia.posicion';
/** A menos de esto de un borde, soltar el panel lo acopla a ese lado (imán). */
export const IMAN_PX = 48;
/** Hay que mover el puntero al menos esto para que cuente como arrastre (un clic en la cabeza no lo mueve). */
const UMBRAL_PX = 4;
const MARGEN_PX = 12;
const ESCRITORIO = '(min-width: 64rem)';

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
 * Arrastrar la cabeza lo deja flotando; soltarlo cerca de un borde lo acopla. Arrastrar no es la única forma: el menú
 * «Mover el asistente» elige la posición con teclado (WCAG 2.5.7).
 */
export class PosicionDelPanel {
  readonly modo = signal<ModoPosicion>('derecha');
  /** En escritorio el panel se puede mover; en pantallas angostas va en su lugar de siempre. */
  readonly movible = signal(false);
  private readonly punto = signal<{ x: number; y: number } | null>(null);

  readonly estilos = computed((): Record<string, string> => {
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

  poner(modo: ModoPosicion): void {
    if (modo === 'flotante' && !this.punto()) {
      const caja = this.host.getBoundingClientRect();
      const area = this.area();
      this.punto.set({ x: Math.max(MARGEN_PX, caja.left - area.left - 32), y: Math.max(MARGEN_PX, caja.top - area.top + 32) });
    }
    this.modo.set(modo);
    this.guardar();
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
    let arrastrando = false;

    const mover = (e: PointerEvent) => {
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      if (!arrastrando && Math.hypot(dx, dy) < UMBRAL_PX) return;
      arrastrando = true;
      this.modo.set('flotante');
      this.punto.set({
        x: limitar(origen.x + dx, MARGEN_PX, area.width - caja.width - MARGEN_PX),
        y: limitar(origen.y + dy, MARGEN_PX, area.height - 160),
      });
    };
    const soltar = () => {
      removeEventListener('pointermove', mover);
      removeEventListener('pointerup', soltar);
      removeEventListener('pointercancel', soltar);
      if (!arrastrando) return;
      const p = this.punto();
      if (p && p.x <= IMAN_PX) this.modo.set('izquierda');
      else if (p && area.width - (p.x + caja.width) <= IMAN_PX) this.modo.set('derecha');
      this.guardar();
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
