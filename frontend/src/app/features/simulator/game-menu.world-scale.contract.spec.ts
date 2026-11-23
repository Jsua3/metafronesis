import { readFileSync } from 'fs';
import { join } from 'path';

// Fin de línea normalizado: el checkout de Windows trae CRLF.
const source = readFileSync(join(__dirname, 'game-menu.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

describe('game-menu: las puertas del lobby salen de lobbyDoorLayout (spec §13.1, decisión 12)', () => {
  it('el marco, la hoja, la manija, el candado, la insignia y el título usan la geometría pura', () => {
    expect(source).toContain('const door = lobbyDoorLayout();');
    expect(source).toContain('this.add.rectangle(x, this.doorY, door.frame.width, door.frame.height, 0x12202f)');
    expect(source).toContain('this.doorY - door.leaf.bottomInset, door.leaf.width, door.leaf.height, fill');
    expect(source).toContain('this.doorY + door.handle.dy, door.handle.width, door.handle.height');
    expect(source).toContain('this.doorY + door.lockDy');
    expect(source).toContain('this.doorY + door.titleDy');
    expect(source).toContain('this.doorY + door.badgeDy');
  });

  it('no quedan las medidas del portal de antes (108×152 y 88×134) ni sus posiciones', () => {
    expect(source).not.toContain('108, 152');
    expect(source).not.toContain('88, 134');
    expect(source).not.toContain('this.doorY - 176');
    expect(source).not.toContain('this.doorY - 150');
  });

  it('la base de las puertas es la constante que comparte la prueba de la geometría', () => {
    expect(source).toContain('private readonly doorY = LOBBY_DOOR_Y;');
  });
});
