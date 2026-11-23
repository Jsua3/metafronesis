import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './core/auth/auth.service';
import { authGuard, passwordChangeGuard, roleGuard } from './core/auth/auth.guard';
import { canLeaveGuard } from './core/navigation/can-leave.guard';
import { caseUnlockedGuard } from './features/simulator/case-unlocked.guard';
import { rolesFor } from './shared/layout/nav-items';

/**
 * Rutas de solo desarrollo (plan visual F0-4): la condición va escrita aquí, envolviendo el `import()`,
 * para que el build de producción (ngDevMode = false) la pliegue y no emita el chunk; `npm run build`
 * lo comprueba con scripts/ui/check-dist-dev-only.mjs.
 */
const DEV_ONLY_ROUTES: Routes = (typeof ngDevMode === 'undefined' || ngDevMode)
  ? [{
      path: 'dev/ui',
      title: 'Galería de componentes',
      loadComponent: () => import('./dev/ui-gallery/ui-gallery.component').then(m => m.UiGalleryComponent),
    }, {
      path: 'dev/barra',
      title: 'Banco de la barra',
      loadComponent: () => import('./dev/glass-bar-bench/glass-bar-bench.component').then(m => m.GlassBarBenchComponent),
    }]
  : [];

function destinoInicial(): string {
  const rol = inject(AuthService).currentUser()?.role;
  return rol === 'ADMIN' ? '/portal/admin/usuarios' : rol === 'PROFESOR' ? '/portal/grupos' : '/portal/dashboard';
}

