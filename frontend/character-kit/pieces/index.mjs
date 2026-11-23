/** Todas las piezas del kit. Registro explícito: el build no descubre archivos. */
import gafas from './accessory/gafas.mjs';
import gafete from './accessory/gafete.mjs';
import faldaLarga from './bottom/falda-larga.mjs';
import faldaRodilla from './bottom/falda-rodilla.mjs';
import jean from './bottom/jean.mjs';
import jogger from './bottom/jogger.mjs';
import pantalon from './bottom/pantalon.mjs';
import pantalonUniforme from './bottom/pantalon-uniforme.mjs';
import maduro from './face/maduro.mjs';
import sereno from './face/sereno.mjs';
import afro from './hair/afro.mjs';
import bobFlequillo from './hair/bob-flequillo.mjs';
import colaCaballo from './hair/cola-caballo.mjs';
import cortoLiso from './hair/corto-liso.mjs';
import cortoRizado from './hair/corto-rizado.mjs';
import largoSuelto from './hair/largo-suelto.mjs';
import mediaMelena from './hair/media-melena.mjs';
import mono from './hair/mono.mjs';
import rapado from './hair/rapado.mjs';
import trenza from './hair/trenza.mjs';
import bata from './layer/bata.mjs';
import bataPsicologia from './layer/bata-psicologia.mjs';
import botines from './shoes/botines.mjs';
import tenis from './shoes/tenis.mjs';
import zapatos from './shoes/zapatos.mjs';
import blazer from './top/blazer.mjs';
import blusa from './top/blusa.mjs';
import camisa from './top/camisa.mjs';
import camisaSeguridad from './top/camisa-seguridad.mjs';
import camiseta from './top/camiseta.mjs';
import cardigan from './top/cardigan.mjs';
import chaquetaCapucha from './top/chaqueta-capucha.mjs';
import chaquetaJean from './top/chaqueta-jean.mjs';
import polo from './top/polo.mjs';
import sudadera from './top/sudadera.mjs';
import sueter from './top/sueter.mjs';
import uniformeClinico from './top/uniforme-clinico.mjs';
import uniformePsicologia from './top/uniforme-psicologia.mjs';

export const PIECES = Object.freeze([
  // pelo
  afro,
  bobFlequillo,
  colaCaballo,
  cortoLiso,
  cortoRizado,
  largoSuelto,
  mediaMelena,
  mono,
  rapado,
  trenza,
  // rostro
  maduro,
  sereno,
  // arriba
  blazer,
  blusa,
  camisa,
  camisaSeguridad,
  camiseta,
  cardigan,
  chaquetaCapucha,
  chaquetaJean,
  polo,
  sudadera,
  sueter,
  uniformeClinico,
  uniformePsicologia,
  // capas
  bata,
  bataPsicologia,
  // abajo
  faldaLarga,
  faldaRodilla,
  jean,
  jogger,
  pantalon,
  pantalonUniforme,
  // calzado
  botines,
  tenis,
  zapatos,
  // accesorios
  gafas,
  gafete,
]);
