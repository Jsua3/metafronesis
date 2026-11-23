import { copiarEscenarioAlCaso } from '../modelo/copiar';
import { universidad } from '../testing/universidad';
import { rutaConcreta } from './ruta-concreta';

describe('rutaConcreta', () => {
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');

  it('sin ruta no hay a dónde ir', () => {
    expect(rutaConcreta('', caso, '/portal/casos/x/editor')).toBeNull();
  });

  it('una pantalla fija cuelga del caso abierto', () => {
    expect(rutaConcreta('/editor/datos', caso, '/portal/casos/x/editor')).toBe(`/portal/casos/${caso.id}/editor/datos`);
  });

  it(':escena toma la de la dirección actual y, si no hay, la de inicio', () => {
    const escena = caso.escenas[0].id;
    expect(rutaConcreta('/editor/escena/:escena', caso, `/portal/casos/${caso.id}/editor/escena/otra`))
      .toBe(`/portal/casos/${caso.id}/editor/escena/otra`);
    expect(rutaConcreta('/editor/escena/:escena', caso, `/portal/casos/${caso.id}/editor`))
      .toBe(`/portal/casos/${caso.id}/editor/escena/${encodeURIComponent(caso.inicioId ?? escena)}`);
  });

  it(':sala toma la primera sala si no hay una en la dirección', () => {
    expect(rutaConcreta('/editor/sala/:sala', caso, `/portal/casos/${caso.id}/editor`))
      .toBe(`/portal/casos/${caso.id}/editor/sala/${caso.salas[0].id}`);
  });

  it('sin caso, lleva a la lista de casos', () => {
    expect(rutaConcreta('/editor/sala/:sala', null, '/portal/casos')).toBe('/portal/casos');
  });
});
