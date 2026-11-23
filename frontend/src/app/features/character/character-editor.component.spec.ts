import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { AvatarStore } from './avatar.store';
import { CharacterEditorComponent } from './character-editor.component';
import { KitFigureComponent } from './kit/kit-figure.component';
import { KitService } from './kit/kit.service';
import { fakeKitService, testKitBundle } from './kit/testing/kit-testing';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } as unknown as Storage;
}

/**
 * Editor de avatar (plan visual F5-4; VD-13), en DOM: piel portal con el escenario oscuro solo en la vista previa,
 * grupos de radios nativos (flechas del navegador), «Cambios sin guardar» a la vista, «Restablecer» con confirmación,
 * el rol desde labels.ts y el error del kit con «Reintentar».
 */
// req: BLOQUE-H, RNF-04
describe('CharacterEditorComponent', () => {
  const DAVID = testKitBundle().recipes['david']?.displayName ?? 'david';
  let fixture: ComponentFixture<CharacterEditorComponent>;
  let store: AvatarStore;
  let confirm: ReturnType<typeof vi.fn>;
  let consequence: ReturnType<typeof vi.fn>;
  let success: ReturnType<typeof vi.fn>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"], [hidden]').forEach(node => node.remove());
    return text(copy);
  };
  const group = (legend: string) => [...host().querySelectorAll('fieldset')].find(set => text(set.querySelector('legend')) === legend)!;
  const radio = (legend: string, label: string) => [...group(legend).querySelectorAll('label')]
    .find(item => spoken(item) === label)!.querySelector<HTMLInputElement>('input[type="radio"]')!;
  const button = (name: string) => [...host().querySelectorAll('button')].find(item => spoken(item) === name) as HTMLButtonElement;
  const status = () => text(host().querySelector('.ce-footer [role="status"]'));

  async function render(options: { role?: string; kit?: KitService; volver?: string } = {}) {
    store = new AvatarStore(memoryStorage());
    confirm = vi.fn();
    consequence = vi.fn();
    success = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(options.volver ? { volver: options.volver } : {}) } } },
        { provide: AvatarStore, useValue: store },
        { provide: KitService, useValue: options.kit ?? fakeKitService() },
        { provide: AuthService, useValue: { currentUser: signal({ role: options.role ?? 'ESTUDIANTE' }) } },
        { provide: NotificationService, useValue: { success } },
        { provide: UiDialog, useValue: { confirm, consequence } },
      ],
    });
    fixture = TestBed.createComponent(CharacterEditorComponent);
    await fixture.whenStable();
  }

  it('un h1 y la piel portal: SOLO el escenario de la vista previa va en piel juego (VD-13)', async () => {
    await render();
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    expect(text(host().querySelector('h1'))).toBe('Personaliza tu avatar profesional');
    const skinned = [...host().querySelectorAll('[data-skin]')];
    expect(skinned).toHaveLength(1);
    expect(skinned[0].matches('section.ce-stage')).toBe(true);
    expect(skinned[0].getAttribute('data-skin')).toBe('game');
  });

  it('el elenco es un grupo de radios nativos (flechas del navegador) y elegir cambia el personaje', async () => {
    await render();
    const radios = [...group('Elige tu personaje').querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios).toHaveLength(13);
    expect(new Set(radios.map(item => item.name)).size).toBe(1);
    expect(radios.filter(item => item.checked)).toHaveLength(1);
    // El elenco y las opciones son radios nativos; el único radiogroup con ARIA es el segmentado de Movimiento (C5).
    expect(host().querySelector('.ce-panel')!.querySelector('[role="radio"], [role="radiogroup"]')).toBeNull();

    radio('Elige tu personaje', DAVID).click();
    await fixture.whenStable();
    expect(store.avatar()).toMatchObject({ mode: 'elenco', recipeId: 'david' });
  });

  it('«Personalizado» abre sus grupos; los tonos tienen nombre aunque se vean como muestras', async () => {
    await render();
    radio('Elige tu personaje', 'Personalizado').click();
    await fixture.whenStable();
    for (const legend of ['Complexión', 'Piel', 'Peinado', 'Color de pelo']) {
      expect(group(legend).querySelectorAll('input[type="radio"]').length).toBeGreaterThan(1);
    }
    expect(spoken(group('Piel').querySelector('label')!)).toBe('Tono 1');
    expect(group('Accesorios').querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it('«Cambios sin guardar» se ve tras un cambio y desaparece al guardar', async () => {
    await render();
    expect(status()).toBe('Sin cambios');
    radio('Elige tu personaje', DAVID).click();
    await fixture.whenStable();
    expect(status()).toBe('Cambios sin guardar');

    button('Guardar').click();
    await fixture.whenStable();
    expect(status()).toBe('Sin cambios');
    expect(success).toHaveBeenCalledWith('Personaje guardado.');
  });

  it('«Restablecer» pide confirmación: «Cancelar» no toca nada y confirmar vuelve al personaje por defecto', async () => {
    await render();
    radio('Elige tu personaje', DAVID).click();
    await fixture.whenStable();

    confirm.mockResolvedValueOnce(false);
    button('Restablecer').click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '¿Restablecer tu personaje?', tone: 'danger', confirmLabel: 'Restablecer' }));
    expect(store.avatar()).toMatchObject({ recipeId: 'david' });

    confirm.mockResolvedValueOnce(true);
    button('Restablecer').click();
    await fixture.whenStable();
    expect(store.avatar()).toMatchObject({ recipeId: 'valentina' });
  });

  it('«Guardar y volver» guarda y lleva al destino conocido (casos)', async () => {
    await render({ volver: '/portal/simulador' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    radio('Elige tu personaje', DAVID).click();
    await fixture.whenStable();
    button('Guardar y volver a casos').click();
    expect(store.dirty()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/portal/simulador');
  });

  it('sin destino conocido solo ofrece guardar', async () => {
    await render();
    expect(text(host().querySelector('.ce-actions'))).not.toContain('Guardar y volver');
  });

  it('las flechas cambian la dirección de la vista previa', async () => {
    await render();
    expect(text(host().querySelector('figcaption'))).toBe('Frente');
    host().querySelector<HTMLButtonElement>('[aria-label="Girar a la derecha"]')!.click();
    await fixture.whenStable();
    expect(text(host().querySelector('figcaption'))).toBe('Derecha');
  });

  it('las dos vistas previas llevan la animación activa (el kit la detiene solo con movimiento reducido)', async () => {
    await render();
    const previews = fixture.debugElement.queryAll(By.css('.ce-view app-kit-figure'));
    expect(previews).toHaveLength(2);
    for (const preview of previews) {
      expect((preview.componentInstance as KitFigureComponent).animated()).toBe(true);
    }
  });

  it('salir con cambios sin guardar pregunta (canLeave); sin cambios, no', async () => {
    await render();
    expect(await fixture.componentInstance.canLeave()).toBe(true);
    expect(consequence).not.toHaveBeenCalled();
    radio('Elige tu personaje', DAVID).click();
    await fixture.whenStable();
    consequence.mockResolvedValue('continue');
    expect(await fixture.componentInstance.canLeave()).toBe(false);
    expect(store.avatar()).toMatchObject({ recipeId: 'david' });
  });

  it('si la sesión ya se cerró (salir de la cuenta, 401), deja salir sin preguntar y descarta lo no guardado', async () => {
    await render();
    radio('Elige tu personaje', DAVID).click();
    await fixture.whenStable();
    (TestBed.inject(AuthService).currentUser as ReturnType<typeof signal<{ role: string } | null>>).set(null);
    expect(await fixture.componentInstance.canLeave()).toBe(true);
    expect(consequence).not.toHaveBeenCalled();
    expect(store.dirty()).toBe(false);
  });

  it('cerrar la pestaña con cambios sin guardar hace que el navegador pregunte; sin cambios, no', async () => {
    await render();
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    radio('Elige tu personaje', DAVID).click();
    await fixture.whenStable();
    expect(unload()).toBe(true);
  });

  it('el rol del resumen sale de labels.ts', async () => {
    await render({ role: 'PROFESOR' });
    expect(text(host().querySelector('.ce-summary'))).toContain('Docente');
  });

  it('si el kit no carga: error con «Reintentar» que lo vuelve a pedir', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('sin red')).mockReturnValue(new Promise(() => undefined));
    await render({ kit: { bundle: signal(null).asReadonly(), load } as unknown as KitService });
    await fixture.whenStable();
    const error = host().querySelector('ui-error-state')!;
    expect(text(error)).toContain('No pudimos cargar los personajes.');
    (error.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
