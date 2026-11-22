import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { Grupo, GrupoEstudiante, GrupoImportResult, GrupoService } from '../../core/api/grupo.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiMenu } from '../../shared/ui/menu/ui-menu';
import { GrupoListComponent } from './grupo-list.component';
import { hojaFalsa } from './grupo-hoja.testing';

/**
 * Pantalla Grupos en maestro-detalle (rediseño B5c): la lista de grupos como tarjetas y el grupo elegido a la derecha,
 * con su ruta propia; «Nuevo grupo», «Editar» e «Importar» en una hoja; los estudiantes en una tabla que se apila; y
 * los casos asignados y las invitaciones en pestañas. La lógica de cada acción vive en las specs de comportamiento
 * (`grupo-list.feedback.spec.ts`, `grupo-list.validation.spec.ts`).
 */
const grupoA: Grupo = { id: 1, nombre: 'Cohorte A', codigo: 'COH-A', totalEstudiantes: 3 };
const grupoB: Grupo = { id: 2, nombre: 'Cohorte B', codigo: 'COH-B', totalEstudiantes: 0 };
const marta = { id: 11, nombre: 'Marta', apellido: 'Ríos', email: 'marta@siep.test', role: 'ESTUDIANTE', activo: true } as GrupoEstudiante;

interface Api {
  listar: () => Observable<Grupo[]>;
  estudiantes: () => Observable<GrupoEstudiante[]>;
}


