import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { CasoStore } from '../../estado/caso.store';
import { faltasPorSala } from '../../modelo/salas-a-documento';
import { CASOS_DE_REGLAS_DE_SALA } from '../../modelo/reglas-salas-casos.fixture';
import { CASO_HOSPITAL } from '../../testing/hospital';
import { PanelDeEstructuraComponent } from './panel-de-estructura.component';

async function montar() {
  TestBed.resetTestingModule();
  const ficha = { nombre: 'Ventana alta', ocupa: 40, franja: [0, 40], muros: ['fondo'], cuadros: 1, vistas: {} };
  const manifiesto = { piezas: { 'ventana/alta': ficha, 'lampara/pie': { ...ficha, nombre: 'Lámpara de pie', muros: ['suelo'] } },
    pisos: { 'vinilo-a': {}, 'madera-b': {} }, muros: { 'liso/blanco': {}, 'ladrillo/rojo': {} } };
  const catalogo = { manifiesto: signal(manifiesto), paleta: () => [
    { clave: 'ventanas', nombre: 'Ventanas', modelos: [{ tipo: 'ventana', modelo: 'alta', nombre: 'Ventana alta', muros: ['fondo'] }] },
    { clave: 'lamparas', nombre: 'Lámparas', modelos: [{ tipo: 'lampara', modelo: 'pie', nombre: 'Lámpara de pie', muros: ['suelo'] }] },
  ], acabados() { return CatalogoDePiezas.prototype.acabados.call(this as unknown as CatalogoDePiezas); } };
  await TestBed.configureTestingModule({ imports: [PanelDeEstructuraComponent],
    providers: [{ provide: CatalogoDePiezas, useValue: catalogo }] }).compileComponents();
  const store = TestBed.inject(CasoStore);
  const caso = structuredClone(CASO_HOSPITAL);
  caso.salas[0].estructura!.acabados = { piso: 'vinilo', variante: 'a', muro: 'liso', paleta: 'blanco' };
  store.fijar(caso);
  const fixture = TestBed.createComponent(PanelDeEstructuraComponent);
  const actualizar = () => { fixture.componentRef.setInput('sala', store.caso()!.salas[0]); fixture.detectChanges(); };
  actualizar();
  return { fixture, store, actualizar, raiz: fixture.nativeElement as HTMLElement };
}

/** E4: la apariencia se elige con muestras (botones de opción) agrupadas por `data-grupo`, no con listas de texto. */
const grupo = (raiz: HTMLElement, nombre: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>(`[role="radiogroup"][data-grupo="${nombre}"] [role="radio"]`)];
const valores = (raiz: HTMLElement, nombre: string) => grupo(raiz, nombre).map(b => b.dataset['valor']);
const elegido = (raiz: HTMLElement, nombre: string) => grupo(raiz, nombre).find(b => b.getAttribute('aria-checked') === 'true')?.dataset['valor'];

