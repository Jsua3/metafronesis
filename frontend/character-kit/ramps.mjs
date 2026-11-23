/**
 * Rampas con nombre (luz → base → sombra → profunda), todas sacadas de
 * `palette.v2.json`. El validador comprueba que cada color esté en la paleta
 * y que la luminancia baje de la luz a la profunda.
 */
export const RAMPS = {
  'piel-1': ['#f7dfcc', '#e9bea0', '#cf8f6f', '#a8614c'],
  'piel-2': ['#f0c7a5', '#d99a76', '#b86f52', '#824735'],
  'piel-3': ['#d6a17f', '#b97656', '#92513b', '#623326'],
  'piel-4': ['#c18c6c', '#a0654a', '#7a4634', '#512d23'],
  'piel-5': ['#ad7758', '#87543d', '#623b2d', '#40271f'],
  'piel-6': ['#774a35', '#563223', '#38231d', '#241817'],

  'castano-oscuro': ['#87543d', '#623b2d', '#40271f', '#241817'],

  verde: ['#85b294', '#5b8d70', '#3d6a55', '#29483d'],
  azul: ['#69a2c8', '#3d78a8', '#2c5884', '#203d61'],
  blanco: ['#ffffff', '#f1f2f4', '#d5d9dd', '#a3abb5'],
  marino: ['#2c5884', '#203d61', '#2d2852', '#211e2b'],
  carbon: ['#6c6376', '#494255', '#302a3b', '#211e2b'],
  'gris-claro': ['#d2d2d4', '#adaeb5', '#858690', '#62636c'],

  // pelo
  negro: ['#594957', '#3d3543', '#2a2630', '#211e2b'],
  castano: ['#a06a40', '#7b4a30', '#5c3928', '#40271f'],
  cobrizo: ['#d06c49', '#a84e36', '#79372d', '#552b26'],
  rubio: ['#f0d17a', '#d7a957', '#b7783e', '#8a542f'],
  canoso: ['#d2d2d4', '#adaeb5', '#858690', '#62636c'],

  // ropa
  gris: ['#a3abb5', '#737d8b', '#505866', '#353a46'],
  'gris-oscuro': ['#737d8b', '#505866', '#353a46', '#211e2b'],
  celeste: ['#a2cbe1', '#69a2c8', '#3d78a8', '#2c5884'],
  morado: ['#8a70d3', '#6350a6', '#433878', '#2d2852'],
  coral: ['#d06c49', '#a84e36', '#79372d', '#552b26'],
  mostaza: ['#d7a957', '#b7783e', '#8a542f', '#5c3928'],
  vinotinto: ['#a95366', '#7b3b4c', '#562d3a', '#302a3b'],
  rosa: ['#efb0b8', '#d47b8b', '#a95366', '#7b3b4c'],
  caqui: ['#c08a55', '#a06a40', '#7b4a30', '#5c3928'],
  menta: ['#bad2be', '#85b294', '#5b8d70', '#3d6a55'],
  'verde-azulado': ['#69a2c8', '#5b8d70', '#3d6a55', '#29483d'],
  /** Azul acero del uniforme de Psicología (Universidad Alexander von Humboldt), tomado de la foto. */
  'azul-humboldt': ['#8293ab', '#647690', '#4d5b6f', '#36404f'],
};

/** Colores literales por defecto (ojos, rubor, accesorios); una receta puede cambiarlos con `literals`. */
export const LITERAL_DEFAULTS = {
  eye: '#211e2b',
  blush: '#efb0b8',
  eyeWhite: '#f1f2f4',
  iris: '#623b2d',
  shine: '#ffffff',
  // accesorios
  gafas: '#302a3b',
  gafete: '#f1f2f4',
  gafeteCinta: '#3d78a8',
  /** Bordado del programa en la bata. */
  bordado: '#3d78a8',
};
