import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Los fines de línea se normalizan: con `core.autocrlf=true` el árbol de trabajo sale en CRLF y varios cortes de abajo buscan `\n`.
const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('simulation-play: introducción', () => {
  it('la introducción es una tarjeta genérica: sin escena animada, sin video y sin texto de un caso', () => {
    expect(source).not.toContain('app-case-intro-scene');
    expect(source).not.toContain('<video');
    expect(source).not.toContain('fondoHabitacion');
    expect(source).not.toMatch(/28 heridas|Contexto inicial del caso|hospital-urgencias/);
    expect(existsSync(join(__dirname, '../../../assets/video/fondoHabitacion.mp4'))).toBe(false);
    for (const gone of ['case-intro-scene.component.ts', 'intro-scene.util.ts']) {
      expect(existsSync(join(__dirname, gone)), gone).toBe(false);
    }
  });

  it('conserva el contrato de los e2e: «Antes de comenzar» con un botón «Continuar»', () => {
    expect(source).toContain('<h2 id="case-intro-title">Antes de comenzar</h2>');
    expect(source).toContain('<p class="psy-eyebrow">Primera escena</p>');
    expect(source).toMatch(/\(click\)="continueFromCaseIntro\(\)">\s*Continuar\s*<\/button>/);
    expect(source).not.toContain('Saltar video');
  });

  it('la tarjeta nombra el caso, la escena y la sala desde el intento y el mundo', () => {
    expect(source).toContain("introCardLines(game.caseTitle, game.currentNode.title, world()?.map?.title ?? '')");
  });

  it('ninguna tarjeta nombra la pista interna y ambas permiten silenciar la música', () => {
    expect(source).not.toContain('está sonando');
    expect(source).not.toContain('PsicoLament');
    const toggles = source.match(/class="intro-music-toggle" \[attr\.aria-pressed\]="musicMuted\(\)" \(click\)="toggleMusicMute\(\)"/g) ?? [];
    expect(toggles).toHaveLength(1);
  });

  it('los anuncios de música llevan tilde', () => {
    expect(source).toContain("'Música silenciada.'");
    expect(source).toContain("'Música activada.'");
  });

  it('«Simulación formativa con datos ficticios» conserva su estilo de chip con clase propia', () => {
    expect(source).toContain('<span class="case-intro-card__chip">Simulación formativa con datos ficticios</span>');
    expect(source).toMatch(/\.case-intro-card__chip\s*\{[^}]*border-radius:\s*999px[^}]*background:\s*rgba\(108,192,199,\.1\)/);
    // Un selector por etiqueta del encabezado alcanzaría también al texto del botón de silenciar.
    expect(source).not.toMatch(/\.case-intro-card__header span\s*\{/);
  });

  it('la etiqueta del botón de música no hereda el estilo del texto de apoyo del pie', () => {
    expect(source).toContain('.case-intro-card__actions > span {');
    expect(source).not.toContain('.case-intro-card__actions span {');
  });
});

