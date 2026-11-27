import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { CLAVE_CUENTAS_RECORDADAS, CuentasRecordadasService } from '../../core/auth/cuentas-recordadas.service';
import { CuentasRecordadasDialogoComponent } from '../../core/auth/cuentas-recordadas-dialogo.component';
import { User } from '../../core/models/user.model';
import { TemaService } from '../../core/tema/tema.service';
import { UiDialog } from '../ui/dialog/ui-dialog';
import { UiMenu } from '../ui/menu/ui-menu';
import { BottomTab } from './bottom-tabs.component';
import { NavBadgesService } from './nav-badges.service';
import { RUTA_CAMBIAR_CONTRASENA, ShellComponent } from './shell.component';

@Component({ template: '<p>pantalla</p>' })
class Screen {}

const user = (role: User['role']): User => ({ id: 1, nombre: 'Ana María', apellido: 'Rodríguez', email: 'ana@cue.edu.co', role });

/**
 * Shell del portal con la barra de vidrio modular (plan visual F3-3). Comportamiento en DOM: destinos y plegado por
 * rol desde NAV_ITEMS, destino activo con aria-current, cuenta con nombre, rol y menú, y sin barra en el juego
 * (`data: { chrome: 'hidden' }`). Sustituye a los contratos que leían la plantilla del menú lateral.
 */
