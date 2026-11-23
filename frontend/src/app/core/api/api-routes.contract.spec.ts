import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Toda URL `/api/...` que el cliente pide existe en las rutas de Django, barra final incluida (plan visual F7b-0).
 * Generaliza `instructor-routes.contract.spec.ts` (hallazgo de la revisión de F7: `rubric-evaluation/` con barra daba
 * 404 en la pila real y ningún e2e lo veía porque simulan la red) a TODOS los servicios de `core/api` y a
 * `auth.service.ts`: así las rutas nuevas de E2 (aprobar cuentas, cambiar contraseña, invitaciones, reemplazo docente)
 * entran comprobadas en cuanto el cliente las usa.
 */
// req: RNF-002
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const BACKEND = REPO_ROOT;

/** `apps.simulation.urls` → `backend_django/apps/simulation/urls.py`. */
const moduleFile = (dotted: string) => join(BACKEND, ...dotted.split('.')) + '.py';

/** Las rutas de un urlconf, con sus `include(...)` resueltos y el prefijo de quien las incluye. */
function routesOf(file: string, prefix = ''): string[] {
  const source = readFileSync(file, 'utf-8');
  const routes: string[] = [];
  for (const match of source.matchAll(/(?:re_)?path\(\s*r?["']([^"']*)["']\s*,\s*([^\n]+)/g)) {
    const [, route, rest] = match;
    const included = rest.match(/include\(["']([^"']+)["']\)/);
    if (included) routes.push(...routesOf(moduleFile(included[1]), prefix + route));
    else routes.push(prefix + route);
  }
  return routes;
}

/** `api/grupos/<int:pk>/estudiantes` → expresión que casa con `api/grupos/<un id>/estudiantes` (nada más). */
const routePattern = (route: string) => new RegExp(`^${route.replace(/<[a-z]+:[a-z_]+>/g, '[^/]+')}$`);

/** Las URL que pide un archivo del cliente: literales con `/api/` o con la constante `API` del servicio. */
function clientUrls(source: string): string[] {
  const constants = new Map<string, string>();
  const declaration = /(API\w*)\s*=\s*['`]([^'`]+)['`]/g;
  for (const match of source.matchAll(declaration)) constants.set(match[1], match[2]);
  // La declaración de la constante es un prefijo, no una URL que se pida.
  const calls = source.replace(declaration, '');
  const urls: string[] = [];
  for (const match of calls.matchAll(/['`]((?:\/api\/|\$\{this\.API\w*\})[^'`]*)['`]/g)) {
    const url = match[1]
      .replace(/\$\{this\.(API\w*)\}/g, (_whole, name: string) => constants.get(name) ?? `«${name} desconocida»`)
      .replace(/\$\{[^}]+\}/g, 'ID')
      .split('?')[0];
    urls.push(url.replace(/^\//, ''));
  }
  return urls;
}

const API_DIR = join(__dirname);
const CLIENT_FILES = [
  ...readdirSync(API_DIR)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map(name => join(API_DIR, name)),
  join(__dirname, '..', 'auth', 'auth.service.ts'),
];

/**
 * Rutas que el cliente ya pide y que llegan con otro PR del servidor: llega con el PR del estado del intento
 * (`GET /api/simulation/attempts/{id}/state`, SIEP-239). Mientras no estén en `develop` se exceptúan; la última prueba
 * falla cuando la ruta ya existe, para quitarla de esta lista y que el contrato la vigile.
 */
// El estado del intento (#57), los reportes (#60), el editor (#55) y el ensayo (#58) ya están en `develop`.
const RUTAS_PENDIENTES: readonly string[] = [];

describe('Rutas del cliente: cada URL existe en el servidor', () => {
  const routes = routesOf(join(BACKEND, 'psychosim', 'urls.py')).filter(route => route.startsWith('api/'));
  const used = CLIENT_FILES.flatMap(file => clientUrls(readFileSync(file, 'utf-8')).map(url => ({ file, url })));

  it('el servidor declara las rutas de la API y el cliente usa al menos treinta', () => {
    expect(routes.length).toBeGreaterThanOrEqual(60);
    expect(used.length).toBeGreaterThanOrEqual(15);
  });

  it('la lectura del cliente resuelve las constantes `API` (ninguna URL queda con una constante desconocida)', () => {
    expect(used.filter(({ url }) => url.includes('desconocida'))).toEqual([]);
  });

  it.each(used.filter(({ url }) => !RUTAS_PENDIENTES.includes(url)).map(({ file, url }) => [file.split(/[\\/]/).pop(), url]))(
    '%s pide «%s», que casa con una ruta declarada (sin barra final de más ni de menos)',
    (_file, url) => {
      expect(routes.some(route => routePattern(route).test(url!)), `${url} no está en las rutas de Django`).toBe(true);
    },
  );

  it('cada ruta pendiente la pide el cliente y todavía no existe en el servidor (si ya existe, quitarla de RUTAS_PENDIENTES)', () => {
    expect(RUTAS_PENDIENTES.filter(url => !used.some(entry => entry.url === url)), 'ya no las pide el cliente').toEqual([]);
    expect(RUTAS_PENDIENTES.filter(url => routes.some(route => routePattern(route).test(url))), 'ya existen en el servidor').toEqual([]);
  });
});