describe('PanelDeEstructuraComponent', () => {
  it('agregar una ventana la pone en el primer hueco del fondo, elegida y enfocada', async () => {
    const { fixture, store, actualizar, raiz } = await montar();
    const elegidas: string[] = []; fixture.componentInstance.agregada.subscribe(id => elegidas.push(id));
    raiz.querySelector<HTMLButtonElement>('[role="tab"]')!.click(); fixture.detectChanges();
    raiz.querySelector<HTMLButtonElement>('[data-modelo="alta"]')!.click(); actualizar();
    const pieza = store.caso()!.salas[0].estructura!.piezas!.at(-1)!;
    expect(pieza.muro).toBe('fondo'); expect(elegidas[0]).toContain(pieza.id!);
  });

  it('una lámpara de pie se agrega en el suelo, dentro de la zona', async () => {
    const { fixture, store, actualizar, raiz } = await montar();
    raiz.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(); fixture.detectChanges();
    raiz.querySelector<HTMLButtonElement>('[data-modelo="pie"]')!.click(); actualizar();
    const pieza = store.caso()!.salas[0].estructura!.piezas!.at(-1)!;
    expect(pieza.x).toBeGreaterThan(0); expect(pieza.y).toBeGreaterThanOrEqual(236);
  });

  it('la muestra de día o de noche cambia el momento y se deshace', async () => {
    const { fixture, store, actualizar, raiz } = await montar();
    const antes = store.caso()!.salas[0].estructura!.momento;
    raiz.querySelector<HTMLButtonElement>('[data-momento][aria-checked="false"]')!.click(); actualizar();
    expect(store.caso()!.salas[0].estructura!.momento).not.toBe(antes);
    store.deshacer(); fixture.detectChanges();
    expect(store.caso()!.salas[0].estructura!.momento).toBe(antes);
  });

  it('solo ofrece variantes y paletas que existen', async () => {
    const { raiz, actualizar } = await montar();
    expect(valores(raiz, 'variante')).toEqual(['a']);
    expect(valores(raiz, 'paleta')).toEqual(['blanco']);
    grupo(raiz, 'piso').find(b => b.dataset['valor'] === 'madera')!.click(); actualizar();
    expect(valores(raiz, 'variante')).toEqual(['b']);
    grupo(raiz, 'muro').find(b => b.dataset['valor'] === 'ladrillo')!.click(); actualizar();
    expect(valores(raiz, 'paleta')).toEqual(['rojo']);
  });

  it('cada grupo de muestras marca lo que la sala tiene aunque no sea la primera opción', async () => {
    const { store, actualizar, raiz } = await montar();
    const ultimo = valores(raiz, 'piso').at(-1)!;
    grupo(raiz, 'piso').at(-1)!.click(); actualizar();
    const acabados = store.caso()!.salas[0].estructura!.acabados;
    expect(acabados.piso).toBe(ultimo);
    // Al volver a pintar desde el borrador (otra sala, deshacer, recargar), cada grupo marca lo guardado.
    const caso = structuredClone(store.caso()!);
    store.fijar(caso); actualizar();
    expect(elegido(raiz, 'piso')).toBe(acabados.piso);
    expect(elegido(raiz, 'variante')).toBe(acabados.variante);
    expect(elegido(raiz, 'muro')).toBe(acabados.muro);
    expect(elegido(raiz, 'paleta')).toBe(acabados.paleta);
    // Una sola muestra por grupo entra con Tab (patrón radio): la elegida.
    expect(grupo(raiz, 'piso').filter(b => b.tabIndex === 0)).toHaveLength(1);
  });

  it('E4 · las flechas eligen la muestra vecina y le pasan el foco', async () => {
    const { store, actualizar, raiz } = await montar();
    document.body.appendChild(raiz);
    try {
      const piso = grupo(raiz, 'piso');
      const actual = piso.findIndex(b => b.getAttribute('aria-checked') === 'true');
      piso[actual].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); actualizar();
      const esperado = piso[(actual + 1) % piso.length].dataset['valor'];
      expect(store.caso()!.salas[0].estructura!.acabados.piso).toBe(esperado);
      expect(document.activeElement).toBe(grupo(raiz, 'piso').find(b => b.dataset['valor'] === esperado));
    } finally { raiz.remove(); }
  });

  it('E4 · la parte «apariencia» no pinta el catálogo ni la puerta, y «agregar» no pinta las muestras', async () => {
    const { fixture, raiz } = await montar();
    fixture.componentRef.setInput('parte', 'apariencia'); fixture.detectChanges();
    expect(raiz.querySelector('[role="tablist"]')).toBeNull();
    expect(grupo(raiz, 'piso').length).toBeGreaterThan(0);
    fixture.componentRef.setInput('parte', 'agregar'); fixture.detectChanges();
    expect(raiz.querySelector('[role="tablist"]')).not.toBeNull();
    expect(grupo(raiz, 'piso')).toHaveLength(0);
  });

  it('crear la puerta de regreso agrega y enlaza una puerta en la sala destino', async () => {
    const { fixture, store, actualizar, raiz } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.salas[1].puertas = caso.salas[1].puertas.filter(p => p.hacia !== caso.salas[0].id);
    store.fijar(caso); actualizar();
    const puerta = caso.salas[0].puertas.find(p => p.id === 'a-pasillo');
    fixture.componentRef.setInput('puertaElegida', puerta!.id);
    fixture.componentRef.setInput('faltas', faltasPorSala(store.caso()!, CASOS_DE_REGLAS_DE_SALA.catalogo).get(caso.salas[0].id));
    fixture.detectChanges();
    const boton = [...raiz.querySelectorAll('button')].find(b => b.textContent?.includes('Crear la puerta de regreso'))!;
    boton.click(); boton.click(); actualizar();
    const origen = store.caso()!.salas[0].puertas.find(p => p.id === puerta!.id)!;
    const regresos = store.caso()!.salas[1].puertas.filter(p => p.hacia === caso.salas[0].id);
    expect(regresos).toHaveLength(1);
    expect(regresos[0]).toMatchObject({ id: origen.par, par: origen.id });
    fixture.componentRef.setInput('faltas', faltasPorSala(store.caso()!, CASOS_DE_REGLAS_DE_SALA.catalogo).get(caso.salas[0].id));
    actualizar();
    expect([...raiz.querySelectorAll('button')].some(b => b.textContent?.includes('Crear la puerta de regreso'))).toBe(false);
  });

  it('las lámparas de pie consecutivas ocupan puntos distintos dentro de la zona', async () => {
    const { fixture, store, actualizar, raiz } = await montar();
    raiz.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(); fixture.detectChanges();
    const agregar = raiz.querySelector<HTMLButtonElement>('[data-modelo="pie"]')!;
    agregar.click(); actualizar(); agregar.click(); actualizar();
    const piezas = store.caso()!.salas[0].estructura!.piezas!.slice(-2);
    expect(piezas[1].x).toBe(piezas[0].x! + 48);
    expect(piezas[1].y).toBe(piezas[0].y);
  });

});
