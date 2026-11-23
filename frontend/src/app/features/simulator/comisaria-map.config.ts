import { MapObjectState } from '../../core/models/simulation.model';

/** Scene map key — Comisaría de Familia (node: valoracion-comisaria). */
export const COMISARIA_MAP_KEY = 'valoracion-comisaria';

/** Frontend display labels — backend keys remain stable. */
export const COMISARIA_INTERACTION_LABELS: Record<string, string> = {
  'riesgo-estructurado': 'Valoración de riesgo',
  'contacto-agresor': 'Acción riesgosa: contacto con agresor',
  'tool-riesgo': 'Instrumento de valoración de riesgo',
  'tool-ruta': 'Medidas de protección',
  'Riesgo estructurado': 'Valoración de riesgo',
  'Contacto agresor': 'Acción riesgosa: contacto con agresor',
  Riesgo: 'Instrumento de valoración de riesgo',
  Ruta: 'Medidas de protección',
};

export const COMISARIA_INTERACTION_DESCRIPTIONS: Record<string, string> = {
  'riesgo-estructurado':
    'Evalúa factores de riesgo de feminicidio: armas, amenazas, reincidencia, aislamiento y red de apoyo.',
  'contacto-agresor':
    'Citar o contactar al agresor antes de medidas de protección puede escalar el peligro inmediato.',
  'tool-riesgo':
    'Consulta el instrumento formativo para valorar riesgo de feminicidio con criterio técnico.',
  'tool-ruta':
    'Revisa medidas de protección, asesoría legal y articulación con trabajo social e instituciones.',
  'ambient:recepcion':
    'Punto de ingreso institucional. Coordina con funcionarios y prepara un espacio de atención respetuoso.',
  'ambient:entrevista-segura':
    'Realiza escucha activa sin juicios, valida emociones y registra observaciones en la bitácora reflexiva.',
  'ambient:derechos':
    'Consulta el marco legal aplicable: Ley 1257 de 2008, Ley 1761 de 2015 y derechos económicos de la sobreviviente.',
  'ambient:proteccion-nna':
    'Evalúa la situación de menores expuestos y activa medidas conforme al interés superior del niño.',
  'ambient:derivacion':
    'Valora derivación a psicología clínica o psiquiatría sin sustituir la ruta de protección inmediata.',
  'Valoración de riesgo':
    'Evalúa factores de riesgo de feminicidio con criterio técnico y ético.',
  'Medidas de protección':
    'Activa rutas de protección, asesoría psicosocial y coordinación interinstitucional.',
};

export interface ComisariaZoneDef {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tint: number;
  alpha: number;
}

export const COMISARIA_ZONES: ComisariaZoneDef[] = [
  { key: 'recepcion', label: 'Recepción', x: 48, y: 360, width: 220, height: 150, tint: 0x1a2838, alpha: 0.55 },
  { key: 'entrevista', label: 'Entrevista segura', x: 48, y: 160, width: 300, height: 180, tint: 0x1a3028, alpha: 0.5 },
  { key: 'valoracion', label: 'Valoración de riesgo', x: 380, y: 240, width: 240, height: 160, tint: 0x1f2530, alpha: 0.48 },
  { key: 'medidas', label: 'Medidas de protección', x: 380, y: 420, width: 240, height: 100, tint: 0x1a2830, alpha: 0.45 },
  { key: 'derechos', label: 'Derechos económicos y justicia', x: 640, y: 48, width: 270, height: 140, tint: 0x201a28, alpha: 0.5 },
  { key: 'nna', label: 'Protección NNA', x: 640, y: 200, width: 270, height: 130, tint: 0x1a2820, alpha: 0.48 },
  { key: 'derivacion', label: 'Derivación salud mental', x: 640, y: 340, width: 270, height: 130, tint: 0x1a2535, alpha: 0.45 },
];

