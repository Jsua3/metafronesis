import { TEXTO_AVISO_DESCRIPTOR, avisosDeDescriptor } from './descriptor-avisos.util';

// EDITOR.md §5.2: la nota orienta la redacción de los descriptores (describen, no califican ni cuentan) sin bloquear.
describe('ayuda para redactar descriptores', () => {
  it('avisa de las palabras de juicio, con o sin tildes y en cualquier caja', () => {
    expect(avisosDeDescriptor('Excelente manejo de la crisis')).toEqual(['juicio']);
    expect(avisosDeDescriptor('Su intervención es REGULAR')).toEqual(['juicio']);
    expect(avisosDeDescriptor('Respuesta óptima')).toEqual(['juicio']);
  });

  it('avisa de los recuentos («al menos», cifras y números escritos)', () => {
    expect(avisosDeDescriptor('Identifica al menos dos apoyos')).toEqual(['recuento']);
    expect(avisosDeDescriptor('Nombra 3 rutas de atención')).toEqual(['recuento']);
    expect(avisosDeDescriptor('Hace más de cuatro preguntas abiertas')).toEqual(['recuento']);
  });

  it('puede dar los dos avisos a la vez', () => {
    expect(avisosDeDescriptor('Buena escucha en tres momentos')).toEqual(['juicio', 'recuento']);
  });

  it('no avisa de un descriptor que describe, ni de los artículos «un», «uno» y «una»', () => {
    expect(avisosDeDescriptor('Reconoce las necesidades inmediatas y estabiliza a la persona')).toEqual([]);
    expect(avisosDeDescriptor('Identifica una necesidad y propone un paso a seguir')).toEqual([]);
  });

  it('sin texto no hay aviso', () => {
    expect(avisosDeDescriptor('')).toEqual([]);
    expect(avisosDeDescriptor('   ')).toEqual([]);
    expect(avisosDeDescriptor(null)).toEqual([]);
  });

  it('cada aviso tiene su texto', () => {
    expect(TEXTO_AVISO_DESCRIPTOR.juicio).toBe('Describe lo que se observa en el intento, no lo califiques.');
    expect(TEXTO_AVISO_DESCRIPTOR.recuento).toContain('describe lo que se observa');
  });
});
