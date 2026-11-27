import { Injectable, signal } from '@angular/core';

import type { User } from '../models/user.model';

/** Clave de `localStorage`. Guarda SOLO datos de identificación: jamás contraseñas, tokens ni nada de autenticación. */
export const CLAVE_CUENTAS_RECORDADAS = 'metafronesis.cuentas-recordadas.v1';

/** Tope de cuentas recordadas: al pasarse, se descarta la que se usó hace más tiempo. */
export const MAX_CUENTAS_RECORDADAS = 5;

const LARGO_MAX = 254;
const ROLES: ReadonlyArray<User['role']> = ['ADMIN', 'PROFESOR', 'ESTUDIANTE'];
const FORMA_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lo único que se recuerda de una cuenta. */
export interface CuentaRecordada {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  rol: User['role'];
  /** Cuándo entró por última vez con esta cuenta en este navegador (ISO 8601). */
  ultimaVez: string;
}

/** Quién es la persona que entra o está dentro: cualquier objeto con estos campos (los demás se ignoran). */
type Identidad = Pick<User, 'id' | 'nombre' | 'apellido' | 'email' | 'role'>;

/**
 * Cuentas recordadas en ESTE navegador (SIEP-281, «Cambiar de cuenta» como en GitHub). Una cuenta recordada es solo
 * una identidad (id, nombre, correo, rol): elegirla cierra la sesión actual y lleva al acceso con el correo ya puesto;
 * la contraseña se escribe siempre. No hay varias sesiones vivas ni credenciales guardadas.
 *
 * Es opt-in por uso (equipos compartidos): la lista no se llena sola en cada inicio de sesión. Una cuenta entra
 * cuando la persona pulsa «Agregar cuenta» (se guarda la actual y la siguiente que entre) o cuando entra eligiendo una
 * de la lista. Ese «la próxima que entre se guarda» vive en memoria, nunca en el almacenamiento.
 *
 * No depende de `AuthService` (es éste quien le avisa), así que no hay dependencia circular; quien cierra la sesión
 * se pasa como función.
 */
@Injectable({ providedIn: 'root' })
export class CuentasRecordadasService {
  private readonly _cuentas = signal<CuentaRecordada[]>(this.leer());
  /** Cuentas guardadas, la usada más recientemente primero. */
  readonly cuentas = this._cuentas.asReadonly();

  private readonly _guardarProxima = signal(false);
  /** En memoria: la próxima cuenta que inicie sesión se agrega a la lista. */
  readonly guardarProxima = this._guardarProxima.asReadonly();

  private readonly _correoPorEntrar = signal<string | null>(null);
  /** En memoria: el correo que el formulario de acceso debe poner, una sola vez. Nunca viaja por la URL. */
  readonly correoPorEntrar = this._correoPorEntrar.asReadonly();

  /** El formulario de acceso toma el correo (y lo deja de ofrecer). */
  consumirCorreoPorEntrar(): string | null {
    const correo = this._correoPorEntrar();
    this._correoPorEntrar.set(null);
    return correo;
  }

  /** Aviso de `AuthService` tras un inicio de sesión correcto. */
  alIniciarSesion(user: Identidad): void {
    const entra = this._guardarProxima();
    this._guardarProxima.set(false);
    const existe = this.leer().some(c => c.id === user?.id);
    if (!entra && !existe) return;
    const cuenta = this.aCuenta(user);
    if (cuenta) this.recordar(cuenta);
  }

  /** Agrega o actualiza una cuenta (con tope y orden). */
  recordar(cuenta: CuentaRecordada): void {
    const valida = this.validar(cuenta);
    if (!valida) return;
    this.escribir([valida, ...this.leer().filter(c => c.id !== valida.id)]);
  }

  quitar(id: number): void {
    this.escribir(this.leer().filter(c => c.id !== id));
  }

  quitarTodas(): void {
    this.escribir([]);
  }

  /** «Agregar cuenta»: guarda la actual, cierra sesión y deja el acceso vacío; la próxima que entre se guarda. */
  agregarCuenta(actual: Identidad | null, salir: () => void): void {
    const cuenta = actual ? this.aCuenta(actual) : null;
    if (cuenta) this.recordar(cuenta);
    this._correoPorEntrar.set(null);
    this._guardarProxima.set(true);
    salir();
  }

  /** Elegir una cuenta de la lista: cierra sesión y deja su correo para el acceso. */
  cambiarA(cuenta: CuentaRecordada, salir: () => void): void {
    this._correoPorEntrar.set(cuenta.email);
    this._guardarProxima.set(true);
    salir();
  }

  /** «Cerrar sesión y olvidar las cuentas»: borra la lista, lo pendiente y cierra sesión. */
  cerrarYOlvidar(salir: () => void): void {
    this.quitarTodas();
    this._correoPorEntrar.set(null);
    this._guardarProxima.set(false);
    salir();
  }

  private aCuenta(user: Identidad): CuentaRecordada | null {
    return this.validar({
      id: user?.id, nombre: user?.nombre ?? '', apellido: user?.apellido ?? '', email: user?.email,
      rol: user?.role, ultimaVez: new Date().toISOString(),
    });
  }

  /** Copia solo los campos permitidos si la forma es válida; si no, `null`. */
  private validar(valor: unknown): CuentaRecordada | null {
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
    const { id, nombre, apellido, email, rol, ultimaVez } = valor as Record<string, unknown>;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
    if (typeof nombre !== 'string' || nombre.length > LARGO_MAX) return null;
    if (typeof apellido !== 'string' || apellido.length > LARGO_MAX) return null;
    if (typeof email !== 'string' || email.length > LARGO_MAX || !FORMA_CORREO.test(email)) return null;
    if (typeof rol !== 'string' || !ROLES.includes(rol as User['role'])) return null;
    if (typeof ultimaVez !== 'string' || ultimaVez.length > 40 || Number.isNaN(Date.parse(ultimaVez))) return null;
    return { id, nombre, apellido, email, rol: rol as User['role'], ultimaVez };
  }

  /** Lectura defensiva: lo corrupto o inválido se descarta sin romper. */
  private leer(): CuentaRecordada[] {
    let crudo: string | null;
    try {
      crudo = localStorage.getItem(CLAVE_CUENTAS_RECORDADAS);
    } catch {
      return [];
    }
    if (!crudo) return [];
    let datos: unknown;
    try {
      datos = JSON.parse(crudo);
    } catch {
      return [];
    }
    if (!Array.isArray(datos)) return [];
    const vistos = new Set<number>();
    const cuentas: CuentaRecordada[] = [];
    for (const dato of datos) {
      const cuenta = this.validar(dato);
      if (!cuenta || vistos.has(cuenta.id)) continue;
      vistos.add(cuenta.id);
      cuentas.push(cuenta);
    }
    return this.ordenar(cuentas);
  }

  private ordenar(cuentas: CuentaRecordada[]): CuentaRecordada[] {
    return [...cuentas].sort((a, b) => Date.parse(b.ultimaVez) - Date.parse(a.ultimaVez)).slice(0, MAX_CUENTAS_RECORDADAS);
  }

  private escribir(cuentas: CuentaRecordada[]): void {
    const lista = this.ordenar(cuentas);
    try {
      if (lista.length === 0) localStorage.removeItem(CLAVE_CUENTAS_RECORDADAS);
      else localStorage.setItem(CLAVE_CUENTAS_RECORDADAS, JSON.stringify(lista));
    } catch {
      // Sin almacenamiento (modo privado, bloqueado o lleno): no se recuerda nada, y la lista en pantalla no miente.
      return;
    }
    this._cuentas.set(lista);
  }
}
