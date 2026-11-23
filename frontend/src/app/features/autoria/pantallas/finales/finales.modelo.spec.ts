import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { CasoBorrador } from '../../modelo/caso';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { FINALES_AUTOMATICOS, finalesDePlantilla } from '../../modelo/finales';
import { universidad } from '../../testing/universidad';
import { FinalesComponent } from './finales.component';

/** Un caso de dos escenas: una respuesta buena que cumple los dos hitos decisivos y una contraindicada; las dos llevan al final. */
function casoConRecorridos(): CasoBorrador {
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
  const [a, b] = caso.escenas;
  b.esFinal = true;
  const decisivos = caso.hitos.filter((h) => h.decisivo).map((h) => h.clave);
  a.respuestas = [
    { id: 'buena', texto: 'Te acompaño.', clase: 'RECOMMENDED', razon: '', retroalimentacion: 'Bien.', efectos: { hitos: decisivos }, destinoId: b.id, marcaIa: false },
    { id: 'mala', texto: 'Apúrate.', clase: 'CONTRAINDICATED', razon: 'Apura a la persona.', retroalimentacion: 'Mal.', efectos: {}, destinoId: b.id, marcaIa: false },
  ];
  return caso;
}

async function montar(modo: 'automatico' | 'propio' = 'automatico') {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [FinalesComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(casoConRecorridos());
  store.fijarModoFinales(modo);
  const fixture = TestBed.createComponent(FinalesComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); await new Promise((r) => setTimeout(r, 0)); await fixture.whenStable(); };
  await listo();
  return { fixture, store, raiz: fixture.nativeElement as HTMLElement, listo };
}

const campo = (raiz: HTMLElement, selector: string) => raiz.querySelector<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(selector)!;
const cambiar = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, valor: string) => {
  el.value = valor;
  el.dispatchEvent(new Event('change'));
};

describe('FinalesComponent · modo automático con hitos decisivos', () => {
  afterEach(() => document.querySelectorAll('body > app-finales, body > [ng-version]').forEach((n) => n.remove()));

  it('marcar hitos decisivos regenera los cuatro finales de plantilla con texto editable', async () => {
    const { store, raiz, listo } = await montar();
    const casillas = [...raiz.querySelectorAll<HTMLLabelElement>('fieldset.decisivos label')];
    expect(casillas.map((l) => l.textContent!.trim())).toEqual(store.caso()!.hitos.map((h) => h.nombre));
    expect(casillas.filter((l) => l.querySelector('input')!.checked)).toHaveLength(2); // el catálogo trae dos decisivos

    // Los cuatro finales de plantilla se pueden reescribir.
    cambiar(campo(raiz, '#pt-protectora'), 'Acompañaste bien a la persona.');
    await listo();
    expect(store.caso()!.textosPlantilla).toEqual({ protectora: { texto: 'Acompañaste bien a la persona.' } });

    // Marcar otro hito como decisivo regenera la condición de los cuatro, sin pisar el texto que se editó.
    const otro = store.caso()!.hitos.findIndex((h) => !h.decisivo);
    casillas[otro].querySelector('input')!.click();
    await listo();
    const decisivos = store.caso()!.hitos.filter((h) => h.decisivo);
    expect(decisivos).toHaveLength(3);
    expect(JSON.stringify(finalesDePlantilla(store.caso()!)[1].condicion)).toContain(decisivos[2].clave);
    expect(campo(raiz, '#pt-protectora').value).toBe('Acompañaste bien a la persona.');
    expect(raiz.querySelector('#regla-protectora')!.textContent).toContain(`«${decisivos[2].nombre}»`);
    expect([...raiz.querySelectorAll('li.final-plantilla strong')].map((n) => n.textContent)).toEqual(
      ['critica', 'protectora', 'riesgo_persistente', 'con_brechas'].map((id) => FINALES_AUTOMATICOS[id as keyof typeof FINALES_AUTOMATICOS].nombre),
    );
  });

  it('el nombre también se reescribe, y «Volver al texto original» deja el del modelo', async () => {
    const { store, raiz, listo } = await montar();
    expect(raiz.querySelector('#restaurar-critica')).toBeNull(); // nada que restaurar
    cambiar(campo(raiz, '#pn-critica'), 'Con peligro de revictimización');
    await listo();
    expect(store.caso()!.textosPlantilla).toEqual({ critica: { nombre: 'Con peligro de revictimización' } });
    raiz.querySelector<HTMLButtonElement>('#restaurar-critica')!.click();
    await listo();
    expect(store.caso()!.textosPlantilla).toEqual({});
    expect(campo(raiz, '#pn-critica').value).toBe(FINALES_AUTOMATICOS.critica.nombre);
  });

  it('la tabla «qué camino lleva a qué final» dice la regla de cada final y si algún recorrido llega', async () => {
    const { raiz } = await montar();
    const filas = [...raiz.querySelectorAll<HTMLElement>('li.final-plantilla')];
    const alcance = filas.map((f) => f.querySelector('.alcance')!.textContent!.trim());
    // buena → cumple los dos decisivos → protectora; mala → una contraindicada sin los decisivos → crítica
    expect(alcance).toEqual([
      // E5: la insignia de cada final es corta; «con las respuestas de ahora» lo dice el resumen de los recorridos.
      'Algún recorrido llega aquí', 'Algún recorrido llega aquí', 'Ningún recorrido llega aquí', 'Ningún recorrido llega aquí',
    ]);
    expect(filas[3].querySelector('.regla')!.textContent).toContain('En cualquier otro caso.');
  });

  it('sin hitos decisivos avisa que los finales no dependen de los pasos del caso', async () => {
    const { store, raiz, listo } = await montar();
    for (const h of store.caso()!.hitos.filter((x) => x.decisivo)) store.editarHito(h.clave, { decisivo: false });
    await listo();
    expect(raiz.querySelector('.sin-decisivos')!.textContent).toContain('Marca al menos un hito como decisivo');
    expect(raiz.textContent).not.toMatch(/estr[eé]s|puntaje|puntos/i);
  });
});

