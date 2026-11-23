import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { CompetencyCatalogItem, RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { AuthService } from '../../core/auth/auth.service';
import { SimulationCaseSummary } from '../../core/models/revision.model';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { ComienzoRubrica, NIVELES_RUBRICA, RubricaEditorComponent, pesosIguales } from './rubrica-editor.component';

/**
 * Editor de una rúbrica (EDITOR.md §5.2, bloque R1): la matriz criterio × nivel. Heredan de la pantalla anterior
 * (F7-5, E2-2, F9-10) las reglas que ya estaban probadas: el motivo de cada botón bloqueado, la regla del 100 %, la
 * rúbrica ajena de solo lectura y el detalle que llega tarde. Se agregan las del rediseño: acordeón, orden sin campo
 * «Orden», reparto en centésimas, plantilla del catálogo, celdas de nivel, vista de solo lectura y guardia de salida.
 */
const rubric = (id: number, name: string, weights: number[], overrides: Partial<RubricAdmin> = {}): RubricAdmin => ({
  id, name, description: null, active: false, version: '1.0', isDefault: false,
  totalWeight: weights.reduce((sum, weight) => sum + weight, 0), criteriaCount: weights.length,
  criteria: weights.map((weight, index) => ({ id: id * 10 + index, title: `Criterio ${index + 1}`, weight, displayOrder: index + 1, active: true })),
  ...overrides,
} as RubricAdmin);

const completa = rubric(4, 'Entrevista inicial', [60, 40], { active: true, isDefault: true });
const incompleta = rubric(7, 'Observación de aula', [60, 30]);
const caso = { caseVersionId: 3, code: 'CASO-3', title: 'Caso tres', semanticVersion: '1.2.0' } as SimulationCaseSummary;
const catalogo: CompetencyCatalogItem[] = [
  { id: 2, code: 'MARCO_NORMATIVO', name: 'Marco normativo y rutas de atención', description: 'Conoce las rutas.', active: true, sortOrder: 2 },
  { id: 1, code: 'CONTENCION', name: 'Contención emocional y manejo de crisis', description: 'Estabiliza a la persona.', active: true, sortOrder: 1 },
  { id: 9, code: 'VIEJA', name: 'Competencia retirada', description: '', active: false, sortOrder: 3 },
  { id: 3, code: 'REFLEXION', name: 'Reflexión profesional', description: 'Revisa lo que hizo.', active: true, sortOrder: 4 },
];

interface Api {
  detail: (id: number) => Observable<RubricAdmin>;
}

describe('editor de una rúbrica (R1)', () => {
  let fixture: ComponentFixture<RubricaEditorComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;
  let dialog: { consequence: ReturnType<typeof vi.fn> };
  let guardadas: RubricAdmin[];
  let perdidas: number;

  const host = () => fixture.nativeElement as HTMLElement;
  const component = () => fixture.componentInstance;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const buttonLabelled = (label: string) => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')) === label) as HTMLButtonElement | undefined;
  const reasonOf = (button: HTMLButtonElement | undefined) => {
    const id = (button?.getAttribute('aria-describedby') ?? '').split(' ').find(Boolean);
    return id ? text(host().querySelector(`#${id}`)) : '';
  };
  const rows = () => [...host().querySelectorAll('li.criterion')];
  const titles = () => component().criteria.controls.map(c => c.get('title')!.value);
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const http = (status: number) => () => throwError(() => new HttpErrorResponse({ status, error: { success: false, message: 'x' } }));

  async function render(api: Partial<Api> = {}, { role = 'ADMIN', rubricId = 4 as number | null, comienzo = 'blanco' as ComienzoRubrica } = {}) {
    service = {
      detail: vi.fn(api.detail ?? ((id: number) => of(id === 7 ? incompleta : completa))),
      create: vi.fn(), update: vi.fn(), activate: vi.fn(), deactivate: vi.fn(), duplicate: vi.fn(), setDefault: vi.fn(),
      assignToCaseVersion: vi.fn(),
      competencies: vi.fn(() => of(catalogo)),
    };
    dialog = { consequence: vi.fn(async () => 'continue') };
    TestBed.configureTestingModule({
      imports: [RubricaEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: RubricService, useValue: service },
        { provide: AuthService, useValue: { hasRole: (...roles: string[]) => roles.includes(role) } },
        { provide: CaseCatalogApi, useValue: { listDrafts: vi.fn(() => of([caso])) } },
        { provide: NotificationService, useValue: notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
        { provide: UiDialog, useValue: dialog },
        { provide: LiveRegionAnnouncer, useValue: { announce: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(RubricaEditorComponent);
    fixture.componentRef.setInput('rubricId', rubricId);
    fixture.componentRef.setInput('comienzo', comienzo);
    guardadas = [];
    perdidas = 0;
    fixture.componentInstance.guardada.subscribe(r => guardadas.push(r));
    fixture.componentInstance.perdida.subscribe(() => (perdidas += 1));
    document.body.appendChild(host());
    await settle();
  }

  afterEach(() => {
    host()?.remove();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // E2-2: rúbricas con dueño. El docente edita solo las suyas, la de otro docente no existe para él (404) y solo el
  // administrador fija la predeterminada. req: SIEP-CU-04, RNF-002
  describe('rúbricas con dueño (E2-2)', () => {
    it('solo el administrador ve «Predeterminada»', async () => {
      await render();
      expect(buttonLabelled('Predeterminada')).toBeDefined();
      TestBed.resetTestingModule();
      await render({}, { role: 'PROFESOR' });
      expect(buttonLabelled('Predeterminada')).toBeUndefined();
      expect(buttonLabelled('Duplicar')).toBeDefined();
    });

    it('guardar una rúbrica ajena (403) explica que es de solo lectura y ofrece duplicarla para personalizarla', async () => {
      await render({}, { role: 'PROFESOR' });
      service['update'].mockImplementation(http(403));
      service['duplicate'].mockReturnValue(of(rubric(9, 'Copia de Entrevista inicial', [60, 40])));
      buttonLabelled('Guardar')!.click();
      await settle();

      expect(text(host().querySelector('.rb-readonly'))).toContain('Esta rúbrica es de solo lectura');
      expect(notify.error).not.toHaveBeenCalledWith(expect.stringContaining('No tienes permisos'));
      buttonLabelled('Duplicar para personalizar')!.click();
      await settle();
      expect(service['duplicate']).toHaveBeenCalledWith(4);
      expect(guardadas.map(r => r.id)).toEqual([9]);
    });

    it('tras un 403, abrir otra rúbrica o empezar una nueva retira el aviso de solo lectura', async () => {
      await render({}, { role: 'PROFESOR' });
      service['update'].mockImplementation(http(403));
      buttonLabelled('Guardar')!.click();
      await settle();
      expect(text(host().querySelector('.rb-readonly'))).toContain('Esta rúbrica es de solo lectura');

      component().openRubric(7);
      await settle();
      expect(host().querySelector('.rb-readonly')).toBeNull();
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).not.toContain('solo lectura');

      buttonLabelled('Guardar')!.click();
      await settle();
      expect(text(host().querySelector('.rb-readonly'))).toContain('solo lectura');
      component().newRubric();
      fixture.detectChanges();
      expect(host().querySelector('.rb-readonly')).toBeNull();
    });

    it('duplicar con cambios sin guardar crea la copia con lo que se escribió', async () => {
      await render({}, { role: 'PROFESOR' });
      component().form.patchValue({ name: 'Mi versión de la entrevista' });
      component().form.markAsDirty();
      service['update'].mockImplementation(http(403));
      service['create'].mockReturnValue(of(rubric(9, 'Copia de Mi versión de la entrevista', [60, 40])));
      buttonLabelled('Guardar')!.click();
      await settle();

      buttonLabelled('Duplicar para personalizar')!.click();
      await settle();

      expect(service['duplicate']).not.toHaveBeenCalled();
      const sent = service['create'].mock.calls[0][0];
      expect(sent.name).toBe('Copia de Mi versión de la entrevista');
      expect(sent.criteria).toHaveLength(2);
      expect(sent.criteria.every((criterion: { id?: number }) => criterion.id === undefined)).toBe(true);
      expect(component().selected()?.id).toBe(9);
      expect(host().querySelector('.rb-readonly')).toBeNull();
    });

    it('desactivar una ajena (403) también lo explica', async () => {
      await render({}, { role: 'PROFESOR' });
      service['deactivate'].mockImplementation(http(403));
      buttonLabelled('Desactivar')!.click();
      await settle();
      expect(text(host().querySelector('.rb-readonly'))).toContain('Esta rúbrica es de solo lectura');
    });

    it('usarla en un caso que no creó (403) dice que solo quien creó el caso puede asignarle una rúbrica', async () => {
      await render({}, { role: 'PROFESOR' });
      service['assignToCaseVersion'].mockImplementation(http(403));
      component().selectCaseVersion('3');
      fixture.detectChanges();
      buttonLabelled('Usar en el caso')!.click();
      await settle();
      expect(notify.error).toHaveBeenCalledWith('Solo quien creó el caso puede asignarle una rúbrica.');
    });

    it('una rúbrica que ya no está disponible (404) lo dice y avisa a quien aloja el editor', async () => {
      await render({}, { role: 'PROFESOR' });
      service['update'].mockImplementation(http(404));
      buttonLabelled('Guardar')!.click();
      await settle();
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Esta rúbrica ya no está disponible.');
      expect(perdidas).toBe(1);
    });

    it('una rúbrica ajena conocida de antemano se ve entera, sin campos, con «Duplicar para personalizar»', async () => {
      const ajena = rubric(5, 'De la institución', [50, 50], {
        editable: false,
        criteria: [
          { id: 51, title: 'Escucha', weight: 50, displayOrder: 1, active: true, levelDescriptors: { LOGRADO: 'Devuelve lo que oye.' } },
          { id: 52, title: 'Encuadre', weight: 50, displayOrder: 2, active: true },
        ],
      });
      await render({ detail: () => of(ajena) }, { role: 'PROFESOR', rubricId: 5 });

      expect(host().querySelector('form')).toBeNull();
      expect(host().querySelectorAll('input, textarea, select')).toHaveLength(0);
      expect(text(host().querySelector('.rb-readonly'))).toContain('Esta rúbrica es de solo lectura');
      const criterios = host().querySelectorAll('.re-lectura__criterio');
      expect(criterios).toHaveLength(2);
      // Cuatro niveles por criterio: el propio donde lo hay y el general (marcado) donde no.
      expect(criterios[0].querySelectorAll('.re-nivel')).toHaveLength(4);
      expect(text(criterios[0].querySelector('[data-nivel="LOGRADO"]'))).toContain('Devuelve lo que oye.');
      expect(text(criterios[0].querySelector('[data-nivel="EN_INICIO"]'))).toContain(NIVELES_RUBRICA[0].general);
      expect(text(criterios[0].querySelector('[data-nivel="EN_INICIO"]'))).toContain('Descriptor general');

      service['duplicate'].mockReturnValue(of(rubric(6, 'Copia', [50, 50])));
      buttonLabelled('Duplicar para personalizar')!.click();
      await settle();
      expect(service['duplicate']).toHaveBeenCalledWith(5);
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('acciones y regla del 100 %', () => {
    it('con la ponderación en 100: «Activar» o «Desactivar» y «Predeterminada» sin motivo, y el total en palabras', async () => {
      await render({ detail: () => of({ ...completa, active: false, isDefault: false }) });
      for (const label of ['Activar', 'Predeterminada']) {
        expect(buttonLabelled(label)!.getAttribute('aria-disabled'), label).toBeNull();
      }
      expect(host().querySelector('#rubric-weight-hint')).toBeNull();
      expect(text(host().querySelector('.rb-weight'))).toContain('Suma 100 %');
    });

    it('con la ponderación distinta de 100: la pista se ve, el total dice cuánto falta y los botones dicen POR QUÉ', async () => {
      await render({ detail: () => of(incompleta) }, { rubricId: 7 });
      expect(text(host().querySelector('#rubric-weight-hint'))).toBe('Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.');
      expect(text(host().querySelector('.rb-weight'))).toContain('Faltan 10 %');
      for (const label of ['Activar', 'Predeterminada']) {
        const button = buttonLabelled(label)!;
        expect(button.getAttribute('aria-disabled'), label).toBe('true');
        expect(reasonOf(button), label).toBe('La ponderación debe sumar 100 %.');
      }
    });

    it('ofrece «Activar» o «Desactivar», nunca los dos', async () => {
      await render();
      expect(buttonLabelled('Desactivar')).toBeDefined();
      expect(buttonLabelled('Activar')).toBeUndefined();
      TestBed.resetTestingModule();
      await render({ detail: () => of(incompleta) }, { rubricId: 7 });
      expect(buttonLabelled('Activar')).toBeDefined();
      expect(buttonLabelled('Desactivar')).toBeUndefined();
    });

    it('el pie tiene UNA acción primaria («Guardar») y lo demás va en «Más»', async () => {
      await render();
      const pie = host().querySelector('ui-barra-acciones')!;
      const primarias = [...pie.querySelectorAll('button.ui-button')].filter(b => b.classList.contains('ui-button--primary'));
      expect(primarias.map(b => text(b.querySelector('.ui-button__label')))).toEqual(['Guardar']);
      const mas = buttonLabelled('Más')!;
      const panel = host().querySelector('#re-mas-panel') as HTMLElement;
      expect(mas.getAttribute('aria-expanded')).toBe('false');
      expect(panel.hidden).toBe(true);
      mas.click();
      fixture.detectChanges();
      expect(mas.getAttribute('aria-expanded')).toBe('true');
      expect(panel.hidden).toBe(false);
      // Esc lo cierra y devuelve el foco a «Más».
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(panel.hidden).toBe(true);
      expect(document.activeElement).toBe(mas);
    });

    it('sin una rúbrica guardada, lo que la necesita explica que hay que guardar primero', async () => {
      await render({}, { rubricId: null });
      expect(buttonLabelled('Duplicar')!.getAttribute('aria-disabled')).toBe('true');
      expect(reasonOf(buttonLabelled('Duplicar'))).toBe('Guarda la rúbrica primero.');
      expect(reasonOf(buttonLabelled('Activar'))).toBe('Guarda la rúbrica primero.');
      expect(reasonOf(buttonLabelled('Usar en el caso'))).toBe('Guarda la rúbrica primero.');
    });

    it('«Usar en el caso» pide elegir un caso y se habilita al elegirlo', async () => {
      await render();
      expect(buttonLabelled('Usar en el caso')!.getAttribute('aria-disabled')).toBe('true');
      expect(reasonOf(buttonLabelled('Usar en el caso'))).toBe('Elige un caso en borrador.');

      const select = host().querySelector('.rb-assign select') as HTMLSelectElement;
      select.value = '3';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(buttonLabelled('Usar en el caso')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('mientras guarda el botón dice «Guardando…» y queda ocupado', async () => {
      await render();
      component().saving.set(true);
      fixture.detectChanges();

      const save = host().querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(text(save.querySelector('.ui-button__label'))).toBe('Guardando…');
      expect(save.getAttribute('aria-disabled')).toBe('true');
      expect(save.getAttribute('aria-busy')).toBe('true');
    });

    it('guardar manda el orden como posición y las cuatro celdas de cada criterio, y avisa a quien lo aloja', async () => {
      await render();
      component().criteria.at(1).get(['levelDescriptors', 'LOGRADO'])!.setValue('  Devuelve lo que oye.  ');
      service['update'].mockReturnValue(of(completa));
      buttonLabelled('Guardar')!.click();
      await settle();

      const sent = service['update'].mock.calls[0][1];
      expect(sent.criteria.map((c: { displayOrder: number }) => c.displayOrder)).toEqual([1, 2]);
      expect(sent.criteria[1].levelDescriptors).toEqual({ EN_INICIO: '', EN_PROCESO: '', LOGRADO: 'Devuelve lo que oye.', DESTACADO: '' });
      expect(guardadas).toHaveLength(1);
    });
  });

  describe('criterios: acordeón, orden y peso', () => {
    it('cerrados por defecto: una fila por criterio con su resumen, sin campos a la vista', async () => {
      await render();
      expect(rows()).toHaveLength(2);
      expect(host().querySelectorAll('li.criterion input')).toHaveLength(0);
      expect(text(rows()[0].querySelector('.criterion__resumen'))).toContain('Criterio 1');
      expect(text(rows()[0].querySelector('.criterion__resumen'))).toContain('60 %');
      expect(text(rows()[0].querySelector('.criterion__meta'))).toContain('Sin competencia del programa');
    });

    it('un criterio abierto a la vez', async () => {
      await render();
      const toggles = () => [...host().querySelectorAll<HTMLButtonElement>('.criterion__resumen')];
      toggles()[0].click();
      fixture.detectChanges();
      expect(toggles()[0].getAttribute('aria-expanded')).toBe('true');
      expect(rows()[0].querySelector('input[formControlName="title"]')).not.toBeNull();

      toggles()[1].click();
      fixture.detectChanges();
      expect(toggles()[0].getAttribute('aria-expanded')).toBe('false');
      expect(toggles()[1].getAttribute('aria-expanded')).toBe('true');
      expect(host().querySelectorAll('li.criterion input[formControlName="title"]')).toHaveLength(1);
    });

    it('agregar un criterio lo deja abierto y enlazado al formulario', async () => {
      await render();
      buttonLabelled('Agregar criterio')!.click();
      fixture.detectChanges();
      expect(rows()).toHaveLength(3);
      const title = rows()[2].querySelector<HTMLInputElement>('input[formControlName="title"]')!;
      title.value = 'Cierre';
      title.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(titles()).toEqual(['Criterio 1', 'Criterio 2', 'Cierre']);
    });

    it('no existe el campo «Orden»: el orden se cambia con «Subir» y «Bajar» (teclado) y es la posición', async () => {
      await render();
      component().alternarCriterio(0);
      fixture.detectChanges();
      expect(host().querySelector('[formControlName="displayOrder"]')).toBeNull();
      expect([...host().querySelectorAll('label')].map(l => text(l))).not.toContain('Orden');

      component().accionCriterio(0, 'bajar');
      fixture.detectChanges();
      expect(titles()).toEqual(['Criterio 2', 'Criterio 1']);
      // El criterio abierto sigue abierto en su nueva posición.
      expect(component().criterioAbierto()).toBe(1);
      component().accionCriterio(1, 'subir');
      expect(titles()).toEqual(['Criterio 1', 'Criterio 2']);
      expect(component().accionesCriterio(0).find(i => i.value === 'subir')!.disabled).toBe(true);
      expect(component().accionesCriterio(1).find(i => i.value === 'bajar')!.disabled).toBe(true);
    });

    it('el orden también se cambia arrastrando la fila por su asa', async () => {
      await render();
      component().addCriterion();
      component().criteria.at(2).patchValue({ title: 'Tercero' });
      fixture.detectChanges();
      const [primera, , tercera] = rows();
      const drag = (type: string) => {
        const evento = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
        Object.defineProperty(evento, 'dataTransfer', { value: { setData: vi.fn(), effectAllowed: '', dropEffect: '' } });
        return evento;
      };
      primera.dispatchEvent(drag('dragstart'));
      tercera.dispatchEvent(drag('dragover'));
      fixture.detectChanges();
      expect(tercera.classList).toContain('criterion--destino');
      tercera.dispatchEvent(drag('drop'));
      fixture.detectChanges();

      expect(titles()).toEqual(['Criterio 2', 'Tercero', 'Criterio 1']);
      expect(host().querySelector('.criterion--destino')).toBeNull();
      expect(component().form.dirty).toBe(true);
    });

    it('quitar un criterio deja el otro en pantalla enlazado a su control', async () => {
      await render();
      component().alternarCriterio(0);
      fixture.detectChanges();
      host().querySelector<HTMLButtonElement>('li.criterion button[aria-label^="Eliminar criterio"]')!.click();
      fixture.detectChanges();
      expect(titles()).toEqual(['Criterio 2']);
      component().alternarCriterio(0);
      fixture.detectChanges();
      const weight = rows()[0].querySelector<HTMLInputElement>('input[formControlName="weight"]')!;
      expect(weight.value).toBe('40');
      weight.value = '35';
      weight.dispatchEvent(new Event('input'));
      expect(component().criteria.at(0).get('weight')!.value).toBe(35);
    });

    it('«Repartir el peso por igual» suma 100,00 con cualquier número de criterios de 1 a 12', async () => {
      await render({}, { rubricId: null });
      for (let cuantos = 1; cuantos <= 12; cuantos++) {
        component().newRubric();
        for (let i = 1; i < cuantos; i++) component().addCriterion();
        component().repartirPeso();
        const pesos = component().criteria.controls.map(c => Number(c.get('weight')!.value));
        expect(component().totalWeight(), `${cuantos} criterios`).toBe(100);
        expect(Math.round(pesos.reduce((a, b) => a + b, 0) * 100), `${cuantos} criterios`).toBe(10000);
        // Todos iguales salvo el último, que absorbe el redondeo (y nunca por más de una centésima por criterio).
        expect(new Set(pesos.slice(0, -1)).size, `${cuantos} criterios`).toBeLessThanOrEqual(1);
      }
    });

    it('pesosIguales: centésimas, el último absorbe el redondeo', () => {
      expect(pesosIguales(3)).toEqual([33.33, 33.33, 33.34]);
      expect(pesosIguales(7)).toEqual([14.28, 14.28, 14.28, 14.28, 14.28, 14.28, 14.32]);
      expect(pesosIguales(1)).toEqual([100]);
      expect(pesosIguales(0)).toEqual([]);
    });

    it('cada celda de nivel muestra en gris el descriptor general y avisa al salir si califica en vez de describir', async () => {
      await render();
      component().alternarCriterio(0);
      fixture.detectChanges();
      const celdas = [...rows()[0].querySelectorAll<HTMLTextAreaElement>('.re-nivel textarea')];
      expect(celdas.map(c => c.placeholder)).toEqual(NIVELES_RUBRICA.map(n => n.general));

      celdas[2].value = 'Excelente manejo';
      celdas[2].dispatchEvent(new Event('input'));
      celdas[2].dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(text(rows()[0].querySelector('[data-nivel="LOGRADO"]'))).toContain('Describe lo que se observa en el intento, no lo califiques.');
      expect(text(rows()[0].querySelector('.criterion__meta'))).toContain('1 de 4 descriptores propios');
    });
  });

  describe('plantilla y uso', () => {
    it('«Con las competencias del programa» crea un criterio por competencia activa, enlazado y con el peso repartido', async () => {
      await render({}, { rubricId: null, comienzo: 'competencias' });
      const criterios = component().criteria.controls.map(c => c.getRawValue());
      expect(criterios.map(c => c.title)).toEqual([
        'Contención emocional y manejo de crisis', 'Marco normativo y rutas de atención', 'Reflexión profesional',
      ]);
      expect(criterios.map(c => c.competencyId)).toEqual([1, 2, 3]);
      expect(criterios.map(c => c.competency)).toEqual(['CONTENCION', 'MARCO_NORMATIVO', 'REFLEXION']);
      expect(component().totalWeight()).toBe(100);
      // El criterio se llama como su competencia: la fila no repite el nombre, dice que está enlazado.
      expect(text(rows()[0].querySelector('.criterion__meta'))).toBe('Competencia del programa · descriptores generales');
      expect(component().form.dirty).toBe(true);
    });

    it('si la rúbrica ya se usó, lo dice arriba y ofrece duplicarla', async () => {
      await render({ detail: () => of({ ...completa, usage: { caseVersions: 2, evaluations: 12 } }) });
      expect(text(host().querySelector('.re-aviso--uso'))).toContain('Esta rúbrica ya se usó en 12 valoraciones.');
      expect(text(host().querySelector('.rb-assign'))).toContain('En 2 casos · 12 valoraciones');
    });
  });

  describe('salir con cambios sin guardar', () => {
    it('sin cambios sale sin preguntar', async () => {
      await render();
      expect(await component().canLeave()).toBe(true);
      expect(dialog.consequence).not.toHaveBeenCalled();
    });

    it('con cambios pregunta, y «Seguir editando» se queda', async () => {
      await render();
      component().form.patchValue({ name: 'Otra' });
      component().form.markAsDirty();
      expect(await component().canLeave()).toBe(false);
      expect(dialog.consequence).toHaveBeenCalledWith(expect.objectContaining({ continueLabel: 'Seguir editando', proceedLabel: 'Salir sin guardar' }));
      dialog.consequence.mockResolvedValue('proceed');
      expect(await component().canLeave()).toBe(true);
    });
  });

  // Hallazgo de F9-10: el detalle de una apertura anterior llega DESPUÉS y no debe pisar lo que la persona ya eligió.
  // req: SIEP-CU-04, RNF-04
  describe('un detalle que llega tarde no pisa lo que la persona ya eligió', () => {
    it('«Nueva rúbrica» antes de que llegue el detalle conserva el formulario nuevo', async () => {
      const firstDetail = new Subject<RubricAdmin>();
      await render({ detail: () => firstDetail });
      component().newRubric();
      component().form.patchValue({ name: 'La mía' });
      firstDetail.next(completa);
      fixture.detectChanges();

      expect(component().selected()).toBeNull();
      expect(component().form.get('name')?.value).toBe('La mía');
    });

    it('abrir otra antes de que llegue el detalle de la primera deja abierta la última que se pidió', async () => {
      const firstDetail = new Subject<RubricAdmin>();
      await render({ detail: (id: number) => (id === 4 ? firstDetail : of(incompleta)) });
      component().openRubric(7);
      firstDetail.next(completa);
      fixture.detectChanges();

      expect(component().selected()?.id).toBe(7);
      expect(component().form.get('name')?.value).toBe('Observación de aula');
    });

    it('si no se puede abrir, un error con «Reintentar» ocupa el lugar del formulario y se anuncia en la región de estado', async () => {
      let llamadas = 0;
      await render({ detail: () => (++llamadas === 1 ? throwError(() => new Error('HTTP 500')) : of(completa)) });
      expect(host().querySelector('form')).toBeNull();
      expect(text(host().querySelector('ui-error-state'))).toContain('No fue posible abrir la rúbrica.');
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('No fue posible abrir la rúbrica.');

      const reintentar = [...host().querySelectorAll('ui-error-state button')].find(b => text(b).includes('Reintentar')) as HTMLButtonElement;
      reintentar.click();
      await settle();
      expect(llamadas).toBe(2);
      expect(host().querySelector('form')).not.toBeNull();
      expect(component().form.get('name')?.value).toBe(completa.name);
    });
  });

  // Revisión de la pasada final: carga, guardado y salida sin perder lo escrito.
  // req: SIEP-CU-04, RNF-04
  describe('carga, guardado y salida', () => {
    it('mientras llega el detalle no hay formulario que editar: un esqueleto ocupado', async () => {
      const detalle = new Subject<RubricAdmin>();
      await render({ detail: () => detalle });
      expect(host().querySelector('form')).toBeNull();
      expect(host().querySelector('.re-cargando[aria-busy="true"]')).not.toBeNull();
      detalle.next(completa);
      await settle();
      expect(host().querySelector('form')).not.toBeNull();
    });

    it('«Con las competencias del programa» no muestra el formulario hasta aplicar la plantilla', async () => {
      const lista = new Subject<typeof catalogo>();
      await render({}, { rubricId: null, comienzo: 'competencias' });
      // render() ya consumió el catálogo inmediato: se repite con uno que tarda.
      service['competencies'].mockReturnValue(lista);
      component().desdeCompetencias();
      await settle();
      expect(host().querySelector('form')).toBeNull();
      lista.next(catalogo);
      lista.complete();
      await settle();
      expect(host().querySelector('form')).not.toBeNull();
      expect(component().criteria.length).toBe(catalogo.filter(item => item.active).length);
    });

    it('mientras guarda los campos quedan inertes y salir espera la respuesta: si falla, pregunta', async () => {
      const respuesta = new Subject<RubricAdmin>();
      await render();
      service['update'].mockReturnValue(respuesta);
      component().form.patchValue({ name: 'Otra' });
      component().form.markAsDirty();
      component().save();
      await settle();
      expect((host().querySelector('.re-marco') as HTMLElement).inert).toBe(true);

      let salio: boolean | null = null;
      void component().canLeave().then(valor => (salio = valor));
      await Promise.resolve();
      expect(salio).toBeNull();
      expect(dialog.consequence).not.toHaveBeenCalled();

      respuesta.error(new Error('HTTP 500'));
      await settle();
      expect((host().querySelector('.re-marco') as HTMLElement).inert).toBe(false);
      expect(dialog.consequence).toHaveBeenCalled();
      expect(salio).toBe(false);
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('estructura', () => {
    it('ninguna región repite el nombre de otra y no quedan restos de Material', async () => {
      await render();
      const names = [...host().querySelectorAll('section[aria-labelledby], [role="region"][aria-label]')].map(el => {
        const labelledBy = el.getAttribute('aria-labelledby');
        return labelledBy ? text(host().querySelector(`#${labelledBy}`)) : el.getAttribute('aria-label');
      });
      expect(names.length).toBeGreaterThan(2);
      expect(new Set(names).size).toBe(names.length);
      expect(host().querySelector('mat-card, mat-form-field, mat-select, mat-progress-bar, .psy-button, .mat-mdc-button')).toBeNull();
    });
  });
});
