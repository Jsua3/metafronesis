import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import type { Comentario } from '../../modelo/caso';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { ComentariosComponent } from './comentarios.component';

@Component({
  selector: 'app-anfitrion',
  imports: [ComentariosComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (escena(); as e) { <app-comentarios [escena]="e" /> }`,
})
class AnfitrionComponent {
  readonly escenaId = input.required<string>();
  protected readonly store = inject(CasoStore);
  protected readonly escena = computed(() => this.store.caso()?.escenas.find((x) => x.id === this.escenaId()));
}

async function montar(opciones: { comentarios?: Comentario[]; sinSala?: boolean; segundaPersona?: boolean } = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [AnfitrionComponent], providers: [provideRouter([])] }).compileComponents();
  const store = TestBed.inject(CasoStore);
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
  const escenaId = caso.escenas[1].id;
  const sala = caso.salas.find((s) => s.id === caso.escenas[1].salaId)!;
  // La clave de la colocación (la que usa `talked`) es distinta de la del personaje (`ref`, la que usan los comentarios).
  sala.personajes[0].clave = 'psicologa';
  sala.objetos[0].clave = 'vaso';
  caso.hitos.push({ clave: 'informar', nombre: 'Informar derechos', descripcion: '', decisivo: false });
  if (opciones.segundaPersona) sala.personajes.push({ ref: 'enfermera', x: 8, y: 8, mirando: 'izquierda', expresion: 'neutral', clave: 'enfermera-1' });
  if (opciones.comentarios) caso.escenas[1].comentarios = opciones.comentarios;
  if (opciones.sinSala) sala.personajes = [];
  store.fijar(caso);
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.componentRef.setInput('escenaId', escenaId);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const raiz = fixture.nativeElement as HTMLElement;
  const fijar = vi.spyOn(store, 'fijarComentarios');
  const comentarios = () => store.caso()!.escenas.find((e) => e.id === escenaId)!.comentarios ?? [];
  const campo = <T extends HTMLElement>(k: number, sufijo: string) => raiz.querySelector<T>(`#comentario-${k}-${sufijo}`)!;
  const escribir = async (el: HTMLInputElement | HTMLSelectElement, valor: string) => {
    el.value = valor;
    el.dispatchEvent(new Event('change'));
    await listo();
  };
  const pulsar = async (el: HTMLElement) => { el.click(); await listo(); };
  const nombrePersona = (id: string) => store.caso()!.personajes.find((p) => p.id === id)?.nombre ?? id;
  return { store, escenaId, raiz, listo, fijar, comentarios, campo, escribir, pulsar, nombrePersona };
}

const botonAgregar = (raiz: HTMLElement) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent!.includes('Agregar lo que dice'));

describe('ComentariosComponent', () => {
  it('es una sección con su título y su ayuda, y un grupo por persona de la sala con su botón', async () => {
    const { raiz, nombrePersona } = await montar({ segundaPersona: true });
    expect(raiz.querySelector('section')!.getAttribute('aria-labelledby')).toBe('comentarios-titulo');
    expect(raiz.querySelector('#comentarios-titulo')!.textContent).toBe('Lo que dicen al acercarte');
    expect(raiz.textContent).toContain('Se dicen una vez, en este orden.');
    const grupos = [...raiz.querySelectorAll('section > [role=group]')].map((g) => g.querySelector('h3')!.textContent!.trim());
    expect(grupos).toEqual([nombrePersona('psicologa-bienestar'), nombrePersona('enfermera')]);
    expect(botonAgregar(raiz).map((b) => b.textContent!.trim())).toEqual([
      `Agregar lo que dice ${nombrePersona('psicologa-bienestar')}`, `Agregar lo que dice ${nombrePersona('enfermera')}`,
    ]);
  });

  it('agregar no toca el caso: el comentario nuevo espera en pantalla, con el foco en su frase, y nunca se guarda con la frase vacía', async () => {
    const { raiz, pulsar, fijar, comentarios, campo, escribir, listo } = await montar();
    await pulsar(botonAgregar(raiz)[0]);
    await listo();
    expect(fijar).not.toHaveBeenCalled();
    expect(comentarios()).toEqual([]);
    expect(document.activeElement).toBe(campo(0, 'texto'));
    await escribir(campo<HTMLInputElement>(0, 'texto'), '   '); // vacío: sigue esperando
    expect(fijar).not.toHaveBeenCalled();
    expect(comentarios()).toEqual([]);
  });

  it('con una frase válida el comentario entra al caso con la clave del personaje (ref), en la posición del documento, y el foco queda en su frase', async () => {
    const { raiz, pulsar, fijar, comentarios, campo, escribir, listo } = await montar({ comentarios: [{ personaje: 'psicologa-bienestar', linea: 'Uno' }] });
    await pulsar(botonAgregar(raiz)[0]);
    await listo();
    expect(raiz.querySelector('#comentario-1')).not.toBeNull(); // la posición que tendrá: la del servidor
    await escribir(campo<HTMLInputElement>(1, 'texto'), '  Hola de nuevo ');
    expect(fijar).toHaveBeenCalledTimes(1);
    expect(comentarios()).toEqual([{ personaje: 'psicologa-bienestar', linea: 'Uno' }, { personaje: 'psicologa-bienestar', linea: 'Hola de nuevo' }]);
    await listo();
    expect(document.activeElement).toBe(campo(1, 'texto'));
    expect(campo<HTMLInputElement>(1, 'texto').value).toBe('Hola de nuevo');
  });

  it('una frase inválida en el comentario nuevo se queda con su alerta y no entra al caso; «Quitar» lo descarta y el foco vuelve a «Agregar»', async () => {
    const { raiz, pulsar, fijar, comentarios, campo, escribir, listo } = await montar();
    await pulsar(botonAgregar(raiz)[0]);
    await escribir(campo<HTMLInputElement>(0, 'texto'), 'Mira https://x.co');
    expect(raiz.querySelector('#comentario-0 [role=alert]')!.textContent).toContain('enlaces');
    expect(campo(0, 'texto').getAttribute('aria-invalid')).toBe('true');
    expect(fijar).not.toHaveBeenCalled();
    expect(comentarios()).toEqual([]);
    await pulsar([...raiz.querySelectorAll<HTMLButtonElement>('#comentario-0 button')].find((x) => x.textContent!.trim() === 'Quitar')!);
    await listo();
    expect(raiz.querySelector('#comentario-0')).toBeNull();
    expect(document.activeElement).toBe(botonAgregar(raiz)[0]);
    expect(fijar).not.toHaveBeenCalled();
  });

  it('agrupa por persona aunque en el documento estén mezclados, y cada ancla es su posición en el documento', async () => {
    const { raiz } = await montar({
      segundaPersona: true,
      comentarios: [
        { personaje: 'psicologa-bienestar', linea: 'Uno' }, { personaje: 'enfermera', linea: 'Dos' }, { personaje: 'psicologa-bienestar', linea: 'Tres' },
      ],
    });
    const grupos = [...raiz.querySelectorAll('section > [role=group]')];
    const anclas = (g: Element) => [...g.querySelectorAll('[tabindex="-1"]')].map((x) => x.id).filter((id) => /^comentario-[0-9]+$/.test(id));
    expect(anclas(grupos[0])).toEqual(['comentario-0', 'comentario-2']);
    expect(anclas(grupos[1])).toEqual(['comentario-1']);
  });

  it('el 7.º no se puede agregar: el botón se apaga y el motivo se lee, enlazado', async () => {
    const seis = Array.from({ length: 6 }, (_, i): Comentario => ({ personaje: 'psicologa-bienestar', linea: `Frase ${i + 1}` }));
    const { raiz, pulsar, fijar, comentarios } = await montar({ comentarios: seis });
    const boton = botonAgregar(raiz)[0];
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    expect(raiz.querySelector('#comentarios-tope')!.textContent).toContain('Ya hay 6 comentarios en esta escena: quita uno para agregar otro.');
    expect(boton.getAttribute('aria-describedby')).toBe('comentarios-tope');
    await pulsar(boton);
    expect(fijar).not.toHaveBeenCalled();
    expect(comentarios()).toHaveLength(6);
  });

  it('con menos de 6 el botón no está apagado ni muestra el motivo', async () => {
    const { raiz } = await montar();
    expect(botonAgregar(raiz)[0].getAttribute('aria-disabled')).toBeNull();
    expect(raiz.querySelector('#comentarios-tope')).toBeNull();
  });

  it('subir y bajar cambian el orden del documento entre comentarios de la misma persona', async () => {
    const { raiz, pulsar, comentarios } = await montar({
      segundaPersona: true,
      comentarios: [
        { personaje: 'psicologa-bienestar', linea: 'Uno' }, { personaje: 'enfermera', linea: 'Dos' }, { personaje: 'psicologa-bienestar', linea: 'Tres' },
      ],
    });
    const subir = (k: number) => raiz.querySelector<HTMLButtonElement>(`#comentario-${k}-subir`)!;
    const bajar = (k: number) => raiz.querySelector<HTMLButtonElement>(`#comentario-${k}-bajar`)!;
    expect(subir(0).getAttribute('aria-disabled')).toBe('true'); // el primero de su persona
    expect(bajar(2).getAttribute('aria-disabled')).toBe('true'); // el último de su persona
    await pulsar(subir(2));
    expect(comentarios().map((c) => c.linea)).toEqual(['Tres', 'Dos', 'Uno']);
    await pulsar(bajar(0));
    expect(comentarios().map((c) => c.linea)).toEqual(['Uno', 'Dos', 'Tres']);
  });

  it('quitar saca el comentario y deja los demás', async () => {
    const { raiz, pulsar, comentarios } = await montar({
      comentarios: [{ personaje: 'psicologa-bienestar', linea: 'Uno' }, { personaje: 'psicologa-bienestar', linea: 'Dos' }],
    });
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-0-quitar')!);
    expect(comentarios().map((c) => c.linea)).toEqual(['Dos']);
  });

  const tres: Comentario[] = [
    { personaje: 'psicologa-bienestar', linea: 'Uno' }, { personaje: 'psicologa-bienestar', linea: 'Dos' }, { personaje: 'psicologa-bienestar', linea: 'Tres' },
  ];

  it('foco: tras subir o bajar sigue al comentario movido; tras quitar va al siguiente o, si no hay, a «Agregar»', async () => {
    const { raiz, pulsar, listo, campo } = await montar({ comentarios: tres });
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-2-subir')!);
    await listo();
    expect(document.activeElement!.id).toBe('comentario-1-subir'); // «Tres» ahora es el 2.º
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-1-bajar')!);
    await listo();
    expect(document.activeElement!.id).toBe('comentario-2-bajar'); // y vuelve a ser el 3.º
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-0-quitar')!);
    await listo();
    expect(document.activeElement).toBe(campo(0, 'texto')); // el que era el 2.º y ahora es el 1.º
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-1-quitar')!); // el último: no hay siguiente
    await listo();
    expect(document.activeElement).toBe(botonAgregar(raiz)[0]);
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-0-quitar')!); // el único
    await listo();
    expect(document.activeElement).toBe(botonAgregar(raiz)[0]);
  });

  it('una frase inválida con su alerta sigue a su comentario cuando otro sube, baja o se quita, y no se guarda', async () => {
    const { raiz, pulsar, escribir, campo, comentarios, fijar, listo } = await montar({ comentarios: tres });
    await escribir(campo<HTMLInputElement>(1, 'texto'), 'Mira https://x.co');
    expect(campo(1, 'texto').getAttribute('aria-invalid')).toBe('true');
    // «Tres» sube sobre «Dos»: lo inválido pasa a la posición 2 con su alerta y su texto
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-2-subir')!);
    expect(comentarios().map((c) => c.linea)).toEqual(['Uno', 'Tres', 'Dos']);
    expect(campo<HTMLInputElement>(2, 'texto').value).toBe('Mira https://x.co');
    expect(raiz.querySelector('#comentario-2 [role=alert]')!.textContent).toContain('enlaces');
    expect(campo(2, 'texto').getAttribute('aria-invalid')).toBe('true');
    expect(raiz.querySelector('#comentario-1 [role=alert]')).toBeNull();
    expect(campo<HTMLInputElement>(1, 'texto').value).toBe('Tres');
    // quitar el primero: lo inválido pasa a la posición 1
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-0-quitar')!);
    await listo();
    expect(comentarios().map((c) => c.linea)).toEqual(['Tres', 'Dos']);
    expect(campo<HTMLInputElement>(1, 'texto').value).toBe('Mira https://x.co');
    expect(raiz.querySelector('#comentario-1 [role=alert]')).not.toBeNull();
    expect(raiz.querySelector('#comentario-0 [role=alert]')).toBeNull();
    expect(fijar).toHaveBeenCalledTimes(2); // la frase inválida nunca se mandó
    // y corregirla la guarda y quita la alerta
    await escribir(campo<HTMLInputElement>(1, 'texto'), 'Dos corregido');
    expect(comentarios().map((c) => c.linea)).toEqual(['Tres', 'Dos corregido']);
    expect(raiz.querySelector('#comentario-1 [role=alert]')).toBeNull();
  });

  it('quitar el comentario que tiene la frase inválida descarta también su alerta', async () => {
    const { raiz, pulsar, escribir, campo, listo } = await montar({ comentarios: tres });
    await escribir(campo<HTMLInputElement>(0, 'texto'), 'Hola <b>x</b>');
    await pulsar(raiz.querySelector<HTMLButtonElement>('#comentario-0-quitar')!);
    await listo();
    expect(raiz.querySelectorAll('[role=alert]')).toHaveLength(0);
    expect(campo<HTMLInputElement>(0, 'texto').value).toBe('Dos');
  });

  it('la frase se guarda recortada; con enlace, HTML o más de 400 no se guarda y dice por qué', async () => {
    const { campo, escribir, comentarios, fijar, raiz } = await montar({ comentarios: [{ personaje: 'psicologa-bienestar', linea: '' }] });
    await escribir(campo<HTMLInputElement>(0, 'texto'), '  Buenos días  ');
    expect(comentarios()[0].linea).toBe('Buenos días');
    fijar.mockClear();
    for (const [texto, pista] of [['Mira https://x.co', 'enlaces'], ['Hola <b>x</b>', 'HTML'], ['a'.repeat(401), '400 caracteres']]) { // el salto de línea no llega: un campo de una línea lo quita al pegar (lo prueba frase.spec)
      await escribir(campo<HTMLInputElement>(0, 'texto'), texto);
      expect(raiz.querySelector('#comentario-0 [role=alert]'), texto).not.toBeNull();
      expect(raiz.querySelector('#comentario-0 [role=alert]')!.textContent).toContain(pista);
      expect(campo(0, 'texto').getAttribute('aria-invalid')).toBe('true');
    }
    expect(fijar).not.toHaveBeenCalled();
    expect(comentarios()[0].linea).toBe('Buenos días');
  });

  it('«Cuando…» dice «La primera vez que se acerque» y marcar un hecho guarda la clave de la colocación, no la del personaje', async () => {
    const { raiz, campo, listo, comentarios } = await montar({ comentarios: [{ personaje: 'psicologa-bienestar', linea: 'Hola' }] });
    expect(raiz.querySelector('#comentario-0-cuando legend')!.textContent).toBe('Cuando…');
    expect(raiz.querySelector('#comentario-0-cuando')!.textContent).toContain('La primera vez que se acerque');
    const casilla = campo<HTMLInputElement>(0, 'cuando-talked-psicologa');
    casilla.checked = true;
    casilla.dispatchEvent(new Event('change'));
    await listo();
    expect(comentarios()[0].cuando).toEqual({ talked: 'psicologa' });
    casilla.checked = false;
    casilla.dispatchEvent(new Event('change'));
    await listo();
    expect(Object.hasOwn(comentarios()[0], 'cuando')).toBe(false); // vacío = siempre: la clave no queda
  });

  it('un «cuando» con un hito se conserva al cambiar la frase, la cara o el gesto', async () => {
    const cuando = { milestone: 'informar' };
    const { raiz, campo, escribir, comentarios } = await montar({ comentarios: [{ personaje: 'psicologa-bienestar', linea: 'Hola', cuando }] });
    expect(raiz.querySelector('#comentario-0-cuando')!.textContent).toContain('Informar derechos');
    await escribir(campo<HTMLInputElement>(0, 'texto'), 'Otra frase');
    await escribir(campo<HTMLSelectElement>(0, 'cara'), 'triste');
    await escribir(campo<HTMLSelectElement>(0, 'gesto'), 'asiente');
    expect(comentarios()[0]).toEqual({ personaje: 'psicologa-bienestar', linea: 'Otra frase', cuando, emocion: 'triste', gesto: 'asiente' });
  });

  it('la cara ofrece las seis y el gesto «Sin gesto: solo voltea» y los cinco; elegir «Sin gesto» quita la clave', async () => {
    const { campo, escribir, comentarios } = await montar({ comentarios: [{ personaje: 'psicologa-bienestar', linea: 'Hola', gesto: 'asiente' }] });
    expect([...campo<HTMLSelectElement>(0, 'cara').options].map((o) => o.textContent!.trim())).toEqual([
      'Según cómo quede la persona', 'Neutral', 'Alegre', 'Preocupada', 'Triste', 'Cautelosa', 'En crisis',
    ]);
    expect([...campo<HTMLSelectElement>(0, 'gesto').options].map((o) => o.textContent!.trim())).toEqual([
      'Sin gesto: solo voltea', 'Se acerca', 'Asiente', 'Se aparta', 'Baja la mirada', 'Se agita',
    ]);
    await escribir(campo<HTMLSelectElement>(0, 'gesto'), '');
    expect(Object.hasOwn(comentarios()[0], 'gesto')).toBe(false);
  });

  it('la vista previa usa el retrato de la persona con la cara elegida y su alt', async () => {
    const { raiz, campo, escribir } = await montar({ comentarios: [{ personaje: 'psicologa-bienestar', linea: 'Hola' }] });
    expect(raiz.querySelector('#comentario-0-vista img')).toBeNull();
    await escribir(campo<HTMLSelectElement>(0, 'cara'), 'triste');
    const img = raiz.querySelector<HTMLImageElement>('#comentario-0-vista img')!;
    expect(img.getAttribute('src')).toBe('/assets/characters/kit/psicologa-hospitalaria/portrait-triste.png');
    expect(img.getAttribute('alt')).toBe('Cara: triste');
  });

  it('un comentario de alguien que ya no está en la sala sale en su grupo, con el aviso', async () => {
    const { raiz, nombrePersona } = await montar({
      comentarios: [{ personaje: 'psicologa-bienestar', linea: 'Hola' }, { personaje: 'enfermera', linea: 'Adiós' }],
    });
    const ausentes = raiz.querySelector('[role=group][data-grupo=ausentes]')!;
    expect(ausentes.querySelector('h3')!.textContent).toContain('Personas que ya no están en esta sala');
    expect(ausentes.querySelector('#comentario-1')).not.toBeNull();
    expect(ausentes.querySelector('#comentario-0')).toBeNull();
    expect(ausentes.textContent).toContain(`${nombrePersona('enfermera')} ya no está en esta sala: este comentario no se dirá.`);
  });

  it('sin personas en la sala dice por qué y ofrece abrir la sala', async () => {
    const { raiz } = await montar({ sinSala: true });
    expect(raiz.textContent).toContain('En esta sala no hay nadie que pueda comentar. Agrega una persona en la sala.');
    expect(raiz.querySelector('a')!.textContent).toContain('Abrir sala');
    expect(botonAgregar(raiz)).toHaveLength(0);
  });
});
