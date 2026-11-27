import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { CaseAccessCache } from '../../core/api/case-access.cache';
import { Invitation, InvitationsApi } from '../../core/api/invitations.api';
import { NotificationService } from '../../core/notifications/notification.service';
import { NavBadgesService } from '../../shared/layout/nav-badges.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { UiMenu } from '../../shared/ui/menu/ui-menu';
import { InvitationsComponent } from './invitations.component';

/**
 * Bandeja de invitaciones del estudiante (plan visual F7b-5; C5 de E2-10; decisión 22 del usuario: un docente no suma a
 * un estudiante sin su aceptación). Antes no existía: con el servidor de E2 un estudiante invitado no tenía forma de
 * aceptar y el docente veía su invitación pendiente para siempre (el servidor necesitaba el puente
 * `SIEP_INVITATIONS_AUTO_ACCEPT`).
 */
// req: SIEP-RF-04, RNF-04
describe('InvitationsComponent', () => {
  let fixture: ComponentFixture<InvitationsComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (name: string) => [...host().querySelectorAll('button')].find(el => text(el) === name) ?? null;
  /** «Salir del grupo» vive en el menú «Más acciones de {grupo}»: se elige el ítem como lo haría el menú. */
  const elegirSalir = () => fixture.debugElement.query(By.directive(UiMenu)).componentInstance.itemSelected.emit('salir');

  const invitation = (over: Partial<Invitation> = {}): Invitation => ({
    id: 1, groupId: 1, groupName: 'Psicología Jurídica · 2026-2', teacherName: 'Paula Docente',
    invitedAt: '2026-10-10T15:00:00Z', status: 'INVITED', ...over,
  });

  interface Api {
    list: () => Observable<Invitation[]>;
    accept: (groupId: number) => Observable<Invitation>;
    decline: (groupId: number) => Observable<Invitation>;
    leave: (groupId: number) => Observable<Invitation>;
  }

  const vaciar = vi.fn();

  async function render(api: Partial<Api> = {}, confirm = vi.fn(async () => true)) {
    vaciar.mockClear();
    const resolved: Api = {
      list: () => of([invitation()]),
      accept: id => of(invitation({ id, groupId: id, status: 'ACTIVE' })),
      decline: id => of(invitation({ id, groupId: id, status: 'DECLINED' })),
      leave: id => of(invitation({ id, groupId: id, status: 'REMOVED' })),
      ...api,
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: InvitationsApi, useValue: resolved },
        { provide: NavBadgesService, useValue: { fijar: vi.fn() } },
        { provide: CaseAccessCache, useValue: { vaciar } },
        { provide: UiDialog, useValue: { confirm } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(InvitationsComponent);
    await fixture.whenStable();
    return resolved;
  }

  it('separa las invitaciones pendientes de los grupos a los que pertenece, con su docente y sin el enum crudo', async () => {
    await render({ list: () => of([invitation(), invitation({ id: 2, groupId: 2, groupName: 'Crisis', status: 'ACTIVE' })]) });
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    const items = [...host().querySelectorAll('.inv-item')];
    expect(items).toHaveLength(2);
    expect(text(items[0])).toContain('Psicología Jurídica · 2026-2');
    expect(text(items[0])).toContain('Paula Docente');
    const secciones = [...host().querySelectorAll('ui-section')];
    expect(secciones).toHaveLength(2);
    expect(text(secciones[0])).toContain('Invitaciones pendientes');
    expect(text(secciones[0])).toContain('Psicología Jurídica · 2026-2');
    expect(text(secciones[1])).toContain('Grupos a los que perteneces');
    expect(text(secciones[1])).toContain('Crisis');
    // Sin fecha no se pinta «Sin fecha»: cada dato que no llega se omite.
    expect(host().textContent).not.toContain('Sin fecha');
    expect(host().textContent).not.toMatch(/INVITED|ACTIVE/);
  });

  it('una invitación pendiente se acepta y queda como miembro, sin recargar a ciegas', async () => {
    const accept = vi.fn((id: number) => of(invitation({ id, groupId: id, status: 'ACTIVE' })));
    await render({ accept });
    button('Aceptar')!.click();
    await fixture.whenStable();
    expect(accept).toHaveBeenCalledWith(1);
    expect(text(host().querySelectorAll('ui-section')[1])).toContain('Psicología Jurídica · 2026-2');
    expect(button('Aceptar')).toBeNull();
    expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('Te uniste a Psicología Jurídica · 2026-2');
  });

  it('al aceptar lleva el foco a Ver mis casos', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    await render();
    button('Aceptar')!.click();
    await fixture.whenStable();
    expect(focus.mock.instances).toContain(host().querySelector('.inv-ingreso a'));
    focus.mockRestore();
  });

  describe('después de aceptar: el grupo y qué sigue (P7)', () => {
    const aceptar = async (casesCount: number | null | undefined, extra: Partial<Invitation> = {}) => {
      await render({ accept: id => of(invitation({ id, groupId: id, status: 'ACTIVE', casesCount, ...extra })) });
      button('Aceptar')!.click();
      await fixture.whenStable();
    };
    const tarjeta = () => host().querySelector('.inv-ingreso');

    it('con casos: dice el grupo, cuántos hay y «Ver mis casos» es la acción principal', async () => {
      await aceptar(2);
      expect(text(tarjeta())).toContain('Ya estás en «Psicología Jurídica · 2026-2»');
      expect(text(tarjeta())).toContain('Tu docente ya le asignó 2 casos a este grupo');
      const ir = tarjeta()!.querySelector('a')!;
      expect(text(ir)).toBe('Ver mis casos');
      expect(ir.getAttribute('href')).toBe('/portal/simulador');
      expect(ir.classList).toContain('ui-button--primary');
      // Una sola región viva dice lo mismo: que entró y qué sigue.
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('Te uniste a Psicología Jurídica · 2026-2. Tu docente ya le asignó 2 casos');
    });

    it('con un solo caso, habla en singular', async () => {
      await aceptar(1);
      expect(text(tarjeta())).toContain('ya le asignó 1 caso a este grupo');
    });

    it('si el grupo aún no tiene casos: lo explica, nombra al docente y no empuja', async () => {
      await aceptar(0);
      expect(text(tarjeta())).toContain('Este grupo todavía no tiene casos');
      expect(text(tarjeta())).toContain('Los asigna tu docente, Paula Docente, y aparecerán en Casos cuando los abra');
      expect(text(tarjeta())).toContain('Si ya debería haber uno, avísale');
      expect(tarjeta()!.querySelector('a')!.classList).not.toContain('ui-button--primary');
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('Este grupo todavía no tiene casos');
    });

    it('si el servidor no informa cuántos casos tiene, no afirma que esté vacío', async () => {
      await aceptar(undefined);
      expect(text(tarjeta())).toContain('Los casos que tu docente asigne a este grupo aparecerán en Casos.');
      expect(text(tarjeta())).not.toContain('todavía no tiene casos');
    });

    it('olvida lo que la caché sabía de los casos: aceptar y salir cambian lo que se ve', async () => {
      await aceptar(1);
      expect(vaciar).toHaveBeenCalledTimes(1);
    });

    it('rechazar no deja tarjeta de ingreso ni toca la caché', async () => {
      await render();
      button('Rechazar')!.click();
      await fixture.whenStable();
      expect(tarjeta()).toBeNull();
      expect(vaciar).not.toHaveBeenCalled();
    });

    it('salir de un grupo quita la tarjeta y vacía la caché', async () => {
      await render({ list: () => of([invitation({ status: 'ACTIVE', casesCount: 2 })]) });
      elegirSalir();
      await fixture.whenStable();
      expect(tarjeta()).toBeNull();
      expect(vaciar).toHaveBeenCalledTimes(1);
    });
  });

  it('«Rechazar» pide confirmar; si se cancela no se envía nada', async () => {
    const decline = vi.fn((id: number) => of(invitation({ id, groupId: id, status: 'DECLINED' })));
    const confirm = vi.fn(async () => false);
    await render({ decline }, confirm);
    button('Rechazar')!.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(decline).not.toHaveBeenCalled();
  });

  it('un miembro puede salir del grupo tras confirmar', async () => {
    const leave = vi.fn((id: number) => of(invitation({ id, groupId: id, status: 'REMOVED' })));
    await render({ list: () => of([invitation({ status: 'ACTIVE' })]), leave });
    elegirSalir();
    await fixture.whenStable();
    expect(leave).toHaveBeenCalledWith(1);
  });

  it('si la invitación ya no está vigente (409), lo dice y vuelve a pedir la lista', async () => {
    const list = vi.fn(() => of([invitation()]));
    const conflict = new HttpErrorResponse({
      status: 409, error: { success: false, code: 'MEMBERSHIP_NOT_INVITED', message: 'Esta invitación ya fue respondida o ya no está vigente.' },
    });
    await render({ list, accept: () => throwError(() => conflict) });
    button('Aceptar')!.click();
    await fixture.whenStable();
    expect(list).toHaveBeenCalledTimes(2);
    expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('ya fue respondida');
  });

  it('sin invitaciones ni grupos: un vacío que explica de dónde vienen (no una lista vacía muda)', async () => {
    await render({ list: () => of([]) });
    expect(host().querySelector('ui-vacio-ilustrado ui-vineta')?.getAttribute('data-escena')).toBe('invitacion');
    // Una sola viñeta por pantalla: sin invitaciones, la escena pasa de la cabecera al vacío.
    expect(host().querySelectorAll('ui-vineta')).toHaveLength(1);
    expect(text(host())).toContain('Aún no perteneces a ningún grupo');
    expect(text(host())).toContain('la invitación aparecerá aquí');
    expect(host().querySelectorAll('.inv-item')).toHaveLength(0);
  });

  it('las dos secciones siguen aunque una esté vacía, y lo dicen', async () => {
    await render({ list: () => of([invitation({ status: 'ACTIVE' })]) });
    expect(text(host())).toContain('No tienes invitaciones pendientes.');
    expect(host().querySelectorAll('ui-section')).toHaveLength(2);
  });

  it('escribe en la insignia de la barra el número de invitaciones pendientes', async () => {
    const fijar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: InvitationsApi, useValue: { list: () => of([invitation(), invitation({ id: 2, groupId: 2 })]) } },
        { provide: NavBadgesService, useValue: { fijar } },
        { provide: UiDialog, useValue: { confirm: vi.fn() } },
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(InvitationsComponent);
    await fixture.whenStable();
    expect(fijar).toHaveBeenCalledWith('invitaciones', 2);
  });

  it('si la lista falla: error con «Reintentar», sin vacío a la vez', async () => {
    const list = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    await render({ list });
    expect(host().querySelector('ui-error-state')).not.toBeNull();
    expect(host().querySelector('ui-vacio-ilustrado')).toBeNull();
  });

  it('mientras carga: esqueleto y la región de estado lo dice', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Subject<Invitation[]>();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(), provideRouter([]),
          { provide: InvitationsApi, useValue: { list: () => pending } },
          { provide: UiDialog, useValue: { confirm: vi.fn() } },
          { provide: NavBadgesService, useValue: { fijar: vi.fn() } },
          { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
        ],
      });
      fixture = TestBed.createComponent(InvitationsComponent);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(400);
      fixture.detectChanges();
      expect(host().querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando tus grupos…');
    } finally {
      vi.useRealTimers();
    }
  });
  // UA-E27 y UA-E28 (medición 0.7.0): «Aceptar» apenas resaltaba y costaba dar con él con Tab; al cerrar el aviso de
  // «Rechazar» el foco quedaba donde no se esperaba, y al responder desaparecía la tarjeta con el foco dentro.
  describe('la acción principal y el foco (UA-E27, UA-E28)', () => {
    it('«Aceptar» es la acción principal de cada invitación y llega antes que «Rechazar» en el orden de foco', async () => {
      await render({ list: () => of([invitation(), invitation({ id: 2, groupId: 2, groupName: 'Crisis' })]) });
      for (const acciones of host().querySelectorAll('.inv-item__actions')) {
        const botones = [...acciones.querySelectorAll<HTMLButtonElement>('button')];
        expect(botones.map(b => text(b))).toEqual(['Aceptar', 'Rechazar']);
        expect(botones[0].classList.contains('ui-button--primary')).toBe(true);
        expect(botones[1].classList.contains('ui-button--primary')).toBe(false);
        expect(botones[0].tabIndex).toBe(0);
      }
    });

    it('el nombre accesible de cada botón dice a qué grupo responde y empieza por su texto visible (WCAG 2.5.3)', async () => {
      await render();
      expect(button('Aceptar')!.getAttribute('aria-label')).toBe('Aceptar la invitación a Psicología Jurídica · 2026-2');
      expect(button('Rechazar')!.getAttribute('aria-label')).toBe('Rechazar la invitación a Psicología Jurídica · 2026-2');
    });

    it('al llegar con el foco en el encabezado, la primera parada es «Aceptar» (nada entre ambos)', async () => {
      await render();
      const paradas = [...host().querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]')].filter(el => el.tabIndex >= 0);
      expect(paradas[0]).toBe(button('Aceptar'));
    });

    it('cancelar «Rechazar» devuelve el foco a «Rechazar» (el diálogo lo restituye) y no envía nada', async () => {
      const decline = vi.fn();
      await render({ decline }, vi.fn(async () => false));
      const rechazar = button('Rechazar')!;
      rechazar.focus();
      rechazar.click();
      await fixture.whenStable();
      expect(decline).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(rechazar);
    });

    it('al rechazar, la tarjeta desaparece y el foco pasa al encabezado de la pantalla, no a <body>', async () => {
      await render();
      const rechazar = button('Rechazar')!;
      rechazar.focus();
      rechazar.click();
      await fixture.whenStable();
      expect(button('Rechazar')).toBeNull();
      await vi.waitFor(() => expect(document.activeElement).toBe(host().querySelector('h1')));
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toContain('Rechazaste la invitación');
    });

    it('al salir de un grupo, el foco tampoco se pierde con el menú que desaparece', async () => {
      await render({ list: () => of([invitation({ status: 'ACTIVE' })]) });
      const disparador = host().querySelector<HTMLElement>('ui-menu button')!;
      disparador.focus();
      elegirSalir();
      await fixture.whenStable();
      expect(host().querySelector('ui-menu')).toBeNull();
      await vi.waitFor(() => expect(document.activeElement).toBe(host().querySelector('h1')));
    });
  });
});
