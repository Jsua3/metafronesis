import type { CasoBorrador, PuertaCaso, SalaCaso } from './caso';
import { claveDeNuevo } from './hacia-api';
import { ALTO_SALA, ANCHO_SALA, esAnchoDeSala, llegada, paredes } from './geometria';
import { movimientoAMetadata } from './movimiento';
import { revisarSalas, type CatalogoDeReglas, type DocumentoDeSalas, type ReglaDeSala } from './reglas-de-sala';

export interface FaltaDeSala {
  regla: ReglaDeSala;
  mensaje: string;
  elemento: { tipo: 'pieza' | 'puerta' | 'objeto' | 'aparicion' | 'sala'; id: string | null };
}

const anchoDe = (sala: SalaCaso) => esAnchoDeSala(sala.estructura?.ancho) ? sala.estructura.ancho : ANCHO_SALA;
const puntoDe = (puerta: PuertaCaso, sala: SalaCaso) => puerta.muro !== undefined && puerta.pos !== undefined
  ? llegada(puerta.muro, puerta.pos, sala.encuadre, anchoDe(sala)) : { x: puerta.x, y: puerta.y };

export function documentoDeSalas(caso: CasoBorrador): DocumentoDeSalas {
  const salas = new Map(caso.salas.map(s => [s.id, s]));
  const clavePorSala = new Map<string, string>();
  caso.escenas.forEach((e, i) => {
    if (e.salaId && !clavePorSala.has(e.salaId)) clavePorSala.set(e.salaId, `escena-${i}`);
  });
  const escenas = caso.escenas.map((escena, i) => {
    const clave = `escena-${i}`;
    const sala = escena.salaId ? salas.get(escena.salaId) : undefined;
    if (!sala) return { clave };
    const usados = new Set<string>();
    const claveObjeto = (propuesta: string | undefined, ref: string) => claveDeNuevo(propuesta, ref, usados);
    const objetos: Record<string, unknown>[] = [];
    for (const m of sala.muebles) {
      const ficha = caso.catalogo.muebles.find(f => f.id === m.ref);
      if (!ficha) continue;
      objetos.push({ clave: claveObjeto(m.clave, m.ref), tipo: 'PROP', x: m.x, y: m.y, ancho: ficha.ancho, alto: ficha.alto,
        visible: true, colision: false, etiqueta: ficha.nombre, metadatos: { arte: ficha.arte, colision: ficha.colision } });
    }
    for (const o of sala.objetos) {
      const ficha = caso.catalogo.objetos.find(f => f.id === o.ref);
      if (!ficha) continue;
      objetos.push({ clave: claveObjeto(o.clave, o.ref), tipo: ficha.tipo, x: o.x, y: o.y, ancho: 32, alto: 32,
        visible: true, colision: false, etiqueta: ficha.nombre, metadatos: { arte: ficha.arte } });
    }
    for (const p of sala.personajes) {
      const ficha = caso.personajes.find(f => f.id === p.ref);
      // El marcador es el punto de apoyo, como guarda el editor (`apoyo: 'pies'`), y el trayecto va tal cual para OCL-19.
      objetos.push({ clave: claveObjeto(p.clave, p.ref), tipo: 'PERSON', x: p.x, y: p.y, ancho: 48, alto: 48,
        visible: true, colision: false, etiqueta: ficha?.nombre ?? p.ref, metadatos: {
          apoyo: 'pies', ...(p.movimiento !== undefined ? { movimiento: movimientoAMetadata(p.movimiento) } : {}) } });
    }
    for (const puerta of sala.puertas) {
      const destino = puerta.hacia ? salas.get(puerta.hacia) : undefined;
      const pareja = destino && (destino.puertas.find(p => p.id === puerta.par)
        ?? destino.puertas.find(p => p.hacia === sala.id));
      const entrada = destino && (pareja ? puntoDe(pareja, destino) : destino.entrada);
      const destinoClave = puerta.hacia ? clavePorSala.get(puerta.hacia) : undefined;
      const metadatos = {
        ...(destinoClave ? { targetNodeKey: destinoClave } : {}),
        ...(entrada ? { entryX: entrada.x, entryY: entrada.y } : {}),
        ...(puerta.muro !== undefined ? { muro: puerta.muro } : {}),
        ...(puerta.pos !== undefined ? { pos: puerta.pos } : {}),
        ...(puerta.modelo !== undefined ? { modelo: puerta.modelo } : {}),
        ...(puerta.par !== undefined ? { par: puerta.par } : {}),
        ...(puerta.sentidoUnico !== undefined ? { sentidoUnico: puerta.sentidoUnico } : {}),
      };
      objetos.push({ clave: puerta.id, tipo: 'EXIT', ...puntoDe(puerta, sala), ancho: 24, alto: 40,
        visible: true, colision: false, etiqueta: puerta.etiqueta, metadatos });
    }
    return { clave, mapa: { ancho: sala.estructura?.ancho ?? ANCHO_SALA, alto: ALTO_SALA,
      ...(sala.estructura ? { estructura: sala.estructura } : {}), ambiente: { encuadre: sala.encuadre, salaId: sala.id },
      aparicion: sala.entrada, colisiones: [...paredes(sala.encuadre, anchoDe(sala)),
        ...Object.entries(sala.choques).map(([claveZona, zona]) => ({ clave: `choque-${claveZona}`, ...zona }))], objetos } };
  });
  return { 'x-siep': { escenas } };
}

