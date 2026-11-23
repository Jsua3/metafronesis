import { MapObjectState } from '../../core/models/simulation.model';
import {
  applyComisariaDisplayLabels,
  buildComisariaAmbientObject,
  getComisariaDisplayLabel,
  getComisariaInteractionDescription,
  isAmbientInteraction as isComisariaAmbient,
  isComisariaMap,
  COMISARIA_AMBIENT_ZONES,
} from './comisaria-map.config';
import {
  applyHospitalDisplayLabels,
  buildAmbientObject as buildHospitalAmbientObject,
  getDisplayLabel as getHospitalDisplayLabel,
  getInteractionDescription as getHospitalInteractionDescription,
  isAmbientInteraction as isHospitalAmbient,
  isHospitalMap,
  HOSPITAL_AMBIENT_ZONES,
} from './hospital-map.config';

export function applySceneDisplayLabels(objects: MapObjectState[], mapKey: string): MapObjectState[] {
  if (isHospitalMap(mapKey)) return applyHospitalDisplayLabels(objects);
  if (isComisariaMap(mapKey)) return applyComisariaDisplayLabels(objects);
  return objects;
}

export function getSceneDisplayLabel(
  obj: Pick<MapObjectState, 'key' | 'label'>,
  mapKey?: string | null
): string {
  if (isHospitalMap(mapKey)) return getHospitalDisplayLabel(obj);
  if (isComisariaMap(mapKey)) return getComisariaDisplayLabel(obj);
  return obj.label;
}

export function getSceneInteractionDescription(
  obj: Pick<MapObjectState, 'key' | 'label' | 'interactionPrompt' | 'interactionText'>,
  mapKey?: string | null
): string {
  if (isHospitalMap(mapKey)) return getHospitalInteractionDescription(obj);
  if (isComisariaMap(mapKey)) return getComisariaInteractionDescription(obj);
  return obj.interactionText ?? obj.interactionPrompt ?? '';
}

export function isSceneAmbientInteraction(key: string): boolean {
  return isHospitalAmbient(key) || isComisariaAmbient(key);
}

export function getSceneAmbientZones(mapKey: string) {
  if (isHospitalMap(mapKey)) return HOSPITAL_AMBIENT_ZONES;
  if (isComisariaMap(mapKey)) return COMISARIA_AMBIENT_ZONES;
  return [];
}

export function buildSceneAmbientObject(
  zone: { key: string; label: string; x: number; y: number; radius: number },
  mapKey: string
): MapObjectState {
  if (isComisariaMap(mapKey)) return buildComisariaAmbientObject(zone);
  return buildHospitalAmbientObject(zone);
}