describe('simulation-play: salida segura alcanzable desde cada superposición (REGLA-004)', () => {
  const caseIntro = source.slice(source.indexOf('id="case-intro-title"'), source.indexOf('<header class="top-bar"'));

  it('la tarjeta de la introducción ofrece «Salida segura» a la izquierda de «Continuar»', () => {
    // U1 (crítica r2): la salida de la tarjeta es la placa con brasa de I1, la misma del pie del juego.
    const intoPause = /<app-safe-exit-button variante="placa" \[pausing\]="pausing\(\)" \(pause\)="pauseFromOverlay\(\)" \/>\s*<button cdkFocusInitial class="psy-button psy-button--primary" type="button" \(click\)="continueFromCaseIntro\(\)">/;
    expect(caseIntro).toMatch(intoPause);
  });

  it('el foco inicial de las tarjetas sigue en «Continuar», no en la salida', () => {
    expect(caseIntro.match(/cdkFocusInitial/g)).toHaveLength(1);
  });

  it('los dos paneles de diálogo y la bitácora conectan su salida segura al método nuevo', () => {
    const panels = source.match(/<app-dialogue-panel[^>]*?\/>/g) ?? [];
    expect(panels).toHaveLength(2);
    for (const panel of panels) expect(panel).toContain('(safeExit)="pauseFromOverlay()"');
    expect(source).toMatch(/<app-journal-panel[^>]*\(safeExit\)="pauseFromOverlay\(\)"/);
  });

  it('los dos paneles de diálogo reciben el token que libera la opción elegida tras un fallo', () => {
    const panels = source.match(/<app-dialogue-panel[^>]*?\/>/g) ?? [];
    expect(panels).toHaveLength(2);
    for (const panel of panels) expect(panel).toContain('[releaseToken]="dialogueReleaseToken()"');
  });

  // F6-6: el pie usa la MISMA implementación que las superposiciones; el rótulo «Pausando…», aria-busy y la tecla
  // (aria-hidden) viven en app-safe-exit-button (su spec y simulation-play.safe-exit-states.spec.ts los fijan).
  const safeExitSource = readFileSync(join(__dirname, 'safe-exit-button.component.ts'), 'utf-8');

  // Bloque U1 (variante B): el botón del pie es la variante «placa» del mismo componente: la etiqueta trae `variante="placa"` antes de `[compact]`.
  it('el botón del pie acepta el toque con una petición en curso y su nombre no dice «(Escape)»', () => {
    const footerButton = source.match(/<app-safe-exit-button variante="placa" \[compact\][^>]*\/>/)?.[0] ?? '';
    expect(footerButton).not.toBe('');
    expect(footerButton).toContain('(pause)="pauseFromOverlay()"');
    expect(footerButton).toContain('[pausing]="pausing()"');
    expect(footerButton).not.toContain('[disabled]');
    expect(source).not.toMatch(/<button class="safe-exit"/);
    expect(safeExitSource).toContain("{{ pausing() ? 'Pausando…' : 'Salida segura' }}");
    expect(source).not.toContain('Salida segura (Escape)');
  });

  // Bloque U1 (variante B): se busca la etiqueta de la variante «placa»; con la antigua el texto salía vacío y la prueba no comprobaba nada.
  it('el botón del pie no pisa su nombre con un aria-label: el texto visible es el nombre (WCAG 2.5.3)', () => {
    const footerButton = source.match(/<app-safe-exit-button variante="placa" \[compact\][^>]*\/>/)?.[0] ?? '';
    expect(footerButton).not.toBe('');
    // Con aria-label «Salida segura» y la tecla «Esc» visible, axe 4.14 marca label-content-name-mismatch.
    expect(footerButton).not.toContain('aria-label');
    expect(safeExitSource).not.toContain('aria-label');
    // La tecla queda fuera del árbol de accesibilidad.
    expect(safeExitSource).toContain('<kbd class="safe-exit-btn__kbd" aria-hidden="true">Esc</kbd>');
  });

  // Bloque U1 (variante B): el acuse es una placa de pixel (u-placa u-sombra) con el icono de pixel «pausa», ya no un chip con mat-icon.
  it('la pausa pedida tiene un acuse visible que no depende del pie (oculto bajo una superposición)', () => {
    const notice = source.match(/@if \(pausing\(\) && attempt\(\)\?\.status === 'IN_PROGRESS'\) \{[\s\S]*?\n      \}\n/)?.[0] ?? '';
    expect(notice).toContain('class="pausing-notice u-placa u-sombra"');
    expect(notice).toContain('<app-pixel-icono nombre="pausa" />');
    expect(notice).toContain('aria-hidden="true"');
    expect(notice).toContain('Pausando el caso…');
    // El acuse es estático: sin temporizadores ni animación (nada esencial se cierra solo).
    expect(source).not.toMatch(/\.pausing-notice\s*\{[^}]*animation/);
  });

  it('el aviso de contenido no promete una salida que el estudiante no tiene a mano', () => {
    expect(source).toContain('con el botón «Salida segura»');
    expect(source).not.toContain('Durante el caso tendrás disponible la salida segura');
  });

  it('el aviso de contenido sigue tragándose Esc (ETH-01): su rama no llama a pauseFromOverlay', () => {
    const branch = source.match(/if \(this\.showContentWarning\(\)\) \{[\s\S]*?\n    \}\n/)?.[0] ?? '';
    expect(branch).toContain("event.key === 'Escape'");
    expect(branch).not.toContain('pauseFromOverlay');
  });
});
