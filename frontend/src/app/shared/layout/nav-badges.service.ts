import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Destinos que pueden llevar insignia: el `NavItem.id` de cada uno, no su etiqueta. Ojo con el estudiante: su destino
 * «Grupos» tiene el id `invitaciones` (DISENO §4.6 dice «grupos», que es el id del destino del DOCENTE; D-22). El tipo
 * cerrado hace que escribir `grupos` desde el Inicio del estudiante falle al compilar en vez de no pintar nada.
 */
export type DestinoConInsignia = 'invitaciones' | 'trazabilidad' | 'usuarios';

interface Registro {
  /** Id de la persona de la sesión cuando se escribió la cuenta. */
  dueno: number | null;
  cuentas: Record<string, number>;
}

/**
 * Insignias de pendientes en la navegación (DISENO §2.5, C15). Las pantallas que ya cargan el dato lo escriben aquí
 * (Inicio del estudiante: `invitaciones`; Inicio del docente: `trazabilidad`; Inicio del admin y Usuarios: `usuarios`)
 * y la barra y las pestañas lo pintan tras la etiqueta del destino, con su texto para lectores de pantalla.
 *
 * Solo para TRABAJO QUE ALGUIEN TIENE QUE HACER (aceptar, revisar, aprobar), nunca para «te falta terminar el caso»:
 * una insignia de progreso se vuelve presión (Zeigarnik).
 *
 * Sigue a la persona de la sesión (D-16): `logout()` navega sin recargar, así que en un computador del aula la
 * siguiente persona vería las cuentas de la anterior. Cada escritura guarda a su dueña y las cuentas de otra sesión
 * se leen vacías.
 */
@Injectable({ providedIn: 'root' })
export class NavBadgesService {
  private readonly auth = inject(AuthService);
  private readonly registro = signal<Registro>({ dueno: null, cuentas: {} });

  private readonly persona = computed(() => this.auth.currentUser()?.id ?? null);

  constructor() {
    // Al cerrar sesión el registro se VACÍA, no solo se oculta: si la misma persona vuelve a entrar sin recargar, no
    // deben reaparecer pendientes de la sesión anterior (quizá ya resueltos) hasta que una pantalla los actualice
    // Un efecto observa la sesión: lo único que escucha es la sesión.
    effect(() => {
      if (this.persona() === null) untracked(() => this.registro.set({ dueno: null, cuentas: {} }));
    });
  }

  /** Pendientes por id de destino (`NavItem.id`). Vacío si no hay sesión o si las escribió otra persona. */
  readonly cuentas = computed<Record<string, number>>(() => {
    const { dueno, cuentas } = this.registro();
    const persona = this.persona();
    return persona !== null && dueno === persona ? cuentas : {};
  });

  /** Fija los pendientes de un destino. 0, negativos o valores no finitos quitan la insignia. */
  fijar(id: DestinoConInsignia, n: number): void {
    const persona = this.persona();
    if (persona === null) return;
    const valor = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    this.registro.update(({ dueno, cuentas }) => {
      const base = dueno === persona ? { ...cuentas } : {};
      if (valor > 0) base[id] = valor;
      else delete base[id];
      return { dueno: persona, cuentas: base };
    });
  }

  /**
   * La insignia de «Usuarios» (administración): solicitudes de acceso por revisar + cuentas importadas por aprobar. Es LA
   * fuente de ese número: la escriben el Inicio y la propia pantalla de Usuarios, y esa pantalla dice la misma cifra en
   * su resumen. Si alguna de las dos no se pudo leer (`null`) no hay cifra que decir —una suma a medias parecería un
   * conteo exacto— y la insignia se quita.
   */
  fijarUsuarios(solicitudes: number | null, cuentasPorAprobar: number | null): void {
    this.fijar('usuarios', pendientesDeUsuarios(solicitudes, cuentasPorAprobar) ?? 0);
  }

  /** Pendientes de un destino (0 si no hay). */
  cuenta(id: string): number {
    return this.cuentas()[id] ?? 0;
  }
}

/** El total de pendientes de Usuarios, o `null` si falta una de las dos cifras. */
export function pendientesDeUsuarios(solicitudes: number | null, cuentasPorAprobar: number | null): number | null {
  return solicitudes === null || cuentasPorAprobar === null ? null : solicitudes + cuentasPorAprobar;
}

/** Lo que se ve en la insignia: más de 99 se abrevia para no ensanchar la pestaña. */
export function textoInsignia(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** Lo que oye un lector de pantalla tras la etiqueta del destino. */
export function textoInsigniaAccesible(n: number): string {
  return n === 1 ? ' (1 pendiente)' : ` (${n} pendientes)`;
}
