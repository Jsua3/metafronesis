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
import type { ProgresoTutorial } from './progreso-tutorial';
import { TutorialService } from './tutorial.service';

/** Lo privado del servicio que esta prueba usa para saltar directo a cada paso (sin pasar por los prácticos). */
interface Interno { fijar(p: ProgresoTutorial): void; entrar(): Promise<void> }

describe('tutorial: cada paso señala algo que existe', () => {
  afterEach(() => {
    TestBed.inject(TutorialService).salir();
    document.body.innerHTML = '';
  });

  it('todo paso con objetivos encuentra su elemento en su pantalla', async () => {
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
    const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
    // Una respuesta para que existan «Lleva a…» y la ficha en el guion, y algo que marcar en Evaluación.
    caso.escenas[0].respuestas = [{ id: 'r1', texto: 'Te escucho', clase: 'RECOMMENDED', razon: '', retroalimentacion: '', efectos: {}, destinoId: null, marcaIa: false }];
    store.fijar(caso);
    const fixture = TestBed.createComponent(AutoriaShellComponent);
    document.body.appendChild(fixture.nativeElement);
    const listo = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 0)); await fixture.whenStable(); fixture.detectChanges(); } };
    await listo();
    const tutorial = TestBed.inject(TutorialService);
    const interno = tutorial as unknown as Interno;
    await tutorial.iniciar(store.caso()!.id);
    const faltan: string[] = [];
    for (const [ci, c] of CAPITULOS.entries()) {
      for (const [pi, p] of c.pasos.entries()) {
        interno.fijar({ ...tutorial.estado(), capitulo: ci, paso: pi });
        await interno.entrar();
        await listo();
        if (p.objetivos.length && !tutorial.elemento()) faltan.push(`${c.id}/${p.id} (${p.objetivos.join(' | ')})`);
      }
    }
    expect(faltan).toEqual([]);
  }, 120_000);
});
