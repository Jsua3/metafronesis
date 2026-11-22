import { readFileSync } from 'fs';
import { join } from 'path';
import { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

import { filtrarTransiciones, rutaDe, tipoDeTransicion } from './transiciones';

/**
 * Transiciones de vistas (DISENO §4.4, pieza 2; DP-10, P10): solo se animan los cambios de lugar (portal → juego, juego →
 * cierre o Inicio, editor ↔ ensayo); la navegación frecuente se salta. Con movimiento reducido solo queda un fundido.
 */
// req: DP-10, P10, WCAG 2.3.3
describe('transiciones de vistas', () => {
  /** Una instantánea mínima con la forma que lee `rutaDe`: raíz → portal → hoja. */
  function snapshot(ruta: string): ActivatedRouteSnapshot {
    const partes = ruta.split('/').filter(Boolean);
    const raiz = { url: [], firstChild: null, pathFromRoot: [] } as unknown as { url: unknown[]; firstChild: unknown; pathFromRoot: unknown[] };
    const hoja = { url: partes.map(path => ({ path })), firstChild: null, pathFromRoot: [] as unknown[] };
    raiz.firstChild = hoja;
    raiz.pathFromRoot = [raiz];
    hoja.pathFromRoot = [raiz, hoja];
    return raiz as unknown as ActivatedRouteSnapshot;
  }

  function info(desde: string, hacia: string) {
    let terminar!: () => void;
    const finished = new Promise<void>(resolve => { terminar = resolve; });
    const transition = { skipTransition: vi.fn(), finished } as unknown as ViewTransition;
    return { info: { transition, from: snapshot(desde), to: snapshot(hacia) } as ViewTransitionInfo, terminar, transition };
  }

  afterEach(() => {
    document.documentElement.classList.remove('vt-activa');
    delete document.documentElement.dataset['vt'];
    document.body.innerHTML = '';
  });

  it('lee la ruta completa de la instantánea, sin consulta', () => {
    expect(rutaDe(snapshot('/portal/simulador/4'))).toBe('/portal/simulador/4');
    expect(rutaDe(null)).toBe('');
  });

  it('las cuatro parejas que cuentan un cambio de lugar', () => {
    expect(tipoDeTransicion('/portal/simulador/4/ficha', '/portal/simulador/4')).toBe('entrada');
    expect(tipoDeTransicion('/portal/dashboard', '/portal/simulador/4')).toBe('entrada');
    expect(tipoDeTransicion('/portal/simulador', '/portal/simulador/4')).toBe('entrada');
    expect(tipoDeTransicion('/portal/simulador/4', '/portal/simulador/4/cierre/abc')).toBe('salida');
    expect(tipoDeTransicion('/portal/simulador/4', '/portal/dashboard')).toBe('salida');
    expect(tipoDeTransicion('/portal/casos/9/editor', '/portal/casos/9/ensayo')).toBe('ensayo');
    expect(tipoDeTransicion('/portal/casos/9/editor/escenas/3', '/portal/casos/9/ensayo')).toBe('ensayo');
    expect(tipoDeTransicion('/portal/casos/9/ensayo', '/portal/casos/9/editor')).toBe('regreso');
  });

  // Control negativo: animar la navegación frecuente es justo lo que P10 descarta.
  it('la navegación frecuente no se anima', () => {
    expect(tipoDeTransicion('/portal/dashboard', '/portal/simulador')).toBeNull();
    expect(tipoDeTransicion('/portal/simulador', '/portal/simulador/4/ficha')).toBeNull();
    expect(tipoDeTransicion('/portal/simulador/4', '/portal/simulador')).toBeNull();
    expect(tipoDeTransicion('/portal/simulador/4', '/portal/simulador/4')).toBeNull();
    expect(tipoDeTransicion('/portal/casos/9/editor', '/portal/casos/8/ensayo')).toBeNull();
    expect(tipoDeTransicion('/login', '/portal/simulador/4')).toBeNull();
  });

  // No se salta (Angular registraría «Transition was skipped» como error de consola en desarrollo): corre sin animar.
  it('la navegación que no cuenta nada corre sin animación: ni se salta ni marca la raíz', () => {
    const { info: datos, transition } = info('/portal/dashboard', '/portal/simulador');
    filtrarTransiciones(datos);
    expect(transition.skipTransition).not.toHaveBeenCalled();
    expect(document.documentElement.classList).not.toContain('vt-activa');
  });

  it('deja correr la entrada al juego y marca la raíz solo mientras dura', async () => {
    const { info: datos, transition, terminar } = info('/portal/simulador/4/ficha', '/portal/simulador/4');
    filtrarTransiciones(datos);
    expect(transition.skipTransition).not.toHaveBeenCalled();
    expect(document.documentElement.classList).toContain('vt-activa');
    expect(document.documentElement.dataset['vt']).toBe('entrada');
    terminar();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.classList).not.toContain('vt-activa');
    expect(document.documentElement.dataset['vt']).toBeUndefined();
  });

  it('con una capa del CDK abierta se salta (la captura la congelaría a media salida)', () => {
    document.body.innerHTML = '<div class="cdk-overlay-container"><div class="cdk-overlay-pane"></div></div>';
    const { info: datos, transition } = info('/portal/simulador/4/ficha', '/portal/simulador/4');
    filtrarTransiciones(datos);
    expect(transition.skipTransition).toHaveBeenCalled();
  });

  describe('la hoja de estilos de la transición', () => {
    const css = readFileSync(join(__dirname, '..', '..', '..', 'styles', 'components', '_transiciones.scss'), 'utf-8');
    const reducida = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

    it('por defecto nada se anima; solo con la raíz marcada', () => {
      expect(css).toMatch(/::view-transition-group\(\*\),[^{]*\{\s*animation: none;/);
      expect(css).toMatch(/:root\.vt-activa::view-transition-old\(root\)\s*\{[^}]*animation: vt-fundido-sale/);
    });

    it('la portada viaja con la duración del umbral y la barra solo tiene nombre durante el paso', () => {
      expect(css).toMatch(/:root\.vt-activa::view-transition-group\(siep-caso-portada\)\s*\{[^}]*var\(--ds-dur-umbral\)/);
      expect(css).toMatch(/:root\.vt-activa \.barra-portal\s*\{[^}]*view-transition-name: siep-barra/);
    });

    // Criterio (7) de B4b: con movimiento reducido no hay transformaciones, solo el fundido de la raíz.
    it('con movimiento reducido: sin nombres ni desplazamientos, solo un fundido de 160 ms', () => {
      expect(reducida).not.toBe('');
      expect(reducida).toMatch(/view-transition-name: none/);
      expect(reducida).toMatch(/var\(--ds-dur-fade\)/);
      expect(reducida).not.toMatch(/translate|scale\(/);
    });
  });
});
