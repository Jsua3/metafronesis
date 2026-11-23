import { describe, expect, it } from 'vitest';
import { npcsDeLaSala } from './npcs-de-sala';

const guardia = { key: 'medico-guardia' };
const enfermera = { key: 'enfermera-urgencias' };
const psicologa = { key: 'psicologa-orientadora' };
const escenario = [enfermera, guardia, psicologa];

describe('npcsDeLaSala', () => {
  it('si el ambiente del mapa lista sus NPC, solo se dibujan los del escenario que figuran en la lista', () => {
    const ambiente = { ambientNpcs: [{ key: 'medico-guardia' }, { key: 'otro-que-no-esta-en-el-escenario' }] };
    expect(npcsDeLaSala(escenario, ambiente)).toEqual([guardia]);
  });

  it('una lista vacía significa que la sala no tiene NPC de ambiente: no se dibuja ninguno', () => {
    expect(npcsDeLaSala(escenario, { ambientNpcs: [] })).toEqual([]);
  });

  it('si el ambiente no trae la lista (o no hay ambiente), se dibujan todos como antes', () => {
    expect(npcsDeLaSala(escenario, {})).toEqual(escenario);
    expect(npcsDeLaSala(escenario, undefined)).toEqual(escenario);
    expect(npcsDeLaSala(escenario, { ambientNpcs: 'no es lista' })).toEqual(escenario);
  });

  it('ignora entradas de la lista sin clave y conserva el orden del escenario', () => {
    const ambiente = { ambientNpcs: [{ key: 'psicologa-orientadora' }, {}, null, 'x', { key: 'enfermera-urgencias' }] };
    expect(npcsDeLaSala(escenario, ambiente)).toEqual([enfermera, psicologa]);
  });
});
