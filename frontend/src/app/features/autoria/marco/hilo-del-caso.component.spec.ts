import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { cifraDeEtapa } from './hilo-del-caso.component';
import { abrirEditor } from './marco.testing';

// req: EDITOR.md §3.1 (el hilo: cinco etapas, siempre visibles, nunca obligatorias) y §7.3 E0, criterio 4
describe('HiloDelCasoComponent', () => {
  afterEach(() => document.querySelectorAll('body > [ng-version]').forEach((n) => n.remove()));

  it('pinta las cinco etapas con su estado en forma y en texto, y marca la etapa en la que estás', async () => {
    const { raiz, harness, listo } = await abrirEditor('/portal/casos/41/editor/datos');
    const hilo = raiz.querySelector('header app-hilo-del-caso')!;
    const etapas = [...hilo.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Secciones del caso"] a')];
    expect(etapas.map((a) => a.querySelector('.hilo__nombre')!.textContent)).toEqual(['Datos', 'Lugar', 'Historia', 'Evaluación', 'Enviar']);
    for (const a of etapas) {
      expect(a.querySelector('.marca-estado')!.getAttribute('data-estado')).toMatch(/^(sin-empezar|en-curso|con-pendientes|lista)$/);
      // El estado también es texto: el nombre accesible lo dice entero.
      // Sin aria-label: el nombre es el texto para lectores (Axe pegaba el aria-label con el texto visible).
      expect(a.hasAttribute('aria-label')).toBe(false);
      expect(a.querySelector('.solo-lector')!.textContent).toBe(a.getAttribute('title'));
      const visible = [a.querySelector('.hilo__nombre')?.textContent?.trim(), a.querySelector('.hilo__cifra')?.textContent?.trim()].filter(Boolean).join(' ');
      expect(a.querySelector('.solo-lector')!.textContent!.startsWith(visible)).toBe(true);
    }
    expect(etapas[0].getAttribute('aria-current')).toBe('page');

    await harness.navigateByUrl('/portal/casos/41/editor/sala/consultorio');
    await listo();
    expect(raiz.querySelector('nav[aria-label="Secciones del caso"] a[aria-current="page"] .hilo__nombre')!.textContent).toBe('Lugar');
  });

  it('por debajo de 64rem el hilo es un menú «N de 5 · nombre» que lleva a cada etapa', async () => {
    const { raiz } = await abrirEditor('/portal/casos/41/editor');
    const menu = raiz.querySelector('app-hilo-del-caso ui-menu')!;
    expect(menu.textContent).toContain('3 de 5 · Historia');
    // El menú va fuera del <nav> para no repetir sus enlaces.
    expect(menu.closest('nav[aria-label="Secciones del caso"]')).toBeNull();
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/portal/casos/41/editor');
  });

  it('la cifra a la vista: los pendientes primero; si no, el avance de la etapa en curso', () => {
    const base = { etapa: 'historia', nombre: 'Historia', nombreLargo: 'Historia', ruta: '/editor' } as const;
    expect(cifraDeEtapa({ ...base, estado: 'con-pendientes', detalle: '3 de 8 escenas escritas', pendientes: 2 })).toBe('2');
    expect(cifraDeEtapa({ ...base, estado: 'en-curso', detalle: '3 de 8 escenas escritas', pendientes: 0 })).toBe('3/8');
    expect(cifraDeEtapa({ ...base, estado: 'lista', detalle: '8 de 8 escenas escritas', pendientes: 0 })).toBe('');
  });
});
