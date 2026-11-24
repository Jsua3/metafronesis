import { LOGIN_PEDAGOGY_PILLARS } from './login-assets.config';
import { LOGIN_ROLES } from './login-role.config';
import {
  PASO_DE_PERFIL, RECORRIDO_PASOS, RECORRIDO_ROTULOS, indiceDePaso, pasoSiguiente,
} from './recorrido.util';

describe('recorrido del acceso', () => {
  it('los pasos siguen, en orden, los pilares de la ventana (una sola fuente para el texto)', () => {
    expect([...RECORRIDO_PASOS]).toEqual(LOGIN_PEDAGOGY_PILLARS.map(pillar => pillar.key));
  });

  it('pasoSiguiente avanza de uno en uno y después del último vuelve al primero', () => {
    expect(pasoSiguiente(0)).toBe(1);
    expect(pasoSiguiente(2)).toBe(3);
    expect(pasoSiguiente(RECORRIDO_PASOS.length - 1)).toBe(0);
  });

  it('cada paso tiene su rótulo y ninguno puntúa ni felicita (P7: nada de logro)', () => {
    expect(Object.keys(RECORRIDO_ROTULOS).sort()).toEqual([...RECORRIDO_PASOS].sort());
    for (const rotulo of Object.values(RECORRIDO_ROTULOS)) {
      expect(rotulo).not.toMatch(/\d|punt|logro|correct|incorrect|bien|mal|felicit/i);
    }
  });

  it('cada perfil lleva a un paso que existe', () => {
    expect(Object.keys(PASO_DE_PERFIL).sort()).toEqual(LOGIN_ROLES.map(role => role.id).sort());
    for (const paso of Object.values(PASO_DE_PERFIL)) expect(indiceDePaso(paso)).toBeGreaterThanOrEqual(0);
  });
});
