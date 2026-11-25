import { FILTROS, seRefresca, transicionesDe } from './sesion-presentacion';

describe('presentación de sesiones', () => {
  it('ordena los botones y descarta lo que no es transición', () => {
    expect(transicionesDe(['cancelar', 'editar', 'iniciar', 'gestionarConvocados'])).toEqual(['iniciar', 'cancelar']);
    expect(transicionesDe(['finalizar', 'reanudar'])).toEqual(['reanudar', 'finalizar']);
  });
  it('los filtros cubren los cinco estados', () => {
    expect(FILTROS.flatMap(f => f.estados).sort()).toEqual(['CANCELADA', 'EN_CURSO', 'FINALIZADA', 'PAUSADA', 'PROGRAMADA']);
  });
  it('solo se refresca en vivo', () => {
    expect(seRefresca('EN_CURSO') && seRefresca('PAUSADA')).toBe(true);
    expect(seRefresca('PROGRAMADA') || seRefresca('FINALIZADA') || seRefresca('CANCELADA')).toBe(false);
  });
});
