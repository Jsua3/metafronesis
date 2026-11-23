import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import type { ClaseRespuesta, Reaccion } from '../../modelo/caso';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { ReaccionComponent } from './reaccion.component';

/** Lo que hace el guion: la reacción de una respuesta, conectada al almacén. */
@Component({
  selector: 'app-anfitrion',
  imports: [ReaccionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (escena(); as e) {
      @for (r of e.respuestas; track r.id) {
        <app-reaccion [respuesta]="r" [escena]="e" [idBase]="'reaccion-' + r.id" (cambio)="store.editarReaccion(e.id, r.id, $event)" />
      }
    }
  `,
})
class AnfitrionComponent {
  readonly escenaId = input.required<string>();
  protected readonly store = inject(CasoStore);
  protected readonly escena = computed(() => this.store.caso()?.escenas.find((x) => x.id === this.escenaId()));
}

async function montar(opciones: { reaccion?: Reaccion; clase?: ClaseRespuesta | null } = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [AnfitrionComponent], providers: [provideRouter([])] }).compileComponents();
  const store = TestBed.inject(CasoStore);
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
  const escenaId = caso.escenas[1].id;
  caso.escenas[1].respuestas = [{
    id: 'r1', texto: 'Hola', clase: opciones.clase === undefined ? 'RECOMMENDED' : opciones.clase, razon: '', retroalimentacion: '', efectos: {},
    destinoId: null, marcaIa: false, ...(opciones.reaccion ? { reaccion: opciones.reaccion } : {}),
  }];
  store.fijar(caso);
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.componentRef.setInput('escenaId', escenaId);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const raiz = fixture.nativeElement as HTMLElement;
  const editar = vi.spyOn(store, 'editarReaccion');
  const reaccion = () => store.caso()!.escenas.find((e) => e.id === escenaId)!.respuestas[0].reaccion;
  const campo = <T extends HTMLElement>(sufijo: string) => raiz.querySelector<T>(`#reaccion-r1-${sufijo}`)!;
  const escribir = async (el: HTMLTextAreaElement | HTMLSelectElement, valor: string) => {
    el.value = valor;
    el.dispatchEvent(new Event('change'));
    await listo();
  };
  return { store, raiz, listo, editar, reaccion, campo, escribir };
}

describe('ReaccionComponent', () => {
  it('es un grupo con su leyenda y su ayuda, y cada campo con su etiqueta', async () => {
    const { raiz, campo } = await montar();
    expect(raiz.querySelector('fieldset#reaccion-r1 legend')!.textContent).toBe('Cómo reacciona');
    expect(raiz.querySelector('#reaccion-r1-ayuda')!.textContent).toContain('solo cambia su cara y hace el gesto de su clase');
    for (const [sufijo, texto] of [['linea', 'Lo que dice'], ['cara', 'Cara'], ['gesto', 'Gesto'], ['quien', 'Quién reacciona']]) {
      expect(campo<HTMLInputElement>(sufijo).labels?.[0].textContent).toContain(texto);
    }
  });

  it('la cara ofrece «Según cómo quede la persona» y las seis; el gesto, el de su clase y los cinco', async () => {
    const { campo } = await montar();
    const cara = [...campo<HTMLSelectElement>('cara').options].map((o) => o.textContent!.trim());
    expect(cara).toEqual(['Según cómo quede la persona', 'Neutral', 'Alegre', 'Preocupada', 'Triste', 'Cautelosa', 'En crisis']);
    const gesto = [...campo<HTMLSelectElement>('gesto').options].map((o) => o.textContent!.trim());
    expect(gesto).toEqual(['El de su clase: se acerca', 'Se acerca', 'Asiente', 'Se aparta', 'Baja la mirada', 'Se agita']);
  });

  it.each([
    ['RECOMMENDED', 'El de su clase: se acerca'], ['ACCEPTABLE', 'El de su clase: asiente'],
    ['RISKY', 'El de su clase: baja la mirada'], ['CONTRAINDICATED', 'El de su clase: se aparta'], [null, 'El de su clase'],
  ] as const)('el gesto por defecto de una respuesta %s es «%s»', async (clase, texto) => {
    const { campo } = await montar({ clase });
    expect(campo<HTMLSelectElement>('gesto').options[0].textContent!.trim()).toBe(texto);
  });

  it('«Quién reacciona» ofrece a quien habla en la escena y las personas de la sala', async () => {
    const { campo } = await montar();
    const quien = [...campo<HTMLSelectElement>('quien').options].map((o) => [o.value, o.textContent!.trim()]);
    expect(quien).toEqual([['', 'Quien habla en la escena'], ['psicologa-bienestar', 'Psicóloga de Bienestar']]);
  });

  it('elegir cara, gesto y persona emite la reacción completa y la guarda', async () => {
    const { campo, escribir, reaccion } = await montar();
    await escribir(campo<HTMLSelectElement>('cara'), 'triste');
    await escribir(campo<HTMLSelectElement>('gesto'), 'se-aparta');
    await escribir(campo<HTMLSelectElement>('quien'), 'psicologa-bienestar');
    expect(reaccion()).toEqual({ emocion: 'triste', gesto: 'se-aparta', personaje: 'psicologa-bienestar' });
  });

  it('elegir «Según cómo quede la persona» quita emocion de la reacción', async () => {
    const { campo, escribir, reaccion } = await montar({ reaccion: { linea: 'Gracias', emocion: 'triste' } });
    await escribir(campo<HTMLSelectElement>('cara'), '');
    expect(reaccion()).toEqual({ linea: 'Gracias' });
    expect(Object.hasOwn(reaccion()!, 'emocion')).toBe(false);
  });

  it('la vista previa usa el retrato del personaje elegido con la cara elegida y su alt', async () => {
    const { campo, escribir, raiz } = await montar();
    expect(raiz.querySelector('#reaccion-r1-vista')!.textContent).toContain('Su cara dependerá de cómo quede la persona');
    expect(raiz.querySelector('#reaccion-r1-vista img')).toBeNull();
    await escribir(campo<HTMLSelectElement>('quien'), 'psicologa-bienestar');
    await escribir(campo<HTMLSelectElement>('cara'), 'triste');
    const img = raiz.querySelector<HTMLImageElement>('#reaccion-r1-vista img')!;
    expect(img.getAttribute('src')).toBe('/assets/characters/kit/psicologa-hospitalaria/portrait-triste.png');
    expect(img.getAttribute('alt')).toBe('Cara: triste');
    expect(raiz.querySelector('#reaccion-r1-vista')!.textContent).not.toContain('Su cara dependerá');
  });

  it('sin persona elegida, la vista previa usa a quien habla primero en la escena', async () => {
    const { campo, escribir, raiz, store } = await montar();
    const primero = store.caso()!.escenas[1].lineas[0]?.personajeId;
    const receta = store.caso()!.personajes.find((p) => p.id === primero)?.recipeId ?? 'sin-receta';
    await escribir(campo<HTMLSelectElement>('cara'), 'alegre');
    expect(raiz.querySelector('#reaccion-r1-vista img')!.getAttribute('src')).toBe(`/assets/characters/kit/${receta}/portrait-alegre.png`);
  });

  it('una frase buena se guarda recortada', async () => {
    const { campo, escribir, reaccion, raiz } = await montar();
    await escribir(campo<HTMLTextAreaElement>('linea'), '  Gracias por contármelo  ');
    expect(reaccion()).toEqual({ linea: 'Gracias por contármelo' });
    expect(raiz.querySelector('[role=alert]')).toBeNull();
  });

  it('la frase con salto de línea o de más de 400 no se guarda y dice por qué', async () => {
    const { campo, escribir, reaccion, raiz, editar } = await montar();
    await escribir(campo<HTMLTextAreaElement>('linea'), 'Primera\nSegunda');
    expect(editar).not.toHaveBeenCalled();
    expect(reaccion()).toBeUndefined();
    expect(raiz.querySelector('[role=alert]')!.textContent).toContain('una sola línea');
    expect(campo('linea').getAttribute('aria-invalid')).toBe('true');
    expect(campo('linea').getAttribute('aria-describedby')).toBe('reaccion-r1-problema');
    expect((campo<HTMLTextAreaElement>('linea')).value).toBe('Primera\nSegunda'); // conserva lo escrito para corregirlo

    await escribir(campo<HTMLTextAreaElement>('linea'), 'a'.repeat(401));
    expect(editar).not.toHaveBeenCalled();
    expect(raiz.querySelector('[role=alert]')!.textContent).toContain('400 caracteres');

    await escribir(campo<HTMLTextAreaElement>('linea'), 'a'.repeat(400));
    expect(reaccion()!.linea).toHaveLength(400);
    expect(raiz.querySelector('[role=alert]')).toBeNull();
  });

  it('una frase con enlace o con HTML tampoco se guarda', async () => {
    const { campo, escribir, editar, raiz } = await montar();
    await escribir(campo<HTMLTextAreaElement>('linea'), 'Mira https://ejemplo.co');
    expect(raiz.querySelector('[role=alert]')!.textContent).toContain('enlaces');
    await escribir(campo<HTMLTextAreaElement>('linea'), 'Hola <b>tú</b>');
    expect(raiz.querySelector('[role=alert]')!.textContent).toContain('HTML');
    // La regla es la del servidor (compartida con los comentarios): otros esquemas y direcciones sin esquema también cuentan.
    await escribir(campo<HTMLTextAreaElement>('linea'), 'Escribe a mailto:a@b.co');
    expect(raiz.querySelector('[role=alert]')!.textContent).toContain('enlaces');
    await escribir(campo<HTMLTextAreaElement>('linea'), 'Abre ftp://x.co');
    expect(raiz.querySelector('[role=alert]')!.textContent).toContain('enlaces');
    expect(editar).not.toHaveBeenCalled();
  });

  it('vaciar la frase la quita de la reacción', async () => {
    const { campo, escribir, reaccion } = await montar({ reaccion: { linea: 'Gracias', gesto: 'asiente' } });
    await escribir(campo<HTMLTextAreaElement>('linea'), '  ');
    expect(reaccion()).toEqual({ gesto: 'asiente' });
  });

  it('una persona que la reacción nombra y la sala no tiene sigue en la lista, para no perderla al guardar', async () => {
    const { campo } = await montar({ reaccion: { personaje: 'enfermera' } });
    const quien = [...campo<HTMLSelectElement>('quien').options].map((o) => o.value);
    expect(quien).toContain('enfermera');
    expect(campo<HTMLSelectElement>('quien').value).toBe('enfermera');
  });
});
