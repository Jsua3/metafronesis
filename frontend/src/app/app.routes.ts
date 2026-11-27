import { Routes } from '@angular/router';
import { authGuard, passwordChangeGuard } from './core/auth/auth.guard';

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
    // El enlace del correo de «¿Olvidaste tu contraseña?»: público, fuera del portal.
    path: 'restablecer-contrasena',
    title: 'Restablece tu contraseña',
    loadComponent: () => import('./features/account/reset-password.component').then(m => m.ResetPasswordComponent)
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
    loadChildren: () => import('./portal.routes').then(m => m.portalRoutes)
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
  { path: 'docente', redirectTo: 'portal/docente/trazabilidad', pathMatch: 'full' },
  { path: 'rubricas', redirectTo: 'portal/rubricas', pathMatch: 'full' },
  { path: 'reportes', redirectTo: 'portal/reportes', pathMatch: 'full' },
  { path: 'grupos', redirectTo: 'portal/grupos', pathMatch: 'full' },
  { path: 'casos', redirectTo: 'portal/casos', pathMatch: 'full' },
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
