import { readFileSync } from 'fs';
import { join } from 'path';

// Fin de línea normalizado: el checkout de Windows trae CRLF y `body()` busca el cierre con \n.
const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** Cuerpo de un método de la escena (hasta su llave de cierre a 2 espacios). */
function body(signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`no encuentro ${signature}`);
  return source.slice(start, source.indexOf('\n  }\n', start));
}

describe('game-world: el jugador sale del kit (spec §8.2)', () => {
  it('se resuelve con el punto único y su hoja se pide en preload', () => {
    expect(source).toContain('this.playerVisual = resolveCharacter(kit, playerCharacterRef(stored));');
    expect(source).toContain('queueCharacterSheets(this, this.playerVisual);');
    expect(source).not.toMatch(/resolvePlayerVisual|v1SheetKey|playerCastId|AVATAR_TEXTURE_KEY|avatarSpecs/);
  });

  it('el sprite va a escala 1, con los pies en (24,68) y sin espejo', () => {
    const create = body('private createPlayer(x: number, y: number) {');
    expect(create).toContain('.setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)');
    expect(create).not.toMatch(/setScale|setFlipX|registerLivingActor/);
  });

  it('la pose del jugador la pone el kit (4 filas reales)', () => {
    expect(body('private applyPlayerPose(')).toContain('playKitPose(this.playerSprite, this.playerVisual, direction, walking, this.callbacks.reduceMotion)');
    expect(source).not.toMatch(/playWalkAnimation|setIdleFrame|createAnimations\(/);
  });

  it('el paquete del kit llega antes que Phaser, y sin él el juego arranca igual', () => {
    // F6-8: también se espera a Poppins (con plazo), sin que su fallo detenga el arranque.
    // El manifiesto del arte de la biblioteca viaja con él; si no llega, el juego arranca sin animaciones de cercanía.
    expect(source).toMatch(/this\.kit\.load\(\)\.then\(bundle => bundle, \(\) => null\),\s*this\.bibliotecaManifest\.load\(\),\s*whenWorldFontsReady\(\),\s*\]\)\.then\(\(\[bundle, manifest\]\) => \{[\s\S]*?this\.startGame\(bundle, manifest\)/);
    expect(source).toMatch(/new DataDrivenWorldScene\(\{\s*reduceMotion,\s*kit,/);
  });
});

describe('game-world: NPC, personas, guía y figurantes del kit; nada los deforma ni tiñe', () => {
  it('nada tiñe ni deforma a un actor', () => {
    expect(source).not.toMatch(/setTint\(|clearTint\(|character-motion|LivingActor|livingActors|registerLivingActor/);
  });

  it('sin personajes de Kenney ni del sistema viejo', () => {
    expect(source).not.toMatch(/KenneyCharFrames|'characters'|npc-avatar-presets|baked-cast|phaser-avatar-renderer|v1-avatar|avatar-config\.util|authoring-catalog|avatarPresetKey|frameIndex/);
  });

  it('el único espejo que queda es el de las puertas laterales', () => {
    expect(source.match(/setFlipX\(/g) ?? []).toHaveLength(1);
    expect(body('private buildDoorSprite(')).toContain('.setFlipX(');
  });

  it('NPC, personas y figurantes se resuelven con el punto único', () => {
    expect(source).toContain('this.actorVisual(npcCharacterRef(npc))');
    expect(source).toContain('personCharacterRef(this.callbacks.kit, object)');
    expect(source).toContain('extrasCharacterRef(kit)');
  });

  it('el estado de la persona es un icono sobre la cabeza', () => {
    const update = body('updatePatientVisualState(persona:');
    expect(update).toContain('personaIconKind(persona)');
    expect(update).toContain('icon.setTexture(personaIconKey(kind))');
  });

  it('el icono sobrevive a un re-render: la escena recuerda el estado y cada icono nace con él', () => {
    expect(body('updatePatientVisualState(persona:')).toContain('this.persona = persona;');
    const create = body('private patientIcon(feetY: number)');
    expect(create).toContain('personaIconView(this.persona)');
    expect(create).toContain('.setVisible(view.visible)');
    expect(create).not.toContain('.setVisible(false)');
  });

  it('una persona del caso no se escala ni se atenúa: el énfasis lo decide markerEmphasis y el pulso va al anillo', () => {
    const refresh = body('private refreshMarkerStates() {');
    expect(refresh).toContain("markerEmphasis({");
    expect(refresh).toContain("kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true");
    expect(refresh).toContain('dimmed: this.dimmedKeys.has(key)');
    expect(refresh).not.toMatch(/m\.setScale\(sel \?|m\.setAlpha\(sel \|\|/);
    const focus = body('focus(key: string) {');
    expect(focus).toContain("bag['__kitSprite'] === true || bag['__pixelSprite'] === true ? bag['__pulse'] : m");
    expect(source).toContain("bag['__kitSprite'] = personVisual !== null;");
  });
});
