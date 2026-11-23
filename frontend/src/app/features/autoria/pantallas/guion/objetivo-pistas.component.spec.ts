import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { ObjetivoPistasComponent } from './objetivo-pistas.component';

/** Lo que hace el guion: pasarle al componente la escena viva del store. */
@Component({
  selector: 'app-anfitrion',
  imports: [ObjetivoPistasComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (escena(); as e) { <app-objetivo-pistas [escena]="e" /> }`,
})
class AnfitrionComponent {
  readonly escenaId = input.required<string>();
  private readonly store = inject(CasoStore);
  protected readonly escena = computed(() => this.store.caso()?.escenas.find((x) => x.id === this.escenaId()));
}

async function montar(opciones: { sinSala?: boolean } = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [AnfitrionComponent], providers: [provideRouter([])] }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  const id = opciones.sinSala ? store.agregarEscena(null) : store.caso()!.escenas[1].id;
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.componentRef.setInput('escenaId', id);
  document.body.appendChild(fixture.nativeElement); // el foco solo existe con el elemento en el documento
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const raiz = fixture.nativeElement as HTMLElement;
  const escena = () => store.caso()!.escenas.find((e) => e.id === id)!;
  const texto = (selector: string) => raiz.querySelector<HTMLTextAreaElement>(selector)!;
  const escribir = (campo: HTMLInputElement | HTMLTextAreaElement, valor: string, evento = 'change') => {
    campo.value = valor;
    campo.dispatchEvent(new Event(evento));
  };
  const agregar = () => raiz.querySelector<HTMLButtonElement>('#agregar-pista')!;
  return { store, id, raiz, listo, escena, texto, escribir, agregar };
}

describe('ObjetivoPistasComponent', () => {
  it('el objetivo tiene su etiqueta, su ayuda enlazada y las anclas para «Llévame ahí»', async () => {
    const { raiz } = await montar();
    const campo = raiz.querySelector<HTMLInputElement>('#objetivo-escena')!;
    expect(campo.labels?.[0].textContent).toContain('Objetivo de la escena');
    expect(campo.getAttribute('aria-describedby')).toContain('objetivo-ayuda');
    expect(raiz.querySelector('#objetivo-ayuda')!.textContent).toContain('Hasta 200 caracteres');
    expect(raiz.querySelector('#pistas-escena')).not.toBeNull();
  });

  it('el objetivo se guarda al salir del campo, no en cada tecla, y recortado', async () => {
    const { escena, raiz, listo, escribir } = await montar();
    const campo = raiz.querySelector<HTMLInputElement>('#objetivo-escena')!;
    escribir(campo, '  Escuchar sin juzgar  ', 'input');
    await listo();
    expect(escena().objetivo ?? '').toBe('');
    expect(raiz.querySelector('#objetivo-cuenta')!.textContent).toContain('23 de 200');

    escribir(campo, '  Escuchar sin juzgar \n'); // el campo de una línea ya descarta el salto
    await listo();
    expect(escena().objetivo).toBe('Escuchar sin juzgar');
    expect(campo.value).toBe('Escuchar sin juzgar');
    expect(raiz.querySelector('#objetivo-cuenta')!.textContent).toContain('19 de 200');
  });

  it('el objetivo no pasa de 200 caracteres y al llegar al tope se anuncia', async () => {
    const { escena, raiz, listo, escribir } = await montar();
    const campo = raiz.querySelector<HTMLInputElement>('#objetivo-escena')!;
    expect(campo.maxLength).toBe(200);
    escribir(campo, 'a'.repeat(200), 'input');
    await listo();
    expect(raiz.querySelector('[role="status"]')!.textContent).toContain('200');
    escribir(campo, 'b'.repeat(260));
    await listo();
    expect(escena().objetivo).toBe('b'.repeat(200));
  });

  it('vaciar el objetivo lo quita; dejarlo igual no manda nada', async () => {
    const { store, escena, raiz, listo, escribir } = await montar();
    const campo = raiz.querySelector<HTMLInputElement>('#objetivo-escena')!;
    escribir(campo, 'Escuchar');
    await listo();
    const editar = vi.spyOn(store, 'editarObjetivo');
    escribir(campo, 'Escuchar');
    expect(editar).not.toHaveBeenCalled();
    escribir(campo, '   ');
    await listo();
    expect(escena().objetivo).toBe('');
  });

  it('agregar una pista la deja en blanco y con el foco; escribirla la guarda al salir del campo, recortada', async () => {
    const { escena, texto, agregar, listo, escribir } = await montar();
    agregar().click();
    await listo();
    expect(escena().pistas).toHaveLength(1);
    expect(document.activeElement).toBe(texto('#pista-texto-0'));
    escribir(texto('#pista-texto-0'), '  Mira la\n  carpeta.\n'); // una pista es de una sola línea
    await listo();
    expect(escena().pistas!.map((p) => p.texto)).toEqual(['Mira la carpeta.']);
    expect(texto('#pista-texto-0').labels?.[0].textContent).toContain('Pista 1');
  });

  it('una pista no pasa de 280 caracteres', async () => {
    const { escena, texto, agregar, listo, escribir } = await montar();
    agregar().click();
    await listo();
    expect(texto('#pista-texto-0').maxLength).toBe(280);
    escribir(texto('#pista-texto-0'), 'x'.repeat(300));
    await listo();
    expect(escena().pistas![0].texto).toHaveLength(280);
  });

  it('con 3 pistas el botón de agregar se apaga con el texto del tope enlazado y no agrega', async () => {
    const { escena, agregar, raiz, listo } = await montar();
    expect(agregar().getAttribute('aria-disabled')).toBeNull();
    for (let i = 0; i < 3; i++) { agregar().click(); await listo(); }
    expect(escena().pistas).toHaveLength(3);
    expect(agregar().getAttribute('aria-disabled')).toBe('true');
    const tope = raiz.querySelector('#pistas-tope')!;
    expect(tope.textContent).toContain('Ya hay 3 pistas: quita una para agregar otra.');
    expect(agregar().getAttribute('aria-describedby')).toBe('pistas-tope');
    agregar().click();
    await listo();
    expect(escena().pistas).toHaveLength(3);
  });

  it('quitar una pista lleva el foco a la que ocupa su lugar, o al botón de agregar si era la última', async () => {
    const { escena, store, id, raiz, texto, agregar, listo } = await montar();
    store.fijarPistas(id, ['Una.', 'Dos.', 'Tres.']);
    await listo();
    const quitar = (n: number) => raiz.querySelector<HTMLButtonElement>(`button[aria-label="Quitar la pista ${n}"]`)!;

    quitar(2).click();
    await listo();
    expect(escena().pistas!.map((p) => p.texto)).toEqual(['Una.', 'Tres.']);
    expect(document.activeElement).toBe(texto('#pista-texto-1'));

    quitar(2).click();
    await listo();
    expect(escena().pistas!.map((p) => p.texto)).toEqual(['Una.']);
    expect(document.activeElement).toBe(agregar());
  });

  it('un caso importado con más de 3 pistas las muestra todas: el tope solo impide agregar', async () => {
    const { store, id, raiz, listo, agregar } = await montar();
    store.fijarPistas(id, ['1', '2', '3', '4']);
    await listo();
    expect(raiz.querySelectorAll('textarea')).toHaveLength(4);
    expect(agregar().getAttribute('aria-disabled')).toBe('true');
  });

  it('una escena sin sala apaga «Pistas» con su motivo', async () => {
    const { raiz } = await montar({ sinSala: true });
    expect(raiz.querySelector('#pistas-motivo')!.textContent).toContain('aún no tiene sala');
    expect(raiz.querySelector('#agregar-pista')).toBeNull();
    expect(raiz.querySelector('#objetivo-escena')).not.toBeNull(); // el objetivo sí se puede escribir
  });
});
