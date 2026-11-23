import { MUROS, esAnchoDeSala, esEncuadre, largoMuro, zonaCaminable, type Muro } from './geometria';
import type { ManifiestoDePiezas } from '../../simulator/sala/catalogo';

export type ReglaDeSala = 'OCL-13' | 'OCL-14' | 'OCL-15' | 'OCL-16' | 'OCL-17' | 'OCL-18' | 'OCL-19';
/** `otra` (solo OCL-14): la ruta de la otra pieza del par. El servidor señala solo la primera; el editor marca las dos. */
export interface HallazgoDeSala { regla: ReglaDeSala; ruta: string; mensaje: string; otra?: string }
export interface CatalogoDeReglas {
  anchos: readonly number[];
  piezas: Readonly<Record<string, { muros: readonly string[]; ocupa: number; franja: readonly [number, number] }>>;
  clavesDePisos: readonly string[]; muros: readonly string[]; propios: readonly string[]; tapetes: readonly string[];
}
type Datos = Record<string, any>;
export interface MapaDeSala {
  clave?: string; ancho?: number; alto?: number; aparicion?: Datos; ambiente?: Datos;
  estructura?: Datos; colisiones?: readonly Datos[]; objetos?: readonly Datos[];
}
export interface DocumentoDeSalas { 'x-siep': { escenas: readonly { clave: string; mapa?: MapaDeSala }[] } }

export function catalogoDeReglas(m: ManifiestoDePiezas): CatalogoDeReglas {
  const extra = m as ManifiestoDePiezas & { geometria?: { anchos?: number[] }; tapetes?: string[] };
  return { anchos: extra.geometria?.anchos ?? [], piezas: Object.fromEntries(Object.entries(m.piezas ?? {}).map(([k, v]) =>
    [k, { muros: v.muros || [], ocupa: v.ocupa || 0, franja: v.franja || [0, 0] }])),
    clavesDePisos: Object.keys(m.pisos ?? {}), muros: Object.keys(m.muros ?? {}), propios: m.propios ?? [], tapetes: extra.tapetes ?? [] };
}

const tabla = (v: unknown): Datos => v && typeof v === 'object' && !Array.isArray(v) ? v as Datos : {};
const objetos = (v: unknown): [number, Datos][] => Array.isArray(v) ? v.flatMap((o, i) => o && typeof o === 'object' && !Array.isArray(o) ? [[i, o] as [number, Datos]] : []) : [];
const entero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const texto = (v: unknown) => typeof v === 'string' && v ? v : '';
const mostrar = (v: unknown) => v == null ? 'None' : String(v);
type Rect = { x: number; y: number; ancho: number; alto: number };
function rects(m: MapaDeSala): Rect[] {
  return [...objetos(m.colisiones).map(([, o]) => o), ...objetos(m.objetos).map(([, o]) => o).filter(o => o['colision'] === true && o['visible'] !== false)]
    .filter(o => ['x', 'y', 'ancho', 'alto'].every(k => entero(o[k]))) as Rect[];
}
const dentro = (x: number, y: number, ancho: number, alto: number) => x - 11 >= 0 && x + 11 <= ancho && y - 16 >= 0 && y <= alto;
const choca = (x: number, y: number, rs: Rect[]) => rs.some(r => x - 11 < r.x + r.ancho && r.x < x + 11 && y - 16 < r.y + r.alto && r.y < y);

