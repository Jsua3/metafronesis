import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HintEditorState, MapEditorState, NodeEditorState } from '../../core/models/simulation.model';
import { CaseHintsComponent } from './case-hints.component';

const map = (id: number, title: string, nodeId: number): MapEditorState => ({
  id, key: `sala-${id}`, title, width: 960, height: 540, theme: 'clinical-soft', spawnX: 145, spawnY: 430, nodeId, nodeKey: `escena-${nodeId}`,
});
const node = (id: number, title: string): NodeEditorState => ({ id, key: `escena-${id}`, title } as NodeEditorState);
const hint = (id: number, mapId: number, order: number, textValue: string): HintEditorState => ({ id, mapId, order, text: textValue });

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const MAPS = [map(11, 'Sala de espera', 1), map(12, 'Consultorio', 2)];
const NODES = [node(1, 'Llegada'), node(2, 'Entrevista')];

/**
 * «Ayudas» del editor (plan visual F10-3†; E3-5, RF-11): cada sala del caso con sus ayudas en orden, para agregar, editar y
 * quitar. La pantalla del editor abre la hoja y llama al servidor; este componente solo presenta y avisa qué se pidió.
 */
// req: RF-11, CU-04, RNF-04
describe('CaseHintsComponent', () => {
  let fixture: ComponentFixture<CaseHintsComponent>;
  let created: number[];
  let edited: HintEditorState[];
  let removed: HintEditorState[];
  let wentToMaps: number;

  const root = () => fixture.nativeElement as HTMLElement;
  const cards = () => [...root().querySelectorAll<HTMLElement>('.ch-card')];
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')]
    .find(item => (item.getAttribute('aria-label') ?? text(item.querySelector('.ui-button__label'))) === label);

  async function render(inputs: { maps?: MapEditorState[]; hints?: HintEditorState[]; lockReason?: string | null } = {}) {
    created = [];
    edited = [];
    removed = [];
    wentToMaps = 0;
    TestBed.configureTestingModule({ imports: [CaseHintsComponent], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(CaseHintsComponent);
    fixture.componentRef.setInput('maps', inputs.maps ?? MAPS);
    fixture.componentRef.setInput('nodes', NODES);
    fixture.componentRef.setInput('hints', inputs.hints ?? []);
    fixture.componentRef.setInput('lockReason', inputs.lockReason ?? null);
    fixture.componentInstance.create.subscribe(mapId => created.push(mapId));
    fixture.componentInstance.edit.subscribe(item => edited.push(item));
    fixture.componentInstance.remove.subscribe(item => removed.push(item));
    fixture.componentInstance.goToMaps.subscribe(() => { wentToMaps += 1; });
    await fixture.whenStable();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('una tarjeta por sala, con la escena a la que pertenece y cuántas ayudas tiene', async () => {
    await render({ hints: [hint(1, 11, 1, 'Mira cómo respira.'), hint(2, 11, 2, 'Pregunta por el sueño.')] });

    expect(cards().map(card => text(card.querySelector('.ch-title')))).toEqual(['Sala de espera', 'Consultorio']);
    expect(cards().map(card => text(card.querySelector('.ch-meta')))).toEqual(['Escena «Llegada»', 'Escena «Entrevista»']);
    expect(cards().map(card => text(card.querySelector('ui-badge')))).toEqual(['2 ayudas', 'Sin ayudas']);
  });

  it('las ayudas de cada sala van en su orden (por lugar y, a igual lugar, por id) y numeradas', async () => {
    await render({
      hints: [hint(3, 11, 2, 'Segunda'), hint(1, 11, 1, 'Primera'), hint(4, 12, 1, 'De otra sala'), hint(2, 11, 2, 'Segunda bis')],
    });

    const first = cards()[0];
    expect([...first.querySelectorAll('.ch-text')].map(text)).toEqual(['Primera', 'Segunda bis', 'Segunda']);
    expect(first.querySelector('ol')!.getAttribute('aria-label')).toBe('Ayudas de Sala de espera');
    expect([...cards()[1].querySelectorAll('.ch-text')].map(text)).toEqual(['De otra sala']);
  });

  it('una sala sin ayudas lo dice en su tarjeta', async () => {
    await render();

    expect(text(cards()[0])).toContain('Esta sala aún no tiene ayudas.');
    expect(cards()[0].querySelector('ol')).toBeNull();
  });

  it('«Agregar ayuda» tiene el nombre de su sala y pide crearla en ella', async () => {
    await render();

    button('Agregar ayuda a «Consultorio»')!.click();

    expect(created).toEqual([12]);
  });

  it('editar y quitar nombran la ayuda por su lugar y su sala, y entregan la ayuda', async () => {
    const second = hint(2, 11, 2, 'Pregunta por el sueño.');
    await render({ hints: [hint(1, 11, 1, 'Mira cómo respira.'), second] });

    button('Editar ayuda 2 de «Sala de espera»')!.click();
    button('Eliminar ayuda 2 de «Sala de espera»')!.click();

    expect(edited).toEqual([second]);
    expect(removed).toEqual([second]);
  });

  // req: RNF-004, WCAG 2.4.3 (revisión de F10)
  it('tras quitar una ayuda el foco va a «Agregar ayuda» de esa sala (el botón que se pulsó desaparece con la fila)', async () => {
    await render({ hints: [hint(1, 11, 1, 'Primera.'), hint(2, 11, 2, 'Segunda.')] });
    document.body.appendChild(root());
    button('Eliminar ayuda 1 de «Sala de espera»')!.click();

    fixture.componentRef.setInput('hints', [hint(2, 11, 2, 'Segunda.')]);
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve));

    expect(document.activeElement).toBe(button('Agregar ayuda a «Sala de espera»'));
    root().remove();
  });

  it('si se pidió quitar y la ayuda sigue (se canceló), el foco no se mueve cuando la lista cambia por otra razón', async () => {
    await render({ hints: [hint(1, 11, 1, 'Primera.')] });
    document.body.appendChild(root());
    button('Eliminar ayuda 1 de «Sala de espera»')!.click();
    const edit = button('Editar ayuda 1 de «Sala de espera»')!;
    edit.focus();

    fixture.componentRef.setInput('hints', [hint(1, 11, 1, 'Primera, editada.'), hint(2, 11, 2, 'Nueva.')]);
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve));

    expect(document.activeElement).toBe(edit);
    root().remove();
  });

  it('una versión que no es borrador bloquea agregar, editar y quitar con su motivo', async () => {
    const reason = 'Esta versión no es un borrador y no se puede modificar: clónala para editarla.';
    await render({ hints: [hint(1, 11, 1, 'Mira cómo respira.')], lockReason: reason });

    for (const label of ['Agregar ayuda a «Sala de espera»', 'Editar ayuda 1 de «Sala de espera»', 'Eliminar ayuda 1 de «Sala de espera»']) {
      const target = button(label)!;
      expect(target.getAttribute('aria-disabled'), label).toBe('true');
      expect(text(target.querySelector('[hidden]')), label).toBe(reason);
      target.click();
    }
    expect(created).toEqual([]);
    expect(edited).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('sin salas explica que las ayudas viven en una sala y lleva a Mapas', async () => {
    await render({ maps: [] });

    expect(cards()).toHaveLength(0);
    expect(text(root())).toContain('Este caso aún no tiene salas');
    expect(text(root())).toContain('Las ayudas viven en la sala de una escena');
    button('Ir a Mapas')!.click();
    expect(wentToMaps).toBe(1);
  });
});
