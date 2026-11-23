import {
  getDisplayLabel,
  getInteractionDescription,
  isHospitalMap,
} from './hospital-map.config';

describe('hospital-map.config', () => {
  it('identifies hospital map key', () => {
    expect(isHospitalMap('urgencias-crisis')).toBe(true);
    expect(isHospitalMap('ruta-proteccion')).toBe(false);
  });

  it('maps backend labels to academic display labels', () => {
    expect(getDisplayLabel({ key: 'tool-pap', label: 'PAP' })).toBe('Primeros Auxilios Psicológicos');
    expect(getDisplayLabel({ key: 'cuestionario-prematuro', label: 'Cuestionario prematuro' }))
      .toBe('Área médica restringida');
    expect(getDisplayLabel({ key: 'aviso-policial', label: 'Aviso policial' })).toBe('Ruta de atención VBG');
  });

  it('returns contextual descriptions for hospital interactions', () => {
    const desc = getInteractionDescription({
      key: 'escucha-segura',
      label: 'Escucha segura',
      interactionPrompt: '',
      interactionText: '',
    });
    expect(desc).toContain('familia');
  });
});
