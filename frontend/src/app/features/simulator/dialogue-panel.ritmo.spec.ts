import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InstantTextSettings } from '../../core/a11y/instant-text-settings.service';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { DialogueState } from '../../core/models/simulation.model';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { AudioDirectorService } from './audio-director.service';
import { DialoguePanelComponent } from './dialogue-panel.component';

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

const TRES_LINEAS: DialogueState = {
  key: 'ritmo',
  speakerName: 'Vigilante',
  portraitKey: null,
  emotion: 'neutral',
  lines: [
    { order: 1, speakerName: 'Vigilante', text: 'Buenas noches, pase por favor.', emotion: 'neutral' },
    { order: 2, speakerName: 'Vigilante', text: 'La sala de espera queda a la derecha.', emotion: 'neutral' },
    { order: 3, speakerName: 'Vigilante', text: 'Avíseme si necesita algo.', emotion: 'neutral' },
  ],
  choices: [],
};

/**
 * Diálogos a tu ritmo (P8): clic, Espacio o Enter muestran la línea entera al instante si aún se escribe y, si ya está
 * completa, avanzan; «Saltar animación» responde SIEMPRE (también cuando el reparto en páginas llega después); «reducir
 * movimiento» y «Texto instantáneo» quitan la máquina de escribir.
 */
