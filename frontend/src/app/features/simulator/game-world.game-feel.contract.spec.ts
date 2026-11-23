import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: game feel del bloque B', () => {
  it('el componente recibe la activación y la intensidad y las pasa a la escena en el arranque y en cada cambio', () => {
    expect(source).toContain("readonly activation = input<Activation>('CALM');");
    expect(source).toContain("readonly intensity = input<Intensity>('MEDIUM');");
    expect(source).toContain("if (changes['activation'] || changes['intensity']) this.scene?.setPersonaScene(this.activation(), this.intensity());");
    expect(source).toMatch(/this\.scene = new DataDrivenWorldScene\(\{[\s\S]*?\}\);\s*this\.scene\.setPersonaScene\(this\.activation\(\), this\.intensity\(\)\);/);
    expect(source).not.toMatch(/stressLevel|setStressLevel/);
  });

  it('las rutas de render pintan la viñeta de crisis, también en salas con luz pintada', () => {
    // renderWorld (sala clásica), renderSalaPorPiezas (sala con `structure`, P2), renderRoom y refitCamera (el lienzo
    // cambió: se redibuja al nuevo rectángulo).
    expect(source.match(/\n {4}this\.applyCrisisVignette\(\);/g) ?? []).toHaveLength(4);
    expect(source).toMatch(/private refitCamera\(\): void \{[\s\S]*?this\.crisisVignette\?\.destroy\(\);\s*this\.applyCrisisVignette\(\);/);
  });

  it('el destello se decide solo donde se cambia de sala de verdad', () => {
    // setWorld: otro mapa (decisión o puerta). Un refresco del mismo mapa no borra uno pendiente.
    expect(source).toMatch(/setWorld\(world: SimulationWorldState\) \{\s*this\.pendingRoomFlash = roomEntryFlash\(this\.world\?\.map\.key \?\? null, world\.map\.key, this\.callbacks\.reduceMotion\)\s*\?\? this\.pendingRoomFlash;/);
    // transitionToRoom: el jugador cruza una salida del ScenarioConfig.
    expect(source).toMatch(/if \(!roomConfig\) return;\s*this\.pendingRoomFlash = roomEntryFlash\(this\.currentRoomKey \|\| null, targetRoomKey, this\.callbacks\.reduceMotion\)\s*\?\? this\.pendingRoomFlash;/);
  });

  it('la crisis la decide la utilidad pura, se congela con el mundo en pausa y nunca deja dos pulsos vivos', () => {
    expect(source).toMatch(/private applyCrisisState\(\): void \{[\s\S]*?crisisVignetteState\(this\.activation, this\.intensity, this\.callbacks\.reduceMotion \|\| this\.motionPaused\)[\s\S]*?this\.crisisPulse\?\.stop\(\);[\s\S]*?this\.crisisPulse = this\.tweens\.add\(\{[\s\S]*?yoyo: true,[\s\S]*?repeat: -1/);
    expect(source).toMatch(/setMotionPaused\(paused: boolean\) \{[\s\S]{0,260}this\.applyCrisisState\(\);\s*\}/);
    expect(source).toContain("this.addVignette('crisis', CRISIS_VIGNETTE_TINT, 0.18, 1, DEPTH.LIGHTING + 1)");
  });

  it('activar movimiento reducido reaplica la crisis y el destello pendiente se consume una sola vez', () => {
    expect(source).toMatch(/setReduceMotion\(reduced: boolean\) \{\s*this\.callbacks\.reduceMotion = reduced;(?:\s*\/\/[^\n]*)?\s*this\.syncProximityAnimations\(\);(?:\s*\/\/[^\n]*)?(?:\s*if \(reduced\) this\.restPersonWalkers\(\);)?\s*this\.applyCrisisState\(\);\s*\}/);
    expect(source).toMatch(/\n  playPendingRoomFlash\(\): void \{\s*const flash = this\.pendingRoomFlash;\s*this\.pendingRoomFlash = null;/);
  });

  it('la sala única con renderer registrado también pinta la crisis', () => {
    expect(source).toMatch(/\n {6}this\.applyCrisisVignette\(\);\s*this\.playIntroFade\(\);\s*this\.callbacks\.onReady\(\);\s*return;/);
  });

  it('ningún render dispara el destello: espera a que la sala se vea', () => {
    // Dos llamadas dentro de la escena: el fin del fundido de cámara de la salida cliente y
    // `playRevealEffects` (el destello de cambio de sala; no hay sacudida por clasificación, RN-08).
    expect(source.match(/this\.playPendingRoomFlash\(\)/g) ?? []).toHaveLength(2);
    expect(source).toMatch(/this\.cameras\.main\.fadeIn\(180, 0, 0, 0\);[\s\S]{0,200}this\.cameras\.main\.once\('camerafadeincomplete', \(\) => this\.playPendingRoomFlash\(\)\);/);
    // Angular lo pide al retirar su fundido de escena.
    expect(source).toMatch(/\n  playRevealEffects\(\) \{ this\.scene\?\.playRevealEffects\(\); \}/);
  });

  // req: RNF-04 (REGLA-009 parte)
  it('las dos viñetas son UNA textura de lienzo cada una, colocada en el rectángulo visible y compensando el zoom', () => {
    const block = source.slice(source.indexOf('  private addVignette('), source.indexOf('  /**\n   * Viñeta de crisis'));
    expect(block).toContain('const frame = vignetteFrame(cam.width, cam.height, cam.zoom);');
    expect(block).toContain('this.textures.createCanvas(key, spec.width, spec.height)');
    expect(block).toContain('paintVignette(texture.getContext(), spec);');
    // Reutilizada: solo se crea si no existe; y la de otro tamaño de ese papel se retira.
    expect(block).toContain('if (!this.textures.exists(key)) {');
    expect(block).toContain('this.textures.remove(previous)');
    // La imagen anterior del mismo papel se destruye ANTES de retirar su textura: ninguna imagen viva queda con una textura
    // destruida (la de crisis fallaba en `TexturerImage.run` al llegar a CRISIS).
    expect(block.indexOf('this.vignetteImages.get(role)?.destroy();')).toBeGreaterThan(-1);
    expect(block.indexOf('this.vignetteImages.get(role)?.destroy();')).toBeLessThan(block.indexOf('this.textures.remove(previous)'));
    expect(block).toContain('this.vignetteImages.set(role, image);');
    expect(block).toMatch(/this\.add\.image\(frame\.x, frame\.y, key\)[\s\S]*?\.setDisplaySize\(frame\.width, frame\.height\)[\s\S]*?\.setScrollFactor\(0\)/);
    expect(source).toContain("this.addVignette('tone', tint, 0.12, 0.3, DEPTH.LIGHTING_FLOOR);");
    expect(source).toContain("this.addVignette('crisis', CRISIS_VIGNETTE_TINT, 0.18, 1, DEPTH.LIGHTING + 1);");
  });

  it('ya no queda ningún bucle de strokeRect por banda en la viñeta ni la banda en Graphics', () => {
    expect(source).not.toContain('strokeVignetteBand');
    expect(source).not.toMatch(/for \(let i = 0; i < band; i\+\+\) \{\s*g\.lineStyle/);
  });

  it('el rótulo y el resto del texto del lienzo usan Poppins y se crean con la fuente ya disponible', () => {
    expect(source).not.toContain("'Arial, sans-serif'");
    expect(source).toContain('fontFamily: WORLD_FONT_FAMILY');
    expect(source).toMatch(/Promise\.all\(\[\s*this\.kit\.load\(\)\.then\(bundle => bundle, \(\) => null\),\s*this\.bibliotecaManifest\.load\(\),\s*whenWorldFontsReady\(\),\s*\]\)\.then\(\(\[bundle, manifest\]\) => \{/);
  });

  it('tras reintentar el foco va a #main-content y no queda perdido en <body>', () => {
    expect(source).toMatch(/retryLoad\(\): void \{[\s\S]*?document\.getElementById\('main-content'\)\?\.focus\(\{ preventScroll: true \}\);[\s\S]*?this\.boot\(\);/);
  });

  // req: RNF-04, REGLA-004 (revisión de F6)
  it('cada avance de la carga rearma el plazo: una red lenta que avanza no es un arranque colgado', () => {
    expect(source).toMatch(/onLoadProgress: percent => this\.zone\.run\(\(\) => \{\s*this\.loadPercent\.set\(percent\);\s*(?:\/\/[^\n]*\n\s*)?if \(!this\.renderReady\(\)\) this\.armBootWatchdog\(\);\s*\}\),/);
  });

  it('si Phaser no pinta nada en 25 s el anfitrión lo sabe y ofrece reintentar', () => {
    expect(source).toContain('const BOOT_WATCHDOG_MS = 25_000;');
    expect(source).toContain('readonly bootFailed = output<void>();');
    expect(source).toMatch(/this\.armBootWatchdog\(\);\s*this\.phaserGame = new Phaser\.Game\(/);
    expect(source).toMatch(/onReady:\s+\(\) => this\.zone\.run\(\(\) => \{\s*this\.clearBootWatchdog\(\);/);
  });

  it('un destello ya decidido no se dispara con movimiento reducido ni con la escena destruida, y es suave', () => {
    expect(source).toContain('if (!flash || this.callbacks.reduceMotion || !this.ready || !this.cameras?.main) return;');
    expect(source).toMatch(/cam\.flashEffect\.alpha = flash\.peakAlpha;\s*cam\.flash\(flash\.durationMs, \.\.\.flash\.rgb\);/);
  });

  it('no hay sacudida por clasificación al decidir: revelar la sala solo destella (RN-08)', () => {
    expect(source).not.toContain('decisionShake');
    expect(source).not.toContain('playDecisionImpact');
    expect(source).toMatch(/playRevealEffects\(\): void \{\s*this\.playPendingRoomFlash\(\);\s*\}/);
  });
});
