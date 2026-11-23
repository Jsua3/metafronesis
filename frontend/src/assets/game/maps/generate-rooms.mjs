// generate-rooms.mjs — creates 3 Tiled JSON room maps for comisaria-familia
// Run: node generate-rooms.mjs  (from the maps directory)
import { writeFileSync } from 'fs';

const TILESETS = [{
  columns: 12,
  firstgid: 1,
  image: "../kenney/tiny-dungeon/Tilemap/tilemap_packed.png",
  imageheight: 176,
  imagewidth: 192,
  margin: 0,
  name: "tiny-dungeon",
  spacing: 0,
  tilecount: 132,
  tileheight: 16,
  tilewidth: 16
}];

const WALL = 1;  // tiny-dungeon local 0 — dark stone wall
const FLOOR = 9; // tiny-dungeon local 8 — light stone floor

/**
 * Make a rectangular room map with walls on the border and floor inside.
 * Internal walls (dividers) defined as [row, col] pairs that get WALL instead of FLOOR.
 */
function makeRoomData(cols, rows, internalWalls = []) {
  const wallSet = new Set(internalWalls.map(([r, c]) => `${r},${c}`));
  const floor = [], walls = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      const isInternalWall = wallSet.has(`${r},${c}`);
      walls.push(isBorder || isInternalWall ? WALL : 0);
      floor.push(!isBorder && !isInternalWall ? FLOOR : 0);
    }
  }
  return { floor, walls };
}

function makeLayer(name, id, data, cols, rows) {
  return { data, height: rows, id, name, opacity: 1, type: "tilelayer", visible: true, width: cols, x: 0, y: 0 };
}

function makeObjectLayer(id, objects) {
  return { draworder: "topdown", id, name: "Objects", objects, opacity: 1, type: "objectgroup", visible: true, x: 0, y: 0 };
}

function makeObject(id, name, type, x, y, w = 16, h = 16) {
  return { height: h, id, name, rotation: 0, type, visible: true, width: w, x, y };
}

// ── ROOM 1: Sala de Espera (60×33 tiles = 960×528px) ─────────────────────────
{
  const COLS = 60, ROWS = 33;
  // Reception desk: a horizontal wall segment at row 8, cols 10-20
  const internal = [];
  for (let c = 10; c <= 20; c++) internal.push([8, c]);

  const { floor, walls } = makeRoomData(COLS, ROWS, internal);

  const objects = [
    // Exit door to consultorio — placed at right wall, mid-height
    makeObject(1, "exit-to-consultorio", "EXIT", 920, 240, 32, 48),
    // NPC positions match scenario JSON (x,y are world pixels = tile * 16)
    makeObject(2, "familiar-comisaria", "NPC", 288, 176, 16, 16),
    makeObject(3, "colega-comisaria", "NPC", 416, 240, 16, 16),
  ];

  const map = {
    compressionlevel: -1,
    height: ROWS,
    infinite: false,
    layers: [
      makeLayer("Floor", 1, floor, COLS, ROWS),
      makeLayer("Walls", 2, walls, COLS, ROWS),
      makeObjectLayer(3, objects)
    ],
    nextlayerid: 4,
    nextobjectid: 10,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.12.2",
    tileheight: 16,
    tilesets: TILESETS,
    tilewidth: 16,
    type: "map",
    version: "1.10",
    width: COLS
  };

  writeFileSync('comisaria-sala-espera.json', JSON.stringify(map));
  console.log(`comisaria-sala-espera.json written (${COLS}x${ROWS} tiles)`);
}

// ── ROOM 2: Consultorio (40×25 tiles = 640×400px) ────────────────────────────
{
  const COLS = 40, ROWS = 25;
  // Dividing wall between two sides (row 12, cols 1-18), with a gap at col 10 (door)
  const internal = [];
  for (let c = 1; c <= 18; c++) if (c !== 10) internal.push([12, c]);

  const { floor, walls } = makeRoomData(COLS, ROWS, internal);

  const objects = [
    makeObject(1, "exit-to-sala-espera", "EXIT", 16, 192, 32, 48),
    makeObject(2, "exit-to-supervisor", "EXIT", 560, 192, 32, 48),
    makeObject(3, "paciente-comisaria", "NPC", 272, 192, 16, 16),
  ];

  const map = {
    compressionlevel: -1,
    height: ROWS,
    infinite: false,
    layers: [
      makeLayer("Floor", 1, floor, COLS, ROWS),
      makeLayer("Walls", 2, walls, COLS, ROWS),
      makeObjectLayer(3, objects)
    ],
    nextlayerid: 4,
    nextobjectid: 10,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.12.2",
    tileheight: 16,
    tilesets: TILESETS,
    tilewidth: 16,
    type: "map",
    version: "1.10",
    width: COLS
  };

  writeFileSync('comisaria-consultorio.json', JSON.stringify(map));
  console.log(`comisaria-consultorio.json written (${COLS}x${ROWS} tiles)`);
}

// ── ROOM 3: Oficina del Supervisor (30×20 tiles = 480×320px) ─────────────────
{
  const COLS = 30, ROWS = 20;
  const { floor, walls } = makeRoomData(COLS, ROWS);

  const objects = [
    makeObject(1, "exit-to-consultorio", "EXIT", 208, 16, 32, 32),
    makeObject(2, "supervisor-comisaria", "NPC", 240, 160, 16, 16),
  ];

  const map = {
    compressionlevel: -1,
    height: ROWS,
    infinite: false,
    layers: [
      makeLayer("Floor", 1, floor, COLS, ROWS),
      makeLayer("Walls", 2, walls, COLS, ROWS),
      makeObjectLayer(3, objects)
    ],
    nextlayerid: 4,
    nextobjectid: 10,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.12.2",
    tileheight: 16,
    tilesets: TILESETS,
    tilewidth: 16,
    type: "map",
    version: "1.10",
    width: COLS
  };

  writeFileSync('comisaria-supervisor.json', JSON.stringify(map));
  console.log(`comisaria-supervisor.json written (${COLS}x${ROWS} tiles)`);
}

console.log('All room maps generated.');
