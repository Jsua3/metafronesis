import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router,
} from '@angular/router';

import { readRouteChrome } from '../../shared/layout/route-chrome';
import { LiveRegionAnnouncer } from './live-announcer.service';
import { encabezadoPrincipal, enfocarPorPrograma } from './foco.util';

/** Una navegación que tarda más que esto se anuncia («Cargando…»): la línea de progreso es decorativa (`aria-hidden`). */
export const ROUTE_SLOW_ANNOUNCE_MS = 800;
export const ROUTE_LOADING_TEXT = 'Cargando la página…';

function rutaSinConsulta(url: string): string {
  return url.split(/[?#]/)[0];
}

/**
 * Foco y anuncio al cambiar de pantalla (P10; WCAG 2.4.3 y 4.1.3). En una aplicación de una sola página el navegador no
 * recarga: tras pulsar un enlace del menú el foco se queda en el menú (o cae en `<body>` si el enlace era del contenido
 * y ya no existe) y quien navega con teclado o lector tiene que volver a recorrer toda la barra hasta el contenido.
 *
 * - Al terminar una navegación a OTRA ruta, lleva el foco al `h1` de la pantalla (con `tabindex="-1"`); el lector lo
 *   lee como encabezado y el teclado sigue desde ahí. Sin `h1`, al `<main>` y anuncia el título de la pestaña.
 * - NO lo hace: en la primera carga (el primer tabulador es «Saltar al contenido»), si solo cambia la consulta o el
 *   fragmento, en el juego (`chrome: 'hidden'`: lleva su propio foco) ni si la pantalla ya puso el foco en un control
 *   suyo durante la navegación (el formulario de acceso, un diálogo abierto por la ruta).
 * - Si la navegación tarda, anuncia «Cargando la página…» por la región educada.
 *
 * Se crea al arrancar (`AppComponent`), junto a las regiones vivas.
 */
@Injectable({ providedIn: 'root' })
export class RouteFocusService {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly announcer = inject(LiveRegionAnnouncer);

  private rutaAnterior: string | null = null;
  private focoAlIniciar: Element | null = null;
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.focoAlIniciar = this.document.activeElement;
        this.limpiar();
        this.temporizador = setTimeout(() => this.announcer.announce(ROUTE_LOADING_TEXT, 'polite'), ROUTE_SLOW_ANNOUNCE_MS);
      } else if (event instanceof NavigationEnd) {
        this.limpiar();
        this.alTerminar(event.urlAfterRedirects);
      } else if (
        event instanceof NavigationCancel || event instanceof NavigationError || event instanceof NavigationSkipped
      ) {
        this.limpiar();
      }
    });
    inject(DestroyRef).onDestroy(() => this.limpiar());
  }

  private limpiar(): void {
    if (this.temporizador !== undefined) clearTimeout(this.temporizador);
    this.temporizador = undefined;
  }

  private alTerminar(url: string): void {
    const ruta = rutaSinConsulta(url);
    const primera = this.rutaAnterior === null;
    const igual = ruta === this.rutaAnterior;
    this.rutaAnterior = ruta;
    if (primera || igual || readRouteChrome(this.router) === 'hidden') return;
    // Después de pintar: la pantalla nueva ya está activa, pero su plantilla se dibuja en este mismo ciclo.
    afterNextRender(() => this.llevarFoco(), { injector: this.injector });
  }

  private llevarFoco(): void {
    const activo = this.document.activeElement;
    // La pantalla (o un diálogo que abrió) ya puso el foco en un control propio y distinto del que había al empezar.
    const main = this.document.querySelector('main');
    const propio = activo && activo !== this.focoAlIniciar && activo !== main && activo !== this.document.body
      && (main?.contains(activo) || !!activo.closest('[role="dialog"], [role="alertdialog"], dialog'));
    if (propio) return;

    const destino = encabezadoPrincipal(this.document);
    if (destino && enfocarPorPrograma(destino)) {
      // Un `<main>` sin `h1` no dice nada al enfocarse: se anuncia el título de la pestaña («<Página> · SIEP»).
      if (!destino.matches('h1')) this.anunciarTitulo();
      return;
    }
    this.anunciarTitulo();
  }

  private anunciarTitulo(): void {
    const titulo = this.document.title?.trim();
    if (titulo) this.announcer.announce(titulo, 'polite');
  }
}
