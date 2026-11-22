/** Origen contra el que se resuelven las URL relativas; sin `location` (prueba de Node) cae a uno fijo. */
function currentOrigin(): string {
  return typeof location !== 'undefined' && location.origin ? location.origin : 'http://localhost';
}

/**
 * S1-4: el token solo viaja a la propia API (`/api/…` del mismo origen). Una URL absoluta de un tercero, una
 * protocolo-relativa (`//otro.sitio/api/…`) o cualquier ruta que no sea de la API no lo reciben: hoy todas las
 * llamadas son relativas, y así una integración futura no enviaría el JWT de 8 horas a otro dominio.
 */
export function isSameOriginApiUrl(url: string): boolean {
  const origin = currentOrigin();
  try {
    const parsed = new URL(url, origin);
    return parsed.origin === origin && parsed.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}
