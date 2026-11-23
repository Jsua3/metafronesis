import { describe, expect, it } from 'vitest';
import { CASO_HOSPITAL, MUNDO_HOSPITAL } from '../testing/hospital';
import { casoSinLugar } from '../testing/caso-api';
import { casoDesdeApi } from './desde-api';

describe('lectura de estructura', () => {
  it('lee map.structure en sala.estructura, igual objeto', () => {
    expect(CASO_HOSPITAL.salas[0].estructura).toEqual(MUNDO_HOSPITAL[0].map.structure);
    expect(CASO_HOSPITAL.salas[0].estructura).not.toBe(MUNDO_HOSPITAL[0].map.structure);
  });
  it('lee muro, pos, modelo, par y sentidoUnico de cada EXIT', () => {
    expect(CASO_HOSPITAL.salas[0].puertas.find(p => p.id === 'a-pasillo')).toMatchObject({ muro: 'izquierda', pos: 176, modelo: 'madera', par: 'a-sala-espera' });
    expect(CASO_HOSPITAL.salas[1].puertas.find(p => p.id === 'a-servicio')?.sentidoUnico).toBe(true);
  });
  it('una sala de imagen fija queda con estructura null', () => {
    const fuente = casoSinLugar();
    expect(casoDesdeApi(fuente.editor, fuente.mundos).salas[0].estructura).toBeNull();
  });
  it('lee las huellas por clave de mueble', () => {
    expect(CASO_HOSPITAL.salas[0].choques['sillas-espera']).toEqual({ x: 370, y: 280, ancho: 60, alto: 15 });
  });
});
