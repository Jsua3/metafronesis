import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { EditorComponent } from './editor.component';

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [EditorComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  const caso = copiarEscenarioAlCaso(universidad, ['pasillo', 'sala-espera', 'consultorio'], 'Caso');
  const [a, b] = caso.escenas;
  const valorar = caso.hitos.find((h) => h.clave === 'valorar_el_riesgo')!.clave;
  a.respuestas = [{
    id: 'r1', texto: 'Cuéntame cómo te sientes en casa.', clase: 'RECOMMENDED', razon: '', retroalimentacion: '', destinoId: b.id,
    efectos: { hitos: [valorar] }, marcaIa: false,
  }];
  b.intensidad = 'HIGH';
  caso.escenas[2].intensidad = 'LOW';
  store.fijar(caso);
  const fixture = TestBed.createComponent(EditorComponent);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); await new Promise((r) => setTimeout(r, 0)); };
  return { fixture, store, caso, valorar, raiz: fixture.nativeElement as HTMLElement, listo };
}

describe('EditorComponent · intensidad de las escenas (los hitos se mudaron a Evaluación)', () => {
  afterEach(() => document.querySelectorAll('app-root, [ng-version]').forEach((n) => n.remove()));

  // E5: «Hitos del caso» dejó el mapa; sus casos (lista, «Llévame ahí» y avisos) viven en
  // `pantallas/evaluacion/evaluacion.component.spec.ts`. Aquí queda lo que sigue siendo del mapa.
  it('E5 · el mapa ya no lleva «Hitos del caso»: los pasos profesionales viven en Evaluación', async () => {
    const { raiz } = await montar();
    expect(raiz.querySelector('section.hitos-del-caso')).toBeNull();
    expect(raiz.querySelector('[id^="hito-"]')).toBeNull();
  });

  it('cada escena muestra su intensidad con palabras, no solo con color', async () => {
    const { raiz } = await montar();
    const tarjetas = [...raiz.querySelectorAll<HTMLElement>('button.escena')];
    expect(tarjetas.map((t) => t.querySelector('.intensidad-marca')!.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Intensidad media'), expect.stringContaining('Intensidad alta'), expect.stringContaining('Intensidad baja'),
    ]);
  });

  it('en ninguna parte del editor aparece una cifra de estrés o de puntaje', async () => {
    const { raiz } = await montar();
    expect(raiz.textContent).not.toMatch(/estr[eé]s|puntaje|puntos/i);
  });
});
