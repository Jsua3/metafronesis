import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthoringApi } from '../../../core/api/authoring.api';
import { rutasEditorCaso } from '../autoria.routes';
import { CasoStore } from '../estado/caso.store';
import { casoCopiadoDeLugar } from '../testing/caso-api';
import { cuentaDePrueba } from '../testing/cuenta';
import { ServidorFalso } from '../testing/servidor-falso';
import { universidad } from '../testing/universidad';

/** Abre el editor del caso 41 (consultorio y pasillo) en `url`, como ruta del programa, y espera a que se dibuje. */
export async function abrirEditor(url: string) {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 }), universidad);
  await TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'portal/casos/:caseVersionId/editor', children: rutasEditorCaso },
        { path: 'portal/casos', children: [] },
      ], withComponentInputBinding()),
      { provide: AuthoringApi, useValue: { ...servidor.api, assistantStatus: () => of({ enabled: false, mode: 'disabled', remainingToday: 0 }) } },
      cuentaDePrueba,
    ],
  }).compileComponents();
  const harness = await RouterTestingHarness.create();
  const listo = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  };
  await harness.navigateByUrl(url);
  await listo();
  return { harness, raiz: harness.routeNativeElement as HTMLElement, listo, store: TestBed.inject(CasoStore), servidor };
}
