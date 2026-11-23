import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { rutasEditorCaso, rutasNuevoCaso } from './autoria.routes';
import { CasoStore } from './estado/caso.store';
import { casoCopiadoDeLugar } from './testing/caso-api';
import { cuentaDePrueba } from './testing/cuenta';
import { ServidorFalso } from './testing/servidor-falso';
import { universidad } from './testing/universidad';

async function irA(url: string, estado: string) {
  TestBed.resetTestingModule();
  const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: 41, revision: 3 });
  datos.editor.status = estado;
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
  await harness.navigateByUrl(url);
  const listo = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  };
  await listo();
  return { servidor, raiz: harness.routeNativeElement as HTMLElement, store: TestBed.inject(CasoStore), listo };
}

describe('AutoriaShellComponent · un caso que ya no es un borrador', () => {
  afterEach(() => document.querySelectorAll('body > app-autoria-shell, body > [ng-version]').forEach((n) => n.remove()));

  it('un caso en revisión avisa que se puede ver pero no editar y bloquea los campos de las pantallas', async () => {
    const { raiz, store, servidor } = await irA('/portal/casos/41/editor/finales', 'IN_REVIEW');
    expect(store.soloLectura()).toBe(true);
    expect(raiz.querySelector('main [role="note"].solo-lectura')!.textContent).toContain('El caso está en revisión de Psicología. Se puede ver, pero no editar.');
    const marco = raiz.querySelector<HTMLFieldSetElement>('main fieldset.marco-pantalla')!;
    expect(marco.disabled).toBe(true);
    expect(marco.querySelector('h1')).not.toBeNull(); // la pantalla se sigue viendo
    expect(servidor.llamadasA('updateEndings')).toHaveLength(0);
  });

  it('en la revisión de un caso que ya no es un borrador los controles siguen vivos: ahí se decide y se crea la versión nueva', async () => {
    const { raiz } = await irA('/portal/casos/41/editor/revision', 'IN_REVIEW');
    const marco = raiz.querySelector<HTMLFieldSetElement>('main fieldset.marco-pantalla')!;
    expect(marco.disabled).toBe(false);
    const botones = [...marco.querySelectorAll<HTMLButtonElement>('[data-accion="decision-caso"] button')];
    const aprobar = botones.find((b) => b.textContent?.includes('Aprobar y publicar'))!;
    expect(aprobar, 'el panel ofrece aprobar').toBeDefined();
    expect(aprobar.disabled || aprobar.matches(':disabled')).toBe(false);
  });

  it('los datos del caso de un caso en revisión se pueden leer con el teclado: la pantalla no se deshabilita, sus campos son de solo lectura', async () => {
    const { raiz, servidor } = await irA('/portal/casos/41/editor/datos', 'IN_REVIEW');
    expect(raiz.querySelector('main [role="note"].solo-lectura')).not.toBeNull();
    const marco = raiz.querySelector<HTMLFieldSetElement>('main fieldset.marco-pantalla')!;
    expect(marco.disabled).toBe(false);
    expect(marco.querySelector<HTMLTextAreaElement>('#d-contexto')!.readOnly).toBe(true);
    expect(marco.querySelector<HTMLTextAreaElement>('#d-contexto')!.disabled).toBe(false);
    expect(servidor.llamadasA('updateBrief')).toHaveLength(0);
  });

  it('un borrador no muestra el aviso ni bloquea nada', async () => {
    const { raiz, store } = await irA('/portal/casos/41/editor', 'DRAFT');
    expect(store.soloLectura()).toBe(false);
    expect(raiz.querySelector('main [role="note"].solo-lectura')).toBeNull();
    expect(raiz.querySelector<HTMLFieldSetElement>('main fieldset.marco-pantalla')!.disabled).toBe(false);
  });

  const botonIa = (raiz: HTMLElement) => [...raiz.querySelectorAll<HTMLButtonElement>('header button')].find((b) => b.textContent?.includes('Asistente de IA'))!;

  it('en solo lectura el asistente de IA queda deshabilitado, con su aviso, y no se le pide nada', async () => {
    const { raiz, servidor } = await irA('/portal/casos/41/editor', 'IN_REVIEW');
    expect(botonIa(raiz).disabled).toBe(true);
    expect(raiz.querySelector('#aviso-ia')!.textContent).toContain('El caso está en revisión: no se puede cambiar.');
    expect(botonIa(raiz).getAttribute('aria-describedby')).toBe('aviso-ia');
    expect(raiz.querySelector<HTMLElement>('app-panel-ia')!.hidden).toBe(true);
    expect(servidor.llamadasA('assistantPropose')).toHaveLength(0);
  });

  it('un borrador deja usar el asistente y no muestra el aviso', async () => {
    const { raiz } = await irA('/portal/casos/41/editor', 'DRAFT');
    expect(botonIa(raiz).disabled).toBe(false);
    expect(raiz.querySelector('#aviso-ia')).toBeNull();
  });

  it('si el caso pasa a revisión con el asistente abierto, el panel se cierra y no se puede volver a abrir', async () => {
    const { raiz, servidor, store, listo } = await irA('/portal/casos/41/editor', 'DRAFT');
    botonIa(raiz).click();
    await listo();
    expect(raiz.querySelector<HTMLElement>('app-panel-ia')!.hidden).toBe(false);
    servidor.editor.status = 'IN_REVIEW';
    await store.cargar(41, true);
    await listo();
    expect(raiz.querySelector<HTMLElement>('app-panel-ia')!.hidden).toBe(true);
    expect(botonIa(raiz).disabled).toBe(true);
    expect(botonIa(raiz).getAttribute('aria-expanded')).toBe('false');
  });
});