function alcanzables(m: MapaDeSala, anchoSala: number | null): [number, number][] {
  const a = tabla(m.aparicion), ax = a['x'], ay = a['y'], ancho = anchoSala || m.ancho, alto = entero(m.alto) ? m.alto : 528;
  if (!entero(ax) || !entero(ay) || !entero(ancho) || !dentro(ax, ay, ancho, alto)) return [];
  const imin = Math.ceil((11 - ax) / 8), imax = Math.floor((ancho - 11 - ax) / 8);
  const jmin = Math.ceil((16 - ay) / 8), jmax = Math.floor((alto - ay) / 8);
  const columnas = imax - imin + 1, filas = jmax - jmin + 1, marcas = new Uint8Array(columnas * filas);
  const indice = (i: number, j: number) => (j - jmin) * columnas + i - imin;
  for (const r of rects(m)) {
    const desdeI = Math.max(imin, Math.ceil((r.x - 11 - ax + 1) / 8));
    const hastaI = Math.min(imax, Math.floor((r.x + r.ancho + 11 - ax - 1) / 8));
    const desdeJ = Math.max(jmin, Math.ceil((r.y - ay + 1) / 8));
    const hastaJ = Math.min(jmax, Math.floor((r.y + r.alto + 16 - ay - 1) / 8));
    for (let j = desdeJ; j <= hastaJ; j++) for (let i = desdeI; i <= hastaI; i++) marcas[indice(i, j)] = 1;
  }
  if (marcas[indice(0, 0)]) return [];
  const pendientes: [number, number][] = [[0, 0]], puntos: [number, number][] = [];
  marcas[indice(0, 0)] = 1;
  while (pendientes.length) {
    const [i, j] = pendientes.pop()!; puntos.push([ax + 8 * i, ay + 8 * j]);
    for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (ni < imin || ni > imax || nj < jmin || nj > jmax || marcas[indice(ni, nj)]) continue;
      marcas[indice(ni, nj)] = 1; pendientes.push([ni, nj]);
    }
  }
  return puntos;
}

