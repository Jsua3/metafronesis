import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SimulationHudComponent } from './simulation-hud.component';
import type { MockInstance } from 'vitest';

const hudSource = readFileSync(join(__dirname, 'simulation-hud.component.ts'), 'utf-8');
const playSource = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

describe('HUD: menú de Ajustes', () => {
  let fixture: ComponentFixture<SimulationHudComponent>;
  let hud: SimulationHudComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SimulationHudComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(SimulationHudComponent);
    fixture.detectChanges();
    hud = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('Esc cierra Ajustes y consume la tecla para que no dispare la salida segura', () => {
    hud.settingsOpen.set(true);
    const event = pressEscape();
    expect(hud.settingsOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('con Ajustes cerrado, Esc queda libre para el juego', () => {
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(false);
  });

  it('un toque dentro del HUD no cierra Ajustes; uno fuera sí', () => {
    hud.settingsOpen.set(true);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hud.settingsOpen()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hud.settingsOpen()).toBe(false);
  });

  describe('oyentes globales solo cuando hacen falta', () => {
    function pointerdownRegistrations(spy: MockInstance): number {
      return spy.mock.calls.filter(([type]) => type === 'pointerdown').length;
    }

    it('con Ajustes cerrado no hay oyente de pointerdown en document', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const fresh = TestBed.createComponent(SimulationHudComponent);
      fresh.detectChanges();
      expect(pointerdownRegistrations(add)).toBe(0);
      add.mockRestore();
    });

    it('se registra al abrir Ajustes y se retira al cerrar', () => {
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      hud.settingsOpen.set(true);
      fixture.detectChanges();
      expect(pointerdownRegistrations(add)).toBe(1);
      expect(pointerdownRegistrations(remove)).toBe(0);

      hud.settingsOpen.set(false);
      fixture.detectChanges();
      expect(pointerdownRegistrations(remove)).toBe(1);

      // Ya cerrado, un toque fuera no hace nada y volver a abrir registra de nuevo.
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      expect(hud.settingsOpen()).toBe(false);
      hud.settingsOpen.set(true);
      fixture.detectChanges();
      expect(pointerdownRegistrations(add)).toBe(2);
      add.mockRestore();
      remove.mockRestore();
    });

    it('abrir dos veces seguidas no duplica el oyente', () => {
      const add = vi.spyOn(document, 'addEventListener');
      hud.settingsOpen.set(true);
      fixture.detectChanges();
      hud.settingsOpen.set(false);
      hud.settingsOpen.set(true);
      fixture.detectChanges();
      expect(pointerdownRegistrations(add)).toBe(1);
      add.mockRestore();
    });

    it('destruir el HUD con Ajustes abierto retira el oyente', () => {
      const remove = vi.spyOn(document, 'removeEventListener');
      hud.settingsOpen.set(true);
      fixture.detectChanges();
      fixture.destroy();
      expect(pointerdownRegistrations(remove)).toBe(1);
      remove.mockRestore();
    });

    it('el teclado solo entra en la zona con Escape: no hay HostListener de document:keydown genérico', () => {
      expect(hudSource).toContain("@HostListener('document:keydown.escape', ['$event'])");
      expect(hudSource).not.toContain("@HostListener('document:keydown', ");
      expect(hudSource).not.toContain("@HostListener('document:pointerdown'");
      expect(hudSource).toMatch(/renderer\.listen\('document', 'pointerdown'/);
    });
  });

  it('el engranaje anuncia si el menú está abierto y recibe el foco al cerrar', () => {
    expect(hudSource).toContain('#settingsTrigger');
    expect(hudSource).toContain('[attr.aria-expanded]="settingsOpen()"');
    expect(hudSource).toContain('[attr.aria-controls]="settingsOpen() ? \'game-settings-menu\' : null"');
    expect(hudSource).toContain('id="game-settings-menu"');
    expect(hudSource).toContain('aria-label="Cerrar ajustes" (click)="closeSettings()"');
    expect(hudSource).toMatch(/if \(restoreFocus\) this\.settingsTrigger\(\)\?\.nativeElement\.focus\(\);/);
  });

  it('el manejador global de la partida respeta las teclas ya consumidas', () => {
    expect(playSource).toMatch(/handleGlobalInteraction\(event: KeyboardEvent\) \{[\s\S]{0,400}?if \(event\.defaultPrevented\) return;/);
  });
});
