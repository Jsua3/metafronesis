import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import type { PersonaCaso } from '../../core/models/simulation.model';
import { rutasEditorCaso, rutasNuevoCaso } from './autoria.routes';
import { casoCopiadoDeLugar } from './testing/caso-api';
import { cuentaDePrueba } from './testing/cuenta';
import { ServidorFalso } from './testing/servidor-falso';
import { universidad } from './testing/universidad';

/** Abre el editor de un caso cuyo servidor dice quién es el autor y quiénes más lo editaron (autoría compartida). */
async function abrir(autoria: { autor?: PersonaCaso; editadoPor?: PersonaCaso[] }) {
  TestBed.resetTestingModule();
  const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 });
  Object.assign(datos.editor, autoria);
  const servidor = new ServidorFalso(datos, universidad);
  await TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'portal/casos/nuevo', children: rutasNuevoCaso },
        { path: 'portal/casos/:caseVersionId/editor', children: rutasEditorCaso },
        { path: 'portal/casos', children: [] },
      ]),
      { provide: AuthoringApi, useValue: { ...servidor.api, assistantStatus: () => of({ enabled: true, mode: 'connected', remainingToday: 5 }) } },
      cuentaDePrueba,
    ],
  }).compileComponents();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/portal/casos/41/editor/datos');
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 0));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }
  return harness.routeNativeElement as HTMLElement;
}

describe('AutoriaShellComponent · autoría compartida', () => {
  afterEach(() => document.querySelectorAll('body > app-autoria-shell, body > [ng-version]').forEach((n) => n.remove()));

  it('la cabecera del caso dice el autor y quiénes más lo editaron', async () => {
    const raiz = await abrir({ autor: { id: 1, nombre: 'Ana Docente' }, editadoPor: [{ id: 2, nombre: 'Beto Docente' }, { id: 3, nombre: 'Carla Docente' }] });
    expect(raiz.querySelector('main .caso-autoria')?.textContent?.trim()).toBe('Autor: Ana Docente · Editado por: Beto Docente, Carla Docente');
    expect(raiz.querySelector('.caso-actual')?.getAttribute('title')).toContain('Autor: Ana Docente');
  });

  it('sin otras manos solo dice el autor', async () => {
    const raiz = await abrir({ autor: { id: 1, nombre: 'Ana Docente' }, editadoPor: [] });
    expect(raiz.querySelector('main .caso-autoria')?.textContent?.trim()).toBe('Autor: Ana Docente');
  });

  it('con un servidor que no manda la autoría no se pinta la línea', async () => {
    const raiz = await abrir({});
    expect(raiz.querySelector('main .caso-autoria')).toBeNull();
  });
});
