/**
 * Ruta a la que vuelve el acceso tras iniciar sesión (plan visual F3-6, H-34). Solo rutas internas absolutas: empieza
 * por «/» pero no por «//» ni «/\» (protocolo relativo: el navegador lo leería como otro dominio), sin caracteres de
 * control ni espacios al borde, con escapes % válidos (uno roto hace que el Router caiga a la portada) y nunca el
 * propio /login (tampoco con matriz «;»). Lo demás devuelve null y el acceso va al panel.
 */
export function safeReturnUrl(value: string | null | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (/^\/login(?:[/?#;]|$)/.test(value)) return null;
  try {
    decodeURI(value);
  } catch {
    return null;
  }
  return value;
}
