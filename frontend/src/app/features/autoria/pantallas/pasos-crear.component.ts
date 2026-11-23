import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Router } from '@angular/router';

import type { CasoStore } from '../estado/caso.store';
import { rutaDelEditor } from '../rutas';

/**
 * Indicador «Paso 1 de 2» al crear un caso: dos fichas unidas por un hilo, la actual en el color de acción y la hecha con
 * visto. El orden de lectura es el de la ficha, así que «Paso N de 2» queda al principio para quien usa lector de pantalla.
 */
@Component({
  selector: 'app-pasos-crear',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Pasos para crear el caso" class="pasos">
      <p class="cuenta">Paso {{ paso() }} de 2</p>
      <ol>
        <li [attr.aria-current]="paso() === 1 ? 'step' : null" [class.hecho]="paso() > 1">
          <span class="numero" aria-hidden="true">{{ paso() > 1 ? '✓' : '1' }}</span>
          <span class="rotulo">Elegir un lugar{{ paso() > 1 ? ' (hecho)' : '' }}</span>
        </li>
        <li [attr.aria-current]="paso() === 2 ? 'step' : null">
          <span class="numero" aria-hidden="true">2</span>
          <span class="rotulo">Elegir salas y recorrido</span>
        </li>
      </ol>
    </nav>
  `,
  styles: `
    .pasos { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 1.25rem; min-inline-size: 0; }
    .cuenta { margin: 0; font-size: var(--autoria-texto-16); color: var(--texto-secundario); font-weight: 700; }
    ol { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0; margin: 0; padding: 0; list-style: none; min-inline-size: 0; }
    li { display: inline-flex; align-items: center; gap: 0.5rem; font-size: var(--autoria-texto-16); color: var(--texto-secundario); min-inline-size: 0; }
    /* El hilo que une las dos fichas: una raya de filo fino, sin ocupar un tercer elemento de la lista. */
    li + li::before { content: ''; inline-size: 2rem; block-size: 1px; margin-inline: 0.5rem; background: var(--borde-control); }
    li[aria-current='step'] { color: var(--tinta); font-weight: 700; }
    .numero {
      display: inline-flex; align-items: center; justify-content: center; flex: none; inline-size: 2rem; block-size: 2rem; border-radius: 999px;
      border: 1px solid var(--borde-control); background: var(--superficie); font-weight: 700;
    }
    li[aria-current='step'] .numero { background: var(--primario); border-color: var(--primario); color: var(--sobre-primario); }
    li.hecho .numero { background: var(--adecuada-tinte); border-color: var(--adecuada-borde); color: var(--adecuada); }
    @media (max-width: 40rem) {
      /* En el teléfono las dos fichas van una bajo otra (en un renglón no caben sus nombres) y el hilo horizontal sobra. */
      .cuenta { flex: 1 0 100%; }
      ol { flex-direction: column; align-items: flex-start; flex: 1 0 100%; }
      li + li::before { display: none; }
    }
  `,
})
export class PasosCrearComponent {
  readonly paso = input.required<1 | 2>();
}

/**
 * Abre el caso recién creado en el guion de su primera escena: es lo primero que hay que escribir. Lee el caso (el marco no lo
 * vuelve a pedir si ya está abierto) y, si no se pudo leer o no tiene escenas, cae en la pantalla del caso, que sí lo dice.
 */
export async function abrirElCasoNuevo(store: CasoStore, router: Router, id: number | string): Promise<void> {
  let destino = '/editor';
  try {
    await store.cargar(Number(id));
    const caso = store.caso();
    const primera = caso?.inicioId ?? caso?.escenas[0]?.id ?? null;
    if (primera !== null && primera !== undefined && String(primera) !== '') destino = `/editor/escena/${encodeURIComponent(String(primera))}`;
  } catch {
    // Sin poder leerlo, el marco lo abre en la pantalla del caso y dice qué pasó.
  }
  await router.navigateByUrl(rutaDelEditor(destino, String(id)));
}
