import { readFileSync } from 'fs';
import { DRAFT_COPY } from './draft-copy';
import { join } from 'path';

import {
  HELP_TEXT,
  HelpModality,
  firstTimeHelpLines,
  helpSections,
} from './game-help.content';

const MODALITIES: readonly HelpModality[] = ['keyboard', 'touch'];
const BOOLEANS = [true, false] as const;

/** Todo el texto que la ayuda puede mostrar, en todas las combinaciones de entradas. */
function everyHelpText(): string[] {
  const texts: string[] = [...Object.values(HELP_TEXT)];
  for (const modality of MODALITIES) {
    for (const safeExitPromise of BOOLEANS) {
      for (const compact of BOOLEANS) {
        texts.push(...firstTimeHelpLines({ modality, compact, safeExitPromise }));
      }
      for (const section of helpSections({ modality, safeExitPromise })) {
        texts.push(section.title, section.text);
      }
    }
  }
  return texts;
}

describe('game-help.content: tarjeta de primera vez (F§5.8)', () => {
  it('teclado: tres líneas con la tecla E, la ficha del objetivo y la pausa con Esc', () => {
    expect(firstTimeHelpLines({ modality: 'keyboard', compact: false, safeExitPromise: true })).toEqual([
      'Muévete con las flechas o WASD. Acércate a una persona o un objeto: abajo aparece su nombre. Pulsa E para interactuar.',
      'Arriba está el objetivo de la escena: ábrelo para ver qué hay en la sala o pedir una pista.',
      'Puedes pausar el caso en cualquier momento con «Salida segura» (con teclado, también Esc). Tu avance se guarda.',
    ]);
  });

  it('táctil: las mismas líneas 2 y 3, esta última sin «con teclado, también Esc»', () => {
    expect(firstTimeHelpLines({ modality: 'touch', compact: false, safeExitPromise: true })).toEqual([
      'Mantén pulsada una flecha para caminar. Cuando algo tenga nombre cerca, toca «Interactuar».',
      'Arriba está el objetivo de la escena: ábrelo para ver qué hay en la sala o pedir una pista.',
      'Puedes pausar el caso en cualquier momento con «Salida segura». Tu avance se guarda.',
    ]);
  });

  it('compacto táctil: una sola frase corta', () => {
    expect(firstTimeHelpLines({ modality: 'touch', compact: true, safeExitPromise: true })).toEqual([
      'Mantén pulsada una flecha para caminar. Toca «Interactuar» cuando veas un nombre abajo.',
    ]);
  });

  it('compacto con teclado: solo la primera línea del teclado, sin copy nuevo ni la palabra «Interactuar»', () => {
    const lines = firstTimeHelpLines({ modality: 'keyboard', compact: true, safeExitPromise: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(firstTimeHelpLines({ modality: 'keyboard', compact: false, safeExitPromise: true })[0]);
  });

  it('sin la promesa de salida segura la línea de pausa desaparece en todas las variantes', () => {
    for (const modality of MODALITIES) {
      for (const compact of BOOLEANS) {
        const lines = firstTimeHelpLines({ modality, compact, safeExitPromise: false });
        expect(lines.join(' ')).not.toMatch(/salida segura|pausar|esc\b|se guarda/i);
      }
      expect(firstTimeHelpLines({ modality, compact: false, safeExitPromise: false })).toHaveLength(2);
    }
  });

  it('los botones y el título tienen el texto exacto del diseño', () => {
    expect(HELP_TEXT.title).toBe('Cómo se juega');
    expect(HELP_TEXT.understood).toBe('Entendido');
    expect(HELP_TEXT.moreHelp).toBe('Más ayuda');
    expect(HELP_TEXT.closeHelp).toBe('Cerrar ayuda');
  });

  it('no define su propia clave de memoria: la de la tarjeta de primera vez es HELP_FIRST_CARD de help-memory.util', () => {
    const source = readFileSync(join(__dirname, 'game-help.content.ts'), 'utf-8');
    expect(source).not.toMatch(/siep\.ayuda|FIRST_HELP_ID|'primero'/);
  });
});

describe('game-help.content: pantalla permanente (F§5.8)', () => {
  const titles = (modality: HelpModality, safeExitPromise: boolean) =>
    helpSections({ modality, safeExitPromise }).map(section => section.id);

  it('teclado con promesa: nueve secciones en orden, con «Salida segura» y «Teclas»', () => {
    expect(titles('keyboard', true)).toEqual([
      'caso', 'moverte', 'interactuar', 'que-hacer', 'herramientas', 'decidir', 'bitacora', 'salida-segura', 'teclas',
    ]);
  });

  it('táctil con promesa: sin la sección de teclas', () => {
    expect(titles('touch', true)).toEqual([
      'caso', 'moverte', 'interactuar', 'que-hacer', 'herramientas', 'decidir', 'bitacora', 'salida-segura',
    ]);
  });

  it('sin promesa: no hay sección de salida segura y la línea de teclas no menciona Esc', () => {
    expect(titles('keyboard', false)).not.toContain('salida-segura');
    expect(titles('touch', false)).not.toContain('salida-segura');
    const keys = helpSections({ modality: 'keyboard', safeExitPromise: false }).find(s => s.id === 'teclas');
    expect(keys?.text).toBe(
      'Mover: flechas o WASD · Interactuar: E, Espacio o Enter · Avanzar un diálogo: Enter o Espacio · Elegir una opción: 1 a 4 · Bitácora: J',
    );
  });

  it('con promesa la línea de teclas termina con «Salida segura: Esc»', () => {
    const keys = helpSections({ modality: 'keyboard', safeExitPromise: true }).find(s => s.id === 'teclas');
    expect(keys?.text).toBe(
      'Mover: flechas o WASD · Interactuar: E, Espacio o Enter · Avanzar un diálogo: Enter o Espacio · Elegir una opción: 1 a 4 · Bitácora: J · Salida segura: Esc',
    );
  });

  it('el texto de movimiento, interacción y bitácora depende de la modalidad', () => {
    const text = (modality: HelpModality, id: string) =>
      helpSections({ modality, safeExitPromise: true }).find(s => s.id === id)?.text;
    expect(text('keyboard', 'moverte')).toBe('Flechas o WASD.');
    expect(text('touch', 'moverte')).toBe('Mantén pulsada una flecha; un toque da un paso corto.');
    expect(text('keyboard', 'interactuar')).toBe(
      'Acércate a una persona o un objeto con nombre y pulsa E (también sirven Espacio y Enter).',
    );
    expect(text('touch', 'interactuar')).toBe('Acércate y toca «Interactuar». El botón dice con qué vas a interactuar.');
    expect(text('keyboard', 'bitacora')).toBe(
      'Escribe tus reflexiones cuando quieras (tecla J o botón de la cabecera).',
    );
    expect(text('touch', 'bitacora')).toBe('Escribe tus reflexiones cuando quieras con el botón de la cabecera.');
  });

  it('«Qué hacer» describe la ficha del objetivo: dónde está, sin nombrar una tarjeta que ya no existe ni insinuar respuestas', () => {
    for (const modality of MODALITIES) {
      const text = helpSections({ modality, safeExitPromise: true }).find(s => s.id === 'que-hacer')?.text ?? '';
      expect(text).toBe(DRAFT_COPY.helpGoalSection.text);
      expect(text).toContain('arriba a la izquierda');
      expect(text).not.toMatch(/tarjeta|se marca sola|siguiente paso|Antes de decidir/i);
    }
  });

  describe('atajos de una tecla (F6-10): la ayuda sigue el ajuste', () => {
    const KEY_LETTERS = /WASD|\bE\b|\bJ\b|1 a 4/;
    const off = (extra: object = {}) => ({ modality: 'keyboard' as HelpModality, safeExitPromise: true, singleKeyShortcuts: false, ...extra });

    it('apagados prometen flechas y Enter, no WASD, E, J ni los números', () => {
      const texts = helpSections(off()).flatMap(s => [s.title, s.text]);
      expect(texts.join(' | ')).not.toMatch(KEY_LETTERS);
      const keys = helpSections(off()).find(s => s.id === 'teclas')?.text ?? '';
      expect(keys).toContain('flechas');
      expect(keys).toContain('Enter');
      expect(keys).toContain('Esc');
      // Las opciones del diálogo no responden a flechas: se eligen con Tab y Enter, o con clic.
      expect(keys).toContain('Elegir una opción: Tab y Enter, o clic');
      expect(keys).not.toMatch(/flechas y Enter/);
    });

    it('la tarjeta de primera vez tampoco promete WASD ni E con el ajuste apagado', () => {
      for (const compact of BOOLEANS) {
        const lines = firstTimeHelpLines({ modality: 'keyboard', compact, safeExitPromise: true, singleKeyShortcuts: false });
        expect(lines.join(' | ')).not.toMatch(KEY_LETTERS);
        expect(lines[0]).toMatch(/flechas/);
        expect(lines[0]).toMatch(/Enter/);
      }
    });

    it('encendidos (y por defecto) conservan WASD, E y J', () => {
      for (const options of [{ singleKeyShortcuts: true }, {}]) {
        const keys = helpSections({ modality: 'keyboard', safeExitPromise: true, ...options }).find(s => s.id === 'teclas')?.text ?? '';
        expect(keys).toMatch(/WASD/);
        expect(keys).toMatch(/\bE\b/);
        expect(keys).toMatch(/\bJ\b/);
      }
    });

    it('la modalidad táctil no cambia con el ajuste', () => {
      expect(helpSections({ modality: 'touch', safeExitPromise: true, singleKeyShortcuts: false })).toEqual(
        helpSections({ modality: 'touch', safeExitPromise: true, singleKeyShortcuts: true }),
      );
    });
  });

  it('el caso no nombra lugares ni cuántas decisiones hay, y la retroalimentación llega después de decidir', () => {
    const all = helpSections({ modality: 'keyboard', safeExitPromise: true });
    expect(all.find(s => s.id === 'caso')?.text).toBe(DRAFT_COPY.helpCaseSection.text);
    expect(all.find(s => s.id === 'caso')?.text).not.toMatch(/hospital|Comisar|[0-9]+ decisiones/i);
    expect(all.find(s => s.id === 'decidir')?.text).toContain('Ninguna opción está marcada como correcta');
    expect(all.find(s => s.id === 'decidir')?.text).toContain('No hay límite de tiempo.');
  });

  it('la promesa táctil de salida segura no menciona el teclado', () => {
    const touch = helpSections({ modality: 'touch', safeExitPromise: true }).find(s => s.id === 'salida-segura');
    expect(touch?.text).toBe(
      'Puedes pausar el caso en cualquier momento con el botón «Salida segura». Tu avance se guarda y lo retomas cuando quieras.',
    );
  });
});

describe('game-help.content: límites de producto y de redacción', () => {
  const texts = everyHelpText();

  it('nunca promete atajos 1 a 5: los números del dock no son atajos', () => {
    for (const text of texts) expect(text).not.toMatch(/1\s*(a|-|–|al)\s*5/i);
  });

  it('no nombra ninguna técnica clínica ni herramienta concreta', () => {
    const forbidden =
      /\b(PAP|SPIKES|EPICEE|RISK_METER)\b|primeros auxilios|valoraci[oó]n (estructurada )?de riesgo|medidas de protecci[oó]n|mediaci[oó]n|perd[oó]n|psicoterapia|interrog|contenci[oó]n|estabiliz/i;
    for (const text of texts) expect(text).not.toMatch(forbidden);
  });

  it('no usa lenguaje de logro, puntos, exclamaciones ni anuncia la regla de reconsiderar', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/[¡!]/);
      expect(text).not.toMatch(/\b(logro|misi[oó]n|victoria|puntos?|puntaje|ganaste|perdiste)\b/i);
      expect(text).not.toMatch(/reconsider|otra oportunidad|intentar de nuevo|reintent/i);
    }
  });

  it('no codifica cuál decisión es la adecuada: solo dice que ninguna está marcada', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/la (mejor|correcta) (opci[oó]n|decisi[oó]n)|opci[oó]n (recomendada|correcta)/i);
    }
  });

  it('lleva tildes: ninguna palabra de uso común aparece sin ellas', () => {
    const missingTilde =
      /\b(accion|decision|informacion|psicologa|bitacora|comisaria|recepcion|proteccion|atencion|tecnica|clinica|clinicas|clinico|exploraras|tomaras|recibiras|acercate|muevete|manten|mas ayuda|retroalimentacion)\b/i;
    for (const text of texts) expect(text).not.toMatch(missingTilde);
    // Y las que sí deben llevarla están escritas con ella.
    const joined = texts.join(' ');
    expect(joined).toContain('Cómo se juega');
    expect(joined).toContain('Más ayuda');
    expect(joined).toContain('Bitácora');
    expect(joined).toContain('retroalimentación');
  });

  it('ningún texto contiene un identificador interno del caso', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/\b[a-z]+(-[a-z]+)+\b/);
      expect(text).not.toMatch(/PAP@|npc:/);
    }
  });

  it('el archivo de contenido no lee la clasificación de las opciones', () => {
    const source = readFileSync(join(__dirname, 'game-help.content.ts'), 'utf-8');
    expect(source).not.toMatch(/classification|prohibitedConduct|isRecommended|isProhibited/);
  });
});
