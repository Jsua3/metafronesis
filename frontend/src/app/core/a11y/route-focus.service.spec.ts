import { ApplicationRef, Component, afterNextRender, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';

import { ROUTE_LOADING_TEXT, ROUTE_SLOW_ANNOUNCE_MS, RouteFocusService } from './route-focus.service';

@Component({
  imports: [RouterOutlet],
  template: `
    <header><a class="menu" href="#" (click)="$event.preventDefault()">Menú</a></header>
    <main id="main-content"><router-outlet /></main>
  `,
})
class Host {}

@Component({ template: '<h1>Uno</h1><button class="control">Acción</button>' })
class Uno {}

@Component({ template: '<h1>Dos</h1><a class="enlace" href="#" (click)="$event.preventDefault()">Ir</a>' })
class Dos {}

@Component({ template: '<p>Sin encabezado</p>' })
class SinEncabezado {}

/** Una pantalla que lleva el foco a su propio campo (como el formulario de acceso). */
@Component({ template: '<h1>Acceso</h1><input class="campo" />' })
class ConCampo {
  constructor() {
    afterNextRender(() => document.querySelector<HTMLInputElement>('.campo')?.focus());
  }
}

/**
 * Foco y anuncio al cambiar de pantalla (P10; WCAG 2.4.3 y 4.1.3): el foco llega al `h1` de la pantalla nueva en vez de
 * quedarse en el menú o caer en `<body>`.
 */
// req: RNF-004 (orden y retorno de foco entre pantallas)
describe('RouteFocusService', () => {
  let router: Router;

  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve));
    TestBed.inject(ApplicationRef).tick();
    await new Promise(resolve => setTimeout(resolve));
  };

  async function arrancar(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'uno', component: Uno },
          { path: 'dos', component: Dos },
          { path: 'sin-h1', component: SinEncabezado, title: 'Pantalla sin encabezado' },
          { path: 'juego', component: Dos, data: { chrome: 'hidden' } },
          { path: 'acceso', component: ConCampo },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    TestBed.inject(RouteFocusService);
    router = TestBed.inject(Router);
    await router.navigateByUrl('/uno');
    await settle();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    document.querySelectorAll('app-root, header, main').forEach(node => node.remove());
  });

  it('la primera carga no mueve el foco: el primer tabulador sigue siendo «Saltar al contenido»', async () => {
    await arrancar();
    expect(document.activeElement).toBe(document.body);
  });

  it('al cambiar de pantalla lleva el foco al h1 (con tabindex -1) aunque estuviera en el menú', async () => {
    await arrancar();
    document.querySelector<HTMLElement>('.menu')!.focus();
    await router.navigateByUrl('/dos');
    await settle();
    const h1 = document.querySelector<HTMLElement>('main h1')!;
    expect(h1.textContent).toBe('Dos');
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute('tabindex')).toBe('-1');
  });

  it('si el foco estaba en un control de la pantalla que se va (y ya no existe), no cae en <body>', async () => {
    await arrancar();
    document.querySelector<HTMLElement>('.control')!.focus();
    await router.navigateByUrl('/dos');
    await settle();
    expect(document.activeElement).toBe(document.querySelector('main h1'));
  });

  it('solo cambia la consulta o el fragmento: el foco se queda donde está', async () => {
    await arrancar();
    await router.navigateByUrl('/dos');
    await settle();
    const enlace = document.querySelector<HTMLElement>('.enlace')!;
    enlace.focus();
    await router.navigateByUrl('/dos?pagina=2#tabla');
    await settle();
    expect(document.activeElement).toBe(enlace);
  });

  it('en el juego (chrome oculto) no toca el foco: la pantalla lleva el suyo', async () => {
    await arrancar();
    document.querySelector<HTMLElement>('.menu')!.focus();
    await router.navigateByUrl('/juego');
    await settle();
    expect(document.activeElement).toBe(document.querySelector('.menu'));
  });

  it('respeta el foco que la pantalla nueva puso en un control suyo (formulario de acceso)', async () => {
    await arrancar();
    await router.navigateByUrl('/acceso');
    await settle();
    expect(document.activeElement).toBe(document.querySelector('.campo'));
  });

  it('sin h1 lleva el foco a <main> y anuncia el título de la pestaña', async () => {
    await arrancar();
    await router.navigateByUrl('/sin-h1');
    await settle();
    expect(document.activeElement).toBe(document.getElementById('main-content'));
    await new Promise(resolve => setTimeout(resolve, 120));
    expect(document.querySelector('[data-live-region="polite"]')!.textContent).toBe('Pantalla sin encabezado');
  });

  it('una navegación lenta se anuncia («Cargando la página…») y una rápida no', async () => {
    await arrancar();
    vi.useFakeTimers();
    try {
      let liberar: () => void = () => undefined;
      const demora = new Promise<void>(resolve => { liberar = resolve; });
      router.resetConfig([
        { path: 'lenta', component: Dos, canActivate: [() => demora.then(() => true)] },
        { path: 'rapida', component: Dos },
      ]);
      const polite = () => document.querySelector('[data-live-region="polite"]')!.textContent;

      const lenta = router.navigateByUrl('/lenta');
      await vi.advanceTimersByTimeAsync(ROUTE_SLOW_ANNOUNCE_MS + 100);
      expect(polite()).toBe(ROUTE_LOADING_TEXT);
      liberar();
      await lenta;

      await vi.advanceTimersByTimeAsync(20_000);
      expect(polite()).toBe('');
      await router.navigateByUrl('/rapida');
      await vi.advanceTimersByTimeAsync(ROUTE_SLOW_ANNOUNCE_MS + 100);
      expect(polite()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});
