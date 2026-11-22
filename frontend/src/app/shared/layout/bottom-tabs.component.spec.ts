import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { UiDialog } from '../ui/dialog/ui-dialog';
import { BottomTab, BottomTabsComponent, MoreSheetComponent } from './bottom-tabs.component';

@Component({ template: '' })
class Screen {}

@Component({
  imports: [BottomTabsComponent],
  template: `<nav app-bottom-tabs [tabs]="tabs()" [more]="more()"></nav>`,
})
class Host {
  tabs = signal<BottomTab[]>([
    { id: 'panel', label: 'Inicio', icon: 'home', route: '/portal/dashboard' },
    { id: 'simulador', label: 'Casos', icon: 'play_circle', route: '/portal/simulador' },
  ]);
  more = signal<BottomTab[]>([]);
}

// req: BLOQUE-H (la hoja «Más» dice cuál es la página actual)
describe('app-more-sheet', () => {
  it('el destino actual lleva aria-current="page" y elegir uno cierra la hoja', async () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: DIALOG_DATA, useValue: [
          { id: 'rubricas', label: 'Rúbricas', icon: 'grading', route: '/portal/rubricas' },
          { id: 'grupos', label: 'Grupos', icon: 'groups', route: '/portal/grupos' },
        ] },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/portal/grupos');
    const sheet = TestBed.createComponent(MoreSheetComponent);
    await sheet.whenStable();
    const links = [...(sheet.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a.hoja-mas__enlace')];
    expect(links.map(link => link.getAttribute('aria-current'))).toEqual([null, 'page']);
    links[0].click();
    expect(close).toHaveBeenCalled();
  });
});

/**
 * Pestañas inferiores del móvil (plan visual F3-5; references/movil.md §3.3 de la skill): como mucho cinco; si el
 * rol tiene destinos secundarios, la última es «Más» y abre una hoja con ellos (diálogo con trampa y retorno del
 * foco). Objetivos ≥ 44 px y el activo con aria-current.
 */
