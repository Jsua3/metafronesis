import { MapObjectState } from '../../core/models/simulation.model';
import { DoorStatus } from './door-status.util';

export interface InteractionVerb {
  text: string;
  locked: boolean;
  reason: string | null;
}

/**
 * ¿Puede este objeto ser el candidato de interacción (`nearestKey`, E, «Ir a…», el contorno del ratón)? Un mueble
 * (`PROP`) se dibuja y choca, nada más. `TOOL_TARGET` y `TRIGGER` no tienen comportamiento propio en el juego: solo
 * cuentan si traen algo con qué actuar (una decisión, una herramienta o un diálogo); si no, se dibujan sin interacción.
 */
export function participatesInInteraction(obj: Pick<MapObjectState, 'type' | 'decisionOptionId' | 'toolCode' | 'dialogue'>): boolean {
  switch (obj.type) {
    case 'PROP':
      return false;
    case 'TOOL_TARGET':
    case 'TRIGGER':
      return obj.decisionOptionId != null || (obj.toolCode != null && obj.toolCode !== '') || obj.dialogue != null;
    default:
      return true;
  }
}

/** Una etiqueta de salida que ya dice el movimiento («Volver al pasillo», «Pasar a la sala de espera»). */
const EXIT_LABEL_WITH_VERB = /^(pasar|volver|salir|ir|entrar|regresar|subir|bajar|cruzar|seguir|continuar)\b/i;

/**
 * «Pasar a {lugar}», salvo que la etiqueta ya sea la frase del movimiento: entonces va tal cual (no «Pasar a Volver…»).
 * La usan la ficha de acción cercana y el aviso de puerta de las salas por piezas: las dos dicen lo mismo.
 */
export function exitVerb(label: string): string {
  return EXIT_LABEL_WITH_VERB.test(label.trim()) ? label.trim() : `Pasar a ${label}`;
}

/**
 * Verbo del botón principal de interacción (F§4.3): lo que el jugador va a HACER, no lo que
 * sugiere el `interactionPrompt` sembrado (algunos nombran la acción clínica). Una puerta
 * bloqueada conserva el verbo y suma el motivo. Un mueble (`PROP`) no tiene verbo: `null`.
 */
export function interactionVerb(obj: MapObjectState, door: DoorStatus | null): InteractionVerb | null {
  switch (obj.type) {
    case 'PERSON':
      return { text: `Hablar con ${obj.label}`, locked: false, reason: null };
    case 'TOOL':
      return { text: `Recoger ${obj.label}`, locked: false, reason: null };
    case 'EXIT': {
      const locked = door?.state === 'locked';
      return { text: exitVerb(obj.label), locked, reason: locked ? door?.message ?? null : null };
    }
    case 'PROP':
      return null;
    default:
      // OBJECT, ROUTE, WARNING, NOTE y RESOURCE se revisan.
      return { text: `Revisar ${obj.label}`, locked: false, reason: null };
  }
}

/**
 * ¿Se lee aquí mismo? Una nota o un recurso (`NOTE`, `RESOURCE`) muestra su `interactionText` —lo que el docente escribió
 * en «Al revisar»— como diálogo local, sin preguntarle nada al servidor. Si además trae una decisión, una herramienta o
 * un diálogo propio, sigue el camino de siempre: leerla aquí dejaría esa acción sin salida.
 */
export function readsLocally(
  obj: Pick<MapObjectState, 'type' | 'decisionOptionId' | 'toolCode' | 'dialogue'>,
): boolean {
  if (obj.type !== 'NOTE' && obj.type !== 'RESOURCE') return false;
  return obj.decisionOptionId == null && !(obj.toolCode != null && obj.toolCode !== '') && obj.dialogue == null;
}
