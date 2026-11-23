import { TITULO_CASO_PRACTICA, asegurarCasoDePractica } from './caso-de-practica';

const biblioteca = {
  lugares: async () => [{ id: 'vacio', salas: 0 }, { id: 'universidad', salas: 3 }],
  escenario: async (id: string) => ({ id, descripcion: 'Un campus', salas: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
};

describe('asegurarCasoDePractica', () => {
  it('reutiliza el caso guardado si sigue siendo un borrador', async () => {
    const crear = vi.fn();
    const id = await asegurarCasoDePractica({ existentes: [{ caseVersionId: 41, status: 'DRAFT' }], casoGuardado: '41', biblioteca, crear });
    expect(id).toBe('41');
    expect(crear).not.toHaveBeenCalled();
  });

  it('crea uno nuevo con el primer lugar con salas y sus dos primeras salas', async () => {
    const crear = vi.fn(async () => 77);
    const id = await asegurarCasoDePractica({ existentes: [{ caseVersionId: 41, status: 'IN_REVIEW' }], casoGuardado: '41', biblioteca, crear });
    expect(id).toBe('77');
    expect(crear).toHaveBeenCalledWith(TITULO_CASO_PRACTICA, 'universidad', ['a', 'b'], 'Un campus');
  });

  it('sin lugares con salas falla con un mensaje claro', async () => {
    await expect(asegurarCasoDePractica({
      existentes: [], casoGuardado: null, biblioteca: { ...biblioteca, lugares: async () => [] }, crear: vi.fn(),
    })).rejects.toThrow('No hay lugares en la biblioteca');
  });
});
