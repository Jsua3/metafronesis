import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { RubricAdmin, RubricService } from '../../core/api/rubric.service';
import { CaseCatalogApi } from '../../core/api/case-catalog.api';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { RubricaEditorComponent } from './rubrica-editor.component';
import { NuevaRubricaDialogo, NuevaRubricaEleccion, RubricsComponent } from './rubrics.component';

/**
 * Rúbricas (EDITOR.md §5.2, bloque R1): la biblioteca y el paso al editor por `?rubrica=`. Se conservan las reglas que
 * ya estaban probadas en la pantalla anterior (F7-5): un solo h1, región de estado siempre presente, esqueleto, error con
 * «Reintentar», vacío con su acción y filtro sin coincidencias. El comportamiento del formulario vive en
 * `rubrica-editor.component.spec.ts` y en las specs de validación y avisos.
 */
const rubric = (id: number, name: string, weights: number[], overrides: Partial<RubricAdmin> = {}): RubricAdmin => ({
  id, name, description: null, active: false, version: '1.0', isDefault: false,
  totalWeight: weights.reduce((sum, weight) => sum + weight, 0), criteriaCount: weights.length,
  criteria: weights.map((weight, index) => ({ id: id * 10 + index, title: `Criterio ${index + 1}`, weight, displayOrder: index + 1, active: true })),
  ...overrides,
} as RubricAdmin);

const completa = rubric(4, 'Entrevista inicial', [60, 40], { active: true, isDefault: true });
const incompleta = rubric(7, 'Observación de aula', [60, 30]);

interface Api {
  list: () => Observable<RubricAdmin[]>;
}

