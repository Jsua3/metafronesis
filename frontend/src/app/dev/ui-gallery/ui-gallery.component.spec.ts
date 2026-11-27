import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UiGalleryComponent } from './ui-gallery.component';

/** Galería de desarrollo (plan visual F0-4 y F2-9, VD-11): cada componente en sus estados y en las dos pieles. */
describe('UiGalleryComponent (/dev/ui)', () => {
  const render = async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const fixture = TestBed.createComponent(UiGalleryComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('tiene un único h1', async () => {
    const host = await render();
    const headings = host.querySelectorAll('h1');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent).toContain('Galería de componentes');
  }, 15000);

  it('repite la matriz en la piel portal y en la piel juego', async () => {
    const host = await render();
    const panels = [...host.querySelectorAll<HTMLElement>('.ui-gallery__skin')];
    expect(panels.map(panel => panel.dataset['skin'])).toEqual(['portal', 'game']);
    expect(host.textContent).not.toContain('Aún no hay componentes');
  });

  it('botones (F2-1): variantes, tamaños, motivo, carga, solo icono y enlaces en cada piel', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      const buttons = [...panel.querySelectorAll('button[ui-button]')];
      for (const variant of ['primary', 'secondary', 'ghost', 'danger']) {
        expect(buttons.some(button => button.classList.contains(`ui-button--${variant}`))).toBe(true);
      }
      for (const size of ['sm', 'md', 'lg']) {
        expect(buttons.some(button => button.classList.contains(`ui-button--${size}`))).toBe(true);
      }
      expect(panel.querySelector('button[ui-button][aria-disabled="true"][aria-describedby]')).not.toBeNull();
      expect(panel.querySelector('button[ui-button][aria-busy="true"]')).not.toBeNull();
      expect(panel.querySelector('a[ui-button]')).not.toBeNull();
      expect(panel.querySelector('button.ui-gallery__save')).not.toBeNull();
      expect(panel.querySelector('button[ui-icon-button][aria-label]')).not.toBeNull();
      expect(panel.querySelector('a[ui-link][target="_blank"]')).not.toBeNull();
    }
  });

  it('«Simular guardado» pasa a cargando al pulsarlo y vuelve solo (para medir el ancho estable en el e2e)', async () => {
    vi.useFakeTimers();
    try {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
      const fixture = TestBed.createComponent(UiGalleryComponent);
      fixture.detectChanges();
      const save = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.ui-gallery__save')!;
      save.click();
      fixture.detectChanges();
      expect(save.getAttribute('aria-busy')).toBe('true');
      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      expect(save.hasAttribute('aria-busy')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('campos (F2-2): ayuda, error, requerido, deshabilitado, área, lista, contraseña, casillas e interruptor', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelectorAll('ui-field').length).toBeGreaterThanOrEqual(6);
      expect(panel.querySelector('.ui-control[aria-invalid="true"]')).not.toBeNull();
      expect(panel.querySelector('.ui-control[aria-required="true"]')).not.toBeNull();
      expect(panel.querySelector('.ui-control:disabled')).not.toBeNull();
      expect(panel.querySelector('textarea.ui-control')).not.toBeNull();
      expect(panel.querySelector('select.ui-control')).not.toBeNull();
      expect(panel.querySelector('.ui-field__reveal[aria-label="Mostrar contraseña"]')).not.toBeNull();
      expect(panel.querySelector('label[ui-check] input[type="radio"]')).not.toBeNull();
      expect(panel.querySelector('input[role="switch"]')).not.toBeNull();
    }
  });

  it('contenido (F2-3): la cabecera lleva el único h1; tarjetas, cifras e insignias de cada tono', async () => {
    const host = await render();
    expect(host.querySelector('ui-page-header h1')?.textContent).toContain('Galería de componentes');
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelector('ui-card:not(.ui-card--interactive)')).not.toBeNull();
      expect(panel.querySelector('a.ui-card--interactive')).not.toBeNull();
      expect(panel.querySelector('button.ui-card--interactive')).not.toBeNull();
      expect(panel.querySelectorAll('ui-stat').length).toBeGreaterThanOrEqual(2);
      for (const tone of ['neutral', 'info', 'success', 'warning', 'danger']) {
        expect(panel.querySelector(`ui-badge.ui-badge--${tone}`)).not.toBeNull();
      }
      expect(panel.querySelectorAll('ui-section').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('carga (F2-4): las siete formas de esqueleto, indicador con nombre y progreso determinado e indeterminado', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      for (const shape of ['line', 'text', 'card', 'stat', 'row', 'chart', 'avatar']) {
        expect(panel.querySelector(`ui-skeleton.ui-skeleton--${shape}`)).not.toBeNull();
      }
      expect(panel.querySelector('ui-spinner[role="status"][aria-label]')).not.toBeNull();
      expect(panel.querySelector('ui-progress[aria-valuenow]')).not.toBeNull();
      expect(panel.querySelector('ui-progress.ui-progress--indeterminate')).not.toBeNull();
    }
  });

  it('estados (F2-5): las tres clases de vacío y las cuatro de error, parcial y bloqueante', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      for (const kind of ['first-use', 'no-results', 'restricted']) {
        expect(panel.querySelector(`ui-empty-state.ui-empty-state--${kind}`)).not.toBeNull();
      }
      expect(panel.querySelectorAll('ui-error-state').length).toBeGreaterThanOrEqual(4);
      expect(panel.querySelector('ui-error-state[role="alert"]')).not.toBeNull();
      expect(panel.querySelector('ui-error-state[role="status"] details')).not.toBeNull();
    }
  });

  it('superposiciones (F2-6): globo con descripción, menú de texto y de icono, y pestañas', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelector('.ui-gallery__tooltip[aria-describedby]')).not.toBeNull();
      expect(panel.querySelectorAll('ui-menu .ui-menu__trigger[aria-haspopup="true"]').length).toBeGreaterThanOrEqual(2);
      expect(panel.querySelector('ui-tabs [role="tablist"][aria-label]')).not.toBeNull();
    }
  });

  it('diálogos y avisos (F2-7): disparadores en cada piel y UN solo anfitrión de avisos con su propio servicio', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelectorAll('.ui-gallery__overlays button[ui-button]').length).toBeGreaterThanOrEqual(7);
    }
    expect(host.querySelectorAll('ui-toast-host').length).toBe(1);
    const success = [...panels[0].querySelectorAll<HTMLButtonElement>('.ui-gallery__overlays button')]
      .find(button => button.textContent?.includes('Aviso de éxito'))!;
    success.click();
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
    expect(host.querySelector('ui-toast-host .ui-toast--success')).not.toBeNull();
  });

  it('tabla (F2-8): densidades, fila seleccionada y los estados de datos alternables', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelector('ui-table.ui-table--comfortable tr[aria-selected="true"]')).not.toBeNull();
      expect(panel.querySelector('ui-table.ui-table--compact')).not.toBeNull();
      expect(panel.querySelector('ui-table ui-empty-state')).not.toBeNull();
      expect(panel.querySelector('ui-table ui-error-state')).not.toBeNull();
      expect(panel.querySelectorAll('.ui-gallery__table-states button').length).toBe(4);
    }
  });

  it('alcance y consecuencia (F2-11): aviso de alcance en borrador y disparador de la confirmación', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelector('ui-scope-notice[data-draft="true"]')).not.toBeNull();
      expect([...panel.querySelectorAll('button')].some(button => button.textContent?.includes('Iniciar un intento nuevo'))).toBe(true);
    }
  });

  // req: DISENO B2 (cada pieza nueva en /dev/ui en las dos pieles)
  it('piezas del rediseño (B2): segmentado, filtros, barra de acciones, figuras, portadas, barras, archivo, doodles y tabla apilada en cada piel', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelectorAll('ui-segmentado [role="radiogroup"]').length).toBeGreaterThanOrEqual(2);
      expect(panel.querySelector('ui-filtros input[type="search"]')).not.toBeNull();
      expect(panel.querySelector('ui-barra-acciones.ui-barra-acciones--pie')).not.toBeNull();
      expect(panel.querySelector('ui-barra-acciones.ui-barra-acciones--columna')).not.toBeNull();
      expect(panel.querySelectorAll('ui-figura-pixel').length).toBeGreaterThanOrEqual(4);
      expect(panel.querySelector('ui-portada-caso.ui-portada-caso--respaldo')).not.toBeNull();
      expect(panel.querySelector('ui-portada-caso:not(.ui-portada-caso--respaldo) img')).not.toBeNull();
      expect(panel.querySelectorAll('ui-barras').length).toBe(2);
      expect(panel.querySelector('ui-archivo input[type="file"]')).not.toBeNull();
      expect(panel.querySelector('app-doodles.doodles--suave')).not.toBeNull();
      expect(panel.querySelectorAll('ui-table.ui-table--apilar').length).toBe(2);
      expect(panel.querySelector('.ui-gallery__estrecha ui-table.ui-table--apilar td[data-celda="principal"]')).not.toBeNull();
      expect(panel.querySelector('ui-empty-state.ui-empty-state--figura ui-figura-pixel')).not.toBeNull();
      expect(panel.querySelector('ui-card.ui-card--hundida')).not.toBeNull();
      expect(panel.querySelector('a.ui-card--tinte')).not.toBeNull();
    }
    // Sigue habiendo un único h1, ahora con el enlace de regreso de la cabecera.
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelector('ui-page-header a.ui-page-header__volver')?.getAttribute('href')).toBe('/dev/barra');
  });

  it('el filtro de muestra filtra y su segmentado lleva las cuentas en texto', async () => {
    const host = await render();
    const panel = host.querySelector('.ui-gallery__skin')!;
    const estado = panel.querySelectorAll('ui-filtros ui-segmentado [role="radio"]');
    expect(estado[1].textContent?.replace(/\s+/g, ' ').trim()).toBe('Sin empezar · 2');
    (estado[1] as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve));
    TestBed.tick();
    expect(panel.querySelector('ui-filtros .ui-filtros__recuento')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Mostrando 2 de 4');
  });
});
