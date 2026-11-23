// Phaser inicializa un canvas WebGL al importarse, cosa que jsdom no soporta: solo hace falta que el módulo cargue.
vi.mock('phaser', () => ({ __esModule: true, default: { Scene: class {}, BlendModes: { MULTIPLY: 2, ADD: 1 } } }));

import { readFileSync } from 'fs';
import { join } from 'path';

import type { PlanDeSala } from './sala/composicion';
import { EscenaDeSala } from './sala/escena-de-sala';

/**
 * Bloque P2, hallazgos de la revisión de Codex sobre la integración (`.superpowers/codex/2026-11-15-revision-integracion-escena.md`):
 * 1. una sala por piezas manda sobre un ScenarioConfig del legado; 2. una pieza que no carga no se pide sin fin ni deja la
 * sala a medias; 3. con una capa encima, las puertas de pieza no se mueven; 6. la sala por piezas se suelta al cambiar de
 * camino y al apagar la escena.
 */
const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');
const plan = { fondo: [{ ruta: 'piezas/piso.png' }], sprites: [{ ruta: 'piezas/puerta.png', brillo: 'piezas/puerta-brillo.png' }] } as unknown as PlanDeSala;

describe('sala por piezas en la escena (P2)', () => {
  it('2. las texturas: listo, pedir o fallo; lo que ya falló no se vuelve a pedir', () => {
    const cargadas = new Set(['sala:piezas/piso.png']);
    const existe = (clave: string) => cargadas.has(clave);
    expect(EscenaDeSala.estadoDeTexturas(plan, existe, new Set())).toBe('pedir');
    expect(EscenaDeSala.estadoDeTexturas(plan, existe, new Set(['sala:piezas/puerta-brillo.png']))).toBe('fallo');
    cargadas.add('sala:piezas/puerta.png').add('sala:piezas/puerta-brillo.png');
    expect(EscenaDeSala.estadoDeTexturas(plan, existe, new Set(['sala:otra.png']))).toBe('listo');
  });

  it('2. la escena anota cada pieza que falla, no la vuelve a pedir y avisa una sola vez por sala', () => {
    expect(source).toContain("const estado = EscenaDeSala.estadoDeTexturas(plan, clave => this.textures.exists(clave), this.piezasFallidas);");
    expect(source).toMatch(/if \(estado === 'fallo'\) \{[\s\S]*?this\.callbacks\.onSalaIncompleta\?\.\(\);[\s\S]*?return false;/);
    expect(source).toMatch(/this\.load\.on\(Phaser\.Loader\.Events\.FILE_LOAD_ERROR, alFallar\);\s*if \(estado === 'pedir'\) EscenaDeSala\.pedirTexturas\(this, plan, this\.piezasFallidas\);/);
    expect(source).toContain('const faltanMuebles = EscenaDeSala.pedirMuebles(this, muebles, this.piezasFallidas);');
    expect(source).toContain('this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, alFallar);');
    expect(source).toContain('if (this.salaIncompletaAvisada !== this.world.map.key) {');
  });

  it('V6: con la sala lista, la luz de las sombras se calcula fuera del primer cuadro de juego, y solo si la sala sigue', () => {
    expect(source).toMatch(/this\.callbacks\.onReady\(\);\s*(\/\/[^\n]*\n\s*)*const recienArmada = this\.salaPorPiezas;\s*setTimeout\(\(\) => \{ if \(this\.salaPorPiezas === recienArmada\) recienArmada\?\.calentarSombras\(\); \}, 0\);\s*return true;/);
    const capasEnSombra = vi.fn();
    EscenaDeSala.prototype.calentarSombras.call({ luz: { capasEnSombra } } as unknown as EscenaDeSala);
    expect(capasEnSombra).toHaveBeenCalledTimes(1);
  });

  it('1. con `structure`, el ScenarioConfig del legado no se lleva la sala', () => {
    expect(source).toContain('if (this.scenarioConfig && !this.esSalaPorPiezas()) {');
  });

  it('3. con una capa encima, las puertas de pieza y las sombras no avanzan', () => {
    expect(source).toMatch(/if \(this\.salaPorPiezas && !this\.motionPaused\) \{\s*const activa = this\.salaPorPiezas\.actualizar\(/);
  });

  it('el aviso de la puerta de pieza es un botón de Angular sobre el lienzo, no la pista de Phaser', () => {
    expect(source).toMatch(/@if \(avisoDePuerta\(\); as aviso\) \{\s*<app-aviso-de-puerta /);
    expect(source).toContain('(cruzar)="cruzarPorAviso(aviso.id)"');
    // Cerrada, dice el mismo motivo que la barra (`doorMessages` de la pantalla), no el «todavía no» genérico.
    expect(source).toContain('[falta]="doorMessages()[aviso.id] ?? null"');
    expect(source).toContain("if (isExit && object.metadata?.['dePieza'] !== true) {");
    expect(source).toContain('pintada: true, dePieza: true');
    // Con el mundo en pausa no hay aviso; solo se avisa a Angular cuando cambia.
    expect(source).toMatch(/this\.avisoDePuerta\(activa\);\s*this\.salaPorPiezas\.cerca\(this\.nearestKey\);\s*\} else \{\s*this\.avisoDePuerta\(null\);/);
    expect(source).toContain('if (firma === this.firmaDelAviso) return;');
  });

  it('los muebles y objetos de la biblioteca de piezas los dibuja la escena; su marcador queda sin sprite, solo rótulo y área', () => {
    expect(source).toContain("const painted = isPaintedDoor(object) || object.metadata?.['dePieza'] === true;");
    expect(source).toContain('const art = this.assetsLoaded && !isExit && !painted ? this.buildArtSprite(object) : null;');
    expect(source).toContain("const pieza = piezaDelObjeto(obj.metadata?.['arte'], manifiesto);");
    expect(source).toContain('if (obj) { this.salaPorPiezas?.revisar(obj.key); this.callbacks.onInteract(obj); return; }');
  });

  it('6. la sala por piezas se suelta en el camino de ScenarioConfig y al apagar la escena', () => {
    const renderRoom = source.slice(source.indexOf('  private renderRoom('), source.indexOf('this.children.removeAll(true);', source.indexOf('  private renderRoom(')));
    expect(renderRoom).toContain('this.soltarSalaPorPiezas();');
    expect(source).toContain("this.events.once('shutdown', () => this.soltarSalaPorPiezas());");
    expect(source).toMatch(/private soltarSalaPorPiezas\(\): void \{\s*this\.salaPorPiezas\?\.destruir\(\);\s*this\.salaPorPiezas = null;/);
  });
});
