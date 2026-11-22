import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Route, Router, TitleStrategy, provideRouter } from '@angular/router';

import { routes } from '../../app.routes';
import { SIEP_DEFAULT_TITLE, SiepTitleStrategy } from './siep-title.strategy';

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager,
 template: '' })
class BlankComponent {}

describe('SiepTitleStrategy', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'con-titulo', title: 'Rúbricas', component: BlankComponent },
        { path: 'sin-titulo', component: BlankComponent },
      ]),
      { provide: TitleStrategy, useClass: SiepTitleStrategy },
    ],
  }));

  it('antepone el nombre de la página a SIEP', async () => {
    await TestBed.inject(Router).navigateByUrl('/con-titulo');
    expect(TestBed.inject(Title).getTitle()).toBe('Rúbricas · SIEP');
  });

  it('usa el título institucional si la ruta no define uno', async () => {
    await TestBed.inject(Router).navigateByUrl('/sin-titulo');
    expect(TestBed.inject(Title).getTitle()).toBe(SIEP_DEFAULT_TITLE);
  });
});

describe('rutas de la app', () => {
  function pages(list: Route[]): Route[] {
    return list.flatMap(route => [
      ...(route.loadComponent ? [route] : []),
      ...pages(route.children ?? []),
    ]);
  }

  it('toda página cargable tiene un título', () => {
    const untitled = pages(routes).filter(route => typeof route.title !== 'string' || !route.title.trim());
    expect(untitled.map(route => route.path)).toEqual([]);
  });
});
