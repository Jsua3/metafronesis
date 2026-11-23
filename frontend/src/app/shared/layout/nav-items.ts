/**
 * Navegación del portal (plan visual F3-3; rediseño 2026-11-21, DISENO §3.2). ÚNICA fuente del menú y de los roles de
 * los guards de `app.routes.ts` (gancho de RF-02 y RNF-002: antes el menú y los permisos se calculaban por separado).
 *
 * Etiquetas que dicen la tarea y no la herramienta (DP-05): «Inicio», «Casos», «Revisión», «Grupos». El estudiante ya
 * no ve «Simulador» (piensa en su caso) y el docente y el administrador tampoco (desde ED-5 no juegan; la ruta sigue
 * abierta por URL, solo sale del menú).
 *
 * `fold` dice para qué roles el destino es secundario: en la barra de vidrio se pliega al desplazarse y vuelve con el
 * cursor o con Tab; en el móvil va a la hoja «Más». El docente pliega Reportes y Rúbricas; el administrador, Revisión y
 * Rúbricas; el estudiante, nada. «Usuarios» ya no se pliega: es la tarea principal del administrador.
 *
 * `order` es el orden por defecto; `orden` lo corrige para un rol cuando los subconjuntos de dos roles piden órdenes
 * distintos (el docente revisa antes de editar casos; el administrador edita casos antes de revisar).
 *
 * Los roles de cada destino son un subconjunto de la matriz de políticas del servidor
 * (`backend_django/shared/policy-matrix.json`; nav-items.spec lo comprueba).
 */
export type UserRole = 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE';

export interface NavItem {
  id: string;
  label: string;
  /** Rótulo de la pestaña inferior cuando el de la barra no cabe a 390 px («Mi personaje» → «Personaje»). */
  etiquetaCorta?: string;
  route: string;
  icon: string;
  roles: readonly UserRole[];
  fold: readonly UserRole[];
  order: number;
  /** Orden propio de un rol (pisa `order` solo para él). */
  orden?: Partial<Record<UserRole, number>>;
}

export const NAV_ITEMS: readonly NavItem[] = [
  // SIEP-239: el estudiante vuelve a tener su inicio, sus casos y su personaje.
  { id: 'panel', label: 'Inicio', route: '/portal/dashboard', icon: 'home', roles: ['ESTUDIANTE'], fold: [], order: 5 },
  { id: 'simulador', label: 'Casos', route: '/portal/simulador', icon: 'play_circle', roles: ['ESTUDIANTE'], fold: [], order: 25 },
  { id: 'personaje', label: 'Mi personaje', etiquetaCorta: 'Personaje', route: '/portal/personaje', icon: 'face', roles: ['ESTUDIANTE'], fold: [], order: 28 },
  { id: 'usuarios', label: 'Usuarios', route: '/portal/admin/usuarios', icon: 'manage_accounts', roles: ['ADMIN'], fold: [], order: 10 },
  { id: 'grupos', label: 'Grupos', route: '/portal/grupos', icon: 'groups', roles: ['PROFESOR'], fold: [], order: 20 },
  { id: 'invitaciones', label: 'Grupos', route: '/portal/invitaciones', icon: 'groups', roles: ['ESTUDIANTE'], fold: [], order: 30 },
];

/** Posición del destino para un rol. */
export function ordenPara(item: NavItem, role: UserRole): number {
  return item.orden?.[role] ?? item.order;
}

/** Destinos del rol, en su orden. Sin rol (sesión aún sin usuario): ninguno. */
export function navItemsFor(role: UserRole | string | null | undefined): NavItem[] {
  if (!role) return [];
  const rol = role as UserRole;
  return NAV_ITEMS.filter(item => item.roles.includes(rol)).sort((a, b) => ordenPara(a, rol) - ordenPara(b, rol));
}

/** Roles con acceso a un destino, para `roleGuard(...rolesFor(id))`. Un id desconocido es un error de programación. */
export function rolesFor(id: string): UserRole[] {
  const item = NAV_ITEMS.find(entry => entry.id === id);
  if (!item) throw new Error(`Destino de navegación desconocido: «${id}»`);
  return [...item.roles];
}
