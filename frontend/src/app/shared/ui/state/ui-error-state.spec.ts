import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ERROR_STATE_COPY } from './state-copy';
import { UiErrorKind, UiErrorState } from './ui-error-state';

/**
 * ui-error-state (plan visual §2.5, F2-5): el error NUNCA se traga. Mensaje humano + «Reintentar» (cuando reintentar
 * tiene sentido) + detalle técnico plegado con el código HTTP. Bloqueante: role="alert"; parcial: role="status" y
 * el resto de la página sigue viva. Tras un reintento fallido el foco va al título del error.
 */
// req: RNF-004 (errores anunciados y con salida)
@Component({
  imports: [UiErrorState],
  template: `
    @if (show()) {
      <ui-error-state [kind]="kind()" [message]="message()" [detail]="detail()" [status]="status()" [blocking]="blocking()"
        [autofocus]="autofocus()" (retry)="retries = retries + 1" />
    }
    <button type="button" class="other">Otro control</button>
  `,
})
class Host {
  show = signal(true);
  kind = signal<UiErrorKind>('server');
  message = signal<string | undefined>(undefined);
  detail = signal<string | undefined>(undefined);
  status = signal<number | undefined>(undefined);
  blocking = signal(false);
  autofocus = signal(false);
  retries = 0;
}

describe('ui-error-state', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const root = () => (fixture.nativeElement as HTMLElement).querySelector('ui-error-state') as HTMLElement;
  const retry = () => root().querySelector<HTMLButtonElement>('button[ui-button]');

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('muestra el mensaje humano del catálogo y «Reintentar», que llega al consumidor', () => {
    expect(root().querySelector('.ui-error-state__title')?.textContent?.trim()).toBe(ERROR_STATE_COPY.server.title);
    expect(root().querySelector('.ui-error-state__message')?.textContent?.trim()).toBe(ERROR_STATE_COPY.server.message);
    expect(retry()?.textContent?.trim()).toBe('Reintentar');
    retry()!.click();
    expect(host.retries).toBe(1);
  });

  it('parcial: role="status"; bloqueante: role="alert"', async () => {
    expect(root().getAttribute('role')).toBe('status');
    host.blocking.set(true);
    await fixture.whenStable();
    expect(root().getAttribute('role')).toBe('alert');
  });

  it('el detalle técnico va plegado en <details> con el código HTTP', async () => {
    host.status.set(503);
    host.detail.set('upstream timeout');
    await fixture.whenStable();
    const details = root().querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent?.trim()).toBe('Detalle técnico');
    expect(details.textContent).toContain('HTTP 503');
    expect(details.textContent).toContain('upstream timeout');
  });

  it('sin detalle ni código no hay <details> vacío', () => {
    expect(root().querySelector('details')).toBeNull();
  });

  it('sin permiso o no encontrado no ofrece «Reintentar» (no cambiaría nada)', async () => {
    for (const kind of ['forbidden', 'not-found'] as const) {
      host.kind.set(kind);
      await fixture.whenStable();
      expect(retry()).toBeNull();
      expect(root().querySelector('.ui-error-state__title')?.textContent?.trim()).toBe(ERROR_STATE_COPY[kind].title);
    }
  });

  it('un mensaje propio reemplaza al del catálogo', async () => {
    host.message.set('No pudimos cargar tus intentos.');
    await fixture.whenStable();
    expect(root().querySelector('.ui-error-state__message')?.textContent?.trim()).toBe('No pudimos cargar tus intentos.');
  });

  it('tras un reintento que vuelve a fallar, el foco va al título del nuevo error', async () => {
    retry()!.focus();
    retry()!.click();
    host.show.set(false);
    await fixture.whenStable();
    host.show.set(true);
    await fixture.whenStable();
    const title = root().querySelector<HTMLElement>('.ui-error-state__title')!;
    expect(title.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(title);
  });

  it('si tras reintentar la persona ya está en otro control, el error nuevo no le roba el foco', async () => {
    retry()!.click();
    host.show.set(false);
    await fixture.whenStable();
    const other = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.other')!;
    other.focus();
    host.show.set(true);
    await fixture.whenStable();
    expect(document.activeElement).toBe(other);
  });

  it('un reintento que tarda mucho (más de 10 s) y falla también devuelve el foco al título', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      retry()!.focus();
      retry()!.click();
      host.show.set(false);
      await fixture.whenStable();
      vi.setSystemTime(Date.now() + 60_000);
      host.show.set(true);
      await fixture.whenStable();
      expect(document.activeElement).toBe(root().querySelector('.ui-error-state__title'));
    } finally {
      vi.useRealTimers();
    }
  });

  // req: REGLA-004, BLOQUE-H (F6-1: el error de carga del juego aparece por sí solo y deja el foco en el cuerpo)
  it('con autofocus, un error bloqueante que aparece por sí solo deja el foco en su título', async () => {
    const other = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.other')!;
    other.focus();
    host.autofocus.set(true);
    host.blocking.set(true);
    host.show.set(false);
    await fixture.whenStable();
    host.show.set(true);
    await fixture.whenStable();
    expect(document.activeElement).toBe(root().querySelector('.ui-error-state__title'));
  });

  it('un error que aparece sin reintento no roba el foco', async () => {
    const other = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.other')!;
    other.focus();
    host.show.set(false);
    await fixture.whenStable();
    host.show.set(true);
    await fixture.whenStable();
    expect(document.activeElement).toBe(other);
  });
});