// req: BLOQUE-H (navegación del portal, plan visual F3-3)
describe('ShellComponent: barra de vidrio en el portal', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let router: Router;
  const currentUser = signal<User | null>(user('ESTUDIANTE'));
  const logout = vi.fn();

  const host = () => fixture.nativeElement as HTMLElement;
  const links = () => [...host().querySelectorAll<HTMLAnchorElement>('.modulo-principal a.nav-enlace')];
  const labels = () => links().map(link => link.textContent!.trim());
  const folded = () => links().filter(link => link.classList.contains('control-plegable')).map(link => link.textContent!.trim());
  const sheet = vi.fn();
  const open = vi.fn();
  const tabs = () => [...host().querySelectorAll<HTMLElement>('header.cromo > nav.modulo-inferior .pestana')];
  const tabLabels = () => tabs().map(tab => tab.querySelector('.pestana__rotulo')!.textContent!.trim());

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    currentUser.set(user('ESTUDIANTE'));
    logout.mockReset();
    sheet.mockReset();
    open.mockReset();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          {
            // Sin componente: el shell es el de la prueba, y su router-outlet pinta las pantallas hijas.
            path: 'portal',
            children: [
              { path: 'dashboard', component: Screen },
              { path: 'invitaciones', component: Screen },
              { path: 'simulador', component: Screen },
              { path: 'simulador/:id', component: Screen, data: { chrome: 'hidden' } },
              { path: 'jugar', component: Screen, data: { chrome: 'hidden' } },
              { path: 'casos/nuevo', component: Screen, data: { chrome: 'propio' } },
              { path: 'cuenta/contrasena', component: Screen },
            ],
          },
        ]),
        { provide: AuthService, useValue: { currentUser, logout } },
        { provide: UiDialog, useValue: { sheet, open } },
      ],
    });
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(ShellComponent);
    await go('/portal/dashboard');
  });

  it('pinta la barra (header.cromo) con la navegación principal nombrada', () => {
    const header = host().querySelector('header.cromo');
    expect(header).not.toBeNull();
    expect(header!.querySelector('nav.bandeja')!.getAttribute('aria-label')).toBe('Navegación principal');
  });

  it('el estudiante ve Inicio, Casos, Mi personaje y Grupos, sin plegables, y ningún «Continuar simulación» (T15.4)', () => {
    expect(labels()).toEqual(['Inicio', 'Casos', 'Mi personaje', 'Grupos']);
    expect(folded()).toEqual([]);
    expect(host().textContent).not.toContain('Continuar simulación');
  });

  it('el docente pliega Rúbricas; Inicio, Revisión y Grupos quedan a la vista (DISENO §3.2)', async () => {
    currentUser.set(user('PROFESOR'));
    await fixture.whenStable();
    expect(labels()).toEqual(['Inicio', 'Revisión', 'Casos', 'Sesiones', 'Grupos', 'Reportes', 'Rúbricas']);
    expect(folded()).toEqual(['Reportes', 'Rúbricas']);
  });

  it('cambiar de sesión sin recargar actualiza destinos y plegados (Review Focus 3)', async () => {
    currentUser.set(user('ADMIN'));
    await fixture.whenStable();
    // ED-5 (E2): el administrador no tiene «Mi personaje» (no juega). «Usuarios» ya no se pliega: es su tarea principal.
    expect(labels()).toEqual(['Inicio', 'Usuarios', 'Casos', 'Revisión', 'Reportes', 'Rúbricas']);
    expect(folded()).toEqual(['Revisión', 'Reportes', 'Rúbricas']);
    currentUser.set(user('ESTUDIANTE'));
    await fixture.whenStable();
    expect(labels()).toEqual(['Inicio', 'Casos', 'Mi personaje', 'Grupos']);
    expect(folded()).toEqual([]);
  });

  it('el destino activo lleva aria-current="page" y solo él', async () => {
    await go('/portal/invitaciones');
    const current = links().filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.map(link => link.textContent!.trim())).toEqual(['Grupos']);
  });

  it('debajo de 64rem la navegación principal es la barra inferior (hija directa del header): los destinos que no se pliegan son pestañas', async () => {
    // «Mi personaje» usa su etiqueta corta en la pestaña: a 390 px no se parte en dos líneas.
    expect(tabLabels()).toEqual(['Inicio', 'Casos', 'Personaje', 'Grupos']);
    currentUser.set(user('ADMIN'));
    await fixture.whenStable();
    expect(tabLabels()).toEqual(['Inicio', 'Usuarios', 'Casos', 'Más']);
  });

  it('la cuenta muestra nombre y rol humanizado; su menú dice quién soy, ofrece «Cambiar contraseña» y «Cerrar sesión»', async () => {
    currentUser.set(user('PROFESOR'));
    await fixture.whenStable();
    expect(host().querySelector('.cuenta-chip__nombre')!.textContent!.trim()).toBe('Ana María Rodríguez');
    expect(host().querySelector('.cuenta-chip__rol')!.textContent!.trim()).toBe('Docente');
    const menu = fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
    expect(menu.label()).toBe('Cuenta');
    expect(menu.items().map(item => item.label)).toEqual(['Ana María Rodríguez · Docente', 'Agregar cuenta', 'Cambiar contraseña', 'Cerrar sesión']);
    // La fila de identidad no hace nada (en el teléfono es el único sitio donde se lee el rol).
    expect(menu.items()[0].disabled).toBe(true);
    expect(menu.items().at(-1)!.tone).toBe('danger');
  });

  it('«Cambiar contraseña» del menú de cuenta lleva a la página voluntaria del portal (DP-22)', async () => {
    const menu = fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
    menu.itemSelected.emit('contrasena');
    await fixture.whenStable();
    expect(router.url).toBe(RUTA_CAMBIAR_CONTRASENA);
    expect(logout).not.toHaveBeenCalled();
  });

  it('«Cerrar sesión» del menú de cuenta cierra la sesión', () => {
    const menu = fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
    menu.itemSelected.emit('salir');
    expect(logout).toHaveBeenCalledTimes(1);
  });

  // SIEP-281: «Cambiar de cuenta» con las cuentas recordadas en este navegador.
  describe('cambiar de cuenta', () => {
    const menu = () => fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
    const recordadas = () => TestBed.inject(CuentasRecordadasService);
    const otra = (id: number, rol: User['role'], extra = {}) => ({
      id, nombre: `Luis${id}`, apellido: 'Paz', email: `luis${id}@cue.edu.co`, rol, ultimaVez: new Date(Date.now() + id).toISOString(), ...extra,
    });

    it('sin cuentas guardadas ofrece «Agregar cuenta», sin «Quitar…» ni «olvidar»', () => {
      const items = menu().items();
      expect(items.map(i => i.label)).toEqual(['Ana María Rodríguez · Estudiante', 'Agregar cuenta', 'Cambiar contraseña', 'Cerrar sesión']);
      expect(items[1]).toMatchObject({ value: 'agregar', icon: 'person_add', grupo: 'Cambiar de cuenta' });
    });

    it('muestra una entrada por cuenta guardada distinta de la actual, con rol y correo como detalle', async () => {
      recordadas().recordar(otra(1, 'ESTUDIANTE', { id: 1, nombre: 'Ana María', apellido: 'Rodríguez', email: 'ana@cue.edu.co' }));
      recordadas().recordar(otra(2, 'PROFESOR'));
      await fixture.whenStable();
      const items = menu().items();
      expect(items.map(i => i.label)).toEqual([
        'Ana María Rodríguez · Estudiante', 'Luis2 Paz', 'Agregar cuenta', 'Quitar cuentas de esta lista…',
        'Cambiar contraseña', 'Cerrar sesión', 'Cerrar sesión y olvidar las cuentas',
      ]);
      expect(items[1]).toMatchObject({ value: 'cuenta:2', detalle: 'Docente · luis2@cue.edu.co', grupo: 'Cambiar de cuenta' });
      expect(items.at(-1)!.tone).toBe('danger');
      expect(items.filter(i => i.grupo).map(i => i.value)).toEqual(['cuenta:2', 'agregar', 'quitar']);
    });

    it('elegir una cuenta cierra la sesión y deja su correo en memoria, no en la URL', async () => {
      recordadas().recordar(otra(2, 'PROFESOR'));
      await fixture.whenStable();
      menu().itemSelected.emit('cuenta:2');
      expect(logout).toHaveBeenCalledTimes(1);
      expect(recordadas().correoPorEntrar()).toBe('luis2@cue.edu.co');
      expect(router.url).not.toContain('luis2');
    });

    it('«Agregar cuenta» guarda la actual, cierra sesión y deja el acceso vacío', () => {
      menu().itemSelected.emit('agregar');
      expect(logout).toHaveBeenCalledTimes(1);
      expect(recordadas().cuentas().map(c => c.id)).toEqual([1]);
      expect(recordadas().correoPorEntrar()).toBeNull();
      expect(recordadas().guardarProxima()).toBe(true);
    });

    it('«Quitar cuentas de esta lista…» abre el diálogo compartido', async () => {
      recordadas().recordar(otra(2, 'PROFESOR'));
      await fixture.whenStable();
      menu().itemSelected.emit('quitar');
      expect(open).toHaveBeenCalledTimes(1);
      expect(open.mock.calls[0][0]).toBe(CuentasRecordadasDialogoComponent);
      expect(logout).not.toHaveBeenCalled();
    });

    it('«Cerrar sesión y olvidar las cuentas» cierra sesión y vacía la lista', async () => {
      recordadas().recordar(otra(2, 'PROFESOR'));
      await fixture.whenStable();
      menu().itemSelected.emit('olvidar');
      expect(logout).toHaveBeenCalledTimes(1);
      expect(recordadas().cuentas()).toEqual([]);
      expect(localStorage.getItem(CLAVE_CUENTAS_RECORDADAS)).toBeNull();
    });

    it('una cuenta que ya no está en la lista no hace nada', () => {
      menu().itemSelected.emit('cuenta:99');
      expect(logout).not.toHaveBeenCalled();
    });
  });

  it('la fila de identidad no navega ni cierra la sesión', async () => {
    const menu = fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
    menu.itemSelected.emit('identidad');
    await fixture.whenStable();
    expect(router.url).toBe('/portal/dashboard');
    expect(logout).not.toHaveBeenCalled();
  });

  // req: DP-02, REGLA-010 (la piel vive en el contenedor del shell, nunca en body ni en html)
  describe('piel del portal', () => {
    const tema = () => TestBed.inject(TemaService);
    const pieles = () => [document.body.getAttribute('data-skin'), document.documentElement.getAttribute('data-skin')];

    afterEach(() => tema().fijar('sistema'));

    it('app-shell lleva .portal y la piel del tema elegido; body y html no llevan ninguna', async () => {
      tema().fijar('claro');
      await fixture.whenStable();
      expect(host().classList).toContain('portal');
      expect(host().getAttribute('data-skin')).toBe('portal');
      tema().fijar('oscuro');
      await fixture.whenStable();
      expect(host().getAttribute('data-skin')).toBe('game');
      expect(pieles()).toEqual([null, null]);
      expect(document.body.classList).not.toContain('portal');
      expect(document.documentElement.classList).not.toContain('portal');
    });

    it('elegir otra opción en la cápsula de tema de la barra cambia la piel del shell', async () => {
      tema().fijar('claro');
      await fixture.whenStable();
      const oscuro = host().querySelector<HTMLButtonElement>('.modulo-cuenta app-tema-selector [role="radio"][aria-label="Oscuro"]')!;
      expect(oscuro).not.toBeNull();
      // Plegada, el primer toque abre la cápsula y el segundo elige (como en la portada).
      oscuro.click();
      await fixture.whenStable();
      oscuro.click();
      await fixture.whenStable();
      expect(host().getAttribute('data-skin')).toBe('game');
      expect(pieles()).toEqual([null, null]);
    });

    // EDITOR.md §4.7 (E0): el editor sigue el tema; antes se quedaba en la piel clara.
    it('en el editor de casos (chrome: propio) la piel también sigue el tema', async () => {
      tema().fijar('oscuro');
      await go('/portal/casos/nuevo');
      expect(host().getAttribute('data-skin')).toBe('game');
      tema().fijar('claro');
      await go('/portal/dashboard');
      await go('/portal/casos/nuevo');
      expect(host().getAttribute('data-skin')).toBe('portal');
    });
  });

  // req: DISENO §2.5 C15 (insignias de pendientes)
  describe('insignias de pendientes', () => {
    it('un destino con pendientes muestra la cifra (decorativa) y su texto accesible; la pestaña también', async () => {
      TestBed.inject(NavBadgesService).fijar('invitaciones', 2);
      await fixture.whenStable();
      const grupos = links().find(link => link.getAttribute('href') === '/portal/invitaciones')!;
      expect(grupos.querySelector('.nav-enlace__cuenta')!.textContent).toBe('2');
      expect(grupos.querySelector('.nav-enlace__cuenta')!.getAttribute('aria-hidden')).toBe('true');
      expect(grupos.querySelector('.ds-sr-only')!.textContent).toBe(' (2 pendientes)');
      const pestana = tabs().find(tab => tab.getAttribute('href') === '/portal/invitaciones')!;
      expect(pestana.querySelector('.pestana__cuenta')!.textContent).toBe('2');
    });

    it('al cambiar de persona sin recargar, las insignias de la anterior no se ven (D-16)', async () => {
      TestBed.inject(NavBadgesService).fijar('invitaciones', 2);
      await fixture.whenStable();
      currentUser.set({ ...user('ESTUDIANTE'), id: 2 });
      await fixture.whenStable();
      expect(host().querySelector('.nav-enlace__cuenta')).toBeNull();
    });
  });

  it('el <main> es el destino de «Saltar al contenido principal» (#main-content, enfocable por script) y la barra trae «Saltar a la navegación»', () => {
    const main = host().querySelector('main.portal-main')!;
    expect(main.id).toBe('main-content');
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(host().querySelector('header.cromo')!.firstElementChild!.textContent!.trim()).toBe('Saltar a la navegación');
  });

  it('en el juego el <main> suelta #main-content: el destino es el contenedor del juego (un solo id)', async () => {
    await go('/portal/jugar');
    const main = host().querySelector('main.portal-main')!;
    expect(main.hasAttribute('id')).toBe(false);
    expect(main.hasAttribute('tabindex')).toBe(false);
  });

  // req: REGLA-010 (el CSS del juego no vive en `<body>`: el shell no le pone clases por ruta; F6-1)
  it('en el juego (chrome: hidden) no hay barra, el <main> ocupa la ventana y el <body> no recibe clases', async () => {
    const bodyClasses = () => Array.from(document.body.classList).sort();
    const before = bodyClasses();
    await go('/portal/jugar');
    expect(host().querySelector('header.cromo')).toBeNull();
    expect(host().querySelector('main.portal-main')!.classList).toContain('portal-main--juego');
    expect(bodyClasses()).toEqual(before);
    await go('/portal/simulador/42');
    expect(host().querySelector('header.cromo')).toBeNull();
    expect(bodyClasses()).toEqual(before);
    await go('/portal/dashboard');
    expect(host().querySelector('header.cromo')).not.toBeNull();
    expect(bodyClasses()).toEqual(before);
  });

  // req: RNF-002 (una sola barra en el editor de casos; la página se desplaza, no se recorta)
  it('en una pantalla con barra propia (chrome: propio) no hay barra del portal, el <main> no recorta y no es un hito más', async () => {
    await go('/portal/casos/nuevo');
    expect(host().querySelector('header.cromo')).toBeNull();
    const main = host().querySelector('main.portal-main')!;
    expect(main.classList).toContain('portal-main--propio');
    expect(main.classList).not.toContain('portal-main--juego');
    expect(main.getAttribute('role')).toBe('none');
    expect(main.hasAttribute('id')).toBe(false);
    await go('/portal/dashboard');
    expect(host().querySelector('header.cromo')).not.toBeNull();
    expect(host().querySelector('main.portal-main')!.getAttribute('role')).toBeNull();
  });

});
