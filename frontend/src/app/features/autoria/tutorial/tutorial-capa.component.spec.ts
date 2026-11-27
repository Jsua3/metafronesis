import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { AutoriaShellComponent } from '../autoria-shell.component';
import { CasoStore } from '../estado/caso.store';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import { cuentaDePrueba } from '../testing/cuenta';
import { rutasDePrueba } from '../testing/rutas';
import { universidad } from '../testing/universidad';
import { CAPITULOS } from './capitulos';
import { TutorialService } from './tutorial.service';

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [AutoriaShellComponent],
    providers: [
      provideRouter(rutasDePrueba, withComponentInputBinding()),
      { provide: BibliotecaService, useValue: { escenario: async () => universidad, lugares: async () => [] } },
      cuentaDePrueba,
    ],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(AutoriaShellComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 0)); await fixture.whenStable(); fixture.detectChanges(); } };
  await listo();
  return { tutorial: TestBed.inject(TutorialService), store, raiz: fixture.nativeElement as HTMLElement, listo };
}

async function terminarBienvenida(tutorial: TutorialService) {
  for (let i = 0; i < CAPITULOS[0].pasos.length; i++) await tutorial.siguiente();
}

describe('TutorialCapaComponent', { timeout: 15_000 }, () => {
  afterEach(() => {
    TestBed.inject(TutorialService).salir();
    document.body.innerHTML = '';
  });

  it('pinta la burbuja con el mentor, el capítulo y el progreso', async () => {
    const { tutorial, store, raiz, listo } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await listo();
    const burbuja = raiz.querySelector('.tut-burbuja')!;
    expect(burbuja.getAttribute('role')).toBe('dialog');
    expect(burbuja.querySelector<HTMLImageElement>('.tut-mentor')!.src).toContain('/sebas/portrait-alegre.png');
    expect(burbuja.textContent).toContain(`Capítulo 1 de ${CAPITULOS.length}`);
    expect(burbuja.textContent).toContain(CAPITULOS[0].pasos[0].titulo);
    expect(raiz.querySelector('.tut-progreso')).not.toBeNull();
  });

  it('en un paso práctico muestra la consigna, «Siguiente» apagado y «Saltar este paso»', async () => {
    const { tutorial, store, raiz, listo } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await terminarBienvenida(tutorial);
    await tutorial.continuar();
    await tutorial.siguiente();
    await listo();
    expect(raiz.querySelector('.tut-consigna')!.textContent).toContain('Escribe dos o tres frases');
    expect(raiz.querySelector<HTMLButtonElement>('.tut-siguiente')!.disabled).toBe(true);
    expect(raiz.querySelector('.tut-saltar')).not.toBeNull();
  });

  it('al terminar un capítulo muestra la insignia con «Continuar»', async () => {
    const { tutorial, store, raiz, listo } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await terminarBienvenida(tutorial);
    await listo();
    expect(raiz.querySelector('.tut-logro')!.textContent).toContain(CAPITULOS[0].logro);
    raiz.querySelector<HTMLButtonElement>('.tut-continuar')!.click();
    await listo();
    expect(tutorial.capitulo().id).toBe('datos');
  });

  it('Salir cierra la capa', async () => {
    const { tutorial, store, raiz, listo } = await montar();
    await tutorial.iniciar(store.caso()!.id);
    await listo();
    raiz.querySelector<HTMLButtonElement>('.tut-salir')!.click();
    await listo();
    expect(raiz.querySelector('.tut-burbuja')).toBeNull();
  });
});
