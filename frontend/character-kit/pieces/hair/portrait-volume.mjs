/**
 * Volumen del pelo en el retrato 32×32, con el criterio del moño: la silueta es
 * la de cada pieza (la del personaje que camina por la sala) y aquí solo se fijan
 * los tonos. Luz arriba a la izquierda: una banda de brillo de ese lado, base en
 * el centro, sombra del lado contrario y pocos mechones, que siguen la caída del
 * pelo. El borde de la silueta queda en sombra, no en profundo, para que un pelo
 * oscuro no se funda con el fondo del cuadro de diálogo.
 *
 * Cada fila lista un texto por TRAMO de pelo, de izquierda a derecha (un tramo
 * es una seguidilla de celdas de pelo de esa fila). Así los tonos siguen a la
 * silueta sin contar columnas, y si la silueta cambia y un texto no calza, el
 * paquete no arma.
 *
 * Símbolos: h brillo · b base · s sombra · r profundo · . lo decide la luz.
 * Un texto vacío deja el tramo entero a la luz.
 */

import { gridFrom, stamp } from '../../raster.mjs';

const SIZE = 32;
const TONES = { h: { tone: 0 }, b: { tone: 1 }, s: { tone: 2 }, r: { tone: 3 } };

/** Las mismas filas para un rango (cortinas de pelo que caen rectas). */
const rows = (from, to, texts) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, texts]));

const VOLUME = {
  // Melena larga con raya al lado: el brillo baja en diagonal desde la raya y dos mechones se abren hacia las cortinas.
  'largo-suelto': {
    2: ['hhbbss'],
    3: ['hshhbbbsss'],
    4: ['hhshhbbbbsss'],
    5: ['hhbsbhhbbbbsss'],
    6: ['hhbbsbbhhbsbbsss'],
    7: ['hhbbsbbbbbbbsbbsss'],
    8: ['hbbsbbbbbbbbbsbsss'],
    9: ['bs', 'ss'],
    // Cortinas: un solo mechón de luz que se curva hacia dentro a media altura; el lado en sombra, liso.
    ...rows(10, 13, ['hbs', 'bss']),
    ...rows(14, 17, ['bhs', 'bss']),
    ...rows(18, 20, ['bbs', 'bss']),
    21: ['bbbs', 'bbss'],
    22: ['bbbbs', 'bbbss'],
    23: ['bbbbbs', 'bbbbss'],
    24: ['bbbbsss', 'sssbbss'],
    ...rows(25, 28, ['bbbs', 'bbss']),
    29: ['bsss', 'ssss'],
  },
  // Media melena con raya al medio: brillo a cada lado de la raya y un mechón por lado.
  'media-melena': {
    2: ['hhsbss'],
    3: ['hhbbshbbss'],
    4: ['hhhbbshhbbss'],
    5: ['hhhbbbsbhhbbss'],
    6: ['hhbbbbbsbbhbbsss'],
    7: ['hhbbbbsbbbbsbbbsss'],
    8: ['hbbbbsbbbbbbsbbsss'],
    9: ['bs', 'ss'],
    // Cortinas: un solo mechón de luz que se curva hacia dentro a media altura; el lado en sombra, liso.
    ...rows(10, 13, ['hbs', 'bss']),
    ...rows(14, 17, ['bhs', 'bss']),
    ...rows(18, 20, ['bbs', 'bss']),
    21: ['bbbs', 'bbss'],
    22: ['bbbbs', 'bbbss'],
    23: ['bbbbbs', 'bbbbss'],
    24: ['bbsssss', 'sssssss'],
  },
  // Corto liso peinado de lado: el brillo y un mechón siguen el barrido hacia la derecha.
  'corto-liso': {
    3: ['bhbbss'],
    4: ['sbhhbbss'],
    5: ['bbsbhhbbbss'],
    6: ['hbbbbbhhbbbbss'],
    7: ['bbbbbsbbhbbbss'],
    8: ['hsssssbsbbbbbsss'],
    9: ['s', 'ssssbbbsss'],
    10: ['s', 'ssssss'],
  },
  // Afro: una masa redonda con el brillo arriba a la izquierda y pocos rizos, en trazos cortos de sombra.
  afro: {
    2: ['hb', 'ss'],
    3: ['hh', 'hhbbbbss'],
    4: ['hhhhbbbbbbbsss'],
    5: ['h', 'hhhbssbbbbbbbssss'],
    6: ['h', 'hhbbbbbbbbssbbbbssss'],
    7: ['hhbbssbbbbbbbbbsssss'],
    8: ['hbbbssssssssssssssbssss'],
    9: ['hbbbs', 'bsss'],
    10: ['hbssbs', 'bbssss'],
    11: ['hbbbbs', 'bbsss'],
    12: ['hbbbs', 'bbssss'],
    13: ['bbbbs', 'bssss'],
    14: ['bbbs', 'bssss'],
    15: ['bbss', 'ssss'],
    16: ['bss', 'sss'],
  },
  // Corto rizado: como el afro, más pegado a la cabeza.
  'corto-rizado': {
    3: ['h', 'hh', 'bs', 'ss'],
    4: ['h', 'hshbbsss', 's'],
    5: ['hhsbhsbbsbbsss', 's'],
    6: ['hbbshbbsbbbsbssss'],
    7: ['hbsbbbsbbbsbbsssss'],
    8: ['hbbssssssssssssssss'],
    9: ['bs', 'bss'],
    10: ['hbs', 'bss'],
    11: ['bbs', 'ss'],
    12: ['bs', 'bss'],
    13: ['bss', 'sss'],
  },
  // Cola de caballo: pelo tirante con el brillo ancho en la coronilla y el flequillo en mechones.
  'cola-caballo': {
    3: ['hhbbss'],
    4: ['hhhbbbss'],
    5: ['hhhhbbbbss'],
    6: ['hhhhbbbbbbbsss'],
    7: ['hhbbbbbbbbbsss'],
    8: ['hhbbbbbbbbbbbsss'],
    9: ['hhbbbbbbbbbbssss'],
    10: ['hsbbsbbsbbsbbsss'],
  },
  // Rapado: solo el volumen del casquete.
  rapado: {
    4: ['hhbbss'],
    5: ['hhhbbbbss'],
    6: ['hhhbbbbbbsss'],
    7: ['hbbbbbbbbsss'],
  },
  // Trenza: raya al medio con brillo a cada lado; la trenza conserva su dibujo.
  trenza: {
    3: ['hhsbss'],
    4: ['hhbshbss'],
    5: ['hhhbshhbss'],
    6: ['hhhbbbsbhbbsss'],
    7: ['hbbbbsbsbbbsss'],
    8: ['hbbbbsbbbsbbbsss'],
  },
  // Bob con flequillo de lado: el brillo cruza en diagonal y un mechón marca el barrido del flequillo.
  'bob-flequillo': {
    2: ['hhbbss'],
    3: ['hhhbbbbbss'],
    4: ['hhbhhbbbbbss'],
    5: ['hhbbhhhbbbbbss'],
    6: ['hhbbbbhhhbbbbsss'],
    7: ['hbbbbbbbhhbbbbbsss'],
    8: ['hbbbbbbbbbbbbbbsss'],
    9: ['hbbbbbbbbbbbbbbsss'],
    10: ['hbbsssbbbsbbbbbbbsss'],
    11: ['hbs', 'sssbbsbbbbbsss'],
    12: ['hbs', 'sssbsbbbsss'],
    13: ['hbs', 'sssssbss'],
    ...rows(14, 16, ['hbs', 'bss']),
    ...rows(17, 19, ['bbs', 'bss']),
    20: ['bss', 'bss'],
    21: ['ss', 'ss'],
  },
};

