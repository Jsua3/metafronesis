import { nodeOptionLabel, statusTone } from './case-labels.util';

describe('case-labels.util', () => {
  it('el tono de la insignia sigue el estado de la versión', () => {
    expect(statusTone('PUBLISHED')).toBe('success');
    expect(statusTone('in_review')).toBe('info');
    expect(statusTone('DRAFT')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
  });

  it('una escena se nombra por su título y su clave entre paréntesis', () => {
    expect(nodeOptionLabel({ key: 'urgencias-crisis', title: 'Sala de urgencias' })).toBe('Sala de urgencias (urgencias-crisis)');
  });
});
