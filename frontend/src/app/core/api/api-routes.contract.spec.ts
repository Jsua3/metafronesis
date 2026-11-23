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

/**
 * Rutas del editor que llegan con el PR #55 (SIEP-238) y aún no están en develop: llegan con el PR #55 (SIEP-238).
 * Mientras falten no se exigen; la prueba de abajo FALLA cuando ya existan, para sacarlas de esta lista.
 */
const PENDIENTES_PR55: readonly string[] = [
  'api/authoring/cases/ID/characters',
  'api/authoring/cases/ID/characters/ID',
  'api/authoring/cases/ID/checklist',
  'api/authoring/cases/ID/decisions/ID/accept-ai',
  'api/authoring/cases/ID/dialogues/ID',
  'api/authoring/cases/ID/dialogues/ID/accept-ai',
  'api/authoring/cases/ID/editor',
  'api/authoring/cases/ID/hints/ID',
  'api/authoring/cases/ID/maps',
  'api/authoring/cases/ID/maps/ID',
  'api/authoring/cases/ID/maps/ID/dialogues',
  'api/authoring/cases/ID/maps/ID/hints',
  'api/authoring/cases/ID/maps/ID/objects',
  'api/authoring/cases/ID/nodes/ID/accept-ai',
  'api/authoring/cases/ID/objects/ID',
  'api/authoring/cases/ID/objects/ID/accept-ai',
  'api/authoring/cases/ID/plan',
  'api/authoring/cases/ID/rubric',
  'api/authoring/cases/ID/rules/endings',
  'api/authoring/cases/ID/rules/milestones',
  'api/authoring/cases/ID/rules/risk',
  'api/authoring/cases/ID/tools',
  'api/authoring/cases/ID/tools/ID',
  'api/authoring/cases/ID/world',
];

const API_DIR = join(__dirname);
const CLIENT_FILES = [
  ...readdirSync(API_DIR)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map(name => join(API_DIR, name)),
  join(__dirname, '..', 'auth', 'auth.service.ts'),
];

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

  const existe = (url: string) => routes.some(route => routePattern(route).test(url));

  it.each(PENDIENTES_PR55.map(url => [url]))('«%s» llega con el PR #55 (SIEP-238): cuando ya exista, quítala de PENDIENTES_PR55', url => {
    expect(existe(url), `${url} ya está en las rutas de Django: quítala de PENDIENTES_PR55`).toBe(false);
  });

  it.each(used.filter(({ url }) => !PENDIENTES_PR55.includes(url)).map(({ file, url }) => [file.split(/[\\/]/).pop(), url]))(
    '%s pide «%s», que casa con una ruta declarada (sin barra final de más ni de menos)',
    (_file, url) => {
      expect(routes.some(route => routePattern(route).test(url!)), `${url} no está en las rutas de Django`).toBe(true);
    },
  );
});