const gridLines = grid => grid.split('\n').map(line => line.trim()).filter(Boolean);

/** Celdas que ocupa el pelo de la pieza en el retrato. */
function hairCells(portrait) {
  const cells = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
  for (const overlay of portrait) {
    if (overlay.mode !== 'cover') continue;
    gridLines(overlay.grid).forEach((line, r) => {
      [...line].forEach((ch, c) => {
        const x = overlay.at[0] + c;
        const y = overlay.at[1] + r;
        if (ch !== '.' && ch !== ' ' && x >= 0 && x < SIZE && y >= 0 && y < SIZE) cells[y][x] = true;
      });
    });
  }
  return cells;
}

/** El retrato de la pieza más su capa de tonos. */
export function hairVolume(id, portrait) {
  const spec = VOLUME[id];
  if (!spec) throw new Error(`pelo ${id}: sin volumen de retrato`);
  const hair = hairCells(portrait);
  const cells = [];
  for (const [key, texts] of Object.entries(spec)) {
    const y = Number(key);
    const runs = [];
    for (let x = 0; x < SIZE; x++) {
      if (!hair[y][x] || (x > 0 && hair[y][x - 1])) continue;
      let end = x;
      while (end + 1 < SIZE && hair[y][end + 1]) end++;
      runs.push([x, end]);
    }
    if (runs.length !== texts.length) throw new Error(`pelo ${id}, fila ${y}: la silueta tiene ${runs.length} tramos y el volumen ${texts.length}`);
    runs.forEach(([from, to], k) => {
      const text = texts[k];
      if (text === '') return;
      if (text.length !== to - from + 1) throw new Error(`pelo ${id}, fila ${y}, tramo ${k + 1}: mide ${to - from + 1} y el volumen ${text.length}`);
      [...text].forEach((ch, c) => { if (ch !== '.') cells.push([from + c, y, ch]); });
    });
  }
  return [...portrait, { anchor: 'H', at: [0, 0], mode: 'paint', parts: ['hair'], legend: TONES, grid: stamp(gridFrom(SIZE, SIZE, () => '.'), cells) }];
}
