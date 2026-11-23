import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Correcciones de accesibilidad de la revisión adversarial sobre `simulation-play.component.ts` (F6, F9). Jest no
 * renderiza la plantilla ni mide el CSS: se fijan sus contratos como texto (las regex usan `\s*` entre líneas).
 */
const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

/**
 * F6-12: el comportamiento (qué se anuncia, cuándo y por dónde) lo fija `simulation-play.live-notices.spec.ts`
 * pintando la plantilla; aquí quedan los contratos de forma que no se ven en el DOM de una pantalla sin mundo.
 */
describe('F6: anuncios de las regiones vivas, una sola vez', () => {
  it('la barra de contexto no es una región viva y ya no trae leyenda de teclado (las teclas viven en la ayuda)', () => {
    expect(source).toMatch(/<div class="context-bar">/);
    expect(source).not.toMatch(/<div class="context-bar" aria-live/);
    expect(source).not.toContain('context-bar__hint');
  });

  it('el aviso de puerta no es una región viva del juego: es un aviso del sistema que anuncia su anfitrión, una vez', () => {
    expect(source).not.toMatch(/class="door-notice"/);
    expect(source).not.toMatch(/class="action-toast"/);
    const showDoorNotice = source.slice(source.indexOf('private showDoorNotice('), source.indexOf('private dismissDoorNotice('));
    expect(showDoorNotice).toContain("this.notifications.show('warning', message, 0)");
    expect(showDoorNotice).not.toContain('this.announce(');
  });

  it('la herramienta no se anuncia dos veces: el panel de diálogo ya anuncia su línea', () => {
    const toolFeedback = source.slice(source.indexOf('private showToolFeedback('), source.indexOf('toggleMusicMute(): void'));
    expect(toolFeedback).not.toContain('this.announce(');
    expect(toolFeedback).toContain('lines: [');
  });

  // Bloque U1 (variante B): el aviso suave es una placa con icono de pixel y la ficha lleva la pestaña de la etapa antes del desplazable; ninguno trae role.
  it('el juego no trae región viva propia: ni el aviso suave ni la tarjeta «Qué hacer» llevan role', () => {
    expect(source).toMatch(/<div class="soft-notice u-placa u-sombra"><app-pixel-icono nombre="hecho" \/><span>\{\{ softNotice\(\) \}\}<\/span><\/div>/);
    expect(source).not.toMatch(/<div class="soft-notice[^>]*role=/);
    expect(source).toMatch(/<div class="objective-card">\s*(<!--[\s\S]*?-->\s*)?(@if \(stageLabel\(\); as etapa\) \{[\s\S]*?objective-card__etapa[\s\S]*?\}\s*)?<div class="objective-card__scroll">/);
    expect(source).not.toMatch(/<div class="objective-card"[^>]*role=/);
    expect(source).not.toMatch(/<p class="objective-card__etapa[^>]*role=/);
    expect(source).not.toMatch(/aria-live="assertive" role="status"/);
    expect(source).not.toContain('a11yAnnouncement');
  });
});

describe('F9: el interruptor «Movimiento reducido» del juego apaga las animaciones CSS del simulador', () => {
  /** Los cuatro selectores de la regla: el contenedor y todo lo que hay dentro, también en componentes hijos (::ng-deep). */
  const selectors = [
    '.game-container--reduce-motion,',
    '.game-container--reduce-motion ::ng-deep *,',
    '.game-container--reduce-motion ::ng-deep *::before,',
    '.game-container--reduce-motion ::ng-deep *::after {',
  ];
  const reduceRule = source.slice(source.indexOf(selectors[0]), source.indexOf('}', source.indexOf(selectors[3])) + 1);

  // Bloque U1 (variante B): el contenedor suma la clase `pixel-juego` y las variables de arte (`[style]="arteJuego"`) de las piezas de pixel.
  it('el contenedor lleva la clase mientras el interruptor (reduceMotion) está activo', () => {
    expect(source).toMatch(/<div class="game-container pixel-juego" data-skin="game" id="main-content" tabindex="-1" \[attr\.data-mode\]="viewMode\(\)" \[style\]="arteJuego"\s*\[class\.game-container--reduce-motion\]="reduceMotion\(\)"\s*\[class\.game-container--cine\]="cinemaBars\(\)"\s*\[style\.--alto-hud\]="altoHud\(\) \+ 'px'" \[style\.--alto-objetivo\]="altoObjetivo\(\) \+ 'px'"( \[style\.--alto-pie\]="altoPie\(\) \+ 'px'")?\s*( ?\[attr\.data-rehearsal\]="[^"]*")?>/);
  });

  it('la regla alcanza al contenedor y a todos sus descendientes, también a los componentes hijos', () => {
    for (const selector of selectors) expect(reduceRule).toContain(selector);
  });

  it('apaga animaciones y transiciones igual que la regla global de prefers-reduced-motion', () => {
    expect(reduceRule).toContain('animation-duration: 1ms !important;');
    expect(reduceRule).toContain('animation-iteration-count: 1 !important;');
    expect(reduceRule).toContain('transition-duration: 1ms !important;');
    expect(reduceRule).toContain('scroll-behavior: auto !important;');
    // La red de seguridad global vive en styles/base/_motion.scss desde F1-6.
    const globalRule = readFileSync(join(__dirname, '../../../styles/base/_motion.scss'), 'utf-8');
    const media = globalRule.slice(globalRule.indexOf('@media (prefers-reduced-motion: reduce) {'));
    for (const declaration of ['animation-duration: 1ms !important;', 'animation-iteration-count: 1 !important;', 'transition-duration: 1ms !important;']) {
      expect(media).toContain(declaration);
    }
  });

  it('las animaciones que la revisión encontró encendidas existen y quedan dentro del alcance de la regla', () => {
    // `door-notice-in` salió con el aviso de puerta propio (F6-12): ahora lo pinta ui-toast-host.
    for (const name of ['sheet-up', 'panel-in', 'fade-in']) {
      expect(source).toContain(`@keyframes ${name}`);
    }
    const dialogue = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');
    expect(dialogue).toContain('@keyframes choice-in');
    expect(readFileSync(join(__dirname, 'tool-inventory.component.ts'), 'utf-8')).toContain('@keyframes tool-pop');
    // La regla está en la hoja de la pantalla de juego, que contiene al panel y al inventario como hijos: ::ng-deep los alcanza.
    expect(source).toContain('<app-dialogue-panel');
    expect(source).toContain('<app-tool-inventory');
  });

  it('el ajuste del sistema sigue funcionando: la media query se conserva', () => {
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.scene-fade \{ transition: none; \}/);
  });
});