export const routes: Routes = [
  {
    path: '',
    title: 'Inicio',
    loadComponent: () => import('./features/public/landing.component').then(m => m.LandingComponent)
  },
  {
    path: 'login',
    title: 'Iniciar sesión',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent)
  },
  {
    // E2-9 (RN-10): fuera del portal (sin barra ni destinos que el servidor negaría con la contraseña temporal).
    path: 'cambiar-contrasena',
    title: 'Cambia tu contraseña',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/change-password.component').then(m => m.ChangePasswordComponent)
  },
  {
    path: 'portal',
    title: 'Portal',
    canActivate: [authGuard, passwordChangeGuard],
    loadComponent: () => import('./shared/layout/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => destinoInicial() },
      {
        // SIEP-239: el inicio del estudiante (sus casos, su siguiente paso y su recorrido). Los demás roles siguen a su destino.
        path: 'dashboard',
        pathMatch: 'full',
        title: 'Inicio',
        canMatch: [() => inject(AuthService).currentUser()?.role === 'ESTUDIANTE'],
        loadComponent: () => import('./features/dashboard/student-dashboard.component').then(m => m.StudentDashboardComponent)
      },
      { path: 'dashboard', pathMatch: 'full', redirectTo: () => destinoInicial() },
      {
        // ED-5: solo el estudiante juega (`attempt.play`); al resto el servidor le responde 403.
        path: 'jugar',
        title: 'Sala de simulación',
        data: { chrome: 'hidden' },
        canActivate: [roleGuard('ESTUDIANTE')],
        loadComponent: () => import('./features/simulator/game-menu.component').then(m => m.GameMenuComponent)
      },
      {
        path: 'simulador',
        title: 'Casos',
        canActivate: [roleGuard(...rolesFor('simulador'))],
        loadComponent: () => import('./features/simulator/simulation-catalog.component').then(m => m.SimulationCatalogComponent)
      },
      {
        // F10-1 (C8, RF-16): la ficha del caso se lee antes de empezar y no crea el intento; «Comenzar» abre el juego.
        path: 'simulador/:caseVersionId/ficha',
        title: 'Ficha del caso',
        canActivate: [roleGuard('ESTUDIANTE')],
        loadComponent: () => import('./features/simulator/case-brief.component').then(m => m.CaseBriefComponent)
      },
      {
        // DP-13: el cierre del caso es una página del portal, con URL estable (se vuelve a ella desde Casos y desde el resultado del juego).
        path: 'simulador/:caseVersionId/cierre/:attemptId',
        title: 'Cierre del caso',
        canActivate: [roleGuard('ESTUDIANTE')],
        loadComponent: () => import('./features/simulator/cierre/cierre-caso.component').then(m => m.CierreCasoComponent)
      },
      {
        path: 'simulador/:caseVersionId',
        title: 'Simulación',
        data: { chrome: 'hidden' },
        canActivate: [roleGuard('ESTUDIANTE'), caseUnlockedGuard],
        loadComponent: () => import('./features/simulator/simulation-play.component').then(m => m.SimulationPlayComponent)
      },
      {
        path: 'personaje',
        title: 'Mi personaje',
        canActivate: [roleGuard(...rolesFor('personaje'))],
        canDeactivate: [canLeaveGuard],
        loadComponent: () => import('./features/character/character-editor.component').then(m => m.CharacterEditorComponent)
      },
      {
        // E2-10 (C5): el estudiante acepta, rechaza o deja los grupos a los que lo invitan.
        path: 'invitaciones',
        title: 'Tus grupos',
        canActivate: [roleGuard(...rolesFor('invitaciones'))],
        loadComponent: () => import('./features/invitations/invitations.component').then(m => m.InvitationsComponent)
      },
      {
        path: 'grupos',
        title: 'Grupos',
        canActivate: [roleGuard(...rolesFor('grupos'))],
        loadComponent: () => import('./features/grupos/grupo-list.component').then(m => m.GrupoListComponent)
      },
      {
        // DP-18: el detalle de un grupo tiene ruta propia (atrás funciona y el Inicio docente enlaza directo). Carga el
        // MISMO componente, que lee `grupoId` con withComponentInputBinding.
        path: 'grupos/:grupoId',
        title: 'Grupos',
        canActivate: [roleGuard(...rolesFor('grupos'))],
        loadComponent: () => import('./features/grupos/grupo-list.component').then(m => m.GrupoListComponent)
      },
      {
        path: 'admin/usuarios',
        title: 'Usuarios',
        canActivate: [roleGuard(...rolesFor('usuarios'))],
        loadComponent: () => import('./features/admin/users.component').then(m => m.UsersComponent)
      },
      {
        // DP-22: cambiar la contraseña por gusto, dentro del portal y desde el menú de cuenta. El MISMO componente que el
        // cambio obligatorio (`/cambiar-contrasena`, fuera del portal); `modo` le llega desde `data`.
        path: 'cuenta/contrasena',
        title: 'Cambiar contraseña',
        data: { modo: 'voluntario' },
        loadComponent: () => import('./features/account/change-password.component').then(m => m.ChangePasswordComponent)
      },
      {
        // Plan visual F4-3: adonde manda roleGuard al negar una sección (antes, al panel en silencio).
        path: 'sin-permiso',
        title: 'Sin permiso',
        loadComponent: () => import('./features/public/forbidden.component').then(m => m.ForbiddenComponent)
      },
      {
        path: '**',
        title: 'Página no encontrada',
        loadComponent: () => import('./features/public/not-found.component').then(m => m.NotFoundComponent)
      }
    ]
  },
  {
    // Plan visual F4-3: sin red, una navegación que no pudo descargar su código llega aquí (offline-navigation.ts).
    // Se PRECARGA con red tras la primera navegación (PreloadMarkedRoutes): sin red ya está lista, y el bundle
    // inicial no crece (importarla directa le sumaba ~80 kB).
    path: 'sin-conexion',
    title: 'Sin conexión',
    data: { precargar: true },
    loadComponent: () => import('./features/public/offline.component').then(m => m.OfflineComponent)
  },
  { path: 'dashboard', redirectTo: 'portal/dashboard', pathMatch: 'full' },
  { path: 'grupos', redirectTo: 'portal/grupos', pathMatch: 'full' },
  { path: 'usuarios', redirectTo: 'portal/admin/usuarios', pathMatch: 'full' },
  ...DEV_ONLY_ROUTES,
  // Plan visual F3-6: una dirección desconocida muestra la 404 (antes redirigía en silencio al panel).
  {
    path: '**',
    title: 'Página no encontrada',
    data: { fueraDelPortal: true },
    loadComponent: () => import('./features/public/not-found.component').then(m => m.NotFoundComponent)
  }
];