export const COMISARIA_COLLISIONS = [
  { x: 48, y: 44, width: 864, height: 12 },
  { x: 48, y: 44, width: 12, height: 452 },
  { x: 900, y: 44, width: 12, height: 452 },
  { x: 48, y: 484, width: 864, height: 12 },
  { x: 360, y: 44, width: 8, height: 480 },
  { x: 620, y: 44, width: 8, height: 480 },
  { x: 640, y: 190, width: 270, height: 8 },
  { x: 640, y: 330, width: 270, height: 8 },
];

export interface ComisariaAmbientZoneDef {
  key: string;
  label: string;
  x: number;
  y: number;
  radius: number;
}

export const COMISARIA_AMBIENT_ZONES: ComisariaAmbientZoneDef[] = [
  { key: 'ambient:recepcion', label: 'Recepción', x: 130, y: 420, radius: 72 },
  { key: 'ambient:entrevista-segura', label: 'Entrevista segura', x: 200, y: 240, radius: 78 },
  { key: 'ambient:derechos', label: 'Derechos económicos y justicia', x: 760, y: 110, radius: 68 },
  { key: 'ambient:proteccion-nna', label: 'Protección NNA', x: 760, y: 260, radius: 68 },
  { key: 'ambient:derivacion', label: 'Derivación salud mental', x: 760, y: 400, radius: 68 },
];

export function isComisariaMap(mapKey: string | undefined | null): boolean {
  return mapKey === COMISARIA_MAP_KEY;
}

export function getComisariaDisplayLabel(obj: Pick<MapObjectState, 'key' | 'label'>): string {
  return COMISARIA_INTERACTION_LABELS[obj.key] ?? COMISARIA_INTERACTION_LABELS[obj.label] ?? obj.label;
}

export function getComisariaInteractionDescription(
  obj: Pick<MapObjectState, 'key' | 'label' | 'interactionPrompt' | 'interactionText'>
): string {
  const display = getComisariaDisplayLabel(obj);
  return (
    COMISARIA_INTERACTION_DESCRIPTIONS[obj.key] ??
    COMISARIA_INTERACTION_DESCRIPTIONS[display] ??
    obj.interactionText ??
    obj.interactionPrompt ??
    ''
  );
}

export function isAmbientInteraction(key: string): boolean {
  return key.startsWith('ambient:');
}

export function buildComisariaAmbientObject(zone: ComisariaAmbientZoneDef): MapObjectState {
  return {
    key: zone.key,
    label: zone.label,
    type: 'OBJECT',
    x: zone.x,
    y: zone.y,
    width: 0,
    height: 0,
    color: '#6F8490',
    icon: 'info',
    shortCode: 'INFO',
    collision: false,
    interactionPrompt: zone.label,
    interactionText: COMISARIA_INTERACTION_DESCRIPTIONS[zone.key] ?? '',
    decisionOptionId: null,
    toolCode: null,
    dialogue: null,
  };
}

export function applyComisariaDisplayLabels(objects: MapObjectState[]): MapObjectState[] {
  return objects.map(obj => ({
    ...obj,
    label: getComisariaDisplayLabel(obj),
  }));
}

export const COMISARIA_AMBIENT_INFO: Record<string, string> = {
  'ambient:recepcion':
    'Recepción institucional: identifica al equipo disponible, garantiza privacidad y prepara condiciones para una entrevista respetuosa.',
  'ambient:entrevista-segura':
    'Entrevista segura: escucha activa, validación emocional, preguntas abiertas y registro en bitácora sin revictimizar.',
  'ambient:derechos':
    'Marco normativo: Ley 1257 de 2008, Ley 1761 de 2015, medidas de protección y orientación sobre derechos económicos.',
  'ambient:proteccion-nna':
    'Protección NNA: Ley 1098 de 2006 e interés superior del niño. Evalúa exposición a violencia y activa rutas si aplica.',
  'ambient:derivacion':
    'Derivación clínica: puede complementar la ruta VBG, pero no sustituye medidas de protección inmediatas.',
};
