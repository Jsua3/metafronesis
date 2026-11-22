import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/** Lo que elige la persona: seguir al sistema operativo, o fijar claro u oscuro. */
export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';
/** El modo que se ve. */
export type ModoTema = 'claro' | 'oscuro';

const CLAVE = 'metafronesis.tema';
const ORDEN: readonly PreferenciaTema[] = ['sistema', 'claro', 'oscuro'];

function leer(): PreferenciaTema {
  try {
    const valor = localStorage.getItem(CLAVE);
    return valor === 'claro' || valor === 'oscuro' ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

function guardar(valor: PreferenciaTema): void {
  try {
    if (valor === 'sistema') localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, valor);
  } catch {
    // Sin almacenamiento (ventana privada, sitio bloqueado): la elección vale solo para esta visita.
  }
}

/**
 * Tema de las pantallas públicas (portada, acceso y 404): sigue al sistema operativo y se puede fijar con el botón de
 * la barra; la elección se recuerda en este navegador. Cada pantalla pinta la piel en SU contenedor
 * (`[attr.data-skin]="tema.piel()"`), nunca en body ni en :root (REGLA-010): claro = piel portal, oscuro = piel juego.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly consulta = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly sistemaOscuro = signal(this.consulta?.matches ?? true);

  readonly preferencia = signal<PreferenciaTema>(leer());
  readonly modo = computed<ModoTema>(() => {
    const p = this.preferencia();
    return p === 'sistema' ? (this.sistemaOscuro() ? 'oscuro' : 'claro') : p;
  });
  readonly piel = computed<'game' | 'portal'>(() => (this.modo() === 'oscuro' ? 'game' : 'portal'));

  constructor() {
    const alCambiar = (evento: MediaQueryListEvent) => this.sistemaOscuro.set(evento.matches);
    this.consulta?.addEventListener('change', alCambiar);
    inject(DestroyRef).onDestroy(() => this.consulta?.removeEventListener('change', alCambiar));
  }

  /** Sistema → claro → oscuro → sistema. */
  siguiente(): void {
    const actual = ORDEN.indexOf(this.preferencia());
    this.fijar(ORDEN[(actual + 1) % ORDEN.length]);
  }

  fijar(valor: PreferenciaTema): void {
    this.preferencia.set(valor);
    guardar(valor);
  }
}