// req: BLOQUE-H (navegación móvil del plan visual F3-5)
describe('app-bottom-tabs', () => {
  let fixture: ComponentFixture<Host>;
  const sheet = vi.fn();
  const nav = () => fixture.nativeElement.querySelector('nav') as HTMLElement;
  const tabs = () => [...nav().querySelectorAll<HTMLElement>('.pestana')];
  const label = (tab: HTMLElement) => tab.querySelector('.pestana__rotulo')!.textContent!.trim();
  const icon = (tab: HTMLElement) => tab.querySelector('mat-icon')!.textContent!.trim();

  beforeEach(async () => {
    sheet.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: UiDialog, useValue: { sheet } },
      ],
    });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('es la navegación principal nombrada y lleva la clase de la barra inferior', () => {
    expect(nav().getAttribute('aria-label')).toBe('Navegación principal');
    expect(nav().classList).toContain('modulo-inferior');
  });

  it('pinta un enlace por destino, con icono decorativo y rótulo; sin secundarios no hay «Más»', () => {
    expect(tabs().map(label)).toEqual(['Inicio', 'Casos']);
    expect(tabs().map(icon)).toEqual(['home', 'play_circle']);
    for (const tab of tabs()) expect(tab.querySelector('mat-icon')!.getAttribute('aria-hidden')).toBe('true');
    expect(nav().querySelector('button.pestana')).toBeNull();
  });

  it('el destino activo lleva aria-current="page"', async () => {
    await TestBed.inject(Router).navigateByUrl('/portal/simulador');
    await fixture.whenStable();
    expect(tabs().filter(tab => tab.getAttribute('aria-current') === 'page').map(label)).toEqual(['Casos']);
  });

  it('con etiqueta corta, la pestaña la usa (a 390 px «Mi personaje» no cabe sin partirse)', async () => {
    fixture.componentInstance.tabs.set([{ id: 'personaje', label: 'Mi personaje', etiquetaCorta: 'Personaje', icon: 'face', route: '/portal/personaje' }]);
    await fixture.whenStable();
    expect(tabs().map(label)).toEqual(['Personaje']);
  });

  it('una pestaña con pendientes lleva la insignia (decorativa) y el texto para lectores de pantalla; sin pendientes, nada', async () => {
    fixture.componentInstance.tabs.set([
      { id: 'invitaciones', label: 'Grupos', icon: 'groups', route: '/portal/invitaciones', cuenta: 3 },
      { id: 'panel', label: 'Inicio', icon: 'home', route: '/portal/dashboard' },
    ]);
    await fixture.whenStable();
    const [grupos, inicio] = tabs();
    const insignia = grupos.querySelector('.pestana__cuenta')!;
    expect(insignia.textContent!.trim()).toBe('3');
    expect(insignia.getAttribute('aria-hidden')).toBe('true');
    expect(grupos.querySelector('.ds-sr-only')!.textContent).toBe(' (3 pendientes)');
    expect(inicio.querySelector('.pestana__cuenta')).toBeNull();
    expect(inicio.querySelector('.ds-sr-only')).toBeNull();
  });

  it('más de 99 pendientes se abrevian a «99+»', async () => {
    fixture.componentInstance.tabs.set([{ id: 'usuarios', label: 'Usuarios', icon: 'manage_accounts', route: '/u', cuenta: 120 }]);
    await fixture.whenStable();
    expect(tabs()[0].querySelector('.pestana__cuenta')!.textContent!.trim()).toBe('99+');
  });

  it('si un destino de «Más» tiene pendientes, «Más» lleva un punto y lo dice; si no, nada', async () => {
    fixture.componentInstance.more.set([{ id: 'rubricas', label: 'Rúbricas', icon: 'grading', route: '/portal/rubricas' }]);
    await fixture.whenStable();
    const more = () => nav().querySelector<HTMLButtonElement>('button.pestana')!;
    expect(more().querySelector('.pestana__cuenta')).toBeNull();
    fixture.componentInstance.more.set([{ id: 'rubricas', label: 'Rúbricas', icon: 'grading', route: '/portal/rubricas', cuenta: 2 }]);
    await fixture.whenStable();
    expect(more().querySelector('.pestana__cuenta--punto')!.getAttribute('aria-hidden')).toBe('true');
    expect(more().querySelector('.ds-sr-only')!.textContent).toBe(' (hay pendientes)');
  });

  it('con secundarios, la última pestaña es «Más» y abre una hoja inferior con ellos', async () => {
    fixture.componentInstance.more.set([{ id: 'rubricas', label: 'Rúbricas', icon: 'grading', route: '/portal/rubricas' }]);
    await fixture.whenStable();
    const more = nav().querySelector<HTMLButtonElement>('button.pestana')!;
    expect(label(more)).toBe('Más');
    expect(icon(more)).toBe('menu');
    expect(more.getAttribute('aria-haspopup')).toBe('dialog');
    more.click();
    expect(sheet).toHaveBeenCalledWith(MoreSheetComponent, expect.objectContaining({
      side: 'bottom', data: [{ id: 'rubricas', label: 'Rúbricas', icon: 'grading', route: '/portal/rubricas' }],
    }));
  });

  it('si la página actual está en «Más», «Más» lo dice (aria-current); si no, no (revisión de F3, M-4)', async () => {
    fixture.componentInstance.more.set([{ id: 'rubricas', label: 'Rúbricas', icon: 'grading', route: '/portal/rubricas' }]);
    await fixture.whenStable();
    const more = () => nav().querySelector<HTMLButtonElement>('button.pestana')!;
    expect(more().hasAttribute('aria-current')).toBe(false);
    await TestBed.inject(Router).navigateByUrl('/portal/rubricas?pagina=2');
    await fixture.whenStable();
    expect(more().getAttribute('aria-current')).toBe('true');
    expect(tabs().filter(tab => tab.getAttribute('aria-current') === 'page')).toHaveLength(0);
    await TestBed.inject(Router).navigateByUrl('/portal/rubricas-viejas');
    await fixture.whenStable();
    expect(more().hasAttribute('aria-current')).toBe(false);
  });

  it('nunca pasa de cinco pestañas: si hay más destinos que caben, los últimos van a «Más»', async () => {
    fixture.componentInstance.tabs.set(['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, label: id.toUpperCase(), icon: 'dashboard', route: `/${id}` })));
    await fixture.whenStable();
    expect(tabs()).toHaveLength(5);
    expect(label(tabs()[4])).toBe('Más');
    tabs()[4].click();
    expect(sheet.mock.calls[0][1].data.map((tab: BottomTab) => tab.id)).toEqual(['e', 'f']);
  });
});
