import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { roleLabel } from '../../shared/ui/labels';
import { UiGlassBar } from '../../shared/ui/glass-bar/ui-glass-bar';
import { UiMenu, UiMenuItem } from '../../shared/ui/menu/ui-menu';

type BenchRole = 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN';

interface BenchItem { label: string; fold: boolean; }

/** Destinos de cada rol con su plegado (plan visual §2.8, D3). F3-3 los sustituye por NAV_ITEMS. */
const ITEMS: Record<BenchRole, BenchItem[]> = {
  ESTUDIANTE: [
    { label: 'Panel', fold: false },
    { label: 'Simulador', fold: false },
    { label: 'Mi personaje', fold: false },
  ],
  PROFESOR: [
    { label: 'Panel', fold: false },
    { label: 'Simulador', fold: false },
    { label: 'Trazabilidad', fold: false },
    { label: 'Rúbricas', fold: true },
    { label: 'Grupos', fold: true },
    { label: 'Reportes', fold: true },
  ],
  ADMIN: [
    { label: 'Panel', fold: false },
    { label: 'Simulador', fold: false },
    { label: 'Mi personaje', fold: true },
    { label: 'Trazabilidad', fold: false },
    { label: 'Rúbricas', fold: true },
    { label: 'Editar casos', fold: false },
    { label: 'Usuarios', fold: true },
  ],
};

const ACCOUNT_MENU: UiMenuItem[] = [{ value: 'salir', label: 'Cerrar sesión', icon: 'logout', tone: 'danger' }];

/**
 * Banco de pruebas de la barra de vidrio modular (plan visual F3-1; paso 4 de la skill): la barra con el contenido
 * de cada rol (`?rol=ESTUDIANTE|PROFESOR|ADMIN`) sobre una página larga con color y rayas, para medirla con
 * `medir-barra.cjs`. Solo existe en desarrollo (ruta tras `ngDevMode`; `check-dist-dev-only` lo vigila).
 */
@Component({
  selector: 'app-glass-bar-bench',
  imports: [UiGlassBar, UiMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header ui-glass-bar label="Navegación principal">
      <a class="modulo modulo-logo pulsable ds-motion" href="/dev/barra" aria-label="SIEP: ir al panel">
        <span class="logo-doble ds-motion">
          <span class="logo-doble__completo ds-motion"><span class="logo-doble__marca" aria-hidden="true"></span><span class="logo-doble__nombre">SIEP</span></span>
          <span class="logo-doble__isotipo ds-motion" aria-hidden="true"><span class="logo-doble__marca" aria-hidden="true"></span></span>
        </span>
      </a>
      <div class="modulo modulo-principal ds-motion">
        @for (item of items(); track item.label; let first = $first) {
          <a class="nav-enlace ds-motion" [class.control-plegable]="item.fold" href="/dev/barra"
            [attr.aria-current]="first ? 'page' : null" (click)="$event.preventDefault()">{{ item.label }}</a>
        }
        <span class="indicador-mas ds-motion" aria-hidden="true">···</span>
      </div>
      <div class="modulo modulo-cuenta ds-motion">
        <span class="cuenta-chip"><span class="cuenta-chip__nombre">Ana María Rodríguez</span><span class="cuenta-chip__rol">{{ roleName() }}</span></span>
        <ui-menu label="Cuenta" icon="account_circle" iconOnly [items]="accountMenu" />
      </div>
    </header>

    <main id="main-content" class="banco" tabindex="-1">
      <section class="banco__hero">
        <h1>Banco de la barra</h1>
        <p>Desplázate: arriba es una píldora; al bajar se quiebra en tres cápsulas y con el cursor en la franja vuelve lo plegado.</p>
      </section>
      <div class="banco__rayas" aria-hidden="true"></div>
      @for (section of sections; track section) {
        <section class="banco__bloque">
          <h2>Bloque {{ section }}</h2>
          <p>Contenido de muestra para desplazar la página. El vidrio deja ver lo que pasa debajo sin apilarse: nunca hay dos desenfoques a la vez.</p>
          <p>Las cápsulas caen 6 px y se separan 12 px con el resorte suave; el logotipo cede al isotipo con el resorte vivo.</p>
        </section>
        <div class="banco__rayas" aria-hidden="true"></div>
      }
    </main>
  `,
  styles: [`
    .banco { display: block; }
    .banco:focus { outline: none; }
    .banco__hero {
      display: grid;
      place-content: center;
      min-height: 100svh;
      padding: 8rem 2rem 4rem;
      text-align: center;
      background:
        radial-gradient(40rem 30rem at 20% 10%, var(--ds-accent-sim), transparent 60%),
        radial-gradient(40rem 30rem at 80% 0%, var(--ds-primary), transparent 60%),
        radial-gradient(30rem 30rem at 50% 60%, var(--ds-warning-bg), transparent 60%),
        var(--ds-surface-page);
    }
    .banco__hero h1 { margin: 0; color: var(--ds-text-1); font-size: var(--ds-type-display-size); }
    .banco__bloque { max-width: 48rem; margin: 0 auto; padding: 3rem 1.5rem; line-height: 1.7; }
    .banco__rayas {
      height: 12rem;
      background: repeating-linear-gradient(90deg, var(--ds-text-1) 0 6px, var(--ds-surface-1) 6px 12px);
    }
  `],
})
export class GlassBarBenchComponent {
  private readonly role = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map(params => {
      const role = params.get('rol');
      return role === 'ESTUDIANTE' || role === 'PROFESOR' ? role : 'ADMIN';
    })),
    { initialValue: 'ADMIN' as BenchRole },
  );

  protected readonly items = computed(() => ITEMS[this.role()]);
  protected readonly roleName = computed(() => roleLabel(this.role()));
  protected readonly accountMenu = ACCOUNT_MENU;
  protected readonly sections = [1, 2, 3, 4, 5, 6];
}
