/**
 * Contratos de texto compartidos por los specs de orientación (SOLO pruebas).
 * Un texto visible de orientación: sin claves internas, con tildes, sin vocabulario de logro
 * ni de respuesta clínica, y sin nombres de herramienta.
 */

/** Técnicas y nombres de herramienta: no deben verse en un texto genérico de orientación. */
export const TOOL_VOCAB = /PAP|SPIKES|RISK_METER|EPICEE|Primeros Auxilios|Valoraci[oó]n de riesgo|\bKit\b/;

/** Una clave interna: palabras en minúscula unidas por guion, prefijos de clave o arroba. */
export const SLUG = /[a-z]+-[a-z]+|npc:|tool:|inspected:|@/;

/** F§9.1: vocabulario que insinuaría la respuesta clínica o la técnica. */
export const CLINICAL_VOCAB =
  /\b(PAP|SPIKES|EPICEE|Primeros Auxilios|valoraci[oó]n (estructurada )?de riesgo|medidas de protecci[oó]n|mediaci[oó]n|perd[oó]n|psicoterapia|interrog|adecuad|correct|recomendad[ao] cl[ií]nic|logr|complet(ad|a tu)|punto|contenci[oó]n|estabiliz)/i;

/** Lenguaje de victoria, puntaje o juego sobre el duelo (límite de producto 2). */
export const ACHIEVEMENT_VOCAB = /completad|bien hecho|¡|!|\bpuntos?\b|puntaje|logro|misi[oó]n|\bgan(aste|ar)\b|victoria/i;

/** Palabras que en español llevan tilde y suelen escribirse sin ella (la forma correcta no coincide). */
export const MISSING_TILDE = /\b(accion|decision|informacion|psicologa|medico|bitacora|comisaria|recepcion|proteccion|atencion|orientacion|valoracion|situacion|estres|institucion|quirofano|juridica|conversacion|intervencion|ubicacion|direccion)\b/i;

export interface TextContract {
  /** true en los textos que pueden nombrar una herramienta (los `labelNamed`). */
  allowToolNames?: boolean;
  /** true en los textos que pueden usar vocabulario clínico por ser un nombre del mundo (p. ej. «Valoración de riesgo»). */
  allowClinicalNames?: boolean;
}

/** Devuelve las infracciones de un texto visible (vacío = limpio). */
export function textViolations(text: string, opts: TextContract = {}): string[] {
  const found: string[] = [];
  if (SLUG.test(text)) found.push(`clave interna: «${text}»`);
  if (!opts.allowToolNames && TOOL_VOCAB.test(text)) found.push(`nombra una herramienta: «${text}»`);
  if (!opts.allowClinicalNames && !opts.allowToolNames && CLINICAL_VOCAB.test(text)) found.push(`vocabulario clínico: «${text}»`);
  if (ACHIEVEMENT_VOCAB.test(text)) found.push(`lenguaje de logro: «${text}»`);
  if (MISSING_TILDE.test(text)) found.push(`falta una tilde: «${text}»`);
  if (/\s{2,}|\s[.,;:]/.test(text)) found.push(`espaciado raro: «${text}»`);
  if (/^\s|\s$/.test(text)) found.push(`espacios al borde: «${text}»`);
  return found;
}

/** Aplana una estructura (objetos, listas) a las cadenas que contiene. */
export function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}
