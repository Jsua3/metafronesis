/**
 * Muestras: cada pieza del kit puesta sobre una receta base, en cada
 * complexión. El validador y las láminas las usan para probar piezas que
 * todavía no lleva ninguna receta fija («toda pieza funciona en A y en B»).
 */

/** Receta base de las muestras: la ropa de Valentina con colores neutros. */
export const SAMPLE_BASE = Object.freeze({
  pieces: { hair: 'bob-flequillo', face: 'sereno', top: 'chaqueta-capucha', bottom: 'jean', shoes: 'tenis', accessories: [] },
  colors: {
    skin: 'piel-3', hair: 'castano-oscuro', top: 'verde', accent: 'azul', inner: 'blanco',
    layer: 'blanco', bottom: 'marino', shoes: 'carbon', sole: 'gris-claro',
  },
});

/** Receta de muestra de una pieza (`kind:id`) en una complexión. */
export function sampleRecipe(pieceKey, complexion) {
  const [kind, id] = pieceKey.split(':');
  const recipe = structuredClone({ ...SAMPLE_BASE, complexion });
  recipe.id = `muestra-${kind}-${id}-${complexion}`;
  if (kind === 'accessory') recipe.pieces.accessories = [id];
  else recipe.pieces[kind] = id;
  if (kind === 'face') recipe.portraits = ['neutral', 'preocupada', 'triste', 'alegre', 'cautelosa', 'en-crisis'];
  return recipe;
}

/** Todas las muestras del paquete: piezas × complexiones, en orden estable. */
export function sampleRecipes(bundle) {
  const out = [];
  for (const key of Object.keys(bundle.pieces).sort()) {
    for (const complexion of Object.keys(bundle.complexions).sort()) out.push(sampleRecipe(key, complexion));
  }
  return out;
}
