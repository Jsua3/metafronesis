import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { SelectorCondicionComponent } from './selector-condicion.component';

/** Lo que hace el guion: el selector de una respuesta, conectado al almacén. */
@Component({
  selector: 'app-anfitrion',
  imports: [SelectorCondicionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (escena(); as e) {
      @for (r of e.respuestas; track r.id) {
        <app-selector-condicion [condicion]="r.requiere" [salaId]="e.salaId" leyenda="Aparece si…" vacio="Siempre aparece."
                                [idBase]="'aparece-si-' + r.id" (cambio)="store.editarRequisito(e.id, r.id, $event)" />
      }
    }
  `,
})
class AnfitrionComponent {
  readonly escenaId = input.required<string>();
  protected readonly store = inject(CasoStore);
  protected readonly escena = computed(() => this.store.caso()?.escenas.find((x) => x.id === this.escenaId()));
}

async function montar(opciones: { requiere?: Record<string, unknown> } = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [AnfitrionComponent], providers: [provideRouter([])] }).compileComponents();
  const store = TestBed.inject(CasoStore);
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
  const escenaId = caso.escenas[1].id;
  const sala = caso.salas.find((s) => s.id === caso.escenas[1].salaId)!;
  // En el servidor cada colocación guardada trae su clave; aquí solo la primera de cada tipo y una sin guardar.
  sala.personajes[0].clave = 'psicologa';
  sala.objetos[0].clave = 'vaso'; // «Vaso de agua», entrega la herramienta PAP
  sala.objetos[0].toolCode = 'PAP';
  sala.objetos[1].clave = 'folleto';
  sala.objetos.push({ ref: 'caja-panuelos', x: 9, y: 9 }); // aún sin guardar: sin clave
  caso.hitos.push({ clave: 'informar', nombre: 'Informar derechos', descripcion: '', decisivo: false });
  caso.herramientas = [{ codigo: 'PAP', nombre: 'Primeros auxilios' }, { codigo: 'FICHA', nombre: 'Ficha de derivación' }];
  caso.escenas[1].respuestas = [{
    id: 'r1', texto: 'Hola', clase: 'RECOMMENDED', razon: '', retroalimentacion: '', efectos: {}, destinoId: null, marcaIa: false,
    ...(opciones.requiere ? { requiere: opciones.requiere } : {}),
  }];
  store.fijar(caso);
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.componentRef.setInput('escenaId', escenaId);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const raiz = fixture.nativeElement as HTMLElement;
  const editar = vi.spyOn(store, 'editarRequisito');
  const respuesta = () => store.caso()!.escenas.find((e) => e.id === escenaId)!.respuestas[0];
  const casilla = (id: string) => raiz.querySelector<HTMLInputElement>(`#aparece-si-r1-${id}`)!;
  const marcar = async (id: string, valor: boolean) => {
    const c = casilla(id);
    c.checked = valor;
    c.dispatchEvent(new Event('change'));
    await listo();
  };
  return { store, escenaId, raiz, listo, editar, respuesta, casilla, marcar };
}

describe('SelectorCondicionComponent', () => {
  it('es un grupo con su leyenda, su ayuda enlazada y tres grupos de casillas con nombre', async () => {
    const { raiz, casilla } = await montar();
    const grupo = raiz.querySelector<HTMLFieldSetElement>('fieldset#aparece-si-r1')!;
    expect(grupo.querySelector('legend')!.textContent).toBe('Aparece si…');
    expect(raiz.querySelector('#aparece-si-r1-ayuda')!.textContent).toContain('tienen que cumplirse todas');
    expect(grupo.getAttribute('aria-describedby')).toBe('aparece-si-r1-ayuda');
    expect(raiz.querySelector('#aparece-si-r1-g-personas')!.textContent).toContain('habló con');
    expect(raiz.querySelector('#aparece-si-r1-g-objetos')!.textContent).toContain('revisó');
    expect(raiz.querySelector('#aparece-si-r1-g-herramientas')!.textContent).toContain('usó');
    expect(casilla('talked-psicologa').labels?.[0].textContent).toContain('Psicóloga de Bienestar');
    expect(raiz.textContent).toContain('Siempre aparece.');
  });

  it('marcar a la psicóloga y el vaso emite {all: [{talked}, {inspected}]}', async () => {
    const { marcar, editar, respuesta } = await montar();
    await marcar('talked-psicologa', true);
    expect(editar).toHaveBeenLastCalledWith(expect.any(String), 'r1', { talked: 'psicologa' });
    await marcar('inspected-vaso', true);
    expect(editar).toHaveBeenLastCalledWith(expect.any(String), 'r1', { all: [{ talked: 'psicologa' }, { inspected: 'vaso' }] });
    expect(respuesta().requiere).toEqual({ all: [{ talked: 'psicologa' }, { inspected: 'vaso' }] });
  });

  it('desmarcar todo emite {} y vuelve a decir «Siempre aparece.»', async () => {
    const { marcar, respuesta, raiz } = await montar({ requiere: { talked: 'psicologa' } });
    expect(raiz.textContent).not.toContain('Siempre aparece.');
    await marcar('talked-psicologa', false);
    expect(respuesta().requiere).toEqual({});
    expect(raiz.textContent).toContain('Siempre aparece.');
  });

  it('un grupo de un solo hecho se normaliza al hecho solo, pero solo cuando la docente cambia el requisito', async () => {
    const { marcar, editar, respuesta, casilla } = await montar({ requiere: { all: [{ talked: 'psicologa' }] } });
    expect(casilla('talked-psicologa').checked).toBe(true);
    expect(editar).not.toHaveBeenCalled(); // mostrarlo no lo reescribe
    expect(respuesta().requiere).toEqual({ all: [{ talked: 'psicologa' }] });
    await marcar('inspected-vaso', true);
    expect(respuesta().requiere).toEqual({ all: [{ talked: 'psicologa' }, { inspected: 'vaso' }] });
    await marcar('inspected-vaso', false);
    expect(respuesta().requiere).toEqual({ talked: 'psicologa' });
  });

  it('con un requisito de hito muestra las palabras, no casillas, y no lo cambia hasta Quitar', async () => {
    const { raiz, store, escenaId, listo, editar, respuesta } = await montar({ requiere: { all: [{ talked: 'psicologa' }, { milestone: 'informar' }] } });
    expect(raiz.querySelectorAll('input[type=checkbox]').length).toBe(0);
    expect(raiz.querySelector('#aparece-si-r1-otra')!.textContent).toContain('Este requisito tiene partes que el editor no sabe mostrar:');
    expect(raiz.querySelector('#aparece-si-r1-otra')!.textContent).toContain('habló con Psicóloga de Bienestar y cumplió el hito');
    expect(raiz.querySelector('#aparece-si-r1-otra')!.textContent).toContain('Se conserva tal cual.');

    // Guardar otra cosa de la misma respuesta no toca el requisito.
    store.editarRespuesta(escenaId, 'r1', { texto: 'Otra cosa' });
    await listo();
    expect(respuesta().requiere).toEqual({ all: [{ talked: 'psicologa' }, { milestone: 'informar' }] });
    expect(editar).not.toHaveBeenCalled();

    raiz.querySelector<HTMLButtonElement>('#aparece-si-r1-quitar')!.click();
    await listo();
    expect(editar).toHaveBeenCalledWith(escenaId, 'r1', {});
    expect(respuesta().requiere).toEqual({});
    expect(raiz.querySelectorAll('input[type=checkbox]').length).toBeGreaterThan(0);
    expect(document.activeElement?.id).toBe('aparece-si-r1'); // el botón desaparece: el foco no se pierde
  });

  it('un hecho de ambiente, un has y un used con @objetivo se muestran en palabras y se conservan al guardar otra cosa', async () => {
    for (const requiere of [{ talked: 'ambiente-9' }, { has: 'PAP' }, { used: 'PAP@objetivo' }, { all: [{ talked: 'psicologa' }, { has: 'PAP' }] }]) {
      const { raiz, store, escenaId, listo, respuesta } = await montar({ requiere });
      expect(raiz.querySelectorAll('input[type=checkbox]').length, JSON.stringify(requiere)).toBe(0);
      expect(raiz.querySelector('#aparece-si-r1-otra')!.textContent).not.toContain('no puede leer');
      store.editarRespuesta(escenaId, 'r1', { retroalimentacion: 'Algo' });
      await listo();
      expect(respuesta().requiere).toEqual(requiere);
    }
  });

  it('una pieza sin guardar no aparece y una herramienta que nadie entrega lleva su aviso', async () => {
    const { raiz, casilla } = await montar();
    const nombres = [...raiz.querySelectorAll('label.casilla')].map((l) => l.textContent!.replace(/▲\s*sin entrega/, '').trim());
    expect(nombres).toContain('Vaso de agua');
    expect(nombres).not.toContain('Caja de pañuelos');
    expect(raiz.querySelectorAll('#aparece-si-r1-g-objetos ~ .casillas label.casilla').length).toBe(2);
    expect(casilla('used-PAP').getAttribute('aria-describedby')).toBeNull(); // la entrega el vaso
    // El aviso se dice UNA vez, arriba de las herramientas (EDITOR.md §3.4.1); la herramienta lleva su marca y apunta a él.
    expect(casilla('used-FICHA').getAttribute('aria-describedby')).toBe('aparece-si-r1-aviso-herramientas');
    expect(raiz.querySelectorAll('[id^="aparece-si-r1-aviso"]').length).toBe(1);
    expect(raiz.querySelector('#aparece-si-r1-aviso-herramientas')!.textContent)
      .toContain('Nadie entrega esta herramienta en el caso: el estudiante no podrá conseguirla.');
    expect(casilla('used-FICHA').closest('label')!.textContent).toContain('sin entrega');
    expect(casilla('used-PAP').closest('label')!.textContent).not.toContain('sin entrega');
  });

  it('marcar una herramienta escribe {used: código}', async () => {
    const { marcar, respuesta } = await montar();
    await marcar('used-PAP', true);
    expect(respuesta().requiere).toEqual({ used: 'PAP' });
  });
});
