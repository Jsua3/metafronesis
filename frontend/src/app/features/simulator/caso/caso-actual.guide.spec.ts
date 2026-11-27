import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { armarGuia, leerGuiaAutorada } from './guia';

describe('guía al llegar a la sala de escucha del caso actual', () => {
  it('apunta a Gloria, que está presente en la escena 2.0.7', () => {
    const dsl = JSON.parse(readFileSync(resolve(process.cwd(), '../apps/simulation/data/casos/SIM-VBG-002.dsl.json'), 'utf8'));
    expect(dsl.caso.version).toBe('2.0.7');
    const escena = dsl['x-siep'].escenas.find((e: any) => e.clave === 'c2-antes-de-decir');
    const objetos = escena.mapa.objetos as Array<{ clave: string; tipo: string; etiqueta: string }>;
    expect(objetos.some(o => o.clave === 'gloria' && o.tipo === 'PERSON')).toBe(true);
    const lugares = objetos.filter(o => o.tipo === 'PERSON' || o.tipo === 'EXIT').map(o => ({ key: o.clave, label: o.etiqueta, kind: o.tipo === 'PERSON' ? 'person' as const : 'door' as const }));
    const guia = leerGuiaAutorada(escena.mapa.ambiente)!;
    const world = { hablados: new Set<string>(), inspeccionados: [], inventario: [], herramientasUsadas: [], viewedNpcKeysHere: [] };
    const result = armarGuia({ goal: escena.objetivo, lugares, inspeccionados: [], hablados: new Set(), autorada: { guia, mundo: world } });
    expect(result.siguienteLugar).toEqual({ key: 'gloria', label: 'Gloria', tipo: 'persona' });
  });
});
