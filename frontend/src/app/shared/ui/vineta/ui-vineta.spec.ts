import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiVineta } from './ui-vineta';
import { ESCENAS, PIEZAS, capasDeEscena, escalaQueCabe, type EscenaVineta, type NombreEscena } from './vineta-catalogo';

/**
 * Viñeta del simulador (personalidad visual del portal, ronda 3). El catálogo se copió del manifiesto de la biblioteca:
 * aquí se comprueba que sigue cuadrando con él (si alguien redibuja una pieza y cambia su tamaño, esta prueba lo
 * avisa), que cada personaje existe en el kit y que ninguna capa se sale del escenario.
 */
// req: RNF-04 (usabilidad: identidad visual coherente con el simulador)
describe('UiVineta', () => {
  const assets = join(__dirname, '../../../../assets');

  describe('catálogo', () => {
    const manifiesto = JSON.parse(readFileSync(join(assets, 'biblioteca/piezas/manifiesto.json'), 'utf-8'));
    const entradas = [
      ...Object.values(manifiesto.muebles), ...Object.values(manifiesto.objetos), ...Object.values(manifiesto.herramientas),
    ] as { ruta: string; ancho: number; alto: number; cuadros?: number }[];

    it.each(Object.entries(PIEZAS))('%s tiene las medidas del manifiesto y su imagen existe', (_, pieza) => {
      const original = entradas.find(e => e.ruta === pieza.ruta);
      expect(original).toBeDefined();
      expect([original!.ancho, original!.alto, original!.cuadros ?? 1]).toEqual([pieza.ancho, pieza.alto, pieza.cuadros]);
      expect(existsSync(join(assets, 'biblioteca', pieza.ruta))).toBe(true);
    });

    it.each(Object.entries(ESCENAS) as [string, EscenaVineta][])('la escena %s cabe en su escenario y sus personajes existen', (_, escena) => {
      for (const capa of escena.capas) {
        const [ancho, alto] = 'pieza' in capa ? [PIEZAS[capa.pieza].ancho, PIEZAS[capa.pieza].alto] : [48, 72];
        expect(capa.x + ancho).toBeLessThanOrEqual(escena.ancho);
        expect((capa.y ?? 0) + alto).toBeLessThanOrEqual(escena.alto);
        if ('kit' in capa) expect(existsSync(join(assets, 'characters/kit', capa.kit, 'idle.png'))).toBe(true);
      }
      expect(escena.capas.filter(c => 'kit' in c && c.protagonista)).toHaveLength(1);
    });
  });

  describe('escalaQueCabe', () => {
    it('usa la máxima sin medida y baja al entero que cabe', () => {
      expect(escalaQueCabe(200, null, 3)).toBe(3);
      expect(escalaQueCabe(200, 650, 3)).toBe(3);
      expect(escalaQueCabe(200, 599, 3)).toBe(2);
      expect(escalaQueCabe(200, 399, 3)).toBe(1);
      expect(escalaQueCabe(200, 100, 2)).toBe(1);
    });
  });

  describe('capasDeEscena', () => {
    it('cambia solo el protagonista por un personaje válido del kit', () => {
      const capas = capasDeEscena(ESCENAS.grupos, 'camila/bata');
      expect(capas.map(c => ('kit' in c ? c.kit : null)).filter(Boolean)).toEqual(['estudiante-consultante', 'camila/bata']);
    });

    it('ignora un personaje con caracteres fuera de la ruta del kit', () => {
      const capas = capasDeEscena(ESCENAS.estudio, "x') url(evil");
      expect(capas.some(c => 'kit' in c && c.kit === 'estudiante-consultante')).toBe(true);
    });

    it('escalona lo que flota después del resto', () => {
      const ordenes = capasDeEscena(ESCENAS.orientadora, null).map(c => c.orden);
      expect(ordenes).toEqual([0, 0, 0, 1, 2, 3]);
    });
  });

  describe('en el DOM', () => {
    beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

    const crear = async (escena: NombreEscena, extra: Record<string, unknown> = {}) => {
      const fixture = TestBed.createComponent(UiVineta);
      fixture.componentRef.setInput('escena', escena);
      for (const [k, v] of Object.entries(extra)) fixture.componentRef.setInput(k, v);
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    };

    it('es decorativa y pinta una capa por pieza y un personaje del kit', async () => {
      const host = await crear('orientadora');
      expect(host.getAttribute('aria-hidden')).toBe('true');
      expect(host.querySelectorAll('ui-pieza-pixel.ui-pieza-pixel--hoja')).toHaveLength(5);
      expect(host.querySelectorAll('ui-pieza-pixel.ui-pieza-pixel--flota')).toHaveLength(3);
      expect(host.querySelectorAll('ui-figura-pixel')).toHaveLength(1);
    });

    it('lleva la escala entera y el tamaño del escenario como variables, sin style en la plantilla', async () => {
      const host = await crear('archivo', { escala: 3 });
      expect(host.style.getPropertyValue('--vineta-e')).toBe('3');
      expect(host.style.getPropertyValue('--vw')).toBe('206');
      const pieza = host.querySelector<HTMLElement>('ui-pieza-pixel.ui-pieza-pixel--hoja')!;
      expect(pieza.style.getPropertyValue('--pimg')).toContain('/assets/biblioteca/piezas/muebles/universidad/estante-libros.png');
      expect(host.querySelector('ui-figura-pixel')?.classList).toContain('ui-figura-pixel--x3');
    });

    it('el marco se elige por clase: placa', async () => {
      const host = await crear('estudio', { marco: 'placa' });
      expect(host.classList).toContain('ui-vineta--placa');
      expect(host.classList).not.toContain('ui-vineta--suelo');
    });
  });
});