export function revisarSalas(doc: DocumentoDeSalas, catalogo: CatalogoDeReglas | null): HallazgoDeSala[] {
  const escenas = objetos(tabla(doc)['x-siep']?.escenas);
  const mapas = new Map<string, MapaDeSala>();
  for (const [, e] of escenas) if (texto(e['clave']) && e['mapa'] && typeof e['mapa'] === 'object' && !Array.isArray(e['mapa'])) mapas.set(texto(e['clave']), e['mapa']);
  const salas = escenas.filter(([, e]) => e['mapa'] && typeof e['mapa'] === 'object' && e['mapa']['estructura'] && typeof e['mapa']['estructura'] === 'object' && !Array.isArray(e['mapa']['estructura']));
  const hallazgos: HallazgoDeSala[] = [];
  // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología.
  const agregar = (regla: ReglaDeSala, ruta: string, mensaje: string, otra?: string) => hallazgos.push({ regla, ruta, mensaje, ...(otra ? { otra } : {}) });
  const modelo = (tipo: unknown, nombre: unknown) => catalogo?.piezas[`${mostrar(tipo)}/${mostrar(nombre)}`];
  const salaId = (clave: string, mapa: MapaDeSala) => typeof tabla(mapa.ambiente)['salaId'] === 'string' && tabla(mapa.ambiente)['salaId'] ? tabla(mapa.ambiente)['salaId'] : clave;
  for (const regla of ['OCL-13', 'OCL-14', 'OCL-15', 'OCL-16', 'OCL-17', 'OCL-18'] as const) {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    if (regla === 'OCL-18' && salas.length && !catalogo) { agregar(regla, 'x-siep.escenas', 'El catálogo de piezas de la biblioteca no está disponible: no se pueden revisar las salas por piezas.'); continue; }
    for (const [i, escena] of salas) {
      const mapa = escena['mapa'] as MapaDeSala, estructura = tabla(mapa.estructura), ambiente = tabla(mapa.ambiente);
      const encuadre = esEncuadre(ambiente['encuadre']) ? ambiente['encuadre'] : 'tres-paredes';
      const ancho = esAnchoDeSala(estructura['ancho']) ? estructura['ancho'] : null;
      const ruta = `x-siep.escenas[${i}].mapa`, piezas = objetos(estructura['piezas']), obs = objetos(mapa.objetos);
      const puertas = obs.filter(([, o]) => o['tipo'] === 'EXIT').map(([k, o]) => [k, o, tabla(o['metadatos'])] as const);
      if (regla === 'OCL-13' && ancho !== null) {
        const zona = zonaCaminable(encuadre, ancho);
        const revisarMuro = (r: string, muro: unknown, pos: unknown, ficha: ReturnType<typeof modelo>) => {
          // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
          if (typeof muro !== 'string' || !MUROS.includes(muro as Muro) || !entero(pos)) { agregar(regla, r, 'No dice en qué muro ni en qué posición va: en una sala por piezas toda pieza y toda puerta lleva «muro» (fondo, izquierda, derecha o cámara) y «pos» (un número entero).'); return; }
          const largo = largoMuro(muro as Muro, encuadre, ancho);
          // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
          if (!largo) agregar(regla, r, `La sala no tiene muro «${muro}»: su encuadre no lo incluye.`);
          // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
          else if (ficha && !ficha.muros.includes(muro)) agregar(regla, r, `Este modelo no puede ir en el muro «${muro}».`);
          // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
          else if (2 * pos - (ficha?.ocupa ?? 0) < 0 || 2 * pos + (ficha?.ocupa ?? 0) > 2 * largo) agregar(regla, r, `La pieza se sale del muro «${muro}», que mide ${largo} px.`);
        };
        for (const [k, p] of piezas) {
          const r = `${ruta}.estructura.piezas[${k}]`, f = modelo(p['tipo'], p['modelo']);
          // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
          if (p['tipo'] === 'puerta') agregar(regla, r, 'Las puertas no van entre las piezas: son objetos de salida (EXIT) con muro y posición.');
          else if ('muro' in p) revisarMuro(r, p['muro'], p['pos'], f);
          else if (entero(p['x']) && entero(p['y'])) {
            // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
            if (f && !(f.muros.length === 1 && f.muros[0] === 'suelo')) agregar(regla, r, 'Esta pieza va colgada de un muro, no apoyada en el suelo.');
            // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
            if (p['x'] < zona.x || p['x'] > zona.x + zona.ancho || p['y'] < zona.y || p['y'] > zona.y + zona.alto) agregar(regla, r, 'La pieza de suelo queda fuera de la zona donde se camina.');
          }
        }
        for (const [k, , m] of puertas) revisarMuro(`${ruta}.objetos[${k}]`, m['muro'], m['pos'], modelo('puerta', m['modelo']));
      }
      if (regla === 'OCL-14') {
        const lista: { ruta: string; nombre: string; muro: string; pos: number; ficha: NonNullable<ReturnType<typeof modelo>>; puerta: boolean }[] = [];
        for (const [k, p] of piezas) { const f = modelo(p['tipo'], p['modelo']); if (f && MUROS.includes(p['muro']) && entero(p['pos'])) lista.push({ ruta: `${ruta}.estructura.piezas[${k}]`, nombre: p['id'] || p['modelo'], muro: p['muro'], pos: p['pos'], ficha: f, puerta: p['tipo'] === 'puerta' }); }
        for (const [k, o, m] of puertas) { const f = modelo('puerta', m['modelo']); if (f && MUROS.includes(m['muro']) && entero(m['pos'])) lista.push({ ruta: `${ruta}.objetos[${k}]`, nombre: o['clave'] || 'puerta', muro: m['muro'], pos: m['pos'], ficha: f, puerta: true }); }
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        for (let a = 0; a < lista.length; a++) for (let b = a + 1; b < lista.length; b++) { const x = lista[a], y = lista[b]; if (x.muro === y.muro && 2 * Math.abs(x.pos - y.pos) < x.ficha.ocupa + y.ficha.ocupa + (x.puerta || y.puerta ? 16 : 0) && x.ficha.franja[0] < y.ficha.franja[1] && y.ficha.franja[0] < x.ficha.franja[1]) agregar(regla, x.ruta, `«${x.nombre}» y «${y.nombre}» se montan una sobre otra en el muro «${x.muro}».`, y.ruta); }
      }
      if (regla === 'OCL-15') for (const [k, , m] of puertas) {
        const r = `${ruta}.objetos[${k}]`, destino = mapas.get(m['targetNodeKey']);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if (!destino) { agregar(regla, r, 'La puerta lleva a una sala que el caso no tiene.'); continue; }
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if ('par' in m && typeof m['par'] !== 'string') { agregar(regla, r, '«par» debe ser la clave (un texto) de la puerta de regreso.'); continue; }
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if ('sentidoUnico' in m && typeof m['sentidoUnico'] !== 'boolean') { agregar(regla, r, '«sentidoUnico» debe ser verdadero o falso.'); continue; }
        if (m['sentidoUnico'] === true) continue;
        const vuelve = (o: Datos) => { const objetivo = tabla(o['metadatos'])['targetNodeKey'], destinoVuelta = mapas.get(objetivo); return o['tipo'] === 'EXIT' && (objetivo === texto(escena['clave']) || !!destinoVuelta && salaId(objetivo, destinoVuelta) === salaId(texto(escena['clave']), mapa)); };
        const disponibles = objetos(destino.objetos).map(([, o]) => o);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if (typeof m['par'] === 'string') { const pareja = disponibles.find(o => o['clave'] === m['par']); if (!pareja) agregar(regla, r, `La puerta de regreso «${m['par']}» no está en la sala de destino.`); else if (!vuelve(pareja)) agregar(regla, r, `La puerta «${m['par']}» de la sala de destino no vuelve a esta sala.`); }
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        else if (!disponibles.some(vuelve)) agregar(regla, r, 'La sala de destino no tiene puerta de regreso; si es de un solo sentido, márcala como de sentido único.');
      }
      // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
      if (regla === 'OCL-16') for (const [k, , m] of puertas) { const destino = mapas.get(m['targetNodeKey']), x = m['entryX'], y = m['entryY']; if (destino && entero(x) && entero(y) && ((entero(destino.ancho) && entero(destino.alto) && !dentro(x, y, destino.ancho, destino.alto)) || choca(x, y, rects(destino)))) agregar(regla, `${ruta}.objetos[${k}].metadatos`, 'Quien cruza esta puerta aparece en la otra sala sobre una pared o un mueble.'); }
      if (regla === 'OCL-17') {
        const puntos = alcanzables(mapa, ancho);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if (!puntos.length) agregar(regla, `${ruta}.aparicion`, 'Quien entra a la sala aparece sobre una pared o un mueble.');
        else {
          const casillas = new Map<string, [number, number][]>();
          for (const punto of puntos) { const clave = `${Math.floor(punto[0] / 64)},${Math.floor(punto[1] / 64)}`; const grupo = casillas.get(clave) ?? []; grupo.push(punto); casillas.set(clave, grupo); }
          for (const [k, o] of obs) {
            if (o['visible'] === false || !entero(o['x']) || !entero(o['y']) || o['tipo'] === 'PROP') continue;
            const radio = o['tipo'] === 'EXIT' ? 56 : o['tipo'] === 'PERSON' ? 72 : 74, ox = o['x'], oy = o['y'];
            let cerca = false;
            for (let cx = Math.floor((ox - radio) / 64); cx <= Math.floor((ox + radio) / 64) && !cerca; cx++) for (let cy = Math.floor((oy - radio) / 64); cy <= Math.floor((oy + radio) / 64) && !cerca; cy++) cerca = (casillas.get(`${cx},${cy}`) ?? []).some(([x, y]) => (x - ox) ** 2 + (y - oy) ** 2 <= radio ** 2);
            // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
            if (!cerca) agregar(regla, `${ruta}.objetos[${k}]`, `No se puede llegar caminando hasta «${o['etiqueta'] || o['clave'] || 'un objeto'}» desde la entrada de la sala.`);
          }
        }
      }
      if (regla === 'OCL-18' && catalogo) {
        const r = `${ruta}.estructura`, a = tabla(estructura['acabados']), piso = a['piso'], variante = 'variante' in a ? a['variante'] : 'a';
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if (ancho === null) agregar(regla, `${r}.ancho`, 'El ancho de la sala no es uno del catálogo (960, 1200, 1440, 1680 o 1920).');
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if (!catalogo.clavesDePisos.includes(`${mostrar(piso)}-${mostrar(variante)}`)) agregar(regla, `${r}.acabados`, `El piso «${mostrar(piso)}» en la variante «${mostrar(variante)}» no está en el catálogo.`);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if (!catalogo.muros.includes(`${mostrar(a['muro'])}/${mostrar(a['paleta'])}`)) agregar(regla, `${r}.acabados`, `El muro «${mostrar(a['muro'])}» con la paleta «${mostrar(a['paleta'])}» no está en el catálogo.`);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        for (const [k, p] of piezas) if (p['tipo'] !== 'puerta' && !modelo(p['tipo'], p['modelo'])) agregar(regla, `${r}.piezas[${k}]`, `La pieza «${mostrar(p['tipo'])}/${mostrar(p['modelo'])}» no está en el catálogo.`);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        for (const [k, , m] of puertas) if (!modelo('puerta', m['modelo'])) agregar(regla, `${ruta}.objetos[${k}]`, `La puerta de modelo «${mostrar(m['modelo'])}» no está en el catálogo.`);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        for (const campo of ['propios', 'tapetes'] as const) for (const [k, capa] of objetos(estructura[campo])) if (!catalogo[campo].includes(capa['ruta'])) agregar(regla, `${r}.${campo}[${k}]`, `La imagen «${mostrar(capa['ruta'])}» no está en el catálogo.`);
      }
    }
  }
  revisarTrayectos(escenas, (ruta, mensaje) => agregar('OCL-19', ruta, mensaje));
  return hallazgos;
}