export function anclaDeElemento(salaId: string, e: FaltaDeSala['elemento']): string {
  return e.tipo === 'sala' || e.tipo === 'aparicion' || e.id === null ? `sala-${salaId}` : `${e.tipo}-${salaId}-${e.id}`;
}

export function elementoDeRuta(ruta: string, caso: CasoBorrador): { salaId: string; elemento: FaltaDeSala['elemento'] } | null {
  const coincidencia = /^x-siep\.escenas\[(\d+)\]\.mapa(?:\.|$)/.exec(ruta);
  if (!coincidencia) return null;
  const indice = Number(coincidencia[1]);
  const salaId = caso.escenas[indice]?.salaId;
  const sala = caso.salas.find(s => s.id === salaId);
  if (!sala) return null;
  const pieza = /\.estructura\.piezas\[(\d+)\]/.exec(ruta);
  if (pieza) {
    const p = sala.estructura?.piezas?.[Number(pieza[1])];
    return p ? { salaId: sala.id, elemento: { tipo: 'pieza', id: p.id ?? null } } : null;
  }
  const objeto = /\.objetos\[(\d+)\]/.exec(ruta);
  if (objeto) {
    const o = documentoDeSalas(caso)['x-siep'].escenas[indice].mapa?.objetos?.[Number(objeto[1])];
    if (!o || typeof o['clave'] !== 'string') return null;
    return { salaId: sala.id, elemento: { tipo: o['tipo'] === 'EXIT' ? 'puerta' : 'objeto', id: o['clave'] } };
  }
  return { salaId: sala.id, elemento: { tipo: ruta.includes('.aparicion') ? 'aparicion' : 'sala', id: null } };
}

export function faltasPorSala(caso: CasoBorrador, catalogo: CatalogoDeReglas | null): Map<string, FaltaDeSala[]> {
  const resultado = new Map<string, FaltaDeSala[]>();
  for (const hallazgo of revisarSalas(documentoDeSalas(caso), catalogo)) {
    const destino = elementoDeRuta(hallazgo.ruta, caso);
    // OCL-14 marca también la otra pieza del par: así se ve en la que la docente acaba de mover.
    const otra = hallazgo.otra ? elementoDeRuta(hallazgo.otra, caso) : null;
    const destinos = destino ? [destino, ...(otra ? [otra] : [])] : hallazgo.ruta === 'x-siep.escenas'
      ? caso.salas.filter(s => s.estructura && caso.escenas.some(e => e.salaId === s.id))
        .map(s => ({ salaId: s.id, elemento: { tipo: 'sala' as const, id: null } })) : [];
    for (const d of destinos) {
      const faltas = resultado.get(d.salaId) ?? [];
      if (!faltas.some(f => f.regla === hallazgo.regla && f.mensaje === hallazgo.mensaje
        && f.elemento.tipo === d.elemento.tipo && f.elemento.id === d.elemento.id)) {
        faltas.push({ regla: hallazgo.regla, mensaje: hallazgo.mensaje, elemento: d.elemento });
        resultado.set(d.salaId, faltas);
      }
    }
  }
  return resultado;
}

/**
 * La clave de la persona cuyo trayecto señala una falta OCL-19 del servidor en la escena `escenaId`. Los objetos del servidor
 * no van en el orden del editor, así que se busca con la regla del cliente la misma falta: el mismo texto y el mismo tramo
 * (lo que sigue a `.movimiento` en la ruta: `.puntos[n]` o nada). Si solo una persona la tiene, es ella; si ninguna la tiene
 * y la escena tiene una sola persona con trayecto, es esa. Si hay varias posibles, `null`: se lleva a la sala sin adivinar.
 */
export function personaDeTrayecto(caso: CasoBorrador, escenaId: string, mensaje: string, ruta = ''): string | null {
  const indice = caso.escenas.findIndex(e => e.id === escenaId);
  if (indice < 0) return null;
  const documento = documentoDeSalas(caso), objetos = documento['x-siep'].escenas[indice]?.mapa?.objetos ?? [];
  const prefijo = `x-siep.escenas[${indice}].mapa.objetos[`;
  const tramo = (r: string) => r.includes('.movimiento') ? r.slice(r.indexOf('.movimiento') + '.movimiento'.length) : null;
  const clave = (r: string) => objetos[Number(/\.objetos\[(\d+)\]/.exec(r)?.[1])]?.['clave'];
  const iguales = revisarSalas(documento, null)
    .filter(h => h.regla === 'OCL-19' && h.ruta.startsWith(prefijo) && h.mensaje === mensaje && tramo(h.ruta) === tramo(ruta));
  const candidatas = new Set((iguales.length ? iguales.map(h => clave(h.ruta))
    : objetos.filter(o => o['tipo'] === 'PERSON' && o['metadatos']?.['movimiento']?.['tipo'] === 'ruta').map(o => o['clave']))
    .filter((c): c is string => typeof c === 'string'));
  return candidatas.size === 1 ? [...candidatas][0] : null;
}
