/**
 * Música del simulador: qué pista suena en cada momento del caso. Son cinco piezas ambientales de 3 minutos
 * (MP3 de 112 kbps, estéreo, igualadas en volumen a la música anterior: −14,7 LUFS, techo −1,5 dBTP) en
 * `assets/game/audio/musica/`. Cada pieza trae su propia entrada y su propio final, así que se encadenan una tras otra
 * sin superponerse (no son capas sincronizadas: tienen tonalidades y pulsos distintos y no deben sonar a la vez).
 *
 * Reparto (cambiarlo es cambiar esta tabla; el director no sabe qué pista es cuál):
 * - `intro`: «quiet beginnings», la tarjeta de contexto antes del caso. Entra en 20 s desde el silencio, registro grave y
 *   sin pulso marcado: acompaña la lectura sin competir con ella.
 * - `ambient`: el mapa y las conversaciones, en rotación para que una sesión larga no repita 3 minutos de música.
 *   «everyday moments» (la más pareja: 4 LU de rango) → «familiar places» → «gentle motion». Esta última es la menos
 *   ambiental: ~100 s tranquila y, hacia el s 99, una subida de ~4 LU en 2 s a una meseta de ~50 s (≈ 7 LU más fuerte que
 *   su primera mitad). Si eso no conviene mientras se conversa, basta quitarla de esta lista.
 * - `resolution`: «subtle continuity», al abrirse el resultado del caso: reemplaza a la ambiental y se queda en bucle
 *   mientras se lee el cierre.
 *
 * Las reglas del producto que la música respeta (orientacion-jugabilidad.md): sin fanfarria ni sonido de logro, sin
 * reloj (ninguna tiene un pulso de reloj: la periodicidad más marcada es débil), sin pista «de tensión» ni de crisis.
 */
const BASE = 'assets/game/audio/musica';

export interface MusicCues {
  readonly intro: string;
  /** La lista ambiental: se encadena en este orden y, tras la última, vuelve a la primera. Una sola pieza se repite en bucle. */
  readonly ambient: readonly string[];
  readonly resolution: string;
}

export const MUSIC_CUES: MusicCues = {
  intro: `${BASE}/01_quiet_beginnings.mp3`,
  ambient: [
    `${BASE}/02_everyday_moments.mp3`,
    `${BASE}/03_familiar_places.mp3`,
    `${BASE}/04_gentle_motion.mp3`,
  ],
  resolution: `${BASE}/05_subtle_continuity.mp3`,
};

/** Todas las pistas del reparto, sin repetir: lo que las pruebas comprueban que existe y que cabe en el presupuesto. */
export const MUSIC_FILES: readonly string[] = [MUSIC_CUES.intro, ...MUSIC_CUES.ambient, MUSIC_CUES.resolution];
