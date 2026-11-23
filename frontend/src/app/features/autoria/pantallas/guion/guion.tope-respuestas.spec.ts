import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { GuionComponent } from './guion.component';

const MOTIVO = 'Una decisión tiene hasta 4 respuestas (A, B, C y D).';

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [GuionComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  const id = store.caso()!.escenas[1].id;
  const fixture = TestBed.createComponent(GuionComponent);
  fixture.componentRef.setInput('escenaId', id);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const raiz = fixture.nativeElement as HTMLElement;
  const agregar = () => [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Agregar una respuesta')!;
  const respuestas = () => store.caso()!.escenas.find((e) => e.id === id)!.respuestas;
  return { store, id, raiz, listo, agregar, respuestas };
}

describe('GuionComponent · hasta 4 respuestas por decisión (A a D)', () => {
  it('con menos de 4 respuestas deja agregar y no muestra el motivo', async () => {
    const { raiz, listo, agregar, respuestas } = await montar();
    const antes = respuestas().length;
    while (respuestas().length < 3) { agregar().click(); await listo(); }

    expect(agregar().getAttribute('aria-disabled')).not.toBe('true');
    expect(raiz.querySelector('#respuestas-tope')).toBeNull();
    agregar().click();
    await listo();
    expect(respuestas().length).toBe(Math.max(antes, 3) + 1);
  });

  it('al llegar a 4 «Agregar una respuesta» se apaga con su motivo enlazado y no agrega', async () => {
    const { raiz, listo, agregar, respuestas } = await montar();
    while (respuestas().length < 4) { agregar().click(); await listo(); }

    expect(respuestas().length).toBe(4);
    expect(agregar().getAttribute('aria-disabled')).toBe('true');
    expect(agregar().getAttribute('aria-describedby')).toBe('respuestas-tope');
    expect(raiz.querySelector('#respuestas-tope')!.textContent).toContain(MOTIVO);
    agregar().click();
    await listo();
    expect(respuestas().length).toBe(4);
  });

  it('una escena que trae más de 4 las conserva todas y un aviso en texto lo dice', async () => {
    const { store, id, raiz, listo, agregar, respuestas } = await montar();
    while (respuestas().length < 4) { agregar().click(); await listo(); }
    store.agregarRespuesta(id); // un caso importado con 5
    await listo();

    expect(respuestas().length).toBe(5);
    expect(raiz.querySelectorAll('ol.lista > li.respuesta').length).toBeGreaterThanOrEqual(5);
    const aviso = raiz.querySelector('#respuestas-exceso')!;
    expect(aviso.textContent).toContain('Esta escena tiene 5 respuestas y el juego solo muestra 4 (A, B, C y D).');
    expect(agregar().getAttribute('aria-disabled')).toBe('true');
    expect(agregar().getAttribute('aria-describedby')!.split(' ')).toContain('respuestas-tope');
  });
});
