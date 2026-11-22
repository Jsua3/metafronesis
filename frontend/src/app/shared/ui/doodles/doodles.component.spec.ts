import { readFileSync } from 'fs';
import { join } from 'path';

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  DISTANCIA_AL_CONTENIDO, DoodlesComponent, type Figura, TESELA, figurasCercanas, figurasDelMosaico, zonasDeMargen,
} from './doodles.component';

/**
 * Fondo de doodles de la portada (rediseño Metafrónesis, 2026-11-20). La luz del cursor enciende figuras ENTERAS, no
 * un disco alrededor del ratón: la elección de qué figuras se encienden es una función pura y se prueba aquí, incluido
 * el cruce de tesela (el mosaico se repite cada 520 px). En jsdom el componente solo pinta sus capas: sin matchMedia
 * no hace ninguna obra ni deja estilos en línea (la portada exige cero atributos [style]).
 */
// req: BLOQUE-H (portada), RNF-04
describe('DoodlesComponent', () => {
  describe('en el DOM', () => {
    const conMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

    beforeEach(() => {
      // jsdom no trae matchMedia, pero otra prueba podría haberlo simulado: aquí se asegura que falte.
      Reflect.deleteProperty(window, 'matchMedia');
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    });

    afterEach(() => {
      if (conMatchMedia) Object.defineProperty(window, 'matchMedia', conMatchMedia);
    });

    const crear = async () => {
      const fixture = TestBed.createComponent(DoodlesComponent);
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    };

    it('pinta la capa base del mosaico y la capa de luz (vacía hasta que hay ratón)', async () => {
      const host = await crear();
      expect(host.querySelector('.capa')).not.toBeNull();
      const luz = host.querySelector('svg.luz');
      expect(luz).not.toBeNull();
      expect(luz?.querySelector('defs')).not.toBeNull();
      expect(luz?.querySelectorAll('.figura')).toHaveLength(0);
    });

    it('intensidad suave: una clase en el anfitrión (la tinta la baja el CSS), sin estilos en línea', async () => {
      const fixture = TestBed.createComponent(DoodlesComponent);
      fixture.componentRef.setInput('intensidad', 'suave');
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('doodles--suave');
      expect(host.hasAttribute('style')).toBe(false);
    });

    // Ronda 3 del portal: las cabeceras bajas usan un borde corto y la tinta crece hacia la viñeta, lejos del título.
    it('borde corto y hacia el fin: clases en el anfitrión, sin estilos en línea; por defecto ninguna', async () => {
      const fixture = TestBed.createComponent(DoodlesComponent);
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).not.toContain('doodles--borde-corto');
      expect(host.classList).not.toContain('doodles--hacia-fin');
      fixture.componentRef.setInput('borde', 'corto');
      fixture.componentRef.setInput('hacia', 'fin');
      await fixture.whenStable();
      expect(host.classList).toContain('doodles--borde-corto');
      expect(host.classList).toContain('doodles--hacia-fin');
      expect(host.hasAttribute('style')).toBe(false);
    });

    it('es decorativo: aria-hidden en el anfitrión', async () => {
      const host = await crear();
      expect(host.getAttribute('aria-hidden')).toBe('true');
    });

    it('sin matchMedia no hace obra ni deja estilos en línea', async () => {
      const host = await crear();
      expect(host.hasAttribute('style')).toBe(false);
      expect(host.querySelectorAll('[style]')).toHaveLength(0);
      expect(host.querySelectorAll('symbol')).toHaveLength(0);
    });

    describe('con colores forzados', () => {
      // El CSS oculta los doodles con forced-colors: el JS tampoco debe escuchar el ratón ni cargar el mosaico. Se
      // simula un navegador con ratón fino y la zona en pantalla; solo cambia la consulta de colores forzados.
      const montarZona = () => {
        const zona = (id: string, top: number, bottom: number) => {
          const el = document.createElement('section');
          el.id = id;
          el.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
          document.body.appendChild(el);
          return el;
        };
        return [zona('casos', 0, 400), zona('como-funciona', 400, 900)];
      };

      const preparar = (forzado: boolean) => {
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          value: (q: string) => ({
            matches: q.includes('forced-colors') ? forzado : q.includes('pointer: fine'),
            addEventListener: () => {},
            removeEventListener: () => {},
          }),
        });
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(0); return 1; });
        const fetchFalso = vi.fn(() => Promise.reject(new Error('sin red en la prueba')));
        vi.stubGlobal('fetch', fetchFalso);
        const escuchas = vi.spyOn(window, 'addEventListener');
        return { fetchFalso, escuchas };
      };

      let zonas: HTMLElement[] = [];
      beforeEach(() => { zonas = montarZona(); });
      afterEach(() => {
        zonas.forEach(z => z.remove());
        Reflect.deleteProperty(window, 'matchMedia');
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      });

      it('no escucha el ratón ni carga el mosaico', async () => {
        const { fetchFalso, escuchas } = preparar(true);
        await crear();
        expect(escuchas.mock.calls.map(c => c[0])).not.toContain('pointermove');
        expect(fetchFalso).not.toHaveBeenCalled();
      });

      it('control: sin colores forzados sí escucha y carga', async () => {
        const { fetchFalso, escuchas } = preparar(false);
        await crear();
        expect(escuchas.mock.calls.map(c => c[0])).toContain('pointermove');
        expect(fetchFalso).toHaveBeenCalledTimes(1);
      });

      // DISENO §2.8: en el portal los doodles acompañan la cabecera sin luz del cursor (hay una tarea que no distraer).
      it('con [interactivo]="false" no escucha el ratón ni carga el mosaico de la luz', async () => {
        const { fetchFalso, escuchas } = preparar(false);
        const fixture = TestBed.createComponent(DoodlesComponent);
        fixture.componentRef.setInput('interactivo', false);
        await fixture.whenStable();
        expect(escuchas.mock.calls.map(c => c[0])).not.toContain('pointermove');
        expect(fetchFalso).not.toHaveBeenCalled();
      });
    });
  });

  describe('figurasCercanas', () => {
    const figura = (tipo: string, x: number, y: number, radio = 20): Figura => ({ tipo, x, y, radio });

    it('enciende de lleno la figura bajo el cursor y deja fuera las lejanas', () => {
      const figuras = [figura('#casa', 100, 100), figura('#psi', 400, 400)];
      const cercanas = figurasCercanas(figuras, 100, 100, 200).filter(c => c.i === 0 && c.j === 0);
      expect(cercanas.map(c => c.indice)).toEqual([0]);
      expect(cercanas[0].intensidad).toBe(1);
      expect(cercanas[0].distancia).toBe(0);
    });

    it('la intensidad baja con la distancia y es 0 fuera del alcance', () => {
      const figuras = [figura('#a', 0, 0, 0)];
      const en = (x: number) => figurasCercanas(figuras, x, 260, 200).find(c => c.i === 0 && c.j === 0)?.intensidad ?? 0;
      // (0, 0) queda a 260 px de (0, 260): fuera. A 150 px, a medias; a 40 px, de lleno.
      expect(en(0)).toBe(0);
      const cerca = figurasCercanas(figuras, 0, 40, 200).find(c => c.i === 0 && c.j === 0)!.intensidad;
      const medio = figurasCercanas(figuras, 0, 150, 200).find(c => c.i === 0 && c.j === 0)!.intensidad;
      expect(cerca).toBe(1);
      expect(medio).toBeGreaterThan(0);
      expect(medio).toBeLessThan(1);
    });

    it('cruza de tesela: una figura del borde izquierdo se enciende en la tesela siguiente', () => {
      const figuras = [figura('#mochila', 10, 100)];
      const [c] = figurasCercanas(figuras, TESELA + 20, 100, 120);
      expect(c).toMatchObject({ indice: 0, i: 1, j: 0, clave: `#mochila@${TESELA + 10},100` });
      // Y hacia arriba: una figura del borde inferior se ve en la tesela de encima (j = −1) cuando el cursor está arriba.
      const arriba = figurasCercanas([figura('#lupa', 200, 510)], 200, 5, 120);
      expect(arriba.map(x => [x.i, x.j])).toEqual([[0, -1]]);
    });

    it('las copias de costura del SVG (misma figura a ±520 px) se encienden una sola vez', () => {
      // El mosaico dibuja la mochila en x 495 y en x −25 para cerrar la costura: en la vista caen en el mismo sitio.
      const figuras = [figura('#mochila', 495, 52), figura('#mochila', 495 - TESELA, 52)];
      const cercanas = figurasCercanas(figuras, 500, 60, 100);
      expect(cercanas).toHaveLength(1);
    });
  });

  describe('figurasDelMosaico', () => {
    it('lee el centro y el radio de usos, puntos y trazos sueltos', () => {
      const doc = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg"><g stroke="#000">
          <use href="#casa" x="270" y="288" width="74" height="74" transform="rotate(4 307 325)"/>
          <circle cx="72.5" cy="16.5" r="2.6"/>
          <path d="M97.5 215.5L103.5 221.5M103.5 215.5L97.5 221.5"/>
        </g></svg>`,
        'image/svg+xml',
      );
      const [uso, punto, cruz] = figurasDelMosaico(doc.querySelector('g')!);
      expect(uso).toEqual({ tipo: '#casa', x: 307, y: 325, radio: 37 });
      expect(punto).toEqual({ tipo: 'circle', x: 72.5, y: 16.5, radio: 2.6 });
      expect(cruz).toEqual({ tipo: 'path', x: 100.5, y: 218.5, radio: 3 });
    });
  });

  // Pedido del usuario (2026-11-20): algunas figuras, al azar, ya van en morado apagado. Son dos máscaras del mismo
  // dibujo generadas desde mosaico.svg; si alguien regenera una sin la otra, una figura saldría doble o desaparecería.
  describe('figuras de acento (morado apagado al azar)', () => {
    const doodles = join(__dirname, '../../../../assets/landing/doodles');
    const leer = (nombre: string) => readFileSync(join(doodles, nombre), 'utf-8');
    const contar = (svg: string, etiqueta: string) => (svg.match(new RegExp(`<${etiqueta}\\b`, 'g')) ?? []).length;
    const original = leer('mosaico.svg');
    const base = leer('mosaico-base.svg');
    const acento = leer('mosaico-acento.svg');

    it('base y acento se reparten las figuras del mosaico sin repetir ni perder ninguna (2 × 2 teselas)', () => {
      expect(contar(base, 'use') + contar(acento, 'use')).toBe(4 * contar(original, 'use'));
      // Puntos y «x» nunca son de acento: van todos en la base.
      for (const trazo of ['circle', 'path']) {
        const enGrupo = (svg: string) => contar(svg.slice(svg.indexOf('</defs>')), trazo);
        expect(enGrupo(base)).toBe(4 * enGrupo(original));
        expect(enGrupo(acento)).toBe(0);
      }
      for (const svg of [base, acento]) {
        expect(svg).toContain(`viewBox="0 0 ${2 * TESELA} ${2 * TESELA}"`);
        // Cada subtesela se recorta a 520 × 520, como hacía la máscara original al repetirse.
        expect(svg.match(/<g transform="translate\(\d+ \d+\)" clip-path="url\(#tesela\)">/g)).toHaveLength(4);
      }
    });

    it('son «algunas»: entre el 5 % y el 15 % de los dibujos', () => {
      const proporcion = contar(acento, 'use') / (4 * contar(original, 'use'));
      expect(proporcion).toBeGreaterThan(0.05);
      expect(proporcion).toBeLessThan(0.15);
    });
  });
});

// req: pedidos del usuario del 2026-11-22: doodles en el blanco de las pantallas y luego en TODA la pantalla, más tenues
// en la franja del contenido para no molestar a la vista.
describe('doodles de fondo del portal (zonasDeMargen)', () => {
  const ext = { izq: 384, der: 1056, inicio: 500, fin: 700 };

  it('la tinta plena empieza a 64 px del contenido a cada lado (en medio queda tenue, no vacío)', () => {
    const vars = zonasDeMargen(ext, 1440, 900, 0);
    expect(vars['--g-izq']).toBe(`${384 - DISTANCIA_AL_CONTENIDO}px`);
    expect(vars['--g-der']).toBe(`${1056 + DISTANCIA_AL_CONTENIDO}px`);
  });

  it('con poco margen, la tinta plena queda fuera de la vista y ese lado se ve tenue', () => {
    const vars = zonasDeMargen({ ...ext, izq: 36, der: 1404 }, 1440, 900, 0);
    expect(vars['--g-izq']).toBe(`${36 - DISTANCIA_AL_CONTENIDO}px`);
    expect(vars['--g-der']).toBe(`${1404 + DISTANCIA_AL_CONTENIDO}px`);
  });

  it('debajo, tinta plena solo si quedan al menos 240 px libres en pantalla, y se mueve con el desplazamiento', () => {
    expect(zonasDeMargen(ext, 1440, 900, 0)['--fin']).toBe('99999px');
    expect(zonasDeMargen({ ...ext, fin: 600 }, 1440, 900, 0)['--fin']).toBe(`${600 + DISTANCIA_AL_CONTENIDO}px`);
    expect(zonasDeMargen({ ...ext, fin: 900 }, 1440, 900, 400)['--fin']).toBe(`${500 + DISTANCIA_AL_CONTENIDO}px`);
  });

  it('sin contenido medido, toda la pantalla tenue', () => {
    expect(zonasDeMargen(null, 1440, 900, 0)).toEqual({ '--g-izq': '-9999px', '--g-der': '99999px', '--fin': '99999px' });
  });

  it('el componente en modo márgenes se marca para su capa propia y no trae luz', async () => {
    await TestBed.configureTestingModule({ imports: [DoodlesComponent], providers: [provideZonelessChangeDetection()] }).compileComponents();
    const fixture = TestBed.createComponent(DoodlesComponent);
    fixture.componentRef.setInput('modo', 'margenes');
    fixture.componentRef.setInput('interactivo', false);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList).toContain('doodles--margenes');
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });
});
