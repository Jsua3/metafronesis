import {
  getComisariaDisplayLabel,
  getComisariaInteractionDescription,
  isComisariaMap,
} from './comisaria-map.config';

describe('comisaria-map.config', () => {
  it('identifies comisaria map key', () => {
    expect(isComisariaMap('valoracion-comisaria')).toBe(true);
    expect(isComisariaMap('urgencias-crisis')).toBe(false);
  });

  it('maps backend object keys to academic labels', () => {
    expect(getComisariaDisplayLabel({ key: 'riesgo-estructurado', label: 'Riesgo estructurado' }))
      .toBe('Valoración de riesgo');
    expect(getComisariaDisplayLabel({ key: 'tool-ruta', label: 'Ruta' }))
      .toBe('Medidas de protección');
  });

  it('returns contextual descriptions', () => {
    const desc = getComisariaInteractionDescription({
      key: 'riesgo-estructurado',
      label: 'Riesgo estructurado',
      interactionPrompt: '',
      interactionText: '',
    });
    expect(desc.toLowerCase()).toContain('feminicidio');
  });
});