/** El margen de la sala para una persona que camina: el `margin` de `personWalkBounds` y `MARGEN_PERSONA` del servidor. */
const MARGEN_PERSONA = 24;
/** A cuánto se para el estudiante para usar una puerta: ningún trayecto pasa tan cerca. */
const RADIO_PUERTA = 56;
const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1_000_000;

/**
 * OCL-19, igual que `ocl_19_trayectos_caminables` del servidor (mira cualquier mapa, tenga o no `estructura`): el juego
 * lleva a la persona en línea recta de un punto al siguiente sin rodear muebles, así que cada tramo se recorre píxel a
 * píxel con sus pies contra la zona caminable, el margen de la sala, las colisiones y las demás personas, y ningún punto
 * pasa a 56 px o menos de una puerta.
 */
function revisarTrayectos(escenas: [number, Datos][], agregar: (ruta: string, mensaje: string) => void): void {
  for (const [i, escena] of escenas) {
    const mapa = escena['mapa'];
    if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) continue;
    const obs = objetos(mapa['objetos']);
    for (const [k, obj] of obs) {
      const meta = tabla(obj['metadatos']), movimiento = meta['movimiento'];
      if (obj['tipo'] !== 'PERSON' || !movimiento || typeof movimiento !== 'object' || Array.isArray(movimiento) || movimiento['tipo'] !== 'ruta') continue;
      const ruta = `x-siep.escenas[${i}].mapa.objetos[${k}].metadatos.movimiento`;
      const puntos = movimiento['puntos'], pausa = movimiento['pausaMs'], modo = movimiento['modo'];
      if (!Array.isArray(puntos) || puntos.length < 2 || puntos.length > 8 || (modo !== 'circuito' && modo !== 'ida-y-vuelta')
        || ('pausaMs' in movimiento && (!numero(pausa) || pausa < 0 || pausa > 10000))
        || puntos.some(p => !p || typeof p !== 'object' || Array.isArray(p) || !numero(p['x']) || !numero(p['y']))) {
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        agregar(ruta, 'El trayecto requiere de 2 a 8 puntos válidos, un modo válido y una pausa entre 0 y 10000 ms.');
        continue;
      }
      const ancho = mapa['ancho'], alto = mapa['alto'], ox = obj['x'], oy = obj['y'];
      if (!(entero(ancho) && entero(alto) && numero(ox) && numero(oy))) {
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        agregar(ruta, 'No se puede comprobar el trayecto sin las medidas de la sala y la posición de la persona.');
        continue;
      }
      // Los pies quedan bajo el marcador: 0 px si el marcador ya es el punto de apoyo, 16 en los casos de antes.
      const pies = meta['apoyo'] === 'pies' ? 0 : 16;
      const cajas: Rect[] = rects({ ...mapa, objetos: obs.map(([, o]) => o).filter(o => o !== obj) });
      // Las personas no chocan entre sí en el juego: el trayecto no pasa por donde otra está de pie (sus pies).
      for (const [, otra] of obs) {
        if (otra === obj || otra['tipo'] !== 'PERSON' || otra['visible'] === false || !numero(otra['x']) || !numero(otra['y'])) continue;
        const pie = otra['y'] + (tabla(otra['metadatos'])['apoyo'] === 'pies' ? 0 : 16);
        cajas.push({ x: otra['x'] - 11, y: pie - 16, ancho: 22, alto: 16 });
      }
      const estructura = mapa['estructura'], ambiente = tabla(mapa['ambiente']);
      const zona = estructura && typeof estructura === 'object' && !Array.isArray(estructura) && esAnchoDeSala(estructura['ancho'])
        ? zonaCaminable(esEncuadre(ambiente['encuadre']) ? ambiente['encuadre'] : 'tres-paredes', estructura['ancho'])
        : { x: 0, y: 0, ancho, alto };
      const puertas = obs.map(([, o]) => o)
        .filter(o => o['tipo'] === 'EXIT' && o['visible'] !== false && numero(o['x']) && numero(o['y']))
        .map(o => [String(o['etiqueta'] || o['clave'] || 'una puerta'), o['x'] as number, o['y'] as number] as const);
      const libre = (x: number, y: number) => {
        const pie = y + pies;
        return MARGEN_PERSONA <= x && x <= ancho - MARGEN_PERSONA && MARGEN_PERSONA <= y && y <= alto - MARGEN_PERSONA
          && dentro(x - zona.x, pie - zona.y, zona.ancho, zona.alto) && dentro(x, pie, ancho, alto) && !choca(x, pie, cajas);
      };
      const tapa = (x: number, y: number) => {
        const pie = y + pies;
        return puertas.find(([, px, py]) => Math.hypot(x - px, pie - py) <= RADIO_PUERTA)?.[0] ?? null;
      };
      const tramo = (a: readonly [number, number], b: readonly [number, number]) => {
        const pasos = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        let chocaTramo = false, puerta: string | null = null;
        for (let t = 1; t <= pasos; t++) {
          const x = a[0] + (b[0] - a[0]) * t / pasos, y = a[1] + (b[1] - a[1]) * t / pasos;
          chocaTramo = chocaTramo || !libre(x, y);
          puerta = puerta || tapa(x, y);
        }
        return [chocaTramo, puerta] as const;
      };
      const partida = [ox, oy] as const;
      if (!libre(...partida)) {
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        agregar(ruta, 'La partida de la persona queda fuera de la zona caminable, sobre un mueble o sobre otra persona.');
        continue;
      }
      const paradas = [partida, ...puntos.map(p => [p['x'], p['y']] as const)];
      const avisadas = new Set<string>();
      const puertaTapada = (nombre: string | null, donde: string) => {
        if (nombre === null || avisadas.has(nombre)) return;
        avisadas.add(nombre);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        agregar(donde, `La persona pasaría frente a la puerta «${nombre}» y la taparía: aleja el trayecto al menos 56 px de la puerta.`);
      };
      puertaTapada(tapa(...partida), ruta);
      const malos = new Set<number>();
      for (let n = 0; n < paradas.length - 1; n++) {
        const parada = paradas[n + 1], donde = `${ruta}.puntos[${n}]`;
        if (!libre(...parada)) {
          malos.add(n + 1);
          // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
          agregar(donde, 'El punto queda fuera de la zona caminable, sobre un mueble o sobre otra persona.');
          continue;
        }
        if (malos.has(n)) continue; // el tramo sale de un punto ya informado
        const [chocaTramo, puerta] = tramo(paradas[n], parada);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if (chocaTramo) agregar(donde, 'El camino recto hasta este punto atraviesa un mueble, una pared u otra persona: la persona camina en línea recta entre sus puntos; agrega un punto intermedio para rodearlo.');
        puertaTapada(puerta, donde);
      }
      if (modo === 'circuito' && libre(...paradas[paradas.length - 1])) {
        const [chocaTramo, puerta] = tramo(paradas[paradas.length - 1], partida);
        // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
        if (chocaTramo) agregar(ruta, 'El camino recto de regreso a la partida atraviesa un mueble, una pared u otra persona: agrega un punto intermedio para rodearlo.');
        puertaTapada(puerta, ruta);
      }
    }
  }
}
