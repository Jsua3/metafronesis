import { MapObjectState } from '../../core/models/simulation.model';

/** Scene map key for Escenario 1 — Hospital / urgencias. */
export const HOSPITAL_MAP_KEY = 'urgencias-crisis';

/** Frontend display labels — backend keys remain stable. */
export const INTERACTION_LABELS: Record<string, string> = {
  'escucha-segura': 'Iniciar escucha segura',
  'cuestionario-prematuro': 'Área médica restringida',
  'aviso-policial': 'Ruta de atención VBG',
  'tool-pap': 'Primeros Auxilios Psicológicos',
  'tool-bitacora': 'Bitácora reflexiva',
  PAP: 'Primeros Auxilios Psicológicos',
  Bitacora: 'Bitácora reflexiva',
  'Escucha segura': 'Iniciar escucha segura',
  'Cuestionario prematuro': 'Acción riesgosa: interrogatorio prematuro',
  'Aviso policial': 'Ruta de atención VBG',
};

/** Contextual descriptions shown on proximity hints. */
export const INTERACTION_DESCRIPTIONS: Record<string, string> = {
  'escucha-segura':
    'La familia está alterada y exige información inmediata. Debes intervenir sin aumentar la crisis.',
  'cuestionario-prematuro':
    'La sobreviviente se encuentra en atención médica crítica. No es momento de interrogarla.',
  'aviso-policial':
    'Consulta el marco técnico y normativo aplicable a casos de violencia basada en género.',
  'tool-pap':
    'Consulta o aplica una guía breve para estabilizar emocionalmente a la familia durante la crisis.',
  'tool-bitacora':
    'Registra tus observaciones, decisiones y dudas éticas durante la intervención.',
  'ambient:protocolo-noticia-dificil':
    'Revisa una guía para preparar la comunicación de una noticia sensible con acompañamiento ético y humano.',
  'ambient:familia-crisis':
    'La familia está alterada y exige información inmediata. Debes intervenir sin aumentar la crisis.',
  'Primeros Auxilios Psicológicos':
    'Consulta o aplica una guía breve para estabilizar emocionalmente a la familia durante la crisis.',
  'Bitácora reflexiva':
    'Registra tus observaciones, decisiones y dudas éticas durante la intervención.',
  'Iniciar escucha segura':
    'Comienza una interacción orientada a validar emociones y evitar revictimización.',
  'Ruta de atención VBG':
    'Consulta el marco técnico y normativo aplicable a casos de violencia basada en género.',
  'Acción riesgosa: interrogatorio prematuro':
    'Esta acción puede aumentar la revictimización o interferir con la atención médica prioritaria.',
};

/** Warning shown before allowing a risky backend interaction. */
export const RESTRICTED_AREA_WARNING_MESSAGE =
  'Acción sensible: la sobreviviente está en atención médica crítica. Interrogarla ahora puede aumentar revictimización. ¿Deseas continuar?';

export const PROTOCOL_INFO_MESSAGE =
  'Protocolo EPICEE / SPIKES: prepara el entorno, valora qué sabe la familia, brinda información clara y acompaña la reacción emocional antes de documentar o activar rutas institucionales.';

/** Frontend collision walls for hospital layout (overrides generic seed zones). */
export const HOSPITAL_COLLISIONS = [
  { x: 48, y: 44, width: 864, height: 12 },
  { x: 48, y: 44, width: 12, height: 452 },
  { x: 900, y: 44, width: 12, height: 452 },
  { x: 48, y: 484, width: 864, height: 12 },
  { x: 600, y: 44, width: 8, height: 280 },
  { x: 600, y: 360, width: 8, height: 136 },
  { x: 330, y: 280, width: 8, height: 216 },
  { x: 620, y: 44, width: 290, height: 8 },
  { x: 620, y: 200, width: 290, height: 8 },
];

export interface AmbientZoneDef {
  key: string;
  label: string;
  x: number;
  y: number;
  radius: number;
}

/** Non-backend informational points on the hospital map. */
export const HOSPITAL_AMBIENT_ZONES: AmbientZoneDef[] = [
  {
    key: 'ambient:protocolo-noticia-dificil',
    label: 'Protocolo para noticia difícil',
    x: 760,
    y: 430,
    radius: 68,
  },
];

export function isHospitalMap(mapKey: string | undefined | null): boolean {
  return mapKey === HOSPITAL_MAP_KEY;
}

export function getDisplayLabel(obj: Pick<MapObjectState, 'key' | 'label'>): string {
  return INTERACTION_LABELS[obj.key] ?? INTERACTION_LABELS[obj.label] ?? obj.label;
}

export function getInteractionDescription(
  obj: Pick<MapObjectState, 'key' | 'label' | 'interactionPrompt' | 'interactionText'>
): string {
  const display = getDisplayLabel(obj);
  return (
    INTERACTION_DESCRIPTIONS[obj.key] ??
    INTERACTION_DESCRIPTIONS[display] ??
    obj.interactionText ??
    obj.interactionPrompt ??
    ''
  );
}

export function isAmbientInteraction(key: string): boolean {
  return key.startsWith('ambient:');
}

/** Build a synthetic MapObjectState for ambient proximity hints. */
export function buildAmbientObject(zone: AmbientZoneDef): MapObjectState {
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
    interactionText: INTERACTION_DESCRIPTIONS[zone.key] ?? '',
    decisionOptionId: null,
    toolCode: null,
    dialogue: null,
  };
}

export function applyHospitalDisplayLabels(objects: MapObjectState[]): MapObjectState[] {
  return objects.map(obj => ({
    ...obj,
    label: getDisplayLabel(obj),
  }));
}