describe('FinalesComponent · modo propio con condiciones en frases', () => {
  afterEach(() => document.querySelectorAll('body > app-finales, body > [ng-version]').forEach((n) => n.remove()));

  it('cada final dice cuándo llega con frases: «Si cumplió el hito…», «Si eligió al menos…», «Si la persona terminó…»', async () => {
    const { store, raiz, listo } = await montar('propio');
    store.agregarFinal();
    await listo();
    const tipo = campo(raiz, 'select[aria-label="Tipo de condición"]');
    expect([...tipo.options].map((o) => o.textContent!.trim())).toEqual([
      'Si cumplió el hito', 'Si no cumplió el hito', 'Si eligió respuestas contraindicadas', 'Si no eligió ninguna respuesta contraindicada',
      'Si eligió respuestas con riesgo', 'Si la persona terminó', 'Ninguna condición en particular',
    ]);
    cambiar(tipo, 'persona');
    await listo();
    expect(store.caso()!.finales[0].condicion).toEqual({ persona: { bond: 'OPEN' } });
    const vinculo = campo(raiz, 'select[aria-label="Cómo termina el vínculo"]');
    const activacion = campo(raiz, 'select[aria-label="Cómo termina la activación"]');
    expect([...vinculo.options].map((o) => o.textContent!.trim())).toEqual(['Cualquiera', 'retraída', 'cautelosa', 'abierta']);
    expect([...activacion.options].map((o) => o.textContent!.trim())).toEqual(['Cualquiera', 'serena', 'tensa', 'en crisis']);
    cambiar(activacion, 'CALM');
    await listo();
    expect(store.caso()!.finales[0].condicion).toEqual({ persona: { bond: 'OPEN', activation: 'CALM' } });
    expect(raiz.querySelector('.condicion .en-palabras')!.textContent).toContain('la persona termina abierta y serena');
  });

  it('se combinan frases con «y» y se quitan, hasta quedar sin condición', async () => {
    const { store, raiz, listo } = await montar('propio');
    store.agregarFinal();
    const hito = store.caso()!.finales[0].condicion as { milestone: string };
    await listo();
    raiz.querySelector<HTMLButtonElement>('button.agregar-condicion')!.click();
    await listo();
    // la segunda frase nace como «no eligió ninguna contraindicada»: lo más natural junto a un hito cumplido
    expect(store.caso()!.finales[0].condicion).toEqual({ all: [{ milestone: hito.milestone }, { count: 'contraindicated', eq: 0 }] });
    expect(raiz.querySelectorAll('.condicion select[aria-label^="Tipo de condición"]')).toHaveLength(2);
    const segunda = campo(raiz, 'select[aria-label="Tipo de condición 2"]');
    cambiar(segunda, 'contraindicadas');
    await listo();
    expect(store.caso()!.finales[0].condicion).toEqual({ all: [{ milestone: hito.milestone }, { count: 'contraindicated', gte: 1 }] });
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Quitar la condición 2"]')!.click();
    await listo();
    expect(store.caso()!.finales[0].condicion).toEqual({ milestone: hito.milestone });
    raiz.querySelector<HTMLButtonElement>('button[aria-label="Quitar la condición"]')!.click();
    await listo();
    expect(store.caso()!.finales[0].condicion).toBeNull();
    expect(raiz.querySelector('.condicion')!.textContent).toContain('Ninguna condición en particular');
  });

  it('una condición con «o» o con comparaciones que el editor no sabe mostrar se conserva como «condición combinada»', async () => {
    const { store, raiz, listo } = await montar('propio');
    store.agregarFinal();
    const hito = store.caso()!.hitos[0];
    const combinada = { any: [{ milestone: hito.clave }, { count: 'risky' as const, gte: 3 }] };
    store.editarFinal(store.caso()!.finales[0].id, { condicion: combinada });
    await listo();
    const condicion = raiz.querySelector('.condicion')!;
    expect(condicion.textContent).toContain('Una condición combinada');
    expect(condicion.textContent).toContain(`cumple «${hito.nombre}» o elige al menos 3 respuestas con riesgo`);
    expect(condicion.querySelector('select')).toBeNull(); // no se edita: se conserva como está
    expect(store.caso()!.finales[0].condicion).toEqual(combinada);
  });

  it('cada final tiene un lugar al que llevar desde la revisión', async () => {
    const { store, raiz, listo } = await montar('propio');
    const id = store.agregarFinal();
    await listo();
    expect(raiz.querySelector(`li.final[id="final-${id}"]`)).not.toBeNull();
  });
});
