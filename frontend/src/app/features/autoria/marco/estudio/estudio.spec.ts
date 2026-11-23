import { ChangeDetectionStrategy, Component, TemplateRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { type Comando, esCampoDeTexto, filtrarComandos, leerGuardado } from './atajos';
import { EstudioDivisorComponent } from './estudio-divisor.component';
import { atajoAria, EstudioHerramientaComponent } from './estudio-herramienta.component';
import { EstudioMarcoComponent } from './estudio-marco.component';
import { EstudioPaletaComponent } from './estudio-paleta.component';
import { EstudioSeccionComponent } from './estudio-seccion.component';
import { EstudioRanuraDirective, EstudioService } from './estudio.service';

const cmd = (id: string, titulo: string, grupo = 'Escenas', ejecutar: () => void = () => undefined): Comando => ({ id, titulo, grupo, ejecutar });

// req: EDITOR-PRO.md punto 4 (paleta de comandos y atajos que no se disparan al escribir)
describe('Estudio · utilidades de atajos y de la paleta', () => {
  it('una tecla de una letra no actúa dentro de un campo, un área de texto o una lista; sí en un botón', () => {
    const casilla = Object.assign(document.createElement('input'), { type: 'checkbox' });
    expect(esCampoDeTexto(document.createElement('input'))).toBe(true);
    expect(esCampoDeTexto(document.createElement('textarea'))).toBe(true);
    expect(esCampoDeTexto(document.createElement('select'))).toBe(true);
    expect(esCampoDeTexto(casilla)).toBe(false);
    expect(esCampoDeTexto(document.createElement('button'))).toBe(false);
    expect(esCampoDeTexto(null)).toBe(false);
  });

  it('filtra sin tildes ni mayúsculas, con lo que empieza igual primero', () => {
    const lista = [cmd('a', 'Sala de espera'), cmd('b', 'Ir a la recepción del hospital'), cmd('c', 'Recepción')];
    expect(filtrarComandos(lista, 'recepcion').map((c) => c.id)).toEqual(['c', 'b']);
    expect(filtrarComandos(lista, '').map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(filtrarComandos(lista, 'zzz')).toEqual([]);
  });

  it('lee lo guardado sin romperse si el almacenamiento falla', () => {
    const espia = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(leerGuardado('x', { a: 1 })).toEqual({ a: 1 });
    espia.mockRestore();
  });

  it('traduce el atajo a `aria-keyshortcuts`', () => {
    expect(atajoAria('Ctrl+Mayús+Z')).toBe('Control+Shift+Z');
    expect(atajoAria('F')).toBe('F');
  });
});

// req: EDITOR-PRO.md punto 1 (disposición de estudio: paneles que se ocultan y se ajustan, ranuras para las pantallas)
describe('EstudioService · el contrato de la disposición', () => {
  beforeEach(() => localStorage.clear());

  it('oculta los dos paneles con una tecla y los devuelve con la misma', () => {
    const s = new EstudioService();
    expect(s.soloLienzo()).toBe(false);
    s.alternarPaneles();
    expect([s.verExplorador(), s.verInspector()]).toEqual([false, false]);
    s.alternarPaneles();
    expect([s.verExplorador(), s.verInspector()]).toEqual([true, true]);
  });

  it('acota el ancho a sus límites y lo recuerda para la próxima vez', () => {
    const s = new EstudioService();
    s.fijarAncho('explorador', 9999);
    expect(s.anchoExplorador()).toBe(400);
    expect(new EstudioService().anchoExplorador()).toBe(400);
  });

  it('las ranuras son una pila: al quitar la última vuelve la anterior', () => {
    const s = new EstudioService();
    const a = {} as TemplateRef<unknown>, b = {} as TemplateRef<unknown>;
    s.registrar('inspector', a);
    const quitarB = s.registrar('inspector', b);
    expect(s.ranura('inspector')).toBe(b);
    quitarB();
    expect(s.ranura('inspector')).toBe(a);
  });

  it('los comandos de varias pantallas se juntan y se van con ellas', () => {
    const s = new EstudioService();
    const quitar = s.registrarComandos(() => [cmd('a', 'Ver todo', 'Vista')]);
    s.registrarComandos(() => [cmd('b', 'Recepción')]);
    expect(s.comandos().map((c) => c.id)).toEqual(['a', 'b']);
    quitar();
    expect(s.comandos().map((c) => c.id)).toEqual(['b']);
  });
});

@Component({
  imports: [EstudioRanuraDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template estudioRanura="inspector"><p class="dentro">Propiedades</p></ng-template>`,
})
class PantallaSola {}

@Component({
  imports: [EstudioRanuraDirective],
  providers: [EstudioService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-template estudioRanura="inspector"><p class="dentro">Propiedades</p></ng-template>`,
})
class PantallaEnEstudio {}

describe('EstudioRanuraDirective', () => {
  it('sin estudio alrededor pinta el contenido en su sitio (la pantalla funciona sola)', async () => {
    const f = TestBed.createComponent(PantallaSola);
    await f.whenStable();
    expect(f.nativeElement.querySelector('.dentro')?.textContent).toBe('Propiedades');
  });

  it('con estudio lo entrega a la ranura y no lo pinta en su sitio', async () => {
    const f = TestBed.createComponent(PantallaEnEstudio);
    await f.whenStable();
    expect(f.nativeElement.querySelector('.dentro')).toBeNull();
    expect(f.debugElement.injector.get(EstudioService).ranura('inspector')).not.toBeNull();
  });
});

@Component({
  imports: [EstudioPaletaComponent, EstudioSeccionComponent, EstudioDivisorComponent, EstudioHerramientaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-estudio-paleta [comandos]="comandos" (cerrar)="cerrada.set(true)" />
    <app-estudio-seccion titulo="Intensidad" resumen="Media"><input aria-label="dentro" /></app-estudio-seccion>
    <app-estudio-divisor etiqueta="Ancho" [valor]="300" [min]="200" [max]="400" (cambio)="ancho.set($event)" />
    <button type="button" estudioHerramienta="Ver todo" atajo="F" [activa]="true">F</button>
  `,
})
class Banco {
  readonly ejecutado = signal('');
  readonly cerrada = signal(false);
  readonly ancho = signal(0);
  readonly comandos = [cmd('a', 'Fachada', 'Escenas', () => this.ejecutado.set('a')), cmd('b', 'Recepción', 'Escenas', () => this.ejecutado.set('b'))];
}

describe('Primitivas del estudio en la pantalla', () => {
  it('la paleta corre el comando activo con Enter y se cierra', async () => {
    const f = TestBed.createComponent(Banco);
    await f.whenStable();
    const campo = f.nativeElement.querySelector('[role="combobox"]') as HTMLInputElement;
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    await f.whenStable();
    expect(campo.getAttribute('aria-activedescendant')).toBe('est-pc-1');
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise((r) => setTimeout(r));
    expect(f.componentInstance.cerrada()).toBe(true);
    expect(f.componentInstance.ejecutado()).toBe('b');
  });

  it('la sección plegada deja su contenido inerte y lo dice con aria-expanded', async () => {
    const f = TestBed.createComponent(Banco);
    await f.whenStable();
    const boton = f.nativeElement.querySelector('app-estudio-seccion button') as HTMLButtonElement;
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    boton.click();
    await f.whenStable();
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    expect(f.nativeElement.querySelector('app-estudio-seccion [inert]')).not.toBeNull();
  });

  it('el divisor es un separador que se mueve con las flechas', async () => {
    const f = TestBed.createComponent(Banco);
    await f.whenStable();
    const div = f.nativeElement.querySelector('app-estudio-divisor') as HTMLElement;
    expect(div.getAttribute('role')).toBe('separator');
    expect(div.getAttribute('aria-valuenow')).toBe('300');
    div.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(f.componentInstance.ancho()).toBe(316);
  });

  it('el botón de herramienta lleva su nombre, su atajo y si está activo', async () => {
    const f = TestBed.createComponent(Banco);
    await f.whenStable();
    const b = f.nativeElement.querySelector('[estudioHerramienta]') as HTMLButtonElement;
    expect(b.getAttribute('aria-label')).toBe('Ver todo');
    expect(b.getAttribute('aria-keyshortcuts')).toBe('F');
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });
});

@Component({
  imports: [EstudioMarcoComponent, EstudioRanuraDirective],
  providers: [EstudioService],
  template: `<app-estudio-marco [exploradorPorDefecto]="explorador">
    <ng-template estudioRanura="inspector"><button>Propiedades</button></ng-template>
  </app-estudio-marco><ng-template #explorador><button>Escenas</button></ng-template>`,
})
class BancoMarco {}

// req: EDITOR-PRO punto 1: el foco acompaña la apertura y el cierre de los paneles.
describe('EstudioMarco ? foco de los paneles', () => {
  beforeEach(() => localStorage.clear());
  for (const escritorio of [true, false]) {
    for (const panel of ['explorador', 'inspector']) {
      it(`${panel}: devuelve el foco al control visible y lo introduce al reabrir (${escritorio ? 'escritorio' : 'móvil'})`, async () => {
        const media = vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: escritorio, addListener: vi.fn(), removeListener: vi.fn() }));
        const f = TestBed.createComponent(BancoMarco);
        document.body.appendChild(f.nativeElement);
        await f.whenStable();
        const raiz = f.nativeElement as HTMLElement;
        // jsdom no aplica las reglas @media: reproducimos qu? barra est? visible.
        raiz.querySelector<HTMLElement>('.estado')!.style.display = escritorio ? 'flex' : 'none';
        raiz.querySelector<HTMLElement>('.paneles-movil')!.style.display = escritorio ? 'none' : 'flex';
        const cerrar = raiz.querySelector<HTMLButtonElement>(`.panel--${panel} .cab button`)!;
        const abrir = raiz.querySelector<HTMLButtonElement>(`${escritorio ? '.estado' : '.paneles-movil'} [data-panel-control="${panel}"]`)!;
        cerrar.focus();
        expect(document.activeElement).toBe(cerrar);
        cerrar.click();
        await f.whenStable();
        expect(document.activeElement).toBe(abrir);
        abrir.click();
        await f.whenStable();
        expect(document.activeElement).toBe(raiz.querySelector(`.panel--${panel} .cab button`));
        f.destroy();
        raiz.remove();
        media.unstubAllGlobals();
      });
    }
  }
});