describe('DialoguePanelComponent: a tu ritmo (P8)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [
        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },
        { provide: KitService, useValue: fakeKitService() },
        { provide: LiveRegionAnnouncer, useValue: { announce: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  }

  function render(dialogue: DialogueState): void {
    writeInputSignal(component.dialogue, dialogue);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  const speech = () => fixture.nativeElement.querySelector('.placa-habla') as HTMLElement;
  const click = (target: Element) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    fixture?.destroy();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  describe('clic sobre el texto', () => {
    beforeEach(async () => { await setup(); });

    it('conserva el botón durante la escritura y completa un clic iniciado antes de terminar', async () => {
      render(TRES_LINEAS);
      const boton = speech().querySelector<HTMLButtonElement>('button.close-btn')!;
      let quitados = 0;
      let insertados = 0;
      const contar = (n: Node) => n instanceof Element ? Number(n.matches('button')) + n.querySelectorAll('button').length : 0;
      const observer = new MutationObserver(records => records.forEach(r => {
        r.removedNodes.forEach(n => quitados += contar(n));
        r.addedNodes.forEach(n => insertados += contar(n));
      }));
      observer.observe(speech(), { childList: true, subtree: true });
      boton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      component.skipTypewriter();
      fixture.detectChanges();
      await Promise.resolve();
      observer.disconnect();
      console.log(`G1 escritura: ${quitados} botones retirados, ${insertados} insertados`);
      expect(speech().querySelector('button.close-btn')).toBe(boton);
      expect(quitados).toBe(0);
      expect(insertados).toBe(0);
      boton.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      boton.click();
      expect(component.lineIndex()).toBe(1);
    });

    it('mientras se escribe, muestra la línea entera de una vez', () => {
      render(TRES_LINEAS);
      expect(component.isTypingComplete()).toBe(false);

      click(speech().querySelector('.dialogue-text')!);

      expect(component.isTypingComplete()).toBe(true);
      expect(component.displayedText()).toBe('Buenas noches, pase por favor.');
      expect(component.lineIndex()).toBe(0);
    });

    it('con la línea completa, avanza a la siguiente', () => {
      render(TRES_LINEAS);
      component.skipTypewriter();

      click(speech().querySelector('.dialogue-text')!);

      expect(component.lineIndex()).toBe(1);
    });

    it('en la última línea no cierra ni elige nada: eso se hace con su botón o su tecla', () => {
      render(TRES_LINEAS);
      component.skipTypewriter();
      component.advanceLine();
      component.skipTypewriter();
      component.advanceLine();
      component.skipTypewriter();
      const close = vi.fn();
      component.close.subscribe(close);

      click(speech().querySelector('.dialogue-text')!);

      expect(component.lineIndex()).toBe(2);
      expect(close).not.toHaveBeenCalled();
    });

    it('un clic sobre un botón del cuadro no se cuenta dos veces', () => {
      render(TRES_LINEAS);
      const saltar = speech().querySelector<HTMLButtonElement>('button.close-btn')!;
      expect(saltar.textContent).toContain('Mostrar texto completo');

      saltar.click();   // «Saltar»: muestra todo, no además avanza
      fixture.detectChanges();

      expect(component.isTypingComplete()).toBe(true);
      expect(component.lineIndex()).toBe(0);
    });

    it('seleccionar texto para copiarlo no avanza', () => {
      render(TRES_LINEAS);
      component.skipTypewriter();
      vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'pase por favor' } as unknown as Selection);

      click(speech().querySelector('.dialogue-text')!);

      expect(component.lineIndex()).toBe(0);
    });

    it('Espacio y Enter hacen lo mismo que el clic: completan y luego avanzan', () => {
      render(TRES_LINEAS);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      expect(component.isTypingComplete()).toBe(true);
      expect(component.lineIndex()).toBe(0);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(component.lineIndex()).toBe(1);
    });
  });

  describe('«Saltar animación» responde siempre', () => {
    beforeEach(async () => { await setup(); });

    it('si el reparto en páginas llega después de saltar, la línea sigue completa (no vuelve a escribirse)', () => {
      render(TRES_LINEAS);
      component.skipTypewriter();
      expect(component.isTypingComplete()).toBe(true);

      // El reparto en páginas (un cuadro después de abrir la línea) vuelve a escribir su primera página:
      (component as unknown as { escribir(text: string): void }).escribir('Buenas noches,');

      expect(component.isTypingComplete()).toBe(true);
      expect(component.displayedText()).toBe('Buenas noches,');
    });

    it('lo saltado vale para la línea; la siguiente vuelve a escribirse a su ritmo', () => {
      render(TRES_LINEAS);
      component.skipTypewriter();

      component.advanceLine();

      expect(component.isTypingComplete()).toBe(false);
      expect(component.displayedText().length).toBeLessThan(TRES_LINEAS.lines[1].text.length);
    });

    it('el control conserva su nombre al completar la escritura', () => {
      render(TRES_LINEAS);
      const boton = fixture.nativeElement.querySelector('button.close-btn') as HTMLButtonElement;
      expect(boton.textContent).toContain('Mostrar texto completo');
      component.skipTypewriter();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('button.close-btn')).toBe(boton);
      expect(boton.textContent).toContain('Seguir leyendo');
    });
  });

  describe('sin máquina de escribir', () => {
    beforeEach(async () => { await setup(); });

    it('con «Texto instantáneo» la línea aparece completa y no queda ningún temporizador', () => {
      TestBed.inject(InstantTextSettings).set(true);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

      render(TRES_LINEAS);

      expect(component.displayedText()).toBe('Buenas noches, pase por favor.');
      expect(component.isTypingComplete()).toBe(true);
      expect(fixture.nativeElement.querySelector('[aria-label="Saltar animación de texto"]')).toBeNull();
      component.advanceLine();
      expect(component.displayedText()).toBe('La sala de espera queda a la derecha.');
      expect(component.isTypingComplete()).toBe(true);
    });

    it('el ajuste visible completa la página, recuerda la preferencia y no avanza el diálogo', () => {
      TestBed.inject(InstantTextSettings).set(false);
      render(TRES_LINEAS);
      const button = fixture.nativeElement.querySelector('.instant-setting') as HTMLButtonElement;
      expect(button.getAttribute('aria-pressed')).toBe('false');
      click(button);
      fixture.detectChanges();
      expect(component.isTypingComplete()).toBe(true);
      expect(component.lineIndex()).toBe(0);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem('siep.texto-instantaneo.v1')).toBe('on');
    });

    it('apagado, la máquina de escribir sigue siendo la de siempre', () => {
      TestBed.inject(InstantTextSettings).set(false);

      render(TRES_LINEAS);

      expect(component.isTypingComplete()).toBe(false);
    });

    it('con «reducir movimiento» tampoco hay máquina de escribir, sin tocar el ajuste', () => {
      writeInputSignal(component.reduceMotion, true);

      render(TRES_LINEAS);

      expect(component.isTypingComplete()).toBe(true);
      expect(TestBed.inject(InstantTextSettings).enabled()).toBe(false);
    });
  });
});
