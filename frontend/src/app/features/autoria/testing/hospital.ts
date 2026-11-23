import type { PiezaDeSala } from '../../simulator/sala/catalogo';
import type { WorldDefinition } from '../../../core/models/simulation.model';
import { casoDesdeApi } from '../modelo/desde-api';
import { llegada, paredes } from '../modelo/geometria';
import type { Muro } from '../modelo/geometria';
import { casoSinLugar, mundoVacio, objetoDeMundo } from './caso-api';

const fuente = casoSinLugar();
fuente.editor.nodes = fuente.editor.nodes.slice(0, 2).map((n, i) => ({ ...n, key: i ? 'pasillo' : 'sala-espera' }));
fuente.editor.maps = fuente.editor.maps.slice(0, 2).map((m, i) => ({ ...m, key: i ? 'sala-pasillo' : 'sala-sala-espera', nodeKey: i ? 'pasillo' : 'sala-espera', width: i ? 1680 : 1440 }));
const piezasEspera: PiezaDeSala[] = [
  { id: 'v1', tipo: 'ventana', modelo: 'alta', muro: 'fondo', pos: 520 },
  { id: 'l1', tipo: 'lampara', modelo: 'tubo', muro: 'fondo', pos: 720 },
  { id: 'r1', tipo: 'reloj', modelo: 'reloj', muro: 'fondo', pos: 856 },
  { id: 'l2', tipo: 'lampara', modelo: 'tubo', muro: 'fondo', pos: 1000 },
  { id: 'c1', tipo: 'cruz', modelo: 'cruz', muro: 'derecha', pos: 64 },
  { id: 'lp', tipo: 'lampara', modelo: 'pie', x: 1180, y: 300 },
];
const piezasPasillo: PiezaDeSala[] = [
  ...[320, 640, 960, 1280].map<PiezaDeSala>((pos, i) => ({ id: `t${i + 1}`, tipo: 'lampara', modelo: 'tubo', muro: 'fondo', pos })),
  { id: 'g1', tipo: 'gel', modelo: 'gel', muro: 'fondo', pos: 1216 },
  { id: 'k1', tipo: 'cartelera', modelo: 'cartelera', muro: 'fondo', pos: 1288 },
  { id: 'e1', tipo: 'extintor', modelo: 'extintor', muro: 'derecha', pos: 248 },
];
type DatosPuerta = [string, string, Muro, number, string, string, Record<string, unknown>?];
const puertas: DatosPuerta[][] = [
  [ ['a-pasillo', 'pasillo', 'izquierda', 176, 'madera', 'Pasar al pasillo', { par: 'a-sala-espera', entryX: 1511, entryY: 390 }],
    ['a-triaje', 'triaje', 'fondo', 1136, 'vidrio', 'Pasar a triaje', { entryX: 480, entryY: 476 }],
    ['a-entrada', 'entrada-urgencias', 'camara', 584, 'corrediza', 'Volver a la entrada de urgencias', { entryX: 600, entryY: 260 }] ],
  [ ['a-triaje', 'triaje', 'fondo', 160, 'madera-ventanilla', 'Pasar a triaje'],
    ['a-enfermeria', 'estacion-enfermeria', 'fondo', 480, 'madera-ventanilla', 'Pasar a enfermería'],
    ['a-escucha', 'sala-escucha', 'fondo', 800, 'madera', 'Pasar a escucha'],
    ['a-trabajo-social', 'trabajo-social', 'fondo', 1120, 'madera', 'Pasar a trabajo social'],
    ['a-entrada', 'entrada-urgencias', 'izquierda', 160, 'urgencias', 'Volver a urgencias'],
    ['a-sala-espera', 'sala-espera', 'derecha', 160, 'vidrio', 'Pasar a la sala de espera', { par: 'a-pasillo', entryX: 150, entryY: 406 }],
    ['a-recuperacion', 'habitacion-recuperacion', 'camara', 344, 'metalica', 'Pasar a recuperación'],
    ['a-servicio', 'entrada-urgencias', 'camara', 1032, 'paso', 'Salida de servicio', { sentidoUnico: true }] ],
];
export const MUNDO_HOSPITAL: WorldDefinition[] = fuente.editor.maps.map((mapa, i) => {
  const ancho = i ? 1680 : 1440;
  const mundo = mundoVacio(mapa.nodeId, { id: mapa.id, key: mapa.key, title: i ? 'Pasillo' : 'Sala de espera', width: ancho, height: 528,
    theme: 'clinical-soft', spawnX: i ? 840 : 720, spawnY: i ? 400 : 440,
    ambient: { encuadre: 'tres-paredes', salaId: i ? 'pasillo' : 'sala-espera', lugarId: 'hospital' },
    structure: { ancho, momento: 'noche', acabados: { piso: 'vinilo', variante: i ? 'b' : 'a', muro: i ? 'pintura' : 'zocalo-alto', paleta: 'hospital' }, piezas: i ? piezasPasillo : piezasEspera },
  }, fuente.editor.revision, fuente.editor.caseVersionId);
  mundo.objects = puertas[i].map(([key, destino, muro, pos, modelo, label, extra], j) => {
    const { x, y } = llegada(muro, pos, 'tres-paredes', ancho);
    return objetoDeMundo(100 + i * 20 + j, key, label, 'EXIT', x, y, 24, 40, { interactionPrompt: label, metadata: { targetNodeKey: destino, muro, pos, modelo, ...extra } });
  });
  if (!i) mundo.objects.unshift(objetoDeMundo(90, 'sillas-espera', 'Sillas', 'PROP', 400, 300, 120, 60));
  mundo.collisionZones = paredes('tres-paredes', ancho).map((z, j) => ({ id: j + 1, key: z.clave, label: z.etiqueta, x: z.x, y: z.y, width: z.ancho, height: z.alto }));
  if (!i) mundo.collisionZones.push({ id: 10, key: 'choque-sillas-espera', label: 'Sillas', x: 370, y: 280, width: 60, height: 15 });
  mundo.rooms = fuente.editor.maps.map((m) => ({ nodeId: m.nodeId, nodeKey: m.nodeKey, mapKey: m.key, title: m.title }));
  return mundo;
});
export const CASO_HOSPITAL = casoDesdeApi(fuente.editor, MUNDO_HOSPITAL);
