import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CLAVE_CUENTAS_RECORDADAS, CuentaRecordada, CuentasRecordadasService } from './cuentas-recordadas.service';

const cuenta = (id: number, extra: Partial<CuentaRecordada> = {}): CuentaRecordada => ({
  id, nombre: `Nombre${id}`, apellido: `Apellido${id}`, email: `u${id}@cue.edu.co`, rol: 'ESTUDIANTE',
  ultimaVez: new Date(2026, 0, id).toISOString(), ...extra,
});

/**
 * Cuentas recordadas en este navegador (SIEP-281): solo datos de identificación, nunca credenciales; la lista no se
 * llena sola (opt-in por uso) y se lee de forma defensiva.
 */
// req: RNF-01 (sin credenciales en el almacenamiento del navegador)
describe('CuentasRecordadasService', () => {
  let service: CuentasRecordadasService;
  const crear = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(CuentasRecordadasService);
  };

  beforeEach(() => { localStorage.clear(); crear(); });
  afterEach(() => localStorage.clear());

  it('un inicio de sesión normal NO agrega la cuenta (opt-in)', () => {
    service.alIniciarSesion({ id: 1, nombre: 'Ana', apellido: 'Ríos', email: 'ana@cue.edu.co', role: 'ADMIN' });
    expect(service.cuentas()).toEqual([]);
    expect(localStorage.getItem(CLAVE_CUENTAS_RECORDADAS)).toBeNull();
  });

  it('tras agregarCuenta() el siguiente inicio de sesión sí guarda, una sola vez, y solo los campos permitidos', () => {
    const salir = vi.fn();
    service.agregarCuenta({ id: 1, nombre: 'Ana', apellido: 'Ríos', email: 'ana@cue.edu.co', role: 'ADMIN' }, salir);
    expect(salir).toHaveBeenCalledTimes(1);
    expect(service.cuentas().map(c => c.id)).toEqual([1]);
    expect(service.correoPorEntrar()).toBeNull();
    // Un objeto con campos de más (p. ej. un token) no se cuela.
    service.alIniciarSesion({ id: 2, nombre: 'Luis', apellido: 'Paz', email: 'luis@cue.edu.co', role: 'PROFESOR', token: 'aaa.bbb.ccc', password: 'x' } as never);
    expect(service.cuentas().map(c => c.id).sort()).toEqual([1, 2]);
    const crudo = localStorage.getItem(CLAVE_CUENTAS_RECORDADAS)!;
    expect(crudo.toLowerCase()).not.toContain('token');
    expect(crudo).not.toContain('aaa.bbb.ccc');
    expect(crudo.toLowerCase()).not.toContain('password');
    expect(Object.keys(JSON.parse(crudo)[0]).sort()).toEqual(['apellido', 'email', 'id', 'nombre', 'rol', 'ultimaVez']);
    // La marca se consumió: el siguiente inicio ya no agrega.
    service.alIniciarSesion({ id: 3, nombre: 'Eva', apellido: 'Sol', email: 'eva@cue.edu.co', role: 'ESTUDIANTE' });
    expect(service.cuentas().map(c => c.id).sort()).toEqual([1, 2]);
  });

  it('una cuenta que ya está en la lista se actualiza al entrar, sin pedir opt-in', () => {
    localStorage.setItem(CLAVE_CUENTAS_RECORDADAS, JSON.stringify([cuenta(5, { rol: 'ESTUDIANTE' })]));
    crear();
    service.alIniciarSesion({ id: 5, nombre: 'Nuevo', apellido: 'Nombre', email: 'u5@cue.edu.co', role: 'PROFESOR' });
    expect(service.cuentas()).toHaveLength(1);
    expect(service.cuentas()[0]).toMatchObject({ id: 5, nombre: 'Nuevo', rol: 'PROFESOR' });
    expect(Date.parse(service.cuentas()[0].ultimaVez)).toBeGreaterThan(Date.parse('2026-06-01'));
  });

  it('cambiarA(): deja el correo en memoria, marca que la próxima entrada se guarda y sale', () => {
    const salir = vi.fn();
    service.cambiarA(cuenta(4), salir);
    expect(salir).toHaveBeenCalledTimes(1);
    expect(service.correoPorEntrar()).toBe('u4@cue.edu.co');
    expect(service.guardarProxima()).toBe(true);
    expect(localStorage.getItem(CLAVE_CUENTAS_RECORDADAS)).toBeNull();
  });

  it('consumirCorreoPorEntrar() entrega el correo una sola vez', () => {
    service.cambiarA(cuenta(4), () => undefined);
    expect(service.consumirCorreoPorEntrar()).toBe('u4@cue.edu.co');
    expect(service.consumirCorreoPorEntrar()).toBeNull();
    expect(service.correoPorEntrar()).toBeNull();
  });

  it('agregarCuenta() deja el formulario vacío (sin correo por entrar)', () => {
    service.agregarCuenta({ id: 1, nombre: 'Ana', apellido: 'Ríos', email: 'ana@cue.edu.co', role: 'ADMIN' }, () => undefined);
    expect(service.consumirCorreoPorEntrar()).toBeNull();
  });

  it('guarda como máximo 5 y descarta la más antigua', () => {
    for (let id = 1; id <= 6; id++) service.recordar(cuenta(id));
    const ids = service.cuentas().map(c => c.id);
    expect(ids).toHaveLength(5);
    expect(ids).not.toContain(1);
    expect(ids).toEqual([6, 5, 4, 3, 2]);
  });

  it('la lista sale ordenada por la última vez, la más reciente primero', () => {
    localStorage.setItem(CLAVE_CUENTAS_RECORDADAS, JSON.stringify([cuenta(1), cuenta(3), cuenta(2)]));
    crear();
    expect(service.cuentas().map(c => c.id)).toEqual([3, 2, 1]);
  });

  it('JSON corrupto o que no es un arreglo se descarta sin lanzar', () => {
    for (const crudo of ['{no es json', '{"a":1}', '"texto"', 'null', '42']) {
      localStorage.setItem(CLAVE_CUENTAS_RECORDADAS, crudo);
      expect(() => crear()).not.toThrow();
      expect(service.cuentas()).toEqual([]);
    }
  });

  it('descarta las entradas con forma inválida y conserva las buenas', () => {
    const buena = cuenta(9);
    const malas: unknown[] = [
      null, 'x', 7, [], { ...cuenta(1), id: '1' }, { ...cuenta(1), id: -3 }, { ...cuenta(1), id: 1.5 },
      { ...cuenta(1), rol: 'SUPERUSUARIO' }, { ...cuenta(1), email: 'sin-arroba' }, { ...cuenta(1), email: `${'a'.repeat(250)}@b.co` },
      { ...cuenta(1), nombre: 5 }, { ...cuenta(1), nombre: 'n'.repeat(255) }, { ...cuenta(1), ultimaVez: 'ayer' },
      { ...cuenta(1), ultimaVez: undefined }, { id: 2 },
    ];
    localStorage.setItem(CLAVE_CUENTAS_RECORDADAS, JSON.stringify([...malas, buena]));
    crear();
    expect(service.cuentas()).toEqual([buena]);
  });

  it('una entrada con campos de más solo conserva los permitidos', () => {
    localStorage.setItem(CLAVE_CUENTAS_RECORDADAS, JSON.stringify([{ ...cuenta(3), token: 'aaa.bbb.ccc' }]));
    crear();
    expect(Object.keys(service.cuentas()[0]).sort()).toEqual(['apellido', 'email', 'id', 'nombre', 'rol', 'ultimaVez']);
  });

  it('más de 5 entradas guardadas a mano se recortan al leer', () => {
    localStorage.setItem(CLAVE_CUENTAS_RECORDADAS, JSON.stringify([1, 2, 3, 4, 5, 6, 7].map(id => cuenta(id))));
    crear();
    expect(service.cuentas().map(c => c.id)).toEqual([7, 6, 5, 4, 3]);
  });

  it('un almacenamiento que lanza no rompe el servicio', () => {
    const lectura = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const escritura = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('lleno'); });
    try {
      expect(() => crear()).not.toThrow();
      expect(() => service.recordar(cuenta(1))).not.toThrow();
      expect(service.cuentas()).toEqual([]);
    } finally { lectura.mockRestore(); escritura.mockRestore(); }
  });

  it('quitar() saca una cuenta y quitarTodas() borra la clave', () => {
    service.recordar(cuenta(1));
    service.recordar(cuenta(2));
    service.quitar(1);
    expect(service.cuentas().map(c => c.id)).toEqual([2]);
    expect(JSON.parse(localStorage.getItem(CLAVE_CUENTAS_RECORDADAS)!)).toHaveLength(1);
    service.quitarTodas();
    expect(service.cuentas()).toEqual([]);
    expect(localStorage.getItem(CLAVE_CUENTAS_RECORDADAS)).toBeNull();
  });

  it('cerrarYOlvidar() borra la lista y sale; también anula lo que estaba pendiente', () => {
    service.recordar(cuenta(1));
    service.cambiarA(cuenta(1), () => undefined);
    const salir = vi.fn();
    service.cerrarYOlvidar(salir);
    expect(salir).toHaveBeenCalledTimes(1);
    expect(service.cuentas()).toEqual([]);
    expect(service.correoPorEntrar()).toBeNull();
    expect(service.guardarProxima()).toBe(false);
  });
});