describe('pantalla Rúbricas: biblioteca (R1)', () => {
  let fixture: ComponentFixture<RubricsComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;
  let dialog: { open: ReturnType<typeof vi.fn>; consequence: ReturnType<typeof vi.fn> };
  let eleccion: NuevaRubricaEleccion | undefined;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = () => [...host().querySelectorAll('.rb-row')];
  const component = () => fixture.componentInstance;
  const router = () => TestBed.inject(Router);
  const buttonLabelled = (label: string) => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')) === label) as HTMLButtonElement | undefined;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function render(api: Partial<Api> = {}, { stable = true, role = 'ADMIN', userId = 1 } = {}) {
    service = {
      list: vi.fn(api.list ?? (() => of([completa, incompleta]))),
      detail: vi.fn((id: number) => of(id === 7 ? incompleta : completa)),
      create: vi.fn(), update: vi.fn(), activate: vi.fn(), deactivate: vi.fn(), duplicate: vi.fn(), setDefault: vi.fn(),
      assignToCaseVersion: vi.fn(), competencies: vi.fn(() => of([])),
    };
    eleccion = undefined;
    dialog = {
      open: vi.fn(() => ({ closed: of(eleccion) })),
      consequence: vi.fn(async () => 'continue'),
    };
    TestBed.configureTestingModule({
      imports: [RubricsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: RubricService, useValue: service },
        {
          provide: AuthService,
          useValue: { hasRole: (...roles: string[]) => roles.includes(role), currentUser: () => ({ id: userId, role }) },
        },
        { provide: CaseCatalogApi, useValue: { listDrafts: vi.fn(() => of([])) } },
        { provide: NotificationService, useValue: notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
        { provide: UiDialog, useValue: dialog },
        { provide: LiveRegionAnnouncer, useValue: { announce: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(RubricsComponent);
    if (stable) await settle();
    else fixture.detectChanges();
  }

  /** Navega a `?…` como lo haría un enlace (la ruta raíz de la prueba es la de la pantalla). */
  async function ir(url: string) {
    await router().navigateByUrl(url);
    await settle();
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // req: RNF-04, BLOQUE-H
  describe('estados', () => {
    it('un solo h1 «Rúbricas», la región de estado siempre presente y «Nueva rúbrica» en la cabecera', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Rúbricas');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
      expect(buttonLabelled('Nueva rúbrica')).toBeDefined();
    });

    it('con rúbricas: una fila por rúbrica que se abre como enlace, con su estado en una insignia y su menú', async () => {
      await render();
      expect(rows()).toHaveLength(2);
      expect(text(rows()[0].querySelector('ui-badge'))).toBe('Predeterminada');
      expect(text(rows()[1].querySelector('ui-badge'))).toBe('Borrador');
      expect(text(rows()[1])).toContain('2 criterios · 90 %');
      expect(rows()[1].querySelector('a.rb-row__abrir')!.getAttribute('href')).toBe('/?rubrica=7');
      expect(rows()[1].querySelector('ui-menu')).not.toBeNull();
      // Ninguna se abre sola: la biblioteca es su propio nivel.
      expect(host().querySelector('app-rubrica-editor')).toBeNull();
    });

    it('en el primer instante de la carga (antes del esqueleto) no pinta «sin resultados» ni ningún vacío', async () => {
      const pending = new Subject<RubricAdmin[]>();
      await render({ list: () => pending }, { stable: false });
      expect(host().querySelector('.rb-list ui-empty-state')).toBeNull();
      expect(rows()).toHaveLength(0);
    });

    it('mientras carga: esqueleto con aria-busy, el estado leído y ninguna fila', async () => {
      vi.useFakeTimers();
      const pending = new Subject<RubricAdmin[]>();
      await render({ list: () => pending }, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('.rb-list ui-skeleton').length).toBeGreaterThan(0);
      expect(host().querySelector('.rb-list [aria-busy="true"]')).not.toBeNull();
      expect(rows()).toHaveLength(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando rúbricas…');
    });

    it('si la lista falla: UN error con «Reintentar» que la vuelve a pedir', async () => {
      let calls = 0;
      await render({ list: () => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of([completa])) });
      const errors = host().querySelectorAll('.rb-list ui-error-state');
      expect(errors).toHaveLength(1);
      expect(text(errors[0])).toContain('No fue posible cargar las rúbricas.');
      expect(notify.error).not.toHaveBeenCalled();

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await settle();
      expect(calls).toBe(2);
      expect(host().querySelector('.rb-list ui-error-state')).toBeNull();
      expect(component().message()).toBe('');
      expect(rows()).toHaveLength(1);
    });

    it('sin rúbricas: lista vacía con su acción «Nueva rúbrica», que abre el diálogo de comienzos', async () => {
      await render({ list: () => of([]) });
      const empty = host().querySelector('.rb-list ui-empty-state')!;
      expect(text(empty)).toContain('Aún no hay rúbricas');
      const action = [...empty.querySelectorAll('button')].find(button => text(button.querySelector('.ui-button__label')) === 'Nueva rúbrica')!;
      action.click();
      expect(dialog.open).toHaveBeenCalledWith(NuevaRubricaDialogo, { data: { rubricas: [] } });
    });

    it('un filtro sin coincidencias deja los controles, dice «No hay resultados» y «Limpiar filtros» lo restablece', async () => {
      await render();
      const search = host().querySelector('.rb-filters input[type="search"]') as HTMLInputElement;
      search.value = 'zzz';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(rows()).toHaveLength(0);
      const none = host().querySelectorAll('.rb-list ui-empty-state');
      expect(none).toHaveLength(1);
      expect(text(none[0])).toContain('No hay resultados');
      expect(host().querySelector('.rb-filters input[type="search"]')).toBe(search);
      (none[0].querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(search.value).toBe('');
      expect(rows()).toHaveLength(2);
    });

    it('el filtro de estado separa activas y borradores, con su cuenta en texto', async () => {
      await render();
      const opciones = [...host().querySelectorAll('ui-segmentado [role="radio"]')];
      expect(opciones.map(o => text(o))).toEqual(['Todas · 2', 'Activas · 1', 'Borradores · 1']);
      (opciones[2] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(rows().map(r => text(r.querySelector('.rb-row__nombre')))).toEqual(['Observación de aula']);
    });
  });

  describe('grupos', () => {
    it('sin `caseVersion` (servidor anterior) no agrupa', async () => {
      await render();
      expect(host().querySelectorAll('.rb-grupo__titulo')).toHaveLength(0);
    });

    it('con `caseVersion`: «Mis rúbricas», «De la institución» y «De un caso», cada una con lo suyo (docente)', async () => {
      const mia = rubric(10, 'La mía', [100], { ownerId: 5, caseVersion: null });
      const institucion = rubric(11, 'Institucional', [100], { ownerId: 1, caseVersion: null, editable: false });
      const delCaso = rubric(12, 'Del caso', [100], {
        ownerId: 5, caseVersion: { id: 3, title: 'Violencia familiar', semanticVersion: '2.1.0', status: 'PUBLISHED' },
      });
      await render({ list: () => of([institucion, delCaso, mia]) }, { role: 'PROFESOR', userId: 5 });

      const grupos = [...host().querySelectorAll('.rb-grupo')];
      expect(grupos.map(g => text(g.querySelector('.rb-grupo__titulo')))).toEqual(['Mis rúbricas 1', 'De la institución 1', 'De un caso 1']);
      expect(text(grupos[1].querySelector('.rb-row__nombre'))).toBe('Institucional');
      expect(text(grupos[2].querySelector('.rb-row'))).toContain('Violencia familiar · v2.1.0');
    });
  });

  describe('acciones de una fila', () => {
    it('«Activar» con la ponderación distinta de 100 dice por qué en vez de llamar al servidor', async () => {
      await render();
      component().rowAction(incompleta, 'activar');
      expect(service['activate']).not.toHaveBeenCalled();
      expect(notify.warning).toHaveBeenCalledWith(expect.stringContaining('la ponderación debe sumar 100 %'));
    });

    it('el menú solo ofrece «Activar» o «Desactivar», y «Hacer predeterminada» solo al administrador', async () => {
      await render();
      const valores = (r: RubricAdmin) => component().rowItems(r).map(i => i.value);
      expect(valores(completa)).toContain('desactivar');
      expect(valores(completa)).not.toContain('activar');
      expect(valores(incompleta)).toContain('activar');
      expect(valores(incompleta)).toContain('predeterminada');
      TestBed.resetTestingModule();
      await render({}, { role: 'PROFESOR' });
      expect(component().rowItems(incompleta).map(i => i.value)).not.toContain('predeterminada');
    });

    it('«Duplicar» crea la copia en el servidor y la abre en el editor', async () => {
      await render();
      service['duplicate'].mockReturnValue(of(rubric(9, 'Copia de Entrevista inicial', [60, 40])));
      component().rowAction(completa, 'duplicar');
      await settle();
      expect(service['duplicate']).toHaveBeenCalledWith(4);
      expect(notify.success).toHaveBeenCalledWith('Rúbrica duplicada.');
      expect(router().url).toBe('/?rubrica=9');
    });

    it('una ajena (403) al desactivar dice que es de solo lectura, sin el aviso genérico de permisos', async () => {
      await render();
      service['deactivate'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403, error: { message: 'x' } })));
      component().rowAction(completa, 'desactivar');
      expect(notify.error).toHaveBeenCalledWith('Esta rúbrica es de solo lectura: no la creaste tú. Duplícala para personalizarla.');
    });
  });

  describe('«Nueva rúbrica» y el paso al editor', () => {
    it('«Con las competencias del programa» abre el editor nuevo con esa plantilla', async () => {
      await render();
      eleccion = { comienzo: 'competencias' };
      buttonLabelled('Nueva rúbrica')!.click();
      await settle();
      expect(router().url).toBe('/?rubrica=nueva&desde=competencias');
      const editor = fixture.debugElement.query(el => el.componentInstance instanceof RubricaEditorComponent)!.componentInstance as RubricaEditorComponent;
      expect(editor.rubricId()).toBeNull();
      expect(editor.comienzo()).toBe('competencias');
    });

    it('«Copiar una rúbrica» la duplica y abre la copia', async () => {
      await render();
      service['duplicate'].mockReturnValue(of(rubric(9, 'Copia', [100])));
      eleccion = { copiar: 7 };
      buttonLabelled('Nueva rúbrica')!.click();
      await settle();
      expect(service['duplicate']).toHaveBeenCalledWith(7);
      expect(router().url).toBe('/?rubrica=9');
    });

    it('con `?rubrica=<id>` se ve el editor de esa rúbrica, con su nombre como título y el regreso a la biblioteca', async () => {
      await render();
      await ir('/?rubrica=7');
      expect(getComputedStyle(host().querySelector('.rb-list')!).display).toBe('none');
      expect(service['detail']).toHaveBeenCalledWith(7);
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Observación de aula');
      expect(text(host().querySelector('.ui-page-header__volver'))).toContain('Biblioteca de rúbricas');
    });

    it('guardar una rúbrica nueva lleva la dirección a su id y refresca la lista', async () => {
      await render();
      await ir('/?rubrica=nueva');
      service['list'].mockClear();
      component().alGuardar(rubric(15, 'Recién guardada', [100]));
      await settle();
      expect(router().url).toBe('/?rubrica=15');
      expect(service['list']).toHaveBeenCalled();
    });

    it('una rúbrica que ya no existe (404) vuelve a la biblioteca, lo dice y pide la lista de nuevo', async () => {
      await render();
      await ir('/?rubrica=7');
      service['list'].mockClear();
      component().alPerderse();
      await settle();
      expect(router().url).toBe('/');
      expect(notify.warning).toHaveBeenCalledWith('Esta rúbrica ya no está disponible.');
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Esta rúbrica ya no está disponible.');
      expect(service['list']).toHaveBeenCalledTimes(1);
    });

    it('salir pregunta al editor si hay cambios sin guardar', async () => {
      await render();
      expect(await component().canLeave()).toBe(true);
      await ir('/?rubrica=7');
      const editor = fixture.debugElement.query(el => el.componentInstance instanceof RubricaEditorComponent)!.componentInstance as RubricaEditorComponent;
      editor.form.markAsDirty();
      expect(await component().canLeave()).toBe(false);
      expect(dialog.consequence).toHaveBeenCalled();
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
      expect(names.length).toBeGreaterThan(0);
      expect(new Set(names).size).toBe(names.length);
      expect(host().querySelector('mat-card, mat-form-field, mat-select, mat-progress-bar, .psy-button, .mat-mdc-button')).toBeNull();
    });
  });
});
