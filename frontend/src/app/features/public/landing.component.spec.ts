import { Component, Input, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TemaService } from '../../core/tema/tema.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { SiepParticleLayerComponent } from '../../shared/ui/siep-particle-layer.component';
import { LandingComponent } from './landing.component';

/** La capa de partículas pinta en un canvas con observadores que jsdom no tiene: aquí basta su sitio. */
@Component({ selector: 'app-siep-particle-layer', template: '' })
class ParticlesStub {
  @Input() density = 'medium';
  @Input() interactive = false;
  @Input() mode = 'background';
  @Input() paused = false;
}

/**
 * Portada (plan visual F4-1), en DOM: una identidad con dos pieles (VD-2: el héroe presenta el simulador en la piel
 * juego; el resto, piel portal), una maqueta que no finge ser interactiva, tarjetas honestas sobre qué casos existen
 * (T15.4) y sin estilos en línea. Sustituye a landing.a11y.spec y landing.honesty.spec, que leían la plantilla.
 */
// req: BLOQUE-H (portada), RNF-04
describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** Lo que se lee de un elemento: sin lo decorativo (aria-hidden, p. ej. la ligadura del icono). */
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return text(copy);
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: UiDialog, useValue: { sheet: vi.fn() } }],
    });
    TestBed.overrideComponent(LandingComponent, { remove: { imports: [SiepParticleLayerComponent] }, add: { imports: [ParticlesStub] } });
    fixture = TestBed.createComponent(LandingComponent);
    await fixture.whenStable();
  });

  it('la cabecera es la barra pública compartida, con las anclas de esta página', () => {
    expect(host().querySelector('app-public-bar header.cromo')).not.toBeNull();
    expect(host().querySelectorAll('header.cromo .modulo-principal a.nav-enlace').length).toBeGreaterThan(0);
  });

  // Rediseño Metafrónesis (2026-11-20): la portada tiene modo claro y oscuro. La piel la lleva SOLO el contenedor de la
  // página (REGLA-010: nunca body ni :root) y sigue al tema: oscuro = juego, claro = portal. Reemplaza a VD-2.
  it('la piel va solo en el contenedor de la página y sigue al tema (oscuro = juego, claro = portal)', async () => {
    const tema = TestBed.inject(TemaService);
    const skinned = () => [...host().querySelectorAll('[data-skin]')];
    tema.fijar('oscuro');
    await fixture.whenStable();
    expect(skinned()).toHaveLength(1);
    expect(skinned()[0].matches('div.landing')).toBe(true);
    expect(skinned()[0].getAttribute('data-skin')).toBe('game');
    tema.fijar('claro');
    await fixture.whenStable();
    expect(skinned()[0].getAttribute('data-skin')).toBe('portal');
    tema.fijar('sistema');
  });

  it('«Cómo funciona» es un relato: un paso por clip del simulador, con pausa y salto de sección', () => {
    const pasos = [...host().querySelectorAll('#como-funciona .landing-relato__paso h3')].map(text);
    expect(pasos).toEqual(['Entra al caso', 'Escucha a las personas', 'Decide con criterio', 'Revisa el sentido de tus decisiones']);
    expect(host().querySelector<HTMLAnchorElement>('.landing-relato__saltar')!.getAttribute('href')).toBe('#roles');
    expect(host().querySelector('.landing-relato__pantalla')!.getAttribute('aria-hidden')).toBe('true');
    const pausa = host().querySelector<HTMLButtonElement>('.landing-relato__pausa')!;
    expect(spoken(pausa)).toMatch(/videos$/);
  });

  // 2026-11-20: el video de fondo tapa a los doodles y se funde con ellos por los bordes (las máscaras viven en
  // _publico.scss). Aquí, que siga siendo decorativo y que vaya antes del contenido, que se pinta encima.
  it('el fondo del relato es decorativo: el cuadro del clip va en un lienzo dentro de su vista, antes del contenido', () => {
    const fondo = host().querySelector('#como-funciona > .landing-relato__fondo')!;
    expect(fondo.getAttribute('aria-hidden')).toBe('true');
    expect(fondo.querySelector('.landing-relato__vista > canvas.landing-relato__ambiente')).not.toBeNull();
    expect(fondo.nextElementSibling?.classList.contains('landing-wrap')).toBe(true);
  });

  // 2026-11-20: en Chrome 156 los VP9 fallaban al decodificar tras el primer cuadro (PIPELINE_ERROR_DECODE) y el clip
  // quedaba congelado: el navegador solo salta de <source> con formatos que ni intenta, no con uno que falla a medias.
  it('los clips piden primero H.264 y, si un formato no se decodifica, pasan solos al siguiente', () => {
    const video = host().querySelector<HTMLVideoElement>('.landing-relato__capa video')!;
    const fuentes = [...video.querySelectorAll('source')];
    expect(fuentes.map(s => s.getAttribute('type'))).toEqual(['video/mp4', 'video/webm']);
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const actual = (src: string) => Object.defineProperty(video, 'currentSrc', { configurable: true, get: () => src });

    actual(fuentes[0].src);
    video.dispatchEvent(new Event('error'));
    expect(video.getAttribute('src')).toMatch(/caminar\.webm$/);
    expect(load).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalled();

    // Con la última fuente ya no hay a dónde ir: no se recarga en bucle.
    actual(fuentes[1].src);
    video.dispatchEvent(new Event('error'));
    expect(load).toHaveBeenCalledTimes(1);
    load.mockRestore();
    play.mockRestore();
  });

  it('la maqueta es una vista previa honesta: sin botones ni «disabled» falsos, y las decisiones son una lista de ejemplo', () => {
    const preview = host().querySelector('aside.landing-preview')!;
    expect(preview.getAttribute('aria-label')).toBe('Vista previa del simulador');
    expect(text(preview)).toContain('Vista previa');
    expect(preview.querySelectorAll('button, [disabled], a')).toHaveLength(0);
    const decisions = preview.querySelector('ul.landing-preview__decisions')!;
    expect(text(host().querySelector(`#${decisions.getAttribute('aria-labelledby')}`))).toBe('Ejemplo de decisiones');
    expect([...decisions.querySelectorAll('li > span')].map(text)).toEqual([
      'Activar ruta institucional', 'Solicitar más contexto', 'Registrar observación ética',
    ]);
    expect(decisions.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('solo «Violencia basada en género» está disponible; las demás dicen «Próximamente» y ninguna tarjeta finge ser pulsable (T15.4)', () => {
    const cards = [...host().querySelectorAll('#casos article.landing-case-card')];
    expect(cards.map(card => text(card.querySelector('h3')))).toEqual(['Violencia basada en género', 'Desplazamiento forzado', 'Conflicto comunitario']);
    expect(cards.map(card => text(card.querySelector('ui-badge')))).toEqual(['Disponible · caso sensible', 'Próximamente', 'Próximamente']);
    expect(cards.map(card => card.classList.contains('landing-case-card--soon'))).toEqual([false, true, true]);
    for (const card of cards) expect(card.querySelectorAll('a, button')).toHaveLength(0);
    expect(host().textContent).not.toMatch(/intrafamiliar/i);
  });

  it('«Ingresa para ver los casos» lleva al acceso, no a su propia sección', () => {
    const link = host().querySelector<HTMLAnchorElement>('#casos .landing-link')!;
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('sin estilos en línea (los acentos por tarjeta eran [style.*]) y sin texto con degradado', () => {
    expect(host().querySelectorAll('[style]')).toHaveLength(0);
    expect(host().querySelectorAll('.landing-accent--dark')).toHaveLength(0);
  });

  // El peso servido lo mide el e2e @publico (< 120 KB por pantalla); aquí, el marcado.
  it('la escena de la vista previa se sirve en WebP a su tamaño nativo (antes, un PNG de 389 KB), con sus dimensiones', () => {
    const scene = host().querySelector<HTMLImageElement>('.landing-preview__scene img')!;
    expect(scene.getAttribute('src')).toBe('/assets/images/institution/escena-portada.webp');
    expect([scene.getAttribute('width'), scene.getAttribute('height')]).toEqual(['581', '415']);
    expect(scene.getAttribute('decoding')).toBe('async');
  });

  it('las partículas del héroe se pueden pausar y reanudar (H-22, VD-25)', async () => {
    const toggle = () => [...host().querySelectorAll<HTMLButtonElement>('.landing-hero button')]
      .find(button => /animación/.test(text(button)))!;
    const particles = () => fixture.debugElement.query(debug => debug.componentInstance instanceof ParticlesStub).componentInstance as ParticlesStub;
    expect(spoken(toggle())).toBe('Pausar animación');
    expect(particles().paused).toBe(false);
    toggle().click();
    await fixture.whenStable();
    expect(spoken(toggle())).toBe('Reanudar animación');
    expect(particles().paused).toBe(true);
  });

  it('el pie es contentinfo: va fuera del <main> (H-34)', () => {
    const footer = host().querySelector('footer')!;
    expect(footer.closest('main')).toBeNull();
    expect(host().querySelector('main#main-content')).not.toBeNull();
  });
});
