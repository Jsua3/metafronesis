import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccesoEscenaComponent } from './acceso-escena.component';
import { RECORRIDO_PASOS, RECORRIDO_ROTULOS } from './recorrido.util';

/**
 * La escena de la ventana del acceso: una imagen y los detalles que cada paso del recorrido pone encima. Solo presentación;
 * el avance y la pausa son del acceso (login.component.spec.ts).
 */
describe('AccesoEscenaComponent', () => {
  let fixture: ComponentFixture<AccesoEscenaComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(paso = 0): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(AccesoEscenaComponent);
    fixture.componentRef.setInput('imagen', 'assets/images/institution/escena-portada.webp');
    fixture.componentRef.setInput('paso', paso);
    await fixture.whenStable();
  }

  it('el host lleva acceso__scene (el acceso le escribe la luz y el paralaje del puntero) y el paso en data-paso', async () => {
    await render();
    expect(host().classList.contains('acceso__scene')).toBe(true);
    for (const [indice, clave] of RECORRIDO_PASOS.entries()) {
      fixture.componentRef.setInput('paso', indice);
      await fixture.whenStable();
      expect(host().getAttribute('data-paso')).toBe(clave);
    }
  });

  it('un paso fuera de rango cae en el primero en vez de dejar la escena sin cámara', async () => {
    await render(9);
    expect(host().getAttribute('data-paso')).toBe('simula');
  });

  it('pinta la imagen una sola vez, con su tamaño, sin diferirla (es el LCP) y con texto alternativo', async () => {
    await render();
    const imagenes = host().querySelectorAll('img');
    expect(imagenes).toHaveLength(1);
    expect(imagenes[0].getAttribute('src')).toBe('assets/images/institution/escena-portada.webp');
    expect([imagenes[0].getAttribute('width'), imagenes[0].getAttribute('height')]).toEqual(['581', '415']);
    expect(imagenes[0].getAttribute('loading')).not.toBe('lazy');
    expect(imagenes[0].getAttribute('alt')!.length).toBeGreaterThan(20);
  });

  it('el rótulo dice el paso y se crea de nuevo con cada uno (para que entre con su resorte)', async () => {
    await render();
    for (const [indice, clave] of RECORRIDO_PASOS.entries()) {
      fixture.componentRef.setInput('paso', indice);
      await fixture.whenStable();
      expect(text(host().querySelector('.rotulo'))).toBe(RECORRIDO_ROTULOS[clave]);
    }
    expect(host().querySelectorAll('.rotulo')).toHaveLength(1);
  });

  it('las opciones de ejemplo son tres, solo una queda marcada y ninguna dice cuál es la correcta (P1)', async () => {
    await render();
    const opciones = [...host().querySelectorAll('.opciones li')];
    expect(opciones).toHaveLength(3);
    expect(opciones.filter(opcion => opcion.classList.contains('elegida'))).toHaveLength(1);
    for (const opcion of opciones) expect(text(opcion)).not.toMatch(/correct|incorrect|mejor|peor|bien|mal|\d/i);
  });

  it('todo lo que va sobre la imagen es decoración (aria-hidden): el texto del paso, fuera de la escena, lo dice todo', async () => {
    await render();
    for (const selector of ['.rotulo', '.brillo', '.opciones', '.nota', '.resalte']) {
      expect(host().querySelector(selector)!.getAttribute('aria-hidden')).toBe('true');
    }
    expect(host().querySelector('button, a, input, [tabindex]')).toBeNull();
  });
});
