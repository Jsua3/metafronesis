import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from '../../../styles/contrast.util';

/**
 * Contratos de fuente de la integración de la orientación en `simulation-play.component.ts` (T9, T10, T8.4):
 * lo que la plantilla y el CSS tienen que seguir diciendo aunque Jest no renderice la plantilla.
 * Las regex usan `\s*` entre líneas (el checkout es LF).
 */
// Los fines de línea se normalizan: con `core.autocrlf=true` el árbol de trabajo sale en CRLF y varios cortes de abajo buscan `\n`.
const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** Cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector}`);
  return match[2];
}

/** La franja del aviso sensible vive en su propio componente (T10): sus reglas se leen de allí. */
const noticeSource = readFileSync(join(__dirname, 'sensitive-notice.component.ts'), 'utf-8');
function noticeRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = noticeSource.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector} en el aviso sensible`);
  return match[2];
}

const worldTag = source.match(/<app-game-world[\s\S]*?\/>/)?.[0] ?? '';

describe('ficha del objetivo (T9.1)', () => {
  // Bloque U1 (variante B): ahora el envoltorio lleva también la pestaña de la etapa antes del desplazable con la ficha.
  it('el envoltorio .objective-card contiene la ficha y no tiene role="status" (la ficha no trae región viva: anuncia el LiveRegionAnnouncer)', () => {
    expect(source).toMatch(/<div class="objective-card">\s*(<!--[\s\S]*?-->\s*)?(@if \(stageLabel\(\); as etapa\) \{[\s\S]*?objective-card__etapa[\s\S]*?\}\s*)?<div class="objective-card__scroll">\s*<app-scene-goal-card/);
    expect(source).not.toMatch(/<div class="objective-card"[^>]*role=/);
    expect(source).not.toMatch(/<p class="objective-card__etapa[^>]*role=/);
  });

  it('ya no se muestra el objetivo antiguo ni su ayuda visual', () => {
    expect(source).not.toContain('getSceneObjective');
    expect(source).not.toContain('sceneObjective');
    expect(source).not.toContain('objective-card__body');
    expect(source).not.toContain('objective-card__ethic');
    expect(source).not.toMatch(/<strong>Objetivo<\/strong>/);
  });

  // Bloque U1 (variante B): el aviso ya no es una franja bajo la cabecera sino la primera pieza del carril de arriba al centro, entre la ficha y el HUD.
  it('el aviso de contenido sensible vive FUERA de la tarjeta plegable: carril de la cabecera, siempre a la vista en todos los dispositivos (L-01)', () => {
    expect(source).toMatch(
      // Bloque U1 (variante B): el HUD va en .top-bar__derecha y el minimapa debajo de él, dentro de la misma fila de la cabecera.
      /<header class="top-bar"[\s\S]*?<span class="top-bar__hueco"[^>]*><\/span>\s*<div class="carril">\s*(<!--[\s\S]*?-->\s*)?<app-sensitive-notice \[text\]="sensitiveNotice\(\)" \[sceneKey\]="visibleNode\(\)\?\.key \?\? null"[^>]*\/>[\s\S]*?<div class="top-bar__derecha"[^>]*>\s*<app-simulation-hud[\s\S]*?\/>\s*@if \(world\(\) && !cinemaBars\(\)\) \{\s*(<!--[\s\S]*?-->\s*)?<app-minimapa[\s\S]*?\/>\s*\}\s*<\/div>\s*<\/div>\s*<\/header>/,
    );
    // Siempre a la vista: ninguna condición del juego (modo de vista, fundido, sala) envuelve al aviso sensible.
    const carril = source.slice(source.indexOf('<div class="carril">'), source.indexOf('<app-simulation-hud'));
    expect(carril.slice(0, carril.indexOf('<app-sensitive-notice'))).not.toMatch(/@if/);
    expect(source).toContain('node.warningMessage');
    // Ya no está dentro de .objective-card (que se pliega a su chip) ni en el panel lateral: un único sitio.
    expect(source).not.toContain('objective-card__notice');
    expect(source).not.toContain('right-panel__warning');
    expect(source).not.toMatch(/<div class="objective-card">[\s\S]*?sensitiveNotice\(\)[\s\S]*?<app-scene-goal-card/);
  });

  it('el pliegue de la tarjeta (chip, «Ocultar pasos», compacto, móvil vertical) ya no toca el aviso ético', () => {
    // Antes, `.objective-card:has([data-collapsed=true]) .objective-card__notice { display: none }` lo ocultaba al plegar.
    const foldRules = source.match(/[^\n{}]*data-collapsed='true'[^{}]*\{[^}]*\}/g) ?? [];
    expect(foldRules.length).toBeGreaterThan(0);
    for (const foldRule of foldRules) {
      expect(foldRule).not.toMatch(/sensitive|notice/);
    }
    expect(noticeSource).not.toMatch(/\.sensitive-strip[^{]*\{[^}]*display:\s*none/);
    // El pliegue propio del aviso deja el texto en el DOM (clase sr-only), nunca lo quita.
    expect(noticeSource).toContain("[class.sr-only]=\"!unfolded()\"");
  });

  // Bloque U1 (variante B): el aviso es una placa de pixel con la tinta y el tamaño de las fichas, ya no una franja con colores propios.
  it('el aviso es legible (>= 12 px, también en compacto), con contraste alto y sin desenfoque', () => {
    // El tamaño sale de `--pixel-tam` (14 px; 13 en móvil; 16 en pantalla grande) y no hay un tamaño propio más pequeño en el aviso.
    const pixelTokens = readFileSync(join(__dirname, '../../../styles/tokens/_pixel.scss'), 'utf-8');
    // Escala única (U1, V7): continua según el área, con piso de 12 px y techo de 16 px.
    expect(pixelTokens).toMatch(/--pixel-tam: clamp\(12px, [^;]+, 16px\);/);
    expect(noticeRule('.sensitive-strip')).toMatch(/font-size:\s*var\(--pixel-tam, 14px\);/);
    expect([...noticeSource.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].filter(match => Number(match[1]) * (match[2] === 'rem' ? 16 : 1) < 12)).toEqual([]);
    // Tinta de la placa y del chip sobre la penumbra opaca de las piezas: razón de contraste >= 7:1 (AAA).
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(pixelTokens)?.[1] ?? '';
    expect(noticeRule('.sensitive-strip')).toContain('color: var(--pixel-tinta);');
    expect(noticeRule('.sensitive-strip__chip')).toContain('color: var(--pixel-ambar);');
    for (const ink of ['pixel-tinta', 'pixel-ambar']) {
      expect(contrastRatio(token(ink), token('pixel-penumbra'))).toBeGreaterThanOrEqual(7);
    }
    // Sin desenfoque: ni el aviso ni la superficie de las piezas de pixel (opaca, con trama) lo usan.
    expect(noticeSource).not.toMatch(/backdrop-filter/);
    const piezas = readFileSync(join(__dirname, '../../../styles/components/_pixel.scss'), 'utf-8');
    expect(piezas).not.toMatch(/backdrop-filter/);
    expect(piezas).toMatch(/background-color:\s*var\(--pixel-penumbra\);/);
    expect(noticeSource).toContain('[class.u-placa]="unfolded()"');
  });

  // Bloque U1 (variante B): «su propio sitio» ahora es el carril de la cabecera, que va en flujo entre el hueco de la ficha y el HUD.
  it('el aviso ocupa su propio sitio en el carril de la cabecera (no es una capa flotante): no tapa al personaje, a la ficha ni los controles', () => {
    expect(noticeRule('.sensitive-strip')).not.toMatch(/position:\s*(absolute|fixed)/);
    expect(rule('.carril')).not.toMatch(/position:\s*(absolute|fixed)/);
    expect(rule('.carril')).toMatch(/flex:\s*1;\s*min-width:\s*0;/);
    expect(source).toMatch(/<div class="top-bar__fila">\s*<span class="top-bar__hueco" aria-hidden="true"><\/span>\s*<div class="carril">/);
    // El carril no cae sobre la ficha: el hueco mide lo mismo que ella.
    expect(rule('.top-bar__hueco')).toContain('width: min(440px, 33%);');
    expect(rule('.objective-card')).toContain('width: min(440px, 33%);');
    // La cabecera es una capa que deja pasar el puntero al mundo; solo el carril y el HUD lo reciben.
    expect(rule('.top-bar')).toContain('pointer-events: none;');
    expect(rule('.carril > *')).toContain('pointer-events: auto;');
  });

  // Bloque U1 (variante B): el tope baja a 24 px de margen porque el envoltorio queda a `--pixel-borde` (12 px) de los bordes.
  it('la tarjeta desplegada tiene tope de alto y se desplaza por dentro: no baja sobre el kit ni la Familia en crisis', () => {
    expect(rule('.objective-card')).toContain('max-height: min(calc(100% - 24px), 66%);');
    expect(rule('.objective-card')).toMatch(/display: flex;\s*flex-direction: column;\s*(align-items: stretch;\s*)?overflow: hidden;/);
    expect(rule('.objective-card__scroll')).toMatch(/min-height: 0;\s*overflow-y: auto;/);
  });

  it('en compacto la tarjeta desplegada deja libre la cruz táctil y se sostiene a la derecha de ella', () => {
    const compact = source.slice(source.lastIndexOf('@media (max-height: 520px), (pointer: coarse) and (orientation: landscape)'));
    expect(compact).toMatch(
      /\.objective-card:not\(:has\(app-scene-goal-card\[data-collapsed='true'\]\)\) \{\s*left: 176px; right: auto; width: min\(640px, calc\(100% - 190px\)\);\s*flex-direction: row;/,
    );
  });

  it('la ficha recibe la guía, el intento y el pliegue compacto (cardFolded), y refresca la sala al abrirse', () => {
    // V7: también el ajuste «Reducir movimiento» (sin pulso al cambiar el objetivo).
    expect(source).toMatch(/<app-scene-goal-card \[guia\]="guide\(\)" \[hintAttempt\]="hintAttempt\(\)" \[compact\]="cardFolded\(\)" \[reduceMotion\]="reduceMotion\(\)"\s*\(opened\)="refreshGuide\(\)" \(consentRequired\)="requireConsentAgain\(\)"/);
    expect(source).toContain('readonly cardFolded = computed(() => this.compactMode() || this.narrowScreen());');
  });

  // Bloque U1 (variante B): el envoltorio ya no pinta fondo; la superficie opaca la ponen las piezas de pixel (pestaña y ficha), sin desenfoque.
  it('el envoltorio no pinta fondo ni desenfoque: la superficie opaca es de las piezas de pixel de la ficha', () => {
    expect(rule('.objective-card')).not.toMatch(/backdrop-filter|background|box-shadow|border/);
    expect(source).toContain('class="objective-card__etapa u-rotulo"');
    const goalCard = readFileSync(join(__dirname, 'scene-goal-card.component.ts'), 'utf-8');
    expect(goalCard).toContain('goal-card__toggle u-boton');
    expect(goalCard).toContain('goal-card__body u-placa');
    expect(goalCard).not.toMatch(/backdrop-filter/);
  });
});

describe('el rótulo de la escena nueva no tapa la ficha del objetivo', () => {
  // Bloque U1 (variante B): el rótulo ya no es una capa absoluta arriba a la derecha sino una placa del carril, que deja libre el hueco de la ficha.
  it('en escritorio el rótulo va en el carril de la cabecera, en flujo, y deja libre el lado de la ficha (que va arriba a la izquierda)', () => {
    const banner = rule('.room-banner');
    expect(banner).not.toMatch(/position:\s*(absolute|fixed)/);
    expect(banner).not.toContain('left: 50%');
    expect(banner).not.toContain('translateX(-50%)');
    // Bloque U1 (variante B): entre el carril y el HUD está ahora el grupo de la derecha, que también aloja el minimapa.
    expect(source).toMatch(/<div class="carril">[\s\S]*?<div class="room-banner u-placa u-sombra">\{\{ roomBanner\(\) \}\}<\/div>[\s\S]*?<\/div>\s*(<!--[\s\S]*?-->\s*)?<div class="top-bar__derecha"[^>]*>\s*<app-simulation-hud/);
    // El carril empieza donde acaba el hueco de la ficha: el rótulo nunca cae sobre ella.
    expect(source).toMatch(/<span class="top-bar__hueco" aria-hidden="true"><\/span>\s*<div class="carril">/);
    expect(rule('.top-bar__hueco')).toContain('width: min(440px, 33%);');
    expect(rule('.objective-card')).toContain('width: min(440px, 33%);');
    expect(rule('.objective-card')).toContain('left: var(--pixel-borde);');
  });

  it('su entrada anima en vertical (sin el desplazamiento horizontal del centrado)', () => {
    expect(source).toMatch(/@keyframes room-banner-in \{ from \{ opacity: 0; transform: translateY\(-8px\); \} \}/);
  });

  // Bloque U1 (variante B): ya no hay chip ni rótulo absoluto. Bajo 760 px la ficha pasa a lo ancho pero el hueco de la
  // cabecera no, así que el carril y el HUD caían sobre ella: ahora la cabecera se apila (el grupo de la derecha primero),
  // el hueco mide lo que la ficha (--alto-objetivo) y la ficha baja bajo el HUD (--alto-hud); las dos alturas las mide un
  // ResizeObserver que se desconecta al destruir.
  it('bajo 760 px el hueco mide lo que la ficha del objetivo y la ficha baja bajo el HUD: el carril y el HUD no caen sobre ella', () => {
    const mobile = source.split('@media (max-width: 760px) {').slice(1).find(bloque => bloque.includes('.top-bar__hueco')) ?? '';
    expect(mobile).toMatch(/\.top-bar__fila \{ flex-direction: column; align-items: stretch; \}/);
    expect(mobile).toMatch(/\.top-bar__derecha \{ order: -1; width: 100%; \}/);
    expect(mobile).toContain('.top-bar__hueco { width: 100%; height: var(--alto-objetivo, 0px); }');
    const ficha = mobile.match(/\.objective-card \{([^}]*)\}/)?.[1] ?? '';
    expect(ficha).toContain('top: calc(2 * var(--pixel-borde) + var(--alto-hud, 0px));');
    expect(ficha).toContain('left: var(--pixel-borde);');
    expect(ficha).toContain('right: var(--pixel-borde);');
    expect(ficha).toContain('width: auto;');
    // Las alturas se miden y se publican en el contenedor; el observador se desconecta al destruir (o al rehacerse).
    expect(source).toContain("[style.--alto-hud]=\"altoHud() + 'px'\"");
    expect(source).toContain("[style.--alto-objetivo]=\"altoObjetivo() + 'px'\"");
    expect(source).toMatch(/new ResizeObserver\(/);
    expect(source).toMatch(/onCleanup\(\(\) => observador\.disconnect\(\)\)/);
  });

  // Bloque U1 (variante B): el teléfono (≤ 560 px) ve más sala. Una sola copia del chip sensible es visible a la vez
  // (display: none la saca del árbol de accesibilidad), el minimapa deja sus dos botones y la ficha pierde el kicker.
  it('en teléfono (≤ 560 px) el chip sensible baja al pie junto a «Salida segura» y solo una copia queda a la vista', () => {
    expect(source).toMatch(/<app-safe-exit-button variante="placa"[^>]*\/>\s*\}\s*(<!--[\s\S]*?-->\s*)?<app-sensitive-notice class="notice-pie" \[text\]="sensitiveNotice\(\)" \[sceneKey\]="visibleNode\(\)\?\.key \?\? null"[^>]*\/>/);
    expect(rule('.notice-pie')).toContain('display: none;');
    const phone = source.match(/@media \(max-width: 560px\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    expect(phone).toContain('.carril > app-sensitive-notice { display: none; }');
    expect(phone).toMatch(/\.notice-pie \{ display: block;/);
    // Bloque U1 (variante B): en el teléfono el plano no se oculta (sin tecla M es la única forma de abrirlo con el dedo); solo la pestaña del lugar.
    expect(phone).toContain('.top-bar__derecha ::ng-deep .minimapa__lugar { display: none; }');
    expect(phone).not.toMatch(/\.minimapa__abrir[^{]*\{ display: none; \}/);
    const goalCard = readFileSync(join(__dirname, 'scene-goal-card.component.ts'), 'utf-8');
    expect(goalCard).toMatch(/@media \(max-width: 560px\) \{\s*\.goal-card__kicker \{ display: none; \}/);
    expect(goalCard).toContain('text-overflow: ellipsis; white-space: nowrap;');
  });

  // Bloque U1 (variante B): el minimapa subió a la cabecera, bajo el HUD; ya no vive en el lienzo.
  it('el minimapa va bajo el HUD, en la cabecera, y con las franjas de cine se va; el foco del plano sigue volviendo a su botón', () => {
    const canvas = source.slice(source.indexOf('<section #canvasZone'), source.indexOf('<app-reaction-director'));
    expect(canvas).not.toContain('<app-minimapa');
    expect(source).toMatch(/@if \(world\(\) && !cinemaBars\(\)\) \{\s*(<!--[\s\S]*?-->\s*)?<app-minimapa \[plano\]="placePlan\(\)" \[actual\]="placeRoom\(\)" \[cercana\]="cameraSettings\.cercana\(\)"\s*\[lugar\]="world\(\)\?\.map\?\.title \?\? ''"/);
    expect(source).toContain("document.querySelector<HTMLElement>('[data-minimapa-abrir]')");
  });
});

describe('el HUD recibe el título de la escena (T9.2)', () => {
  it('stageLabel es el título del nodo: sin contador de decisiones ni respaldo por escenarios', () => {
    expect(source).toMatch(/readonly stageLabel = computed<string \| null>\(\(\) => this\.visibleNode\(\)\?\.title \?\? null\);/);
    expect(source).not.toContain('fallbackStageLabel');
  });

  it('el HUD recibe stageLabel y no el contador «Escenario k de n» ni progressLabel', () => {
    expect(source).toMatch(/<app-simulation-hud[\s\S]*?\[stageLabel\]="stageLabel\(\)"/);
    expect(source).not.toContain('[progressLabel]');
    expect(source).not.toContain('[nearbyInteractionKey]');
    expect(source).not.toMatch(/progressLabel\(\)\s*:\s*string/);
  });

  it('el encabezado del panel lateral no repite el título de la escena encima del h2', () => {
    expect(source).not.toContain('right-panel__kicker');
    expect(source).toMatch(/<h2>\{\{ game\.currentNode\.title \}\}<\/h2>/);
  });
});

describe('barra contextual (T9.3, T9.5)', () => {
  it('el botón principal conserva button.context-bar__interaction con su <strong> y el nombre «Interactuar: …»', () => {
    // Bloque U1 (variante B): las acciones son fichas del cuadro de diálogo (u-ficha u-sombra).
    expect(source).toMatch(/<button type="button" class="context-bar__interaction u-ficha u-sombra"/);
    expect(source).toMatch(/<strong>\{\{ action\.verb\.text \}\}<\/strong>/);
    expect(source).toContain('`Interactuar: ${verb.text}');
    expect(source).not.toContain('atajo E');
  });

  it('el botón secundario usa context-bar__interaction--secondary y también lleva <strong>', () => {
    expect(source).toMatch(/class="context-bar__interaction context-bar__interaction--secondary u-ficha u-sombra"[\s\S]*?<strong>\{\{ also\.verb\.text \}\}<\/strong>/);
  });

  it('el secundario conserva «También:» en su nombre accesible aunque el modo compacto lo oculte a la vista', () => {
    expect(source).toContain(`[attr.aria-label]="'También: ' + also.verb.text"`);
  });

  it('en reposo la barra solo trae la nota «No hay nada a tu alcance» (clase propia); ni línea «Ahora:» ni leyenda de teclas', () => {
    // Bloque U1 (variante B): la nota de reposo es una placa (u-placa).
    expect(source).toMatch(/@if \(nothingNearbyNote\(\); as note\) \{\s*<p class="context-bar__now u-placa">\{\{ note \}\}<\/p>/);
    expect(source).not.toContain('nowLine');
    expect(source).not.toContain('context-bar__hint');
    expect(source).not.toContain('WASD mover');
  });

  it('la <kbd> «E» del botón no se pinta en modo compacto ni sin puntero fino', () => {
    // La tecla que se rotula sale del ajuste «Atajos de una tecla» (F6-10): E con ellos activos, Enter sin ellos.
    // Bloque U1 (variante B): la tecla es la u-tecla de letra del cuadro de diálogo.
    expect(source).toMatch(/@if \(!compactMode\(\)\) \{ <kbd class="u-tecla u-tecla--letra" aria-hidden="true">\{\{ shortcuts\.enabled\(\) \? 'E' : 'Enter' \}\}<\/kbd> \}/);
    expect(source).toMatch(/@media not all and \(hover: hover\) and \(pointer: fine\) \{\s*\.context-bar__interaction kbd \{ display: none; \}/);
  });

  it('una puerta bloqueada también marca candado cuando es el botón secundario', () => {
    expect(source).toMatch(/context-bar__interaction--secondary u-ficha u-sombra"[\s\S]*?\[class\.context-bar__interaction--locked\]="also\.verb\.locked"[\s\S]*?@if \(also\.verb\.locked\) \{ <app-pixel-icono class="context-bar__lock" nombre="candado" \/> \}/);
  });

  // Bloque U1 (variante B): el pie ya no tiene alto fijo; es una capa en la misma celda que el mundo, así que el mundo no se redimensiona.
  it('el pie es una capa sobre el mundo (misma celda de la rejilla): el mundo no cambia de tamaño al acercarte a algo', () => {
    expect(source).toMatch(/\.top-bar, \.main-zone, \.bottom-zone \{ grid-row: 1; grid-column: 1; \}/);
    expect(source).toMatch(/grid-template-rows: minmax\(0, 1fr\);/);
    expect(rule('.bottom-zone')).toMatch(/align-self: end;/);
    // Capa: deja pasar el puntero al mundo y solo sus piezas lo reciben; sin altura ni alto mínimo que empuje al lienzo.
    expect(rule('.bottom-zone')).toMatch(/pointer-events: none;/);
    expect(rule('.bottom-zone > *')).toMatch(/pointer-events: auto;/);
    expect(rule('.bottom-zone')).not.toMatch(/(^|[\s;])(min-|max-)?height:/);
    expect(rule('.main-zone')).not.toMatch(/padding:\s*[1-9]/);
  });

  // req: RNF-04, BLOQUE-H
  it('las acciones de la barra de contexto miden 44 px con cualquier puntero', () => {
    expect(rule('.context-bar__interaction')).toMatch(/min-height: 44px;/);
  });

  it('el botón no hace crecer el pie: una línea con puntos suspensivos', () => {
    expect(rule('.context-bar__copy strong')).toMatch(/white-space: nowrap;/);
    expect(rule('.context-bar__copy strong')).toMatch(/text-overflow: ellipsis;/);
    expect(rule('.context-bar__interaction')).toMatch(/max-height: 100%;/);
  });
});

describe('«Ir a…» (F6-11, VD-19)', () => {
  // req: BLOQUE-H H-06, RNF-04
  it('abierta, el resto del juego queda inerte y Esc la cierra antes que la ayuda, la bitácora, el diálogo y la pausa', () => {
    expect(source).toMatch(/this\.showCaseIntro\(\) \|\| this\.dialogue\(\) !== null \|\| this\.journalOpen\(\) \|\| this\.placesOpen\(\)/);
    const chain = source.slice(source.indexOf('if (this.placesOpen())  {'));
    expect(chain.indexOf('if (this.placesOpen())')).toBeLessThan(chain.indexOf('if (this.helpOpen())'));
    expect(source).toMatch(/<app-world-places-list \[places\]="placeOptions\(\)" \[pausing\]="pausing\(\)"\s*\(choose\)="choosePlace\(\$event\)" \(closed\)="closePlaces\(\)" \(safeExit\)="pauseFromOverlay\(\)" \/>/);
  });

  it('solo se ofrecen personas, puertas y lo examinado (misma regla que el hover) y la llegada se anuncia', () => {
    expect(source).toContain('selectPlaces(this.gameWorld?.places() ?? [], examined)');
    expect(source).toContain('new Set(this.world()?.inspectedObjectKeys ?? [])');
    expect(source).toMatch(/onWalkEnded\(event: \{ key: string; label: string; outcome: 'arrived' \| 'blocked' \}\): void \{/);
    expect(source).toContain('DRAFT_COPY.placesArrived');
  });

  it('al cerrarla el foco vuelve a su acceso de la cabecera', () => {
    expect(source).toMatch(/afterNextRender\(\(\) => document\.querySelector<HTMLElement>\('\[data-hud-places\]'\)\?\.focus\(\)/);
  });
});

describe('texto de la pantalla de juego (F6-3)', () => {
  // req: RNF-04, BLOQUE-H
  it('ningún texto del componente baja de 12 px, ni en las entradas ni en el pie ni en el panel de escena', () => {
    const styles = source.slice(source.indexOf('styles: [`'));
    const small: string[] = [];
    for (const chunk of styles.split('}')) {
      const [selector, body] = chunk.split('{');
      if (!body) continue;
      for (const match of body.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) {
        const px = match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
        if (px < 12) small.push(selector.trim().split('\n').pop() + ' → ' + match[0]);
      }
    }
    expect(small).toEqual([]);
  });

  it('el foco del pie es el anillo global del juego, sin anillo local con literales', () => {
    expect(source).not.toMatch(/\.context-bar__interaction:focus-visible/);
  });
});

describe('enlaces con el mundo (T9.5, T9.9)', () => {
  it('el mundo recibe atenuados, puertas y modo compacto, y sus dos salidas nuevas están enlazadas', () => {
    expect(worldTag).not.toContain('nextTargetKey');
    expect(worldTag).toContain('[dimmedKeys]="dimmedKeys()"');
    expect(worldTag).toContain('[doorStates]="doorStates()"');
    expect(worldTag).toContain('[compact]="compactMode()"');
    expect(worldTag).toContain('(proximityAlso)="nearbyAlso.set($event)"');
    expect(worldTag).toContain('(nothingNearby)="showNothingNearby()"');
  });

  it('el panel lateral releer el tamaño del mundo cuando termina su animación', () => {
    expect(source).toMatch(/<aside class="right-panel"[^>]*\(animationend\)="refreshWorldScale\(\)"/);
  });
});

describe('ayuda (T9.8)', () => {
  it('la tarjeta de primera vez y la pantalla de ayuda están enlazadas, con la promesa de salida segura condicionada', () => {
    expect(source).toMatch(/<app-game-help view="card"[^>]*\[safeExitPromise\]="safeExitPromise"[\s\S]*?\(dismissed\)="markHelpCardSeen\(\)" \(openFull\)="openHelp\(\)"/);
    expect(source).toMatch(/<app-game-help view="screen"[^>]*\[safeExitPromise\]="safeExitPromise"[\s\S]*?\(closed\)="helpOpen\.set\(false\)"/);
    expect(source).toContain('readonly safeExitPromise = SAFE_EXIT_ALWAYS_REACHABLE;');
  });

  it('el HUD abre la ayuda y reactiva la tarjeta', () => {
    expect(source).toMatch(/\(openHelp\)="openHelp\(\)" \(helpReset\)="resetHelpCard\(\)"/);
  });

  it('la pantalla de ayuda deja libres la cabecera y el pie (no se pone inert)', () => {
    // Bloque U1 (variante B): ya no hay cabecera de 52 px ni pie de 68 px fijos sino capas; se dejan libres la tira del HUD
    // (de 64 a 120 px según el alto) y el pie medido (--alto-pie, V6).
    expect(rule('.help-layer')).toMatch(/top: clamp\(64px, 12vh, 120px\);/);
    expect(rule('.help-layer')).toMatch(/bottom: calc\(var\(--alto-pie, 88px\) \+ 8px\);/);
    expect(rule('.help-layer')).toMatch(/pointer-events: none;/);
    expect(source).toMatch(/<footer class="bottom-zone"[^>]*\[attr\.inert\]="inputBlocked\(\)/);
  });
});

describe('el cliente ya no recibe ni usa la clasificación de las opciones (T8.4)', () => {
  const model = readFileSync(join(__dirname, '../../core/models/simulation.model.ts'), 'utf-8');
  const block = (name: string) => model.match(new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';

  it('SimulationDecisionOption solo trae id y texto', () => {
    expect(block('SimulationDecisionOption')).toContain('id: number;');
    expect(block('SimulationDecisionOption')).not.toMatch(/classification|prohibitedConduct/);
  });

  it('DialogueChoiceState no lleva ayudas visuales de «recomendada» ni «prohibida»', () => {
    expect(block('DialogueChoiceState')).not.toMatch(/isRecommended|isProhibited/);
  });

  it('la pantalla de juego no los asigna', () => {
    expect(source).not.toMatch(/isRecommended|isProhibited/);
  });

  it('el reporte de finalización trae retries (opcional, aparte de las decisiones registradas)', () => {
    expect(block('AttemptCompletionReport')).toMatch(/retries\?: number;/);
  });

  it('el resultado y la pausa reciben los recursos de apoyo que ya muestra la bitácora', () => {
    expect(source).toMatch(/<app-attempt-outcome[^>]*\[supportResources\]="supportResources\(\)"/);
    expect(source).toMatch(/<app-journal-panel[\s\S]*?\[resources\]="supportResources\(\)"/);
  });

});

describe('modo compacto (T10)', () => {
  const COMPACT = '@media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {';
  // Hay dos bloques con esta condición (la tarjeta de ayuda y el principal): el principal es el último.
  const start = source.lastIndexOf(COMPACT);
  const compactCss = start >= 0 ? source.slice(start, source.indexOf('\n    }\n', start) + 7) : '';

  it('la condición del CSS es la de la lógica (compactMode)', () => {
    expect(source).toContain("const COMPACT_QUERY = '(max-height: 520px), (pointer: coarse) and (orientation: landscape)';");
    expect(start).toBeGreaterThan(-1);
  });

  it('va después del bloque móvil: un móvil horizontal de 667x375 cumple los dos y manda el compacto', () => {
    expect(source.indexOf('@media (max-width: 760px) {')).toBeGreaterThan(-1);
    expect(source.indexOf('@media (max-width: 760px) {')).toBeLessThan(start);
  });

  // Bloque U1 (variante B): «Salida segura» del pie es ahora la variante «placa» del mismo componente compartido.
  it('el pie es de una sola fila y altura fija de 56 px, sin teclas ni leyenda (la leyenda ya no existe)', () => {
    expect(compactCss).toMatch(/\.bottom-zone \{[^}]*flex-wrap: nowrap;[^}]*height: 56px;/);
    expect(compactCss).not.toContain('context-bar__hint');
    // «Salida segura» es el componente compartido (F6-6): en compacto va en su variante densa, sin la pista de tecla.
    expect(source).toMatch(/<app-safe-exit-button variante="placa" \[compact\]="compactMode\(\)" \[pausing\]="pausing\(\)" \(pause\)="pauseFromOverlay\(\)" \/>/);
  });

  it('los controles del pie miden al menos 44 px', () => {
    // «Salida segura» mide 44 px en el propio componente, también compacto (su spec lo fija).
    expect(readFileSync(join(__dirname, 'safe-exit-button.component.ts'), 'utf-8'))
      .toMatch(/\.safe-exit-btn \{[^}]*min-height: 44px;/);
    expect(compactCss).toMatch(/\.context-bar__interaction \{[^}]*min-height: 44px;/);
    // Bloque U1 (variante B): la placa de «Salida segura» toma su alto de `--alto-boton` del pie (28 puntos de mundo = 56 px >= 44).
    expect(rule('.bottom-zone')).toContain('--alto-boton: calc(28 * var(--pixel-px));');
    expect(readFileSync(join(__dirname, 'safe-exit-button.component.ts'), 'utf-8')).toContain('min-height: var(--alto-boton, 44px);');
  });

  it('el panel de decisión es una hoja flotante: una columna, sin resumen de etapa y sin reencuadrar el mundo', () => {
    expect(compactCss).toMatch(/\.game-container\[data-mode='dialogue-right'\] \.main-zone \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(compactCss).toMatch(/\.right-panel \{[^}]*position: fixed;[^}]*bottom: 0;/);
    expect(compactCss).toMatch(/\.game-container\[data-mode='dialogue-right'\] \.right-panel__scene \{ display: none; \}/);
  });

  it('la introducción y el contexto tienen cabecera compacta, pie fijo y degradado que avisa del desplazamiento', () => {
    expect(compactCss).toMatch(/\.case-intro-card__header \{[^}]*grid-template-areas: 'eyebrow extra' 'title extra';/);
    expect(compactCss).toMatch(/\.case-intro-card__actions::before \{[^}]*linear-gradient\(/);
    expect(compactCss).toMatch(/\.case-intro-card__actions \{ position: relative; \}/);
  });

  it('ningún nombre accesible promete teclas que no existen en táctil', () => {
    expect(source).not.toMatch(/aria-label="[^"]*\((Esc|Escape|J|E)\)/);
    expect(source).not.toMatch(/\[attr\.aria-label\]="[^"]*\((Esc|Escape|J|E)\)/);
  });
});