describe('pantalla Grupos en maestro-detalle (B5c)', () => {
  let fixture: ComponentFixture<GrupoListComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let dialog: { confirm: ReturnType<typeof vi.fn>; sheet: ReturnType<typeof hojaFalsa> };
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const items = () => [...host().querySelectorAll('.gl-groups li')];
  const people = () => [...host().querySelectorAll('.gl-detail tbody tr')];
  const component = () => fixture.componentInstance;
  /** Lo que pinta la hoja falsa: vive junto al anfitrión, no dentro. */
  const hoja = () => document.body;

  async function render(api: Partial<Api> = {}, { stable = true, grupoId }: { stable?: boolean; grupoId?: string } = {}) {
    service = {
      listar: vi.fn(api.listar ?? (() => of([grupoA, grupoB]))),
      // La especificación de E2: sin columna `password` (RN-10).
      importSpec: vi.fn(() => of({ requiredColumns: ['nombre', 'apellido', 'email'], optionalColumns: [], columns: ['nombre', 'apellido', 'email'], templateFilename: 'plantilla.xlsx', acceptedExtensions: ['.xlsx'] })),
      listarEstudiantes: vi.fn(api.estudiantes ?? (() => of([marta]))),
      crear: vi.fn(), actualizar: vi.fn(), eliminar: vi.fn(), quitarEstudiante: vi.fn(), agregarEstudiante: vi.fn(),
      importarEstudiantes: vi.fn(), descargarPlantillaImportacion: vi.fn(),
    };
    dialog = { confirm: vi.fn(() => Promise.resolve(true)), sheet: hojaFalsa(() => fixture) };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GrupoListComponent],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: GrupoService, useValue: service },
        // F10-5: los casos asignados los lee y los cambia su propio componente, por las asignaciones con ventana (C7).
        { provide: NotificationService, useValue: notify },
        { provide: UiDialog, useValue: dialog },
      ],
    });
    fixture = TestBed.createComponent(GrupoListComponent);
    if (grupoId) fixture.componentRef.setInput('grupoId', grupoId);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
    fixture.detectChanges();
  }

  /** Abre una pestaña del detalle (su contenido se pinta la primera vez que se abre). */
  async function abrirPestana(clave: 'estudiantes' | 'casos' | 'invitaciones') {
    component().pestana.set(clave);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openDetail(group: Grupo = grupoA) {
    component().gestionarGrupo(group);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    dialog?.sheet.limpiar();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // req: RNF-04, BLOQUE-H
  describe('estados', () => {
    it('«Grupos» es el h1 de la lista; el del detalle es la cabecera de teléfono y la región de estado siempre está', async () => {
      await render();
      expect(text(host().querySelector('.gl-cab--lista h1'))).toBe('Grupos');
      expect(host().querySelectorAll('h1').length).toBeLessThanOrEqual(2);
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
    });

    it('mientras carga: esqueleto en la lista, ninguna cifra y el estado leído', async () => {
      vi.useFakeTimers();
      const loading = new Subject<Grupo[]>();
      await render({ listar: () => loading }, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('.gl-list ui-skeleton').length).toBeGreaterThan(0);
      expect(host().querySelector('.gl-list[aria-busy="true"]')).not.toBeNull();
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando grupos…');

      loading.next([grupoA, grupoB]);
      loading.complete();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(host().querySelectorAll('.gl-list ui-skeleton')).toHaveLength(0);
      expect(items()).toHaveLength(2);
    });

    it('con grupos: una tarjeta por grupo con nombre, código y su resumen en singular o plural; sin cifras sueltas', async () => {
      await render();
      expect(items()).toHaveLength(2);
      expect(text(items()[0])).toContain('Cohorte A');
      expect(text(items()[0])).toContain('COH-A');
      expect(text(items()[0])).toContain('3 estudiantes');
      expect(text(items()[1])).toContain('0 estudiantes');
      expect(host().querySelectorAll('ui-stat')).toHaveLength(0);
    });

    it('cada tarjeta es un enlace a la ruta del grupo', async () => {
      await render();
      const links = [...host().querySelectorAll<HTMLAnchorElement>('.gl-groups a')];
      expect(links.map(a => a.getAttribute('href'))).toEqual(['/portal/grupos/1', '/portal/grupos/2']);
    });

    it('sin grupos: muestra el formulario de primer uso', async () => {
      await render({ listar: () => of([]) });
      expect(host().querySelectorAll('ui-vacio-ilustrado')).toHaveLength(1);
      expect(host().querySelector('.gl-layout')).toBeNull();
      expect(host().querySelector('form input[formControlName="nombre"]')).not.toBeNull();
      expect(host().querySelector('form input[formControlName="codigo"]')).not.toBeNull();
      expect(host().querySelector('form button[type="submit"]')?.textContent).toContain('Crear grupo');
      expect(dialog.sheet).not.toHaveBeenCalled();
    });

    it('si falla la carga: UN error con «Reintentar» que vuelve a pedir los grupos', async () => {
      let calls = 0;
      await render({ listar: () => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of([grupoA])) });
      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      expect(host().querySelector('.gl-groups')).toBeNull();

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(items()).toHaveLength(1);
    });
  });

  // req: DP-18
  describe('maestro-detalle y ruta', () => {
    it('sin grupo en la ruta se abre el primero; la tarjeta elegida queda marcada', async () => {
      await render();
      expect(text(host().querySelector('.gl-detail h2'))).toBe('Cohorte A');
      expect(items()[0].querySelector('a')?.getAttribute('aria-current')).toBe('true');
      expect(items()[1].querySelector('a')?.getAttribute('aria-current')).toBeNull();
    });

    it('/portal/grupos/:id abre ESE grupo y pide sus estudiantes', async () => {
      await render({}, { grupoId: '2' });
      expect(text(host().querySelector('.gl-detail h2'))).toBe('Cohorte B');
      expect(service['listarEstudiantes']).toHaveBeenCalledWith(2);
      expect(items()[1].querySelector('a')?.getAttribute('aria-current')).toBe('true');
      expect(host().querySelector('.gl-layout--detalle')).not.toBeNull();
    });

    it('un id que no existe dice «No encontramos ese grupo» y «Ver todos los grupos» vuelve a la lista', async () => {
      await render({}, { grupoId: '99' });
      expect(host().querySelector('.gl-detail h2')).toBeNull();
      const vacio = host().querySelector('.gl-detail ui-empty-state')!;
      expect(text(vacio)).toContain('No encontramos ese grupo');
      expect(text(vacio.querySelector('button'))).toBe('Ver todos los grupos');
    });

    it('con un grupo en la ruta, la cabecera de teléfono es la del grupo y vuelve a «Todos los grupos»', async () => {
      await render({}, { grupoId: '1' });
      const cabecera = host().querySelector('.gl-cab--detalle')!;
      expect(text(cabecera.querySelector('h1'))).toBe('Cohorte A');
      const volver = cabecera.querySelector<HTMLAnchorElement>('a.ui-page-header__volver')!;
      expect(text(volver)).toContain('Todos los grupos');
      expect(volver.getAttribute('href')).toBe('/portal/grupos');
      expect(host().querySelector('.gl-cab--lista')?.classList.contains('gl-cab--con-detalle')).toBe(true);
    });

    it('sin grupo en la ruta la cabecera de la lista no se oculta (teléfono: solo la lista)', async () => {
      await render();
      expect(host().querySelector('.gl-cab--lista')?.classList.contains('gl-cab--con-detalle')).toBe(false);
      expect(host().querySelector('.gl-layout--detalle')).toBeNull();
    });

    it('«Nuevo grupo» de la cabecera abre la hoja con el formulario del grupo', async () => {
      await render();
      const nuevo = [...host().querySelectorAll<HTMLButtonElement>('.gl-cab--lista button')].find(b => text(b).includes('Nuevo grupo'))!;
      nuevo.click();
      fixture.detectChanges();
      expect(dialog.sheet.mock.results[0].value.title).toBe('Nuevo grupo');
      expect(text(hoja().querySelector('.gl-form form button[type="submit"]'))).toBe('Crear grupo');
    });
  });

  // req: RNF-04, BLOQUE-H, RQ-NEG-006
  describe('acciones del grupo abierto', () => {
    it('el detalle no ofrece reportes retirados y conserva el menú de acciones', async () => {
      await render();
      const detail = host().querySelector('.gl-detail')!;
      expect(detail.querySelector('.gl-detail__actions a')).toBeNull();

      expect(detail.querySelectorAll('.gl-detail__head ui-menu')).toHaveLength(1);
      expect(detail.querySelector('.gl-detail__head ui-menu button')?.getAttribute('aria-label')).toBe('Más acciones de Cohorte A');
      const menu = fixture.debugElement.query(By.directive(UiMenu)).componentInstance as UiMenu;
      expect(menu.items().map(item => item.label)).toEqual(['Copiar código', 'Editar', 'Borrar']);
    });

    it('«Editar» del menú abre la hoja con el grupo cargado; «Borrar» pide confirmar con el diálogo de la biblioteca', async () => {
      await render();
      const menu = fixture.debugElement.query(By.directive(UiMenu));

      menu.triggerEventHandler('itemSelected', 'editar');
      fixture.detectChanges();
      expect(component().editandoGrupo()).toEqual(grupoA);
      expect(dialog.sheet.mock.results[0].value.title).toBe('Editar grupo');
      expect((hoja().querySelector('.gl-form input[formControlName="nombre"]') as HTMLInputElement).value).toBe('Cohorte A');

      service['eliminar'].mockReturnValue(of({ id: 1 }));
      menu.triggerEventHandler('itemSelected', 'borrar');
      await fixture.whenStable();
      expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Borrar grupo', confirmLabel: 'Borrar', tone: 'danger', message: expect.stringContaining('"Cohorte A"'),
      }));
      expect(service['eliminar']).toHaveBeenCalledWith(1);
    });

    it('«Copiar código» del menú copia el código del grupo abierto', async () => {
      await render({}, { grupoId: '2' });
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      try {
        fixture.debugElement.query(By.directive(UiMenu)).triggerEventHandler('itemSelected', 'copiar');
        await fixture.whenStable();
        expect(writeText).toHaveBeenCalledWith('COH-B');
      } finally {
        delete (navigator as unknown as { clipboard?: unknown }).clipboard;
      }
    });

    it('buscar filtra por nombre o código; sin coincidencias, «Limpiar búsqueda» la restablece', async () => {
      await render();
      const search = host().querySelector('.gl-list input[type="search"]') as HTMLInputElement;
      search.value = 'coh-b';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(items()).toHaveLength(1);
      expect(text(items()[0])).toContain('Cohorte B');

      search.value = 'zzz';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(items()).toHaveLength(0);
      const none = host().querySelector('.gl-list ui-empty-state')!;
      expect(text(none)).toContain('No encontramos grupos con ese criterio');
      (none.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(search.value).toBe('');
      expect(items()).toHaveLength(2);
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('detalle del grupo', () => {
    it('abre el grupo con sus estudiantes en una tabla y casos en su pestaña; quitar nombra a la persona o al caso', async () => {
      await render();
      const detail = host().querySelector('.gl-detail')!;
      expect(text(detail.querySelector('h2'))).toContain('Cohorte A');
      expect(people()).toHaveLength(1);
      expect(text(people()[0])).toContain('Marta Ríos');
      expect(text(people()[0])).toContain('marta@siep.test');
      expect(detail.querySelector('button[aria-label="Quitar a Marta Ríos del grupo"]')).not.toBeNull();

    });

    it('la tabla de estudiantes se apila en tarjetas, con el nombre como título de cada una', async () => {
      await render();
      expect(host().querySelector('.gl-detail ui-table.ui-table--apilar')).not.toBeNull();
      expect(people()[0].querySelector('th[data-celda="principal"]')).not.toBeNull();
      expect(people()[0].querySelector('td[data-celda="acciones"]')).not.toBeNull();
    });

    it('ninguna región de la pantalla repite el nombre de otra (landmark-unique)', async () => {
      await render();
      const names = [...host().querySelectorAll('section[aria-labelledby], section[aria-label], [role="region"][aria-label]')].map(el => {
        const labelledBy = el.getAttribute('aria-labelledby');
        return labelledBy ? text(host().querySelector(`#${labelledBy}`)) : el.getAttribute('aria-label');
      });
      expect(names.length).toBeGreaterThanOrEqual(3);
      expect(new Set(names).size).toBe(names.length);
    });

    it('sin estudiantes ni casos: vacíos que dicen qué hacer, no cifras en cero', async () => {
      await render({ estudiantes: () => of([]) });
      const detail = host().querySelector('.gl-detail')!;
      expect(text(detail)).toContain('Este grupo aún no tiene estudiantes.');
    });

    // req: RF-14, CU-06 (F10-5)

  });

  // req: RNF-04, BLOQUE-H
  describe('importación de estudiantes (hoja)', () => {
    async function abrirImportacion(api: Partial<Api> = {}) {
      await render(api);
      const importar = [...host().querySelectorAll<HTMLButtonElement>('.gl-toolbar button')].find(b => text(b).includes('Importar desde Excel'))!;
      importar.click();
      fixture.detectChanges();
    }
    const zone = () => hoja().querySelector('.gl-drop') as HTMLElement;

    it('«Importar desde Excel» abre una hoja con la zona de archivo (`ui-archivo`) y su control nativo', async () => {
      await abrirImportacion();
      expect(dialog.sheet.mock.results[0].value.title).toBe('Importar estudiantes a Cohorte A');
      expect(zone().querySelector('ui-archivo')).not.toBeNull();
      expect(zone().querySelector('ui-archivo input[type="file"]')).not.toBeNull();
      expect(component().importacionAbierta()).toBe(true);
    });

    it('elegir un .xlsx lo selecciona; elegir otro tipo se rechaza con un mensaje en la hoja', async () => {
      await abrirImportacion();
      const good = new File(['x'], 'lista.xlsx');
      component().archivoElegido(good);
      fixture.detectChanges();
      expect(component().archivoImportacion()).toBe(good);

      component().archivoElegido(new File(['x'], 'lista.pdf'));
      fixture.detectChanges();
      expect(component().archivoImportacion()).toBeNull();
      expect(text(hoja().querySelector('.gl-form .gl-message'))).toBe('Selecciona un archivo .xlsx.');
      // El aviso se lee en la hoja: no se repite en la pestaña de atrás.
      expect(host().querySelector('.gl-detail .gl-message')).toBeNull();
    });

    // E2-9 (RN-10, decisión 4): la importación ya no trae `defaultPassword` (la pantalla imprimía «…: undefined») ni
    // acepta la columna `password`: las cuentas nuevas quedan PENDIENTES y el administrador las aprueba.
    // req: RN-10, RNF-01
    it('el resultado sale una vez y dice cuántas cuentas quedan pendientes de aprobación; nunca una contraseña (gancho RN-10)', async () => {
      await abrirImportacion();
      const result = {
        associated: 3, assigned: 3, created: 2, existing: 1, skipped: 0, duplicated: 0, message: 'Importación completada.',
        pendingApproval: 2, ignoredColumns: ['password'], errors: [], students: [], grupo: grupoA,
      } as unknown as GrupoImportResult;
      component().resultadoImportacion.set(result);
      fixture.detectChanges();

      const summary = hoja().querySelectorAll('.gl-import-result');
      expect(summary).toHaveLength(1);
      expect(text(summary[0])).toContain('3 invitados · 2 cuentas nuevas · 1 ya existían · 0 omitidos');
      expect(text(summary[0]).match(/pendientes de aprobación/g)).toHaveLength(1);
      expect(text(summary[0])).toContain('Las 2 cuentas nuevas quedan pendientes de aprobación');
      expect(text(summary[0])).toContain('Se ignoró la columna «password»');
      expect(text(summary[0])).not.toMatch(/[Cc]ontraseña por defecto|undefined/);
      // Con el resultado a la vista se ofrece cerrar o cargar otra lista; la zona de archivo ya no está.
      expect(hoja().querySelector('ui-archivo')).toBeNull();
      const botones = [...hoja().querySelectorAll('.gl-form .gl-actions button')].map(b => text(b));
      expect(botones).toEqual(['Listo', 'Importar otra lista']);
    });

    it('«Importar otra lista» devuelve la zona de archivo y borra el resultado', async () => {
      await abrirImportacion();
      component().resultadoImportacion.set({ associated: 1, assigned: 1, created: 0, existing: 1, skipped: 0, message: 'ok', errors: [], grupo: grupoA } as unknown as GrupoImportResult);
      fixture.detectChanges();
      const otra = [...hoja().querySelectorAll<HTMLButtonElement>('.gl-form .gl-actions button')].find(b => text(b) === 'Importar otra lista')!;
      otra.click();
      fixture.detectChanges();
      expect(component().resultadoImportacion()).toBeNull();
      expect(hoja().querySelector('ui-archivo')).not.toBeNull();
    });

    it('la hoja de importación ya no pide ni menciona contraseñas (la plantilla de E2 no tiene esa columna)', async () => {
      await abrirImportacion();
      const hojaTexto = text(zone().parentElement);
      expect(hojaTexto).toContain('Columnas requeridas: nombre, apellido, email.');
      expect(hojaTexto).not.toMatch(/[Cc]ontraseña|password|Opcionales/);
    });

    it('«Importar lista» sin archivo no se puede enviar y se explica por qué', async () => {
      await abrirImportacion();
      const importar = [...hoja().querySelectorAll<HTMLButtonElement>('.gl-form .gl-actions button')].find(b => text(b).includes('Importar lista'))!;
      expect(importar.getAttribute('aria-disabled')).toBe('true');
    });
  });

  // E2-10 (C5, decisión 22): el docente INVITA y el estudiante acepta; de quien no ha aceptado el servidor solo devuelve
  // el correo. `totalEstudiantes` cuenta las membresías activas y `totalInvitados` las pendientes.
  // req: SIEP-RF-04, D-14, RNF-04
  describe('membresías por invitación (E2-10)', () => {
    const laura = { id: 12, nombre: '', apellido: '', email: 'laura@siep.test', role: 'ESTUDIANTE', membershipStatus: 'INVITED' } as GrupoEstudiante;
    const rechazo = { id: 13, nombre: '', apellido: '', email: 'pedro@siep.test', role: 'ESTUDIANTE', membershipStatus: 'DECLINED' } as GrupoEstudiante;
    const activa = { ...marta, membershipStatus: 'ACTIVE' } as GrupoEstudiante;

    it('cada estudiante dice su estado en palabras; de un invitado solo el correo (sin «undefined» ni nombre vacío)', async () => {
      await render({ estudiantes: () => of([activa, laura, rechazo]) });
      expect(people()).toHaveLength(3);
      expect(text(people()[0])).toContain('Marta Ríos');
      expect(text(people()[0].querySelector('ui-badge'))).toBe('Miembro');
      expect(text(people()[1].querySelector('th'))).toBe('laura@siep.test');
      expect(text(people()[1].querySelector('ui-badge'))).toBe('Invitación pendiente');
      expect(text(people()[2].querySelector('ui-badge'))).toBe('Rechazó la invitación');
      expect(text(host().querySelector('.gl-detail'))).not.toContain('undefined');
      expect(people()[1].querySelector('button[aria-label="Cancelar la invitación a laura@siep.test"]')).not.toBeNull();
      // Quien rechazó no tiene nada que quitar.
      expect(people()[2].querySelector('button')).toBeNull();
    });

    it('la pestaña «Invitaciones» lleva el conteo y lista solo las pendientes, con su cancelación', async () => {
      await render({ estudiantes: () => of([activa, laura, rechazo]) });
      const tabs = [...host().querySelectorAll('.ui-tabs__tab')].map(t => text(t));
      expect(tabs).toEqual(['Estudiantes', 'Invitaciones · 1']);

      await abrirPestana('invitaciones');
      const pendientes = [...host().querySelectorAll('.gl-detail .gl-people .gl-person')];
      expect(pendientes).toHaveLength(1);
      expect(text(pendientes[0])).toContain('laura@siep.test');
      expect(pendientes[0].querySelector('button[aria-label="Cancelar la invitación a laura@siep.test"]')).not.toBeNull();
    });

    it('sin invitaciones pendientes la pestaña lo dice', async () => {
      await render({ estudiantes: () => of([activa]) });
      await abrirPestana('invitaciones');
      expect(text(host().querySelector('.gl-detail'))).toContain('No hay invitaciones pendientes.');
    });

    it('el detalle cuenta miembros e invitaciones por separado', async () => {
      await render({ estudiantes: () => of([activa, laura]) });
      expect(text(host().querySelector('.gl-detail .gl-hint'))).toContain('1 estudiante · 1 invitación pendiente');
    });

    it('la lista separa a los miembros de las invitaciones pendientes en cada tarjeta', async () => {
      await render({ listar: () => of([{ ...grupoA, totalInvitados: 2 }, { ...grupoB, totalInvitados: 1 }]) });
      expect(text(items()[0].querySelector('.gl-group__meta'))).toBe('3 estudiantes · 2 invitaciones pendientes');
      expect(text(items()[1].querySelector('.gl-group__meta'))).toBe('0 estudiantes · 1 invitación pendiente');
    });

    it('«Invitar estudiante» abre el formulario de correo en la pestaña; el resultado dice que la persona verá el grupo cuando acepte', async () => {
      await render();
      const invitar = [...host().querySelectorAll<HTMLButtonElement>('.gl-toolbar button')].find(b => text(b).includes('Invitar estudiante'))!;
      invitar.click();
      fixture.detectChanges();
      expect(host().querySelector('.gl-add input[type="email"]')).not.toBeNull();

      service['agregarEstudiante'].mockReturnValue(of({ grupo: grupoA, message: 'Si el correo es de un estudiante registrado, recibirá la invitación.' }));
      component().estudianteForm.setValue({ email: 'nuevo@siep.test' });
      component().confirmarAgregar();
      fixture.detectChanges();
      expect(component().mensajeEstudiante()).toBe('Si el correo es de un estudiante registrado, recibirá la invitación.');
      expect(text(host().querySelector('.gl-detail .gl-message'))).toContain('recibirá la invitación');
    });
  });

  // req: RNF-04, BLOQUE-H (revisión de F7)
  describe('arreglos de la revisión de F7', () => {
    it('un refresco silencioso que falla conserva la lista y avisa, no la reemplaza por un error', async () => {
      await render();
      service['listar'].mockReturnValue(throwError(() => new Error('HTTP 500')));

      component().cargar(true);
      fixture.detectChanges();

      expect(items()).toHaveLength(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(notify.warning).toHaveBeenCalledWith('No pudimos actualizar la lista de grupos.');
    });

    it('invitar con el correo vacío o inválido lleva el foco al campo', async () => {
      await render();
      document.body.appendChild(host());
      try {
        component().agregarEstudiante(grupoA);
        await fixture.whenStable();
        fixture.detectChanges();
        const input = host().querySelector('.gl-add input[type="email"]') as HTMLInputElement;
        const form = host().querySelector('.gl-add') as HTMLFormElement;

        form.dispatchEvent(new Event('submit', { cancelable: true }));
        fixture.detectChanges();

        expect(text(host().querySelector('.gl-add .ui-field__message--error'))).toBe('Escribe un correo válido.');
        expect(document.activeElement).toBe(input);
      } finally {
        host().remove();
      }
    });

    it('el mensaje de una acción sobre los estudiantes se anuncia en la región de estado y se lee en el detalle', async () => {
      await render();
      component().mensajeEstudiante.set('Se envió la invitación.');
      fixture.detectChanges();

      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Se envió la invitación.');
      expect(text(host().querySelector('.gl-detail .gl-message'))).toBe('Se envió la invitación.');
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('sin restos del diseño anterior', () => {
    it('ni Material, ni cifras de arriba, ni el formulario «Nuevo grupo» ocupando la página', async () => {
      await render();
      expect(host().querySelector('mat-card, mat-form-field, mat-progress-bar, mat-select, .text-action, .psy-button')).toBeNull();
      expect(host().querySelector('app-confirm-dialog')).toBeNull();
      expect(host().querySelector('ui-stat')).toBeNull();
      expect(host().querySelector('.gl-form')).toBeNull();
      expect(host().querySelector('.gl-detail ui-tabs')).not.toBeNull();
    });
  });
});

