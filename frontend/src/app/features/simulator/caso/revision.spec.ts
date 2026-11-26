import { evaluarRevision, leerRevision } from './revision';

const paso = {
  numero: 2, titulo: ' Contén antes de informar ', hitos: ['familia_contenida', 'pap_aplicado'],
  logrado: 'Escuchaste a la familia, {nombre}.', pendiente: 'Empieza por escuchar, {nombre}.',
};
const capitulo = { titulo: ' En el hospital ', pasos: [paso] };

function ambiente(...capitulos: unknown[]) {
  return { revision: {
    nombre: ' Profesor ', rol: ' Tutor del caso ', recipeId: 'supervisor-clinico',
    entrada: ' Repasemos, {nombre}. ', capitulos, cierre: ' Gracias, {nombre}. ',
  } };
}

describe('leerRevision', () => {
  it.each([null, [], {}, { revision: false }, { revision: { capitulos: 'hospital' } }, ambiente()])(
    'devuelve null si no hay una revisión utilizable (%j)', datos => expect(leerRevision(datos)).toBeNull(),
  );

  it('conserva el orden y las plantillas, y omite capítulos vacíos y pasos inválidos', () => {
    const revision = leerRevision(ambiente(
      { titulo: 'Vacío', pasos: [] }, null, { ...capitulo, pasos: [false, paso] },
      { titulo: 'En la comisaría', pasos: [{ ...paso, numero: 1 }] },
    ))!;
    expect(revision).toMatchObject({
      nombre: 'Profesor', rol: 'Tutor del caso', recipeId: 'supervisor-clinico',
      entrada: 'Repasemos, {nombre}.', cierre: 'Gracias, {nombre}.',
    });
    expect(revision.capitulos.map(c => c.titulo)).toEqual(['En el hospital', 'En la comisaría']);
    expect(revision.capitulos[0].pasos).toEqual([{ ...paso, titulo: 'Contén antes de informar' }]);
    expect(revision.capitulos[0].pasos[0].hitos).not.toBe(paso.hitos);
  });

  it.each([
    { hitos: [] }, { hitos: 'pap_aplicado' }, { hitos: ['pap_aplicado', null] }, { hitos: [' '] },
    { hitos: ['x'.repeat(121)] }, { hitos: Array(25).fill('pap_aplicado') },
    { numero: '2' }, { numero: NaN }, { numero: 2.5 }, { numero: 0 }, { numero: 100 },
    { titulo: 7 }, { logrado: '' }, { pendiente: null },
  ])('descarta el paso con datos inválidos (%j)', invalido => {
    expect(leerRevision(ambiente({ ...capitulo, pasos: [{ ...paso, ...invalido }] }))).toBeNull();
  });

  it('acota textos y listas, y rechaza una receta que contiene una ruta', () => {
    const largo = 'x'.repeat(1000);
    const datos = ambiente(...Array(13).fill({ ...capitulo, pasos: Array(25).fill({ ...paso, logrado: largo }) }));
    const revision = leerRevision({ revision: { ...datos.revision, nombre: largo, rol: largo, entrada: largo, recipeId: '../profesor' } })!;
    expect(revision.recipeId).toBeNull();
    expect(revision.nombre).toHaveLength(80);
    expect(revision.rol).toHaveLength(140);
    expect(revision.entrada).toHaveLength(900);
    expect(revision.capitulos).toHaveLength(12);
    expect(revision.capitulos[0].pasos).toHaveLength(24);
    expect(revision.capitulos[0].pasos[0].logrado).toHaveLength(900);
  });
});

describe('evaluarRevision', () => {
  it('exige todas las claves y devuelve la frase correspondiente', () => {
    const revision = leerRevision(ambiente(capitulo))!;
    expect(evaluarRevision(revision, new Set(['pap_aplicado', 'familia_contenida']))).toEqual([{
      titulo: 'En el hospital',
      pasos: [{ numero: 2, titulo: 'Contén antes de informar', logrado: true, texto: paso.logrado }],
    }]);
    for (const hitos of [[], ['pap_aplicado'], ['Familia contenida', 'PAP aplicado']]) {
      expect(evaluarRevision(revision, hitos)[0].pasos[0]).toMatchObject({ logrado: false, texto: paso.pendiente });
    }
  });
});
