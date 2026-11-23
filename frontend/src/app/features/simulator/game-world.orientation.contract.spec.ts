import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

/** Cuerpo de un método de la escena: desde su firma hasta la siguiente declaración al mismo nivel. */
function bodyOf(signature: RegExp, until: RegExp): string {
  const start = source.search(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  const end = rest.slice(1).search(until);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

describe('game-world: contrato público de orientación (F§6.4)', () => {
  it('entradas nuevas con su tipo y valor por defecto', () => {
    expect(source).toContain('readonly nextTargetKey = input<string | null>(null);');
    expect(source).toContain("readonly doorStates = input<Record<string, 'open' | 'locked'>>({});");
    expect(source).toContain('readonly dimmedKeys = input<ReadonlySet<string>>(new Set<string>());');
    expect(source).toContain('readonly compact = input(false);');
  });

  it('salidas nuevas y la existente', () => {
    expect(source).toContain('readonly proximity = output<MapObjectState | null>();');
    expect(source).toContain('readonly proximityAlso = output<MapObjectState | null>();');
    expect(source).toContain('readonly nothingNearby = output<void>();');
    expect(source).toMatch(/onProximityAlso: i => this\.zone\.run\(\(\) => this\.proximityAlso\.emit\(i\)\),/);
    expect(source).toMatch(/onNothingNearby: \(\) => this\.zone\.run\(\(\) => this\.nothingNearby\.emit\(\)\),/);
  });

  it('un cambio de destino, puertas o atenuados llega a la escena por una sola vía', () => {
    expect(source).toMatch(/if \(changes\['nextTargetKey'\] \|\| changes\['doorStates'\] \|\| changes\['dimmedKeys'\]\) this\.pushOrientation\(\);/);
    expect(source).toMatch(/this\.scene\?\.setOrientation\(\{\s*nextTargetKey: this\.nextTargetKey\(\),\s*doorStates: this\.doorStates\(\),\s*dimmedKeys: this\.dimmedKeys\(\),\s*\}\);/);
  });

  it('interactNearest despacha por clave: personas por npc:, marcadores como siempre, y avisa si no hay nada', () => {
    const body = bodyOf(/\n  interactNearest\(\) \{\n    const key/, /\n  \/\*\*/);
    expect(body).toMatch(/key\.startsWith\(NPC_KEY_PREFIX\)/);
    expect(body).toContain('this.callbacks.onNpcInteract(npc)');
    expect(body).toContain('this.callbacks.onInteract(obj)');
    expect(body).toContain('this.callbacks.onNothingNearby()');
    expect(body).not.toMatch(/playSfx|sound\.play|ui_cancel/);
  });
});

describe('game-world: nada nuevo por cuadro (F§7.2, 59 FPS)', () => {
  const frameBody = bodyOf(/\n  private updateNearestInteraction\(suppressSound = false\) \{/, /\n  \/\*\*\n   \* Lo que se le entrega a Angular/);

  it('la proximidad reutiliza listas y piezas: ni copias, ni mapas, ni objetos nuevos por cuadro', () => {
    expect(frameBody).not.toMatch(/\.map\(|\.filter\(|\.sort\(|\.slice\(|\.concat\(|\[\.\.\.|\{ \.\.\./);
    expect(frameBody).not.toMatch(/new (Map|Set|Array)\b/);
    expect(frameBody).toContain('list.length = 0;');
    expect(frameBody).toContain('pickNearby(list, this.nearestKey, this.pick)');
    expect(frameBody).toContain('this.revealScratch');
  });

  it('los avisos y el repintado solo ocurren cuando algo cambió', () => {
    expect(frameBody).toMatch(/if \(primaryChanged \|\| alsoChanged \|\| revealChanged\) this\.refreshMarkerStates\(\);/);
    expect(frameBody).toMatch(/if \(primaryChanged\) \{[\s\S]*?this\.callbacks\.onProximity\(/);
    expect(frameBody).toMatch(/if \(alsoChanged\) \{[\s\S]*?this\.callbacks\.onProximityAlso\(/);
  });

  it('el anillo, los rótulos y los atenuados no usan tweens ni se actualizan desde update()', () => {
    for (const body of [
      bodyOf(/\n  private syncTargetRing\(\): void \{/, /\n  \/\*\* Reinicia/),
      bodyOf(/\n  private refreshMarkerStates\(\) \{/, /\n  \/\*\* El canvas cambió/),
      bodyOf(/\n  setOrientation\(next: \{/, /\n  \/\*\* Puntero táctil/),
    ]) {
      expect(body).not.toMatch(/tweens\.add|this\.tweens/);
    }
    const update = bodyOf(/\n  override update\(time: number, delta: number\) \{/, /\n  setWorld\(/);
    expect(update).not.toMatch(/refreshMarkerStates|syncTargetRing|applyDoorStates|setOrientation|labelScale/);
    expect(update).toContain('this.updateNearestInteraction();');
    expect(update).not.toContain('updateNpcHints');
  });

  // req: BLOQUE-H (H-12)
  it('con el foco en una región con scroll las flechas la desplazan y el jugador no camina', () => {
    expect(source).toMatch(/const typing = isTextEntryTarget\(focus\) \|\| isScrollRegionTarget\(focus\);/);
    // `bloqueado` = escribiendo o con el foco en una región con scroll, o con una capa abierta (bloque M1).
    expect(source).toContain('const bloqueado = typing || this.motionPaused;');
    expect(source).toMatch(/left:  !bloqueado && \(this\.cursors\.left\.isDown/);
  });

  it('la pulsación corta de E, Espacio y Enter no se pierde (T0.2) y respeta las mismas reglas de foco', () => {
    expect(source).toMatch(/this\.keys\['E'\]\?\.on\('down', \(\) => \{ this\.tappedKeys\.e = true; \}\);/);
    expect(source).toMatch(/this\.keys\['SPACE'\]\?\.on\('down', \(\) => \{ this\.tappedKeys\.space = true; \}\);/);
    expect(source).toMatch(/this\.keys\['ENTER'\]\?\.on\('down', \(\) => \{ this\.tappedKeys\.enter = true; \}\);/);
    expect(source).toMatch(/const tapped = resolveInteractPress\(focus, this\.tappedKeys\);/);
    expect(source).toMatch(/this\.interactPending = !typing && \(this\.interactPending \|\| pressed \|\| tapped\);/);
  });
});

describe('game-world: ratón (F6-7, VD-5)', () => {
  // req: BLOQUE-H, RNF-04
  it('el hover va por eventos del puntero, no por cuadro: update() no sabe nada de él', () => {
    expect(source).toMatch(/this\.input\.on\('pointermove', this\.handlePointerMove, this\);/);
    const update = bodyOf(/\n  override update\(time: number, delta: number\) \{/, /\n  setWorld\(/);
    expect(update).not.toMatch(/hover|Hover|pickHoverTarget|handlePointerMove/);
  });

  it('con dedo o con una capa abierta no se resalta nada y el contorno solo sale de lo elegible', () => {
    const target = bodyOf(/\n  private hoverTargetAt\(pointer: Phaser\.Input\.Pointer\): string \| null \{/, /\n  private handlePointerMove\(/);
    expect(target).toContain('pointer.wasTouch || this.motionPaused');
    expect(target).toContain('pickHoverTarget(');
    expect(target).toContain('this.examinedKeys');
    const move = bodyOf(/\n  private handlePointerMove\(pointer: Phaser\.Input\.Pointer\): void \{/, /\n  private setHover\(/);
    expect(move).toContain('this.setHover(this.hoverTargetAt(pointer));');
  });

  // req: BLOQUE-H, RNF-04 (revisión de F6)
  it('el clic vuelve a decidir qué hay bajo el puntero: con el cursor quieto el objetivo marcado puede estar viejo', () => {
    const handler = bodyOf(/\n  private handlePointerDown\(pointer: Phaser\.Input\.Pointer\): void \{/, /\n  \}\n/);
    expect(handler).toContain('const key = this.hoverTargetAt(pointer);');
    expect(handler).toContain('this.setHover(key);');
    expect(handler).not.toContain('this.hoverKey');
  });

  // req: BLOQUE-H, RNF-04 (VD-5)
  it('el clic con puntero fino camina; con dedo, capa abierta o botón secundario no', () => {
    const handler = bodyOf(/\n  private handlePointerDown\(pointer: Phaser\.Input\.Pointer\): void \{/, /\n  \}\n/);
    expect(handler).toContain('pointer.wasTouch || this.motionPaused');
    expect(handler).toMatch(/pointer\.button !== 0/);
    // Sobre algo señalado camina hasta su alcance de interacción; en el suelo, hasta el punto clicado.
    expect(handler).toContain('startWalk({ x: aimed.x, y: aimed.y, radius: aimed.reach })');
    expect(handler).toContain('WALK_GROUND_RADIUS_PX');
  });

  it('en update() el teclado o la cruceta cancelan la caminata antes de aplicarla y el paso es el de siempre', () => {
    const update = bodyOf(/\n  override update\(time: number, delta: number\) \{/, /\n  setWorld\(/);
    expect(update).toContain('cancelWalkOnKeys(');
    expect(update.indexOf('cancelWalkOnKeys(')).toBeLessThan(update.indexOf('tickWalk('));
    expect(update).toContain('computePlayerStep(input, this.lastDirection, delta)');
    expect(update).toContain('this.movePlayer(part.dx, part.dy)');
  });

  it('el jugador mira en ocho direcciones: la mirada sale de la entrada en cada cuadro (con margen) y todas las poses la usan', () => {
    const update = bodyOf(/\n  override update\(time: number, delta: number\) \{/, /\n  setWorld\(/);
    expect(update).toContain('this.mirada = actualizarMirada(this.mirada, Number(input.right) - Number(input.left), Number(input.down) - Number(input.up), delta');
    expect(update.indexOf('actualizarMirada(')).toBeLessThan(update.indexOf('this.applyPlayerPose('));
    expect(update.match(/this\.applyPlayerPose\(this\.mirada\.actual, (true|false)\)/g) ?? []).toHaveLength(3);
    expect(source).not.toMatch(/applyPlayerPose\((step\.direction|this\.lastDirection|direction), /);
    // Las personas y los NPC tampoco deciden su mirada en 4 direcciones.
    expect(source).not.toMatch(/\bresolveDirection\(|\bdirectionTowards\(|\bturnStepBetween\(/);
  });

  it('un paso de la cruceta suelta la caminata y una sala nueva no la arrastra', () => {
    const nudge = bodyOf(/\n  nudge\(direction: 'up' \| 'down' \| 'left' \| 'right'\) \{\n    if \(!this\.player\) return;/, /\n  \/\*\* Punto de pies/);
    expect(nudge).toContain('this.walk = NO_WALK;');
    expect(source).toContain('if (!keepPosition) { this.walk = NO_WALK; this.walkGoal = null; }');
  });

  it('el hover no lee clasificación ni datos clínicos de lo que señala', () => {
    const hover = bodyOf(/\n  \/\*\* Lo ya examinado llega de Angular/, /\n  focus\(key: string\) \{/);
    expect(hover).not.toMatch(/classification|prohibitedConduct|isRecommended|isProhibited|decisionOptionId|effect\b/);
  });

  it('el mundo no pide nada al servidor al pasar el puntero (solo callbacks de la propia escena)', () => {
    const hover = bodyOf(/\n  \/\*\* Lo ya examinado llega de Angular/, /\n  focus\(key: string\) \{/);
    expect(hover).not.toMatch(/http|fetch|simulation\.|onInteract|onNpcInteract/);
  });
});

describe('game-world: atajos de una tecla (F6-10, WCAG 2.1.4)', () => {
  // req: BLOQUE-H (H-07)
  it('WASD y E solo con el ajuste activo y con el foco en el juego; flechas, Enter y Espacio no dependen de él', () => {
    expect(source).toContain('const letters = this.shortcutsEnabled && isShortcutContext(focus);');
    expect(source).toMatch(/left:  !bloqueado && \(this\.cursors\.left\.isDown  \|\| \(letters && this\.keys\['A'\]\.isDown\)\),/);
    expect(source).toMatch(/up:    !bloqueado && \(this\.cursors\.up\.isDown    \|\| \(letters && this\.keys\['W'\]\.isDown\)\),/);
    expect(source).toContain('e: justE && letters,');
    expect(source).toContain('if (!letters) this.tappedKeys.e = false;');
    // Enter y Espacio siguen sin pasar por «letters».
    expect(source).toMatch(/space: Phaser\.Input\.Keyboard\.JustDown\(this\.keys\['SPACE'\]\),\s*enter: Phaser\.Input\.Keyboard\.JustDown\(this\.keys\['ENTER'\]\),/);
  });

  it('el ajuste llega a la escena al arrancar y al cambiar', () => {
    expect(source).toContain("if (changes['shortcuts']) this.scene?.setShortcutsEnabled(this.shortcuts());");
    expect(source).toContain('this.scene?.setShortcutsEnabled(this.shortcuts());');
  });
});

describe('game-world: «Ir a…» (F6-11)', () => {
  // req: BLOQUE-H H-06, DM-5.8
  it('los candidatos son solo clave, nombre y tipo: nada clínico ni la clasificación de una opción', () => {
    const block = bodyOf(/\n  placeCandidates\(\): PlaceCandidate\[\] \{/, /\n  private finishWalkGoal\(/);
    expect(block).not.toMatch(/classification|prohibitedConduct|isRecommended|isProhibited|decisionOptionId|effect\b/);
    expect(block).toContain("kind: 'person'");
    expect(block).toContain("obj.type === 'EXIT' ? 'door'");
  });

  it('la caminata a un lugar elegido pasa por la misma caminata del clic y avisa al terminar', () => {
    const walk = bodyOf(/\n  walkToKey\(key: string\): boolean \{/, /\n  private finishWalkGoal\(/);
    expect(walk).toContain('startWalk({ x: anchor.x, y: anchor.y, radius: anchor.reach })');
    expect(walk).toContain('this.walkGoal = { key, label: anchor.label };');
    // Pedida con la lista aún cerrándose (la escena figura pausada): espera a reanudarse en vez de soltarse.
    expect(walk).toContain('this.walkWaitsForResume = this.motionPaused;');
    const update = bodyOf(/\n  override update\(time: number, delta: number\) \{/, /\n  setWorld\(/);
    expect(update).toContain("this.finishWalkGoal(tick.arrived ? 'arrived' : 'blocked')");
  });
});

describe('game-world: señales iguales para todos (límite 1 de producto)', () => {
  it('el anillo y los rótulos nacen de la clave del destino y de la distancia, nunca de lo clínico', () => {
    const forbidden = /classification|prohibitedConduct|isRecommended|isProhibited|decisionOptionId/;
    for (const body of [
      bodyOf(/\n  private updateNearestInteraction\(suppressSound = false\) \{/, /\n  \/\*\*\n   \* Lo que se le entrega a Angular/),
      bodyOf(/\n  private syncTargetRing\(\): void \{/, /\n  \/\*\* Reinicia/),
      bodyOf(/\n  private refreshMarkerStates\(\) \{/, /\n  \/\*\* El canvas cambió/),
    ]) {
      expect(body).not.toMatch(forbidden);
    }
  });

  it('el anillo es único (un trazo claro y su halo), con colores fijos', () => {
    expect(source).toContain('const RING_COLOR = 0xcdbcff;');
    expect(source).toContain('const RING_HALO_COLOR = 0x0b0f1a;');
    // El atenuado de las otras etapas vive en markerEmphasis (world-characters.util): el componente no repite el valor.
    expect(readFileSync(join(__dirname, 'world-characters.util.ts'), 'utf-8')).toContain('export const DIMMED_ALPHA = 0.55;');
    expect(source).not.toContain('const DIMMED_ALPHA');
  });

  it('en táctil o con los atajos apagados la pista de una persona y el rótulo de una puerta no mencionan la tecla E', () => {
    expect(source).toMatch(/private npcHintGlyph\(\): string \{\s*return this\.touchPointer\(\) \|\| !this\.shortcutsEnabled \? '▲' : '▲ E';\s*\}/);
    expect(source).toMatch(/private doorHintText\(label: string\): string \{\s*return this\.touchPointer\(\) \|\| !this\.shortcutsEnabled \? `\$\{label\} →` : `E  \$\{label\} →`;\s*\}/);
    expect(source).not.toContain("'▲ E', {");
  });

  // req: BLOQUE-H (H-07), RNF-04 (revisión de F6)
  it('el nombre accesible del mundo solo promete las teclas que el ajuste deja activas', () => {
    expect(source).toContain('[attr.aria-label]="worldLabel()"');
    expect(source).not.toMatch(/\n\s+aria-label="Mapa explorable/);
    expect(source).toMatch(/protected readonly worldLabel = computed\(\(\) => \(this\.shortcuts\(\)\s*\? 'Mapa explorable de la simulación\. Usa WASD o flechas para moverte, E para interactuar\.'\s*: 'Mapa explorable de la simulación\. Usa las flechas para moverte, Enter para interactuar\.'/);
  });
});
