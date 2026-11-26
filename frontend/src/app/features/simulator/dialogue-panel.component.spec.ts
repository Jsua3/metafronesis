import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { of, throwError } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { SimulationService } from '../../core/api/simulation.service';
import { ShortcutSettings } from '../../core/a11y/shortcut-settings.service';
import { DialogueState } from '../../core/models/simulation.model';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { blend, contrastRatio } from '../../../styles/contrast.util';
import { AudioDirectorService } from './audio-director.service';
import { DialoguePanelComponent } from './dialogue-panel.component';
import {
  activeDialogueLine,
  dialogueChoicesVisible,
  dialogueKeyAction,
  isFinalDialogueLine,
  nextDialogueLineIndex,
} from './dialogue-progression.util';
import type { Mock } from 'vitest';

const source = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');

const MULTI_LINE_DIALOGUE: DialogueState = {
  key: 'dialogue-multi',
  speakerName: 'Narradora',
  portraitKey: 'info',
  emotion: 'neutral',
  lines: [
    { order: 1, speakerName: 'Primera voz', text: 'Primera', emotion: 'concerned' },
    { order: 2, speakerName: 'Segunda voz', text: 'Segunda', emotion: 'positive' },
  ],
  choices: [{
    key: 'choice-1', text: 'Responder', decisionOptionId: 1,
    requiredToolCode: null, effect: {},
  }],
};

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

describe('DialoguePanelComponent - contrato de progresion narrativa', () => {
  it('expone una sola intervencion y revela opciones solo al completar la ultima', () => {
    let lineIndex = 0;

    expect(activeDialogueLine(MULTI_LINE_DIALOGUE, lineIndex)?.text).toBe('Primera');
    expect(activeDialogueLine(MULTI_LINE_DIALOGUE, lineIndex)?.speakerName).toBe('Primera voz');
    expect(dialogueChoicesVisible(MULTI_LINE_DIALOGUE, lineIndex, true)).toBe(false);

    lineIndex = nextDialogueLineIndex(MULTI_LINE_DIALOGUE, lineIndex) ?? lineIndex;

    expect(activeDialogueLine(MULTI_LINE_DIALOGUE, lineIndex)?.text).toBe('Segunda');
    expect(activeDialogueLine(MULTI_LINE_DIALOGUE, lineIndex)?.emotion).toBe('positive');
    expect(dialogueChoicesVisible(MULTI_LINE_DIALOGUE, lineIndex, true)).toBe(true);
  });

  it('modela Enter y Espacio como completar, avanzar y cerrar sin saltos dobles', () => {
    expect(dialogueKeyAction('Enter', false, false, 0, false)).toBe('complete');
    expect(dialogueKeyAction('Enter', true, false, 0, false)).toBe('advance');
    expect(dialogueKeyAction(' ', false, false, 0, false)).toBe('complete');
    expect(dialogueKeyAction(' ', true, false, 0, false)).toBe('advance');
    expect(dialogueKeyAction('Enter', true, true, 0, false)).toBe('close');
    expect(dialogueKeyAction('Enter', true, true, 1, false)).toBe('none');
    expect(dialogueKeyAction('Enter', true, false, 0, true)).toBe('none');
  });

  it('mantiene Escape disponible y bloquea opciones antes del final', () => {
    expect(dialogueKeyAction('Escape', false, false, 1, false)).toBe('close');
    // Mantenida, solo el primer evento cierra (F5): los repetidos no cierran el diálogo siguiente.
    expect(dialogueKeyAction('Escape', true, true, 0, true)).toBe('none');
    expect(dialogueKeyAction('1', true, false, 1, false)).toBe('none');
    expect(dialogueKeyAction('1', true, true, 1, false)).toBe('choose');
    expect(dialogueKeyAction('2', true, true, 1, false)).toBe('none');
    // Las opciones se nombran A a D: la letra elige igual que el número, con las mismas guardas.
    expect(dialogueKeyAction('a', true, true, 1, false)).toBe('choose');
    expect(dialogueKeyAction('B', true, true, 2, false)).toBe('choose');
    expect(dialogueKeyAction('b', true, true, 1, false)).toBe('none');
    expect(dialogueKeyAction('a', true, false, 1, false)).toBe('none');
    expect(dialogueKeyAction('e', true, true, 4, false)).toBe('none');
    expect(isFinalDialogueLine(MULTI_LINE_DIALOGUE, 0)).toBe(false);
    expect(isFinalDialogueLine(MULTI_LINE_DIALOGUE, 1)).toBe(true);
  });
});

describe('DialoguePanelComponent - integración renderizada', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [
        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },
        { provide: KitService, useValue: fakeKitService() },
        // El anuncio de la línea tiene su propio describe (F6-12); aquí su temporizador de escritura no cuenta.
        { provide: LiveRegionAnnouncer, useValue: { announce: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(dialogue: DialogueState): void {
    writeInputSignal(component.dialogue, dialogue);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('pinta el alto real de las opciones, pero las mantiene inertes hasta recibir su propio encuadre', () => {
    fixture.componentRef.setInput('esperarEncuadre', true);
    fixture.componentRef.setInput('reduceMotion', true);
    render(MULTI_LINE_DIALOGUE);
    fixture.componentRef.setInput('encuadreListo', component.faseEncuadre());
    fixture.detectChanges();
    component.advanceLine();
    fixture.detectChanges();

    const banda: HTMLElement = fixture.nativeElement.querySelector('.dialogue-strip');
    const fichas = banda.querySelector('.strip-body') as HTMLElement;
    expect(banda.querySelector('.choice-btn')).not.toBeNull();
    expect(fichas.hasAttribute('data-encuadrando')).toBe(true);
    expect(fichas.hasAttribute('inert')).toBe(true);
    // La línea que se estaba leyendo no desaparece mientras la cámara llega.
    expect(banda.hasAttribute('inert')).toBe(false);
    expect(banda.hasAttribute('data-encuadrando')).toBe(false);
    const ejecutar = vi.fn();
    component.execute.subscribe(ejecutar);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'a' }));
    expect(component.chosenKey()).toBeNull();
    expect(ejecutar).not.toHaveBeenCalled();

    fixture.componentRef.setInput('encuadreListo', component.faseEncuadre());
    fixture.detectChanges();
    expect(fichas.hasAttribute('inert')).toBe(false);
    expect(banda.contains(document.activeElement)).toBe(true);
  });

  it('abre al vencer el plazo sin cámara y da un plazo propio a las opciones', () => {
    vi.useFakeTimers();
    try {
      fixture.componentRef.setInput('esperarEncuadre', true);
      fixture.componentRef.setInput('reduceMotion', true);
      render(MULTI_LINE_DIALOGUE);
      const banda: HTMLElement = fixture.nativeElement.querySelector('.dialogue-strip');
      const faseDeLectura = component.faseEncuadre();
      const avanzarTiempo = (ms: number) => {
        vi.advanceTimersByTime(ms);
        fixture.detectChanges();
      };

      // La lectura no espera a la cámara: el cuadro está a la vista desde el principio.
      expect(banda.hasAttribute('inert')).toBe(false);
      expect(banda.hasAttribute('data-encuadrando')).toBe(false);

      component.advanceLine();
      fixture.componentRef.setInput('encuadreListo', faseDeLectura);
      fixture.detectChanges();
      const fichas = () => banda.querySelector('.strip-body') as HTMLElement;
      avanzarTiempo(1599);
      expect(banda.querySelector('.choice-btn')).not.toBeNull();
      expect(fichas().hasAttribute('inert')).toBe(true);
      expect(banda.hasAttribute('inert')).toBe(false);
      avanzarTiempo(1);
      expect(fichas().hasAttribute('inert')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('la trampa de foco no captura mientras las fichas esperan (sin aviso de cdkFocusInitial sobre un grupo inerte)', () => {
    expect(source).toContain(`[cdkTrapFocusAutoCapture]="!encuadrando()"`);
    expect(source).toMatch(/<div class="choices"[^>]*cdkFocusInitial/);
  });

  it('abre al confirmar y cancela el plazo de esa fase', () => {
    vi.useFakeTimers();
    try {
      fixture.componentRef.setInput('esperarEncuadre', true);
      fixture.componentRef.setInput('reduceMotion', true);
      render(MULTI_LINE_DIALOGUE);
      const banda: HTMLElement = fixture.nativeElement.querySelector('.dialogue-strip');
      const fichas = () => banda.querySelector('.strip-body') as HTMLElement;
      component.advanceLine();
      fixture.detectChanges();
      vi.advanceTimersByTime(400);
      fixture.detectChanges();
      expect(fichas().hasAttribute('inert')).toBe(true);

      fixture.componentRef.setInput('encuadreListo', component.faseEncuadre());
      fixture.detectChanges();
      expect(fichas().hasAttribute('inert')).toBe(false);
      // El plazo de esa fase quedó cancelado: nada vuelve a cerrar las fichas.
      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      expect(fichas().hasAttribute('inert')).toBe(false);
      expect(banda.hasAttribute('inert')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reemplaza cada control sin sacar el foco del diálogo y oculta opciones intermedias', () => {
    render(MULTI_LINE_DIALOGUE);
    component.skipTypewriter();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(component.displayedText()).toBe('Primera');
    expect(dialog.querySelector('.choices')).toBeNull();
    expect(document.activeElement).toBe(dialog.querySelector('.close-btn'));

    component.advanceLine();
    component.skipTypewriter();
    fixture.detectChanges();

    expect(component.displayedText()).toBe('Segunda');
    expect(dialog.querySelector('.choices')).not.toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('con movimiento reducido la línea aparece completa, sin máquina de escribir, y el foco entra al diálogo', () => {
    // render() bajo reloj real: igual que en el resto del archivo, instalar el reloj falso
    // ANTES del primer detectChanges() deja a mitad de camino el tick de estabilización del
    // planificador zone-coalesced de Angular 22 y una siguiente llamada reentra en
    // ApplicationRef.tick (NG0101).
    writeInputSignal(component.reduceMotion, true);
    render(MULTI_LINE_DIALOGUE);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
      expect(component.displayedText()).toBe('Primera');
      expect(component.isTypingComplete()).toBe(true);
      expect(dialog.contains(document.activeElement)).toBe(true);

      // DOM renderizado: no hay nada que saltar y el control de avance ya está disponible.
      expect(dialog.querySelector('[aria-label="Saltar animación de texto"]')).toBeNull();
      expect(dialog.querySelector('button.close-btn')?.textContent).toContain('Continuar');
      // La máquina de escribir no dejó ningún temporizador programado.
      expect(vi.getTimerCount()).toBe(0);

      component.advanceLine();
      fixture.detectChanges();
      expect(component.displayedText()).toBe('Segunda');
      expect(component.isTypingComplete()).toBe(true);
      expect(dialog.querySelector('[aria-label="Saltar animación de texto"]')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sin movimiento reducido la línea sigue apareciendo letra a letra', () => {
    render(MULTI_LINE_DIALOGUE);
    expect(component.displayedText()).toBe('');
    expect(component.isTypingComplete()).toBe(false);
  });

  it('cambiar el interruptor con el diálogo abierto no lo reinicia', () => {
    render(MULTI_LINE_DIALOGUE);
    component.skipTypewriter();
    component.advanceLine();
    expect(component.lineIndex()).toBe(1);

    writeInputSignal(component.reduceMotion, true);
    TestBed.flushEffects();

    expect(component.lineIndex()).toBe(1);
    expect(component.activeLine()?.text).toBe('Segunda');
  });

  it('hereda hablante, emoción y retrato del árbol cuando la línea trae cadenas vacías', () => {
    render({
      ...MULTI_LINE_DIALOGUE,
      speakerName: 'Consultante',
      portraitKey: 'escucha-segura',
      emotion: 'neutral',
      lines: [{ order: 1, speakerName: '', text: 'Necesito apoyo', emotion: '' }],
      choices: [],
    });

    expect(fixture.nativeElement.querySelector('.speaker-name')?.textContent).toContain('Consultante');
    expect(fixture.nativeElement.querySelector('.portrait-img')?.getAttribute('src'))
      .toBe('/assets/characters/kit/sobreviviente/portrait-neutral.png');
  });

  const portraitSrc = () => fixture.nativeElement.querySelector('.portrait-img')?.getAttribute('src') ?? null;

  it('el NPC de escenario muestra el retrato de su receta aunque se llame como una voz sin cuerpo', () => {
    render({
      key: 'npc-supervisor-cierre',
      speakerName: 'Supervisión clínica',
      portraitKey: null,
      recipeId: 'supervisor-clinico',
      emotion: 'neutral',
      lines: [{ order: 1, speakerName: 'Supervisión clínica', text: 'Buen cierre.', emotion: 'positive' }],
      choices: [],
    });

    expect(portraitSrc()).toBe('/assets/characters/kit/supervisor-clinico/portrait-alegre.png');
  });

  it.each(['Supervisión clínica', 'Consecuencia', 'Aviso de pausa', 'Tu libreta', 'Informe', 'Cierre del caso'])(
    '%s muestra el texto sin una ventanilla de retrato', (speakerName) => {
    render({
      ...MULTI_LINE_DIALOGUE,
      speakerName,
      portraitKey: null,
      lines: [{ order: 1, speakerName, text: 'Revisa el protocolo.', emotion: 'danger' }],
      choices: [],
    });

    expect(fixture.nativeElement.querySelector('.speaker-name')?.textContent).toContain(speakerName);
    expect(fixture.nativeElement.querySelector('.portrait')).toBeNull();
  });

  it('el aviso de herramienta muestra el texto sin la ventanilla de retrato', () => {
    render({
      ...MULTI_LINE_DIALOGUE, speakerName: 'Herramienta pertinente', portraitKey: null, hidePortrait: true,
      lines: [{ order: 1, speakerName: '', text: 'La herramienta ayudó a la persona.', emotion: 'neutral' }], choices: [],
    });

    expect(fixture.nativeElement.querySelector('.speaker-name')?.textContent).toContain('Herramienta pertinente');
    expect(fixture.nativeElement.querySelector('.portrait')).toBeNull();
  });

  it('la receta del árbol no vale para la línea de otro hablante', () => {
    render({
      key: 'npc-supervisor-cierre',
      speakerName: 'Supervisión clínica',
      portraitKey: null,
      recipeId: 'supervisor-clinico',
      emotion: 'neutral',
      lines: [{ order: 1, speakerName: 'Abuela de la niña', text: 'Gracias por venir.', emotion: 'neutral' }],
      choices: [],
    });

    expect(portraitSrc()).toBe('/assets/characters/kit/abuela-familia/portrait-neutral.png');
  });
});

describe('DialoguePanelComponent - cabecera fija con salida (T4.1, REGLA-004)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const head = () => host().querySelector('.panel-head') as HTMLElement | null;
  const buttonNames = (root: ParentNode) =>
    Array.from(root.querySelectorAll('button')).map(b => b.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  const INFO_DIALOGUE: DialogueState = {
    key: 'dialogue-info', speakerName: 'Enfermera', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Enfermera', text: 'Buenas tardes', emotion: 'neutral' }],
    choices: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(dialogue: DialogueState, mode: 'cinematic' | 'side' = 'cinematic', reveal = true): void {
    writeInputSignal(component.mode, mode);
    writeInputSignal(component.dialogue, dialogue);
    TestBed.flushEffects();
    fixture.detectChanges();
    if (reveal) {
      component.skipTypewriter();
      while (!component.isLastLine()) { component.advanceLine(); component.skipTypewriter(); }
      fixture.detectChanges();
    }
  }

  it.each(['cinematic', 'side'] as const)('con opciones visibles (modo %s) están «Volver al mapa» y «Salida segura»', mode => {
    render(MULTI_LINE_DIALOGUE, mode);
    expect(host().querySelector('.choices')).not.toBeNull();
    const names = buttonNames(head()!);
    expect(names.some(n => n.includes('Volver al mapa'))).toBe(true);
    expect(names.some(n => n.includes('Salida segura'))).toBe(true);
  });

  it.each(['cinematic', 'side'] as const)('sin opciones (modo %s) la cabecera sigue ofreciendo ambas salidas', mode => {
    render(INFO_DIALOGUE, mode);
    expect(host().querySelector('.choices')).toBeNull();
    const names = buttonNames(head()!);
    expect(names.some(n => n.includes('Volver al mapa'))).toBe(true);
    expect(names.some(n => n.includes('Salida segura'))).toBe(true);
  });

  it('la cabecera existe también mientras el texto aún se escribe (antes de ver opciones)', () => {
    render(MULTI_LINE_DIALOGUE, 'side', false);
    expect(component.isTypingComplete()).toBe(false);
    expect(host().querySelector('.choices')).toBeNull();
    expect(buttonNames(head()!).some(n => n.includes('Volver al mapa'))).toBe(true);
    expect(buttonNames(head()!).some(n => n.includes('Salida segura'))).toBe(true);
  });

  it('«Volver al mapa» emite close y no es un botón close-btn (el e2e solo pulsa esos para avanzar)', () => {
    render(MULTI_LINE_DIALOGUE);
    const close = vi.fn();
    component.close.subscribe(close);
    const back = Array.from(head()!.querySelectorAll('button')).find(b => b.textContent?.includes('Volver al mapa')) as HTMLButtonElement;
    expect(back.classList).not.toContain('close-btn');
    back.click();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ningún botón de la cabecera usa la clase close-btn: closeDialogue de los e2e sigue encontrando solo los de avance', () => {
    render(INFO_DIALOGUE);
    expect(head()!.querySelectorAll('.close-btn')).toHaveLength(0);
    const advance = Array.from(host().querySelectorAll('button.close-btn')).map(b => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(advance).toEqual(['Continuar ▶']);
  });

  it('la salida segura de la cabecera reenvía pause como safeExit del panel', () => {
    // ts-jest no aplica la transformación JIT a `output()`: se fija el cableado sobre el fuente.
    expect(source).toMatch(/<app-safe-exit-button[^>]*\(pause\)="safeExit\.emit\(\)"/);
    // En el panel Esc cierra el diálogo (el segundo Esc pausa): el botón no promete Esc.
    render(INFO_DIALOGUE);
    expect(head()!.querySelector('app-safe-exit-button')?.hasAttribute('data-hide-key')).toBe(true);
    expect(source).toMatch(/readonly safeExit = output<void>\(\);/);
  });

  it('la cabecera es fija (sticky) y queda fuera del retrato y del cuerpo que se desplazan', () => {
    expect(source).toMatch(/\.panel-head \{\s*position: sticky;\s*top: 0;/);
    render(MULTI_LINE_DIALOGUE, 'side');
    const strip = host().querySelector('.dialogue-strip') as HTMLElement;
    expect(strip.firstElementChild).toBe(head());
    expect(head()!.closest('.strip-main')).toBeNull();
  });

  it('Enter o Espacio sobre un botón de la cabecera no avanzan el texto ni cancelan su clic nativo', () => {
    render(MULTI_LINE_DIALOGUE, 'side', false);
    const back = Array.from(head()!.querySelectorAll('button')).find(b => b.textContent?.includes('Volver al mapa')) as HTMLButtonElement;
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      back.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(component.isTypingComplete()).toBe(false);
    // Escape sigue cerrando desde la cabecera.
    const close = vi.fn();
    component.close.subscribe(close);
    back.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('DialoguePanelComponent - liberación tras un error (T4.2, DLG-01)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      // Sin zone.js, como la app (Angular 22 es zoneless por defecto): con el planificador de zone.js el reloj
      // falso de Vitest dejaba ticks a medias y, con el pool vmThreads (TOO-1), re-entraba en
      // ApplicationRef.tick (NG0101). Aquí cada detectChanges() es explícito.
      providers: [provideZonelessChangeDetection(), { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
    writeInputSignal(component.dialogue, {
      ...MULTI_LINE_DIALOGUE,
      lines: [{ order: 1, speakerName: 'Familia', text: '¿Qué hacemos?', emotion: 'neutral' }],
      choices: [
        { key: 'c1', text: 'Opción uno', decisionOptionId: 1, requiredToolCode: null, effect: {} },
        { key: 'c2', text: 'Opción dos', decisionOptionId: 2, requiredToolCode: null, effect: {} },
      ],
    });
    TestBed.flushEffects();
    fixture.detectChanges();
    // Instalados DESPUÉS del detectChanges() inicial (no antes): con Angular 22 instalarlos
    // primero deja el tick de estabilización del planificador zone-coalesced a mitad de camino
    // bajo el reloj falso de Vitest, y una siguiente detectChanges()/advanceTimersByTime()
    // termina re-entrando en ApplicationRef.tick (NG0101).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('elegir una opción la bloquea hasta que el anfitrión libera el panel', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    const [first] = component.dialogue()!.choices;

    component.handleChoice(first);
    fixture.detectChanges();
    expect(component.chosenKey()).toBe('c1');
    expect(host().querySelector('.choices--locked')).not.toBeNull();

    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledWith(1);
    // Mientras no haya liberación, una segunda elección se ignora.
    component.handleChoice(component.dialogue()!.choices[1]);
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('un releaseToken nuevo limpia la elección y las opciones vuelven a ser activables', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    const [first, second] = component.dialogue()!.choices;
    component.handleChoice(first);
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    expect(host().querySelector('.choices--locked')).not.toBeNull();

    // El anfitrión falló al registrar la decisión y suma un token.
    writeInputSignal(component.releaseToken, 1);
    TestBed.flushEffects();
    fixture.detectChanges();

    expect(component.chosenKey()).toBeNull();
    expect(host().querySelector('.choices--locked')).toBeNull();
    // Y se puede elegir de nuevo, también otra opción.
    component.handleChoice(second);
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenLastCalledWith(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('cada token nuevo libera otra vez (un fallo tras otro no deja el panel atrapado)', () => {
    const [first] = component.dialogue()!.choices;
    for (const token of [1, 2, 3]) {
      component.handleChoice(first);
      vi.advanceTimersByTime(200);
      // Asienta aquí el tick pendiente del reloj falso: sin esto, el flushEffects()/escritura
      // de signal que sigue reentra en ApplicationRef.tick (NG0101).
      fixture.detectChanges();
      expect(component.chosenKey()).toBe('c1');
      writeInputSignal(component.releaseToken, token);
      TestBed.flushEffects();
      expect(component.chosenKey()).toBeNull();
    }
  });

  it('liberar antes de que venza la pausa de confirmación cancela la ejecución pendiente', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    component.handleChoice(component.dialogue()!.choices[0]);
    fixture.detectChanges();
    writeInputSignal(component.releaseToken, 1);
    TestBed.flushEffects();
    fixture.detectChanges();
    vi.advanceTimersByTime(500);
    expect(execute).not.toHaveBeenCalled();
    expect(component.chosenKey()).toBeNull();
  });

  it('el valor inicial del token es 0 y no altera el diálogo recién abierto', () => {
    expect(component.releaseToken()).toBe(0);
    expect(component.chosenKey()).toBeNull();
  });
});

describe('DialoguePanelComponent - sin decisión accidental (T4.3, DLG-03)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const host = () => fixture.nativeElement as HTMLElement;
  const choiceButtons = () => Array.from(host().querySelectorAll<HTMLButtonElement>('.choice-btn'));
  const clickWithDetail = (button: HTMLElement, detail: number) =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
    writeInputSignal(component.dialogue, {
      ...MULTI_LINE_DIALOGUE,
      lines: [{ order: 1, speakerName: 'Familia', text: '¿Qué hacemos?', emotion: 'neutral' }],
      choices: [
        { key: 'c1', text: 'Opción uno', decisionOptionId: 1, requiredToolCode: null, effect: {} },
        { key: 'c2', text: 'Opción dos', decisionOptionId: 2, requiredToolCode: null, effect: {} },
      ],
    });
    TestBed.flushEffects();
    fixture.detectChanges();
    // Instalados DESPUÉS del detectChanges() inicial (no antes): con Angular 22 instalarlos
    // primero deja el tick de estabilización del planificador zone-coalesced a mitad de camino
    // bajo el reloj falso de Vitest, y una siguiente detectChanges()/advanceTimersByTime()
    // termina re-entrando en ApplicationRef.tick (NG0101).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('con opciones visibles el foco entra al grupo .choices, no a una opción, y sigue dentro del diálogo', () => {
    const dialog = host().querySelector('[role="dialog"]') as HTMLElement;
    const group = host().querySelector('.choices') as HTMLElement;
    expect(group).not.toBeNull();
    expect(group.getAttribute('tabindex')).toBe('-1');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(group);
    expect(choiceButtons().some(b => b === document.activeElement)).toBe(false);
  });

  it('el foco sigue sin caer en una opción tras completar el texto a mano', () => {
    writeInputSignal(component.reduceMotion, false);
    writeInputSignal(component.dialogue, { ...component.dialogue()!, key: 'otra', lines: [{ order: 1, speakerName: 'Familia', text: 'Texto largo para escribir', emotion: 'neutral' }] });
    TestBed.flushEffects();
    fixture.detectChanges();
    component.skipTypewriter();
    fixture.detectChanges();
    expect(host().querySelector('.choices')).not.toBeNull();
    expect(choiceButtons().some(b => b === document.activeElement)).toBe(false);
    expect((host().querySelector('[role="dialog"]') as HTMLElement).contains(document.activeElement)).toBe(true);
  });

  it('Enter con opciones visibles no emite execute (ni siquiera tras la confirmación)', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    vi.advanceTimersByTime(1000);
    expect(execute).not.toHaveBeenCalled();
    expect(component.chosenKey()).toBeNull();
  });

  it('un clic de teclado (detail 0) en los primeros 500 ms se ignora', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    clickWithDetail(choiceButtons()[0], 0);
    vi.advanceTimersByTime(300);
    expect(component.chosenKey()).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('un toque o clic de puntero (detail >= 1) funciona de inmediato', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    clickWithDetail(choiceButtons()[1], 1);
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledWith(2);
  });

  it('pasada la ventana, una activación por teclado deliberada sí elige', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    vi.advanceTimersByTime(600);
    // detectChanges() asienta aquí el tick que el reloj falso deja pendiente: sin esto, un
    // segundo advanceTimersByTime más adelante reentra en ApplicationRef.tick (NG0101).
    fixture.detectChanges();
    clickWithDetail(choiceButtons()[0], 0);
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledWith(1);
  });

  it('un diálogo nuevo con opciones reinicia la ventana de guarda', () => {
    vi.advanceTimersByTime(2000);
    writeInputSignal(component.dialogue, {
      ...component.dialogue()!,
      key: 'siguiente',
    });
    fixture.detectChanges();
    const execute = vi.fn();
    component.execute.subscribe(execute);
    clickWithDetail(choiceButtons()[0], 0);
    vi.advanceTimersByTime(300);
    expect(execute).not.toHaveBeenCalled();
  });

  it('elegir con la tecla de dígito sigue siendo una acción deliberada', () => {
    const execute = vi.fn();
    component.execute.subscribe(execute);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(200);
    expect(execute).toHaveBeenCalledWith(2);
  });

  // req: BLOQUE-H (H-07), WCAG 2.1.4
  it('con los atajos de una tecla apagados los dígitos no eligen ni se consumen', () => {
    TestBed.inject(ShortcutSettings).set(false);
    try {
      const execute = vi.fn();
      component.execute.subscribe(execute);
      const event = new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      vi.advanceTimersByTime(600);
      expect(execute).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      localStorage.removeItem('siep.atajos.v1');
    }
  });

  it('apagados, la pista de teclado no promete los números; activos sí', () => {
    const settings = TestBed.inject(ShortcutSettings);
    try {
      expect(component.keyboardHint(component.dialogue()!)).toBe('Enter: continuar · A a B: elegir · Esc: volver al mapa');
      settings.set(false);
      expect(component.keyboardHint(component.dialogue()!)).toBe('Enter: continuar · Esc: volver al mapa');
    } finally {
      localStorage.removeItem('siep.atajos.v1');
    }
  });
});

describe('DialoguePanelComponent - aviso, subtítulos y chips (T4.5)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  let playSfx: Mock;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  const decision = (id: number, label: string, extra: Partial<DialogueState['choices'][number]> = {}) => ({
    key: `d${id}`, text: label, decisionOptionId: id, requiredToolCode: null, effect: {}, ...extra,
  });
  const tool = (code: string, label: string, extra: Partial<DialogueState['choices'][number]> = {}) => ({
    key: `t-${code}`, text: label, decisionOptionId: null, requiredToolCode: code, effect: {}, ...extra,
  });
  const dialogueWith = (choices: DialogueState['choices'], extra: Partial<DialogueState> = {}): DialogueState => ({
    key: 'dlg', speakerName: 'Familia en crisis', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Familia en crisis', text: 'Necesitamos ayuda', emotion: 'neutral' }],
    choices, ...extra,
  });

  beforeEach(async () => {
    playSfx = vi.fn();
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(d: DialogueState): void {
    writeInputSignal(component.dialogue, d);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('muestra un solo aviso de evidencia sobre las opciones, sin insignia por opción ni «(información incompleta)»', () => {
    render(dialogueWith(
      [decision(1, 'Escuchar sin juzgar'), decision(2, 'Dar un consejo')],
      { notice: 'Antes de decidir te falta: hablar con la Enfermera de urgencias.' },
    ));
    const notices = host().querySelectorAll('.choices-notice');
    expect(notices).toHaveLength(1);
    expect(text(notices[0])).toContain('Antes de decidir te falta');
    // El aviso va antes del grupo de opciones.
    const group = host().querySelector('.choices')!;
    expect(notices[0].compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.getAttribute('aria-describedby')).toBe('choices-notice');
    // Ni insignia por opción ni la frase en los nombres accesibles (el e2e chooseDecision la rechaza).
    expect(host().querySelector('.choice-btn__meta')).toBeNull();
    for (const button of Array.from(host().querySelectorAll('.choice-btn'))) {
      expect(button.getAttribute('aria-label')).not.toMatch(/información incompleta/i);
      expect(text(button)).not.toMatch(/información incompleta/i);
    }
  });

  it('con la advertencia heredada repetida en cada opción sigue saliendo un solo aviso', () => {
    render(dialogueWith([
      decision(1, 'Escuchar', { evidenceWarning: 'Información insuficiente: falta una conversación.' }),
      decision(2, 'Aconsejar', { evidenceWarning: 'Información insuficiente: falta una conversación.' }),
    ]));
    expect(host().querySelectorAll('.choices-notice')).toHaveLength(1);
    expect(text(host().querySelector('.choices-notice'))).toBe('Información insuficiente: falta una conversación.');
  });

  it('sin aviso no hay párrafo ni aria-describedby en el grupo', () => {
    render(dialogueWith([decision(1, 'Escuchar')]));
    expect(host().querySelector('.choices-notice')).toBeNull();
    expect(host().querySelector('.choices')!.hasAttribute('aria-describedby')).toBe(false);
  });

  it('una opción de herramienta sin la herramienta es aria-disabled, enfocable, con chip, y no ejecuta', () => {
    const useTool = vi.fn();
    component.useTool.subscribe(useTool);
    render(dialogueWith([tool('PAP', 'Aplicar el material de apoyo', { toolMissing: true }), decision(1, 'Escuchar')]));
    // Instalado DESPUÉS del render(): antes deja a mitad de camino el tick de estabilización
    // del planificador zone-coalesced de Angular 22 (NG0101 en el primer advanceTimersByTime).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const [toolBtn, decisionBtn] = Array.from(host().querySelectorAll<HTMLButtonElement>('.choice-btn'));
      expect(toolBtn.getAttribute('aria-disabled')).toBe('true');
      expect(toolBtn.disabled).toBe(false);   // sigue enfocable
      expect(decisionBtn.hasAttribute('aria-disabled')).toBe(false);
      const chip = toolBtn.querySelector('.choice-btn__hint')!;
      expect(text(chip)).toBe('Necesitas PAP. Busca esta herramienta al explorar las salas.');
      expect(toolBtn.getAttribute('aria-label')).toBe('A. Aplicar el material de apoyo');
      expect(toolBtn.getAttribute('aria-describedby')).toBe(chip.id);
      expect(chip.getAttribute('aria-hidden')).toBe('true'); // descrito por referencia, sin duplicarlo en el nombre
      expect(toolBtn.textContent).toMatch(/apoyo\s+Necesitas/);
      // Y lo mismo entre la letra y la etiqueta, en cualquier opción: «BEscuchar» tampoco coincide con «B. Escuchar».
      // (Bloque I1: las opciones se nombran A a D; la letra se dibuja en pixel art y sigue como texto al principio.)
      expect(toolBtn.textContent).toMatch(/^\s*A\s+Aplicar/);
      expect(decisionBtn.textContent).toMatch(/^\s*B\s+Escuchar/);

      vi.advanceTimersByTime(600);
      fixture.detectChanges();
      toolBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
      vi.advanceTimersByTime(300);
      expect(useTool).not.toHaveBeenCalled();
      expect(component.chosenKey()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('describe la herramienta y solo indica la sala cuando el mundo contiene el objeto', () => {
    writeInputSignal(component.world, { map: { title: 'Sala de espera' }, tools: [{ code: 'PAP', label: 'Kit PAP' }],
      objects: [{ type: 'TOOL', toolCode: 'PAP', label: 'Kit PAP' }] } as any);
    render(dialogueWith([tool('PAP', 'Aplicar apoyo', { toolMissing: true })]));
    const button = host().querySelector<HTMLButtonElement>('.choice-btn')!;
    const hint = host().querySelector<HTMLElement>('.choice-btn__hint')!;
    expect(hint.textContent).toContain('Necesitas Kit PAP. La encuentras en Sala de espera.');
    expect(button.getAttribute('aria-describedby')).toBe(hint.id);
    writeInputSignal(component.world, { map: { title: 'Otra sala' }, tools: [{ code: 'PAP', label: 'Kit PAP' }], objects: [] } as any);
    fixture.detectChanges();
    expect(hint.textContent).toContain('Busca esta herramienta al explorar las salas.');
    expect(hint.textContent).not.toContain('Otra sala');
  });

  it('con la herramienta en la mochila la opción es activable sin chip', () => {
    const useTool = vi.fn();
    component.useTool.subscribe(useTool);
    render(dialogueWith([tool('PAP', 'Aplicar el material de apoyo', { toolMissing: false })]));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const button = host().querySelector<HTMLButtonElement>('.choice-btn')!;
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      expect(host().querySelector('.choice-btn__hint')).toBeNull();
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      vi.advanceTimersByTime(300);
      expect(useTool).toHaveBeenCalledWith('PAP');
    } finally {
      vi.useRealTimers();
    }
  });

  // req: RNF-04, RN-01 (VD-24: vocabulario educativo en borrador; el texto sale de draft-copy.ts)
  // I1: la etiqueta va dentro de la ficha de herramienta; sin subtítulos sueltos ni un segundo «Decisión».
  it('marca «Usar una herramienta» en su ficha solo cuando conviven, sin reordenar ni repetir «Decisión»', () => {
    render(dialogueWith([tool('PAP', 'Aplicar material'), decision(1, 'Escuchar'), decision(2, 'Aconsejar')]));
    const children = Array.from(host().querySelector('.choices')!.children).map(el =>
      `${text(el.querySelector('.choice-btn__tag') ?? document.createElement('i'))}|${text(el.querySelector('.choice-btn__label'))}`);
    expect(children).toEqual(['Usar una herramienta|Aplicar material', '|Escuchar', '|Aconsejar']);
    expect(host().querySelector('.choices-subtitle')).toBeNull();
    expect(host().querySelector('.choice-btn')!.getAttribute('aria-label')).toBe('A. Usar una herramienta: Aplicar material');
  });

  it('sin mezcla de herramienta y decisión no hay etiquetas', () => {
    render(dialogueWith([decision(1, 'Escuchar'), decision(2, 'Aconsejar')]));
    expect(host().querySelector('.choice-btn__tag')).toBeNull();
    render(dialogueWith([tool('PAP', 'Aplicar material')]));
    expect(host().querySelector('.choice-btn__tag')).toBeNull();
  });

  it('una conversación de otra etapa (stale) muestra la línea informativa, ninguna decisión y «Continuar»', () => {
    const close = vi.fn();
    component.close.subscribe(close);
    render(dialogueWith([decision(1, 'Escuchar'), tool('PAP', 'Aplicar material')], { stale: true }));
    expect(host().querySelector('.choices')).toBeNull();
    expect(host().querySelector('.choice-btn')).toBeNull();
    expect(text(host().querySelector('.stale-note'))).toContain('Vuelve al mapa');
    const advance = Array.from(host().querySelectorAll('button.close-btn')).map(b => text(b));
    expect(advance).toEqual(['Continuar ▶']);
    // Enter cierra (no hay nada que elegir) y los dígitos no eligen.
    const execute = vi.fn();
    component.execute.subscribe(execute);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
    expect(execute).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('una conversación antigua ofrece la indicación actual incluso con un texto heredado', () => {
    writeInputSignal(component.nextStep, 'Habla con Vigilante');
    render(dialogueWith([], {
      stale: true,
      lines: [
        { order: 1, speakerName: 'Familia en crisis', text: 'Hola', emotion: 'neutral' },
        { order: 2, speakerName: 'Sistema', text: 'Esta conversación corresponde a otro momento del caso.', emotion: 'neutral' },
      ],
    }));
    expect(text(host().querySelector('.stale-note'))).toContain('Vuelve al mapa');
    expect(text(host().querySelector('.stale-note'))).toContain('Ahora te toca: Habla con Vigilante');
  });

  it('la cabecera anuncia «Decisión» solo si alguna opción registra una decisión', () => {
    render(dialogueWith([decision(1, 'Escuchar')]));
    expect(text(host().querySelector('.panel-chip'))).toBe('Decisión');
    expect(text(host().querySelector('.panel-head__note'))).toContain('Tu elección queda registrada en tu seguimiento formativo.');
    render(dialogueWith([tool('PAP', 'Aplicar material')]));
    expect(host().querySelector('.panel-head__note')).toBeNull();
    render(dialogueWith([]));
    expect(host().querySelector('.panel-head__note')).toBeNull();
  });

  it('la pista de teclado nombra el rango real de opciones y solo se pinta con puntero fino', () => {
    render(dialogueWith([decision(1, 'Escuchar'), decision(2, 'Aconsejar'), decision(3, 'Derivar')]));
    expect(text(host().querySelector('.keyboard-hint'))).toBe('Enter: continuar · A a C: elegir · Esc: volver al mapa');
    render(dialogueWith([]));
    expect(text(host().querySelector('.keyboard-hint'))).toBe('Enter: continuar · Esc: volver al mapa');
    expect(source).toMatch(/\.keyboard-hint \{ display: none;/);
    expect(source).not.toMatch(/\.strip-body > \.keyboard-hint:last-child \{ display: none; \}/);
    expect(source).toContain('font-size: max(14px, .9em)');
  });
});

describe('DialoguePanelComponent - emociones y retrato (T4.6)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [
        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },
        { provide: KitService, useValue: fakeKitService() },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(speaker: string, emotion: string): void {
    writeInputSignal(component.dialogue, {
      key: 'e', speakerName: speaker, portraitKey: null, emotion,
      lines: [{ order: 1, speakerName: speaker, text: 'Línea', emotion }],
      choices: [],
    });
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it.each(['positive', 'concerned', 'danger', 'vulnerable'])(
    'una persona con emoción %s no lleva chip ni etiqueta de emoción', emotion => {
      render('Abuela de la niña', emotion);
      expect(host().querySelector('.emotion-chip')).toBeNull();
      expect(host().querySelector('.emotion-tag')).toBeNull();
    });

  it('la Abuela con emoción positive no recibe el retrato sonriente', () => {
    render('Abuela de la niña', 'positive');
    expect(host().querySelector('.portrait-img')?.getAttribute('src')).toBe('/assets/characters/kit/abuela-familia/portrait-neutral.png');
  });

  it('una voz de sistema conserva la señal de emoción (chip y etiqueta con su color)', () => {
    render('Supervisión clínica', 'danger');
    expect(host().querySelector('.emotion-chip')).not.toBeNull();
    expect(host().querySelector('.emotion-tag')?.textContent?.trim()).toBe('alerta');
  });

  it('emotionColor y emotionLabel se conservan (contrato de contraste del bloque H)', () => {
    expect(component.emotionColor('positive')).toBe('#6EC67A');
    expect(component.emotionColor('danger')).toBe('#E25A4F');
    expect(component.emotionLabel('concerned')).toBe('preocupada');
    expect(source).toMatch(/\.emotion-tag \{[^}]*opacity: 1;/);
  });
});

describe('DialoguePanelComponent - «Continuar» y sonido de opciones (T4.7)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  let playSfx: Mock;
  const host = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    playSfx = vi.fn();
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
    writeInputSignal(component.reduceMotion, true);
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(d: DialogueState): void {
    writeInputSignal(component.dialogue, d);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('«Continuar» tiene como nombre accesible su texto visible, no «Cerrar diálogo (Esc)»', () => {
    render({ key: 'c', speakerName: 'Enfermera', portraitKey: null, emotion: 'neutral',
      lines: [{ order: 1, speakerName: 'Enfermera', text: 'Hola', emotion: 'neutral' }], choices: [] });
    const button = host().querySelector<HTMLButtonElement>('button.close-btn')!;
    expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Continuar ▶');
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(host().innerHTML).not.toMatch(/Cerrar diálogo/);
  });

  // req: RNF-04, BLOQUE-H
  it('«Saltar», «Siguiente» y «Continuar» son el primario de la piel del juego y conservan clase y nombre accesible', () => {
    writeInputSignal(component.reduceMotion, false);
    const advanceButtons = () => Array.from(host().querySelectorAll<HTMLButtonElement>('button.close-btn'));
    const expectPrimary = () => {
      expect(advanceButtons()).toHaveLength(1);
      const [button] = advanceButtons();
      expect(button.classList).toContain('u-boton--principal');
      expect(button.classList).not.toContain('psy-button--ghost');
    };
    // Línea 1 de 2, todavía escribiéndose: «Saltar».
    render({ ...MULTI_LINE_DIALOGUE, choices: [] });
    expectPrimary();
    expect(advanceButtons()[0].textContent).toContain('Continuar');
    // Línea 1 completa: «Siguiente».
    component.skipTypewriter();
    fixture.detectChanges();
    expectPrimary();
    expect(advanceButtons()[0].textContent).toContain('Continuar');
    // Última línea completa y sin opciones: «Continuar».
    component.advanceLine();
    component.skipTypewriter();
    fixture.detectChanges();
    expectPrimary();
    expect(advanceButtons()[0].textContent?.replace(/\s+/g, ' ').trim()).toBe('Continuar ▶');
  });

  it('pasar el ratón por una opción no suena; el foco de teclado sí', () => {
    render({ ...MULTI_LINE_DIALOGUE, lines: [MULTI_LINE_DIALOGUE.lines[1]] });
    const option = host().querySelector<HTMLButtonElement>('.choice-btn')!;
    playSfx.mockClear();

    option.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(playSfx).not.toHaveBeenCalled();

    // Foco por puntero (no :focus-visible): sin sonido.
    Object.defineProperty(option, 'matches', { configurable: true, value: () => false });
    option.dispatchEvent(new FocusEvent('focus'));
    expect(playSfx).not.toHaveBeenCalled();

    // Foco de teclado (:focus-visible): suena una vez.
    Object.defineProperty(option, 'matches', { configurable: true, value: (selector: string) => selector === ':focus-visible' });
    option.dispatchEvent(new FocusEvent('focus'));
    expect(playSfx).toHaveBeenCalledWith('ui_select');
    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it('un navegador sin :focus-visible no rompe el foco de la opción', () => {
    render({ ...MULTI_LINE_DIALOGUE, lines: [MULTI_LINE_DIALOGUE.lines[1]] });
    const option = host().querySelector<HTMLButtonElement>('.choice-btn')!;
    Object.defineProperty(option, 'matches', { configurable: true, value: () => { throw new SyntaxError('selector no válido'); } });
    expect(() => option.dispatchEvent(new FocusEvent('focus'))).not.toThrow();
  });
});

/** Cuerpos de todos los bloques `@media <consulta> { … }` de un CSS: cuenta llaves, así que una regla solo cuenta dentro del suyo. */
function mediaBlocks(css: string, query: string): string[] {
  const head = `@media ${query} {`;
  const blocks: string[] = [];
  for (let from = css.indexOf(head); from >= 0; from = css.indexOf(head, from + head.length)) {
    let depth = 1;
    let end = from + head.length;
    for (; end < css.length && depth > 0; end += 1) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') depth -= 1;
    }
    blocks.push(css.slice(from + head.length, end - 1));
  }
  return blocks;
}

describe('DialoguePanelComponent - scroll, hoja y retrato (T4.4)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  let scrollIntoView: Mock;
  const host = () => fixture.nativeElement as HTMLElement;
  const strip = () => host().querySelector('.dialogue-strip') as HTMLElement;
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');

  const LONG = 'Texto bastante largo para que la máquina de escribir tarde en terminar de escribirlo todo.';
  const dialogue = (text = LONG): DialogueState => ({
    key: 'scroll', speakerName: 'Familia', portraitKey: null, emotion: 'neutral',
    lines: [{ order: 1, speakerName: 'Familia', text, emotion: 'neutral' }],
    choices: [
      { key: 'c1', text: 'Opción uno', decisionOptionId: 1, requiredToolCode: null, effect: {} },
      { key: 'c2', text: 'Opción dos', decisionOptionId: 2, requiredToolCode: null, effect: {} },
    ],
  });

  beforeEach(async () => {
    scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
    if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
    else delete (Element.prototype as unknown as Record<string, unknown>)['scrollIntoView'];
  });

  // El cuadro entero solo se desplaza en el panel lateral; sobre el mundo se desplaza la lista de fichas (ver abajo).
  function render(d: DialogueState, mode: 'cinematic' | 'side' = 'side'): void {
    writeInputSignal(component.mode, mode);
    writeInputSignal(component.dialogue, d);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('sobre el mundo no desplaza el cuadro: la lista de fichas vuelve arriba (A y B a la vista)', () => {
    render(dialogue(), 'cinematic');
    component.skipTypewriter();
    fixture.detectChanges();
    const choices = host().querySelector('.choices') as HTMLElement;
    choices.scrollTop = 40;
    strip().scrollTop = 0;
    component.ngAfterViewChecked();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(choices.scrollTop).toBe(0);
    expect(strip().scrollTop).toBe(0);
  });

  // ts-jest corre sin zone.js: `fixture.detectChanges()` no invoca ngAfterViewChecked si solo cambian
  // señales internas. En el navegador Angular lo llama en cada ciclo; aquí se invoca a mano.
  const checkView = () => { fixture.detectChanges(); component.ngAfterViewChecked(); };

  it('mientras se escribe ancla abajo en cada revisión', () => {
    render(dialogue());
    expect(component.isTypingComplete()).toBe(false);
    Object.defineProperty(strip(), 'scrollHeight', { configurable: true, value: 640 });
    strip().scrollTop = 0;
    component.ngAfterViewChecked();
    expect(strip().scrollTop).toBe(640);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('al aparecer las opciones las revela una sola vez y no vuelve a pelear con el scroll', () => {
    render(dialogue());
    component.skipTypewriter();
    checkView();
    expect(host().querySelector('.choices')).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

    // El estudiante se desplaza: ninguna revisión posterior lo devuelve al fondo ni repite el reveal.
    Object.defineProperty(strip(), 'scrollHeight', { configurable: true, value: 900 });
    strip().scrollTop = 40;
    checkView();
    checkView();
    expect(strip().scrollTop).toBe(40);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('sin opciones, al terminar la línea deja a la vista el botón de avance y luego no ancla más', () => {
    render({ ...dialogue(), choices: [] });
    component.skipTypewriter();
    Object.defineProperty(strip(), 'scrollHeight', { configurable: true, value: 500 });
    strip().scrollTop = 0;
    checkView();
    expect(strip().scrollTop).toBe(500);
    expect(scrollIntoView).not.toHaveBeenCalled();
    strip().scrollTop = 120;
    checkView();
    expect(strip().scrollTop).toBe(120);
  });

  it('si la lista no cabe bajo la cabecera alinea su inicio para que se vean la opción 1 y la 2', () => {
    render(dialogue());
    component.skipTypewriter();
    fixture.detectChanges();
    // Con Angular 22 ese detectChanges() ya invoca ngAfterViewChecked() automáticamente (antes
    // ocurría más tarde, de forma menos eager), así que el guard `settled` de revealChoices()
    // ya quedó fijo con las medidas por defecto (0) antes de poder simular las reales. Se
    // reabre a propósito para que la llamada manual de abajo, ya con las medidas simuladas,
    // vuelva a decidir entre 'start' y 'nearest'.
    (component as unknown as { settled: boolean }).settled = false;
    scrollIntoView.mockClear(); // la primera llamada (automática, con medidas en 0) no es la que se mide aquí.
    Object.defineProperty(strip(), 'clientHeight', { configurable: true, value: 220 });
    Object.defineProperty(host().querySelector('.panel-head'), 'offsetHeight', { configurable: true, value: 56 });
    Object.defineProperty(host().querySelector('.choices'), 'offsetHeight', { configurable: true, value: 400 });
    component.ngAfterViewChecked();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('tras revelar las opciones, la línea del personaje no queda cortada por la cabecera fija', () => {
    render(dialogue());
    component.skipTypewriter();
    fixture.detectChanges();
    (component as unknown as { settled: boolean }).settled = false;
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    vi.spyOn(host().querySelector('.panel-head') as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(0, 80));
    vi.spyOn(host().querySelector('.dialogue-text') as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(56, 120));
    vi.spyOn(strip(), 'getBoundingClientRect').mockReturnValue(rect(0, 600));
    for (const button of Array.from(host().querySelectorAll<HTMLElement>('.choice-btn'))) {
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect(300, 364));
    }
    strip().scrollTop = 200;
    component.ngAfterViewChecked();
    expect(strip().scrollTop).toBe(176);
  });

  it('el ajuste tiene tope: nunca saca de la vista las opciones 1 y 2 (TOUCH-01)', () => {
    render(dialogue());
    component.skipTypewriter();
    fixture.detectChanges();
    (component as unknown as { settled: boolean }).settled = false;
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    const buttons = Array.from(host().querySelectorAll<HTMLElement>('.choice-btn'));
    expect(buttons.length, 'el diálogo de prueba ofrece opciones').toBeGreaterThan(0);
    vi.spyOn(host().querySelector('.panel-head') as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(0, 80));
    vi.spyOn(host().querySelector('.dialogue-text') as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(56, 120));
    vi.spyOn(strip(), 'getBoundingClientRect').mockReturnValue(rect(0, 600));
    // La opción que se protege (la 2, o la 1 si solo hay una) acaba en 590: solo caben 10 px de ajuste, no los 24 que pide el texto.
    for (const button of buttons) vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect(526, 590));
    strip().scrollTop = 200;
    component.ngAfterViewChecked();
    expect(strip().scrollTop).toBe(190);
  });

  it('con movimiento reducido las opciones también se revelan una vez por línea nueva', () => {
    writeInputSignal(component.reduceMotion, true);
    render(dialogue('Primera'));
    component.ngAfterViewChecked();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    component.ngAfterViewChecked();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    writeInputSignal(component.dialogue, { ...dialogue('Segunda'), key: 'otra' });
    TestBed.flushEffects();
    fixture.detectChanges();
    component.ngAfterViewChecked();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  // Bloque I1: el retrato mide siempre un múltiplo de 96 (y de 32): sirve igual para el retrato del kit (32 px) y para
  // uno fino de 96 px, sin escalar a un factor no entero. En pantallas bajas ya no baja a 64 px (no es múltiplo de 96).
  it('el retrato mide 64, 96, 192 o 288 px según el espacio (múltiplos de 32), y el panel lateral es lo único que se desplaza', () => {
    // Tramos (U1, V7): los tamaños del tramo compacto y del amplio salen de las fichas --dialogo-* de .pixel-juego.
    const fichas = readFileSync(join(__dirname, '../../../styles/tokens/_pixel.scss'), 'utf-8');
    const tamanos = [
      ...source.matchAll(/--retrato: (?:var\(--dialogo-retrato(?:-lado)?, )?(\d+)px/g),
      ...fichas.matchAll(/--dialogo-retrato(?:-lado)?: (\d+)px/g),
    ].map(m => Number(m[1]));
    expect(tamanos.length).toBeGreaterThan(5);
    expect(new Set(tamanos)).toEqual(new Set([64, 96, 128, 192, 288]));
    // Desde que se retiró el retrato de 96 px (decisión del usuario), basta con múltiplos de 32: el retrato del kit queda entero.
    for (const t of tamanos) expect(t % 32, `${t} px`).toBe(0);
    expect(source).toMatch(/\.dialogue-strip--side \{\s*--retrato: var\(--dialogo-retrato-lado, 96px\);/);
    const compact = mediaBlocks(source, '(max-height: 520px)');
    expect(compact.length).toBeGreaterThan(0);
    expect(compact.some(block => block.includes('--retrato: 96px'))).toBe(true);
    expect(source).toMatch(/\.portrait-img \{[^}]*width: var\(--retrato\);[^}]*image-rendering: pixelated;/);
    expect(source).not.toContain('clamp(48px, 12vh, 64px)');
    expect(source).toMatch(/\.dialogue-strip--side \{[^}]*overflow-y: auto;/);
    // Ya no se ancla al fondo en cada ciclo de detección.
    expect(source).not.toMatch(/el\.scrollTop = el\.scrollHeight;\s*\}\s*\}\s*ngOnDestroy/);
  });
});

describe('DialoguePanelComponent - contraste de lo nuevo (WCAG 1.4.3, T4.1/T4.5)', () => {
  // Peores fondos: panel lateral (vidrio oscuro del HUD) y franja cinemática sobre un píxel blanco del mapa.
  const SIDE_BG = '#181F31';
  const CINEMATIC_BG = blend('#080C12', 0.95, '#FFFFFF');
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return source.match(new RegExp(`${escaped} \\{([^}]*)\\}`))?.[1] ?? '';
  };
  const hexOf = (body: string, property: string): string => body.match(new RegExp(`${property}: (#[0-9A-Fa-f]{6})`))?.[1] ?? '';

  // Bloque I1: el texto va sobre las tramas de pixel del panel (dialogo_arte.py), no sobre vidrio con transparencia.
  // Superficies: el tono más claro de cada trama (penumbra de la placa y pizarra de la ficha), más el canto de luz.
  const PLACA = ['#1B1826', '#211E2E', '#171421'];
  const FICHA = ['#28243C', '#2F2B45', '#231F35', '#302B46', '#383350', '#2A263E'];
  const TODO = [...PLACA, ...FICHA];
  const hexOfRule = (selector: string) => hexOf(rule(selector), 'color');

  it('el aviso de evidencia, el chip de herramienta ausente, el chip «Decisión» y los subtítulos llegan a 4,5:1', () => {
    for (const surface of PLACA) {
      expect(contrastRatio(hexOfRule('.choices-notice'), surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(hexOfRule('.panel-chip'), surface)).toBeGreaterThanOrEqual(4.5);
    }
    // La etiqueta de la ficha de herramienta va sobre la trama de la ficha.
    for (const surface of FICHA) expect(contrastRatio(hexOfRule('.choice-btn__tag'), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexOf(rule('.choice-btn__hint'), 'color'), hexOf(rule('.choice-btn__hint'), 'background'))).toBeGreaterThanOrEqual(4.5);
  });

  // Bloque I1: la silueta del retrato del kit (contorno #15131D) se recorta contra la ventanilla a 3:1 o más (WCAG 1.4.11).
  it('la ventanilla del retrato deja ver el contorno de la figura a 3:1', () => {
    const fondo = source.match(/\.portrait \{[^}]*--rp[^}]*background-color: (#[0-9a-f]{6})/)?.[1] ?? '';
    expect(contrastRatio('#15131D', fondo)).toBeGreaterThanOrEqual(3);
  });

  it('el texto de «Volver al mapa» llega a 4,5:1 y la cabecera del panel lateral es opaca', () => {
    for (const surface of PLACA) expect(contrastRatio(hexOfRule('.panel-back'), surface)).toBeGreaterThanOrEqual(4.5);
    // En el panel lateral lo que se desplaza no se transparenta debajo de los botones.
    expect(source).toMatch(/\.dialogue-strip--side \.panel-head \{ background: #[0-9A-Fa-f]{6}; \}/);
  });

  it('la pista de teclado, la nota de cabecera, la línea de otro momento y el texto de las fichas llegan a 4,5:1', () => {
    for (const selector of ['.keyboard-hint', '.panel-head__note', '.stale-note']) {
      for (const surface of PLACA) expect(contrastRatio(hexOfRule(selector), surface), selector).toBeGreaterThanOrEqual(4.5);
    }
    const tinta = source.match(/--tinta: (#[0-9a-f]{6})/)?.[1] ?? '';
    const suave = source.match(/--tinta-suave: (#[0-9a-f]{6})/)?.[1] ?? '';
    for (const surface of TODO) {
      expect(contrastRatio(tinta, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(suave, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/**
 * F6-12 (H-09, WCAG 4.1.3): la línea activa se anuncia por las regiones vivas persistentes de la app. La región que
 * tenía el panel nacía DENTRO del `@if` con su texto y la primera línea no se anunciaba; ahora el panel solo la
 * escribe como texto (visualmente oculto, para el cursor de lectura) y el servicio la anuncia.
 */
// req: BLOQUE-H (H-09), RNF-004
describe('DialoguePanelComponent - texto de 12 px, estados y vocabulario educativo (F6-4)', () => {
  const styles = source.slice(source.indexOf('styles: [`'));
  const template = source.slice(source.indexOf('template: `'), source.indexOf('styles: [`'));

  // req: RNF-04, BLOQUE-H
  it('ningún texto del panel baja de 12 px (0,75 rem)', () => {
    const small: string[] = [];
    for (const chunk of styles.split('}')) {
      const [selector, body] = chunk.split('{');
      if (!body) continue;
      for (const match of body.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) {
        const px = match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
        if (px < 12) small.push(selector.trim().split('\n').pop() + ' → ' + match[0]);
      }
    }
    expect(small).toEqual([]);
  });

  it('«Volver al mapa» tiene hover protegido, respuesta al presionar y el anillo global de la piel', () => {
    const pixel = readFileSync(join(__dirname, '../../../styles/components/_pixel.scss'), 'utf-8');
    expect(template).toContain('class="panel-back u-boton"');
    expect(pixel).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.u-boton:hover/);
    expect(pixel).toMatch(/\.u-boton:active \{[^}]*transform:/);
    expect(pixel).toMatch(/\.u-boton:focus-visible \{[^}]*outline:/);
    expect(styles).not.toMatch(/\.choice-btn:focus-visible \{[^}]*outline:\s*\d+px solid/);
  });

  it('el vocabulario educativo sale del registro de borradores y la cadena clínica vieja no reaparece (VD-24)', () => {
    const offenders = readdirSync(__dirname)
      .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts') && name !== 'draft-copy.ts')
      .filter(name => /Decisión clínica|Inventario clínico/.test(readFileSync(join(__dirname, name), 'utf-8')));
    expect(offenders).toEqual([]);
    expect(source).toContain('DRAFT_COPY.decisionLabel.text');
    expect(template).toContain('{{ decisionLabel }}');
  });

  // req: DM-5.8 (la interfaz no anticipa la clasificación de una opción)
  it('la plantilla de opciones no lee la clasificación ni el efecto de una opción antes de decidir', () => {
    expect(template).not.toMatch(/\b(classification|prohibitedConduct|isRecommended|isProhibited|effect)\b/);
    // Las únicas clases de una opción son de estado (elegida, sin herramienta): nada separa «adecuada» de «inadecuada».
    const stateClasses = [...template.matchAll(/\[class\.(choice-btn--[\w-]+)\]/g)].map(match => match[1]).sort();
    expect(stateClasses).toEqual(['choice-btn--chosen', 'choice-btn--unavailable']);
  });
});

describe('DialoguePanelComponent - anuncio de la línea activa (F6-12)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  let announce: Mock;

  beforeEach(async () => {
    announce = vi.fn();
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [
        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },
        { provide: KitService, useValue: fakeKitService() },
        { provide: LiveRegionAnnouncer, useValue: { announce } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  function render(dialogue: DialogueState | null): void {
    writeInputSignal(component.dialogue, dialogue);
    TestBed.flushEffects();
    fixture.detectChanges();
  }

  it('la primera línea se anuncia al abrirse el diálogo, con cortesía y una sola vez', () => {
    render(MULTI_LINE_DIALOGUE);

    expect(announce.mock.calls).toEqual([['Primera', 'polite']]);
  });

  it('cada línea nueva se anuncia al avanzar, sin repetir la anterior', () => {
    render(MULTI_LINE_DIALOGUE);
    component.skipTypewriter();
    component.advanceLine();
    TestBed.flushEffects();

    expect(announce.mock.calls).toEqual([['Primera', 'polite'], ['Segunda', 'polite']]);
  });

  it('teclear la máquina de escribir no anuncia nada: solo cuenta la línea completa', () => {
    render(MULTI_LINE_DIALOGUE);
    announce.mockClear();
    fixture.detectChanges();

    expect(component.isTypingComplete()).toBe(false);
    expect(announce).not.toHaveBeenCalled();
  });

  it('sin diálogo no se anuncia nada', () => {
    render(null);

    expect(announce).not.toHaveBeenCalled();
  });

  it('el panel ya no lleva una región viva propia: el texto queda para el cursor de lectura, sin role', () => {
    render(MULTI_LINE_DIALOGUE);

    const text = fixture.nativeElement.querySelector('.placa-habla > .visually-hidden') as HTMLElement;
    expect(text.textContent?.trim()).toBe('Primera');
    expect(text.hasAttribute('role')).toBe(false);
    expect(text.hasAttribute('aria-live')).toBe(false);
    expect(fixture.nativeElement.querySelector('[aria-live]')).toBeNull();
  });
});

const CHARS_PER_SEC = 22;
const INTERVAL_MS = Math.round(1000 / CHARS_PER_SEC);

function simulateTypewriter(fullText: string, tickCount: number): string {
  return fullText.slice(0, tickCount);
}

// req: RF-18, CU-09 (F10-2)
describe('DialoguePanelComponent - pistas de la escena (F10-2)', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  let getHints: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getHints = vi.fn(() => of({ available: 2, shown: [] }));
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [
        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },
        { provide: KitService, useValue: fakeKitService() },
        { provide: LiveRegionAnnouncer, useValue: { announce: vi.fn() } },
        { provide: SimulationService, useValue: { getHints, revealNextHint: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  /** Abre el diálogo con opciones: la última intervención ya escrita, que es cuando se ven. */
  function openWithChoices(): void {
    writeInputSignal(component.dialogue, MULTI_LINE_DIALOGUE);
    TestBed.flushEffects();
    fixture.detectChanges();
    component.skipTypewriter();
    component.advanceLine();
    component.skipTypewriter();
    fixture.detectChanges();
  }

  it('con el intento a la vista, las pistas van justo antes de las opciones y piden el estado de ese intento', () => {
    writeInputSignal(component.hintAttempt, { attemptId: 'intento-1' });
    openWithChoices();
    const root = fixture.nativeElement as HTMLElement;
    const hints = root.querySelector('app-scene-hint');
    const choices = root.querySelector('.choices');
    expect(hints).not.toBeNull();
    expect(choices).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING: las opciones vienen después de las pistas.
    expect(hints!.compareDocumentPosition(choices!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getHints).toHaveBeenCalledWith('intento-1');
  });

  it('sin intento (la vista previa del editor) no hay pistas ni se pide nada', () => {
    openWithChoices();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-scene-hint')).toBeNull();
    expect(getHints).not.toHaveBeenCalled();
  });

  /** Abre un diálogo con las opciones dadas y las deja a la vista (última intervención ya escrita). */
  function openWith(choices: DialogueState['choices']): HTMLElement {
    writeInputSignal(component.dialogue, { ...MULTI_LINE_DIALOGUE, choices });
    TestBed.flushEffects();
    fixture.detectChanges();
    component.skipTypewriter();
    component.advanceLine();
    component.skipTypewriter();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  // req: RF-18, CU-09 (revisión de F10: una confirmación de la interfaz no es un momento de decidir)
  it('una confirmación de la interfaz (sin decisión ni herramienta) no ofrece pistas ni las pide', () => {
    writeInputSignal(component.hintAttempt, { attemptId: 'intento-1' });
    const root = openWith([
      { key: 'frontend:cancel-restricted', text: 'Volver', decisionOptionId: null, requiredToolCode: null, effect: {} },
      { key: 'frontend:proceed-restricted', text: 'Continuar', decisionOptionId: null, requiredToolCode: null, effect: {} },
    ]);

    expect(root.querySelector('.choices'), 'las opciones sí se ven').not.toBeNull();
    expect(root.querySelector('app-scene-hint')).toBeNull();
    expect(getHints).not.toHaveBeenCalled();
  });

  // req: RF-18, CU-09 (el caso demo llega a la decisión de la familia por la herramienta: sin ella, la lista solo trae esa opción)
  it('una lista solo de herramientas sí ofrece pistas: así se llega a la decisión de la sala', () => {
    writeInputSignal(component.hintAttempt, { attemptId: 'intento-1' });
    const root = openWith([
      { key: 'tool-1', text: 'Aplicar PAP a la familia en crisis', decisionOptionId: null, requiredToolCode: 'PAP', effect: {} },
    ]);

    expect(root.querySelector('app-scene-hint'), 'la franja de pistas está sobre las opciones').not.toBeNull();
    expect(getHints).toHaveBeenCalledWith('intento-1');
  });

  it('mientras las opciones siguen ocultas (hay más intervenciones por leer) tampoco', () => {
    writeInputSignal(component.hintAttempt, { attemptId: 'intento-1' });
    writeInputSignal(component.dialogue, MULTI_LINE_DIALOGUE);
    TestBed.flushEffects();
    fixture.detectChanges();
    component.skipTypewriter();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-scene-hint')).toBeNull();
    expect(getHints).not.toHaveBeenCalled();
  });

  // req: ETH-01, SIEP-RF-05 (S3-2b: el consentimiento exigido llega hasta la pantalla de juego también por las pistas)
  it('si las pistas reciben un 403 CONSENT_REQUIRED, el panel lo reenvía a la pantalla de juego (una vez)', () => {
    const lost = vi.fn();
    component.consentRequired.subscribe(lost);
    getHints.mockReturnValue(throwError(() => ({ status: 403, error: { success: false, code: 'CONSENT_REQUIRED' } })));
    writeInputSignal(component.hintAttempt, { attemptId: 'intento-1' });

    openWithChoices();

    expect(getHints).toHaveBeenCalledTimes(1);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('un fallo de pistas que no es el consentimiento no lo reenvía', () => {
    const lost = vi.fn();
    component.consentRequired.subscribe(lost);
    getHints.mockReturnValue(throwError(() => ({ status: 500, error: null })));
    writeInputSignal(component.hintAttempt, { attemptId: 'intento-1' });

    openWithChoices();

    expect(getHints).toHaveBeenCalledTimes(1);
    expect(lost).not.toHaveBeenCalled();
  });
});

describe('Dialogue typewriter timing', () => {
  it('reveals characters at 22 chars/sec', () => {
    const text = 'Hola mundo';
    expect(simulateTypewriter(text, 1)).toBe('H');
    expect(simulateTypewriter(text, 5)).toBe('Hola ');
  });

  it('completes at text.length ticks', () => {
    const text = 'Test';
    expect(simulateTypewriter(text, text.length)).toBe('Test');
  });

  it('keeps the configured interval near 45 ms', () => {
    expect(INTERVAL_MS).toBeGreaterThanOrEqual(44);
    expect(INTERVAL_MS).toBeLessThanOrEqual(46);
  });
});

// Bloque I1: el vigilante y el hermano mayor salían con la silueta porque el kit no conoce su nombre; el panel usa la
// cara del personaje de la sala (la misma que la reacción) cuando el retrato no se resuelve.
describe('DialoguePanelComponent - cara del personaje de la sala', () => {
  it('presta la cara de la sala solo a la voz de quien habla, nunca a una voz de sistema ni a otro hablante', async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }, { provide: KitService, useValue: fakeKitService() }],
    }).compileComponents();
    const fixture = TestBed.createComponent(DialoguePanelComponent);
    const c = fixture.componentInstance;
    const visual = { portraits: {} } as never;
    writeInputSignal(c.speakerVisual, visual);
    const vigilante: DialogueState = { key: 'v', speakerName: 'Vigilante', portraitKey: null, emotion: 'neutral', choices: [],
      lines: [{ order: 1, speakerName: 'Vigilante', text: 'Buenas noches.', emotion: 'neutral' }] };
    writeInputSignal(c.dialogue, vigilante);
    TestBed.flushEffects();
    expect(c.visualDeHablante(vigilante)).toBe(visual);
    const otraVoz = { ...vigilante, lines: [{ order: 1, speakerName: 'Enfermera', text: 'Ahora no.', emotion: 'neutral' }] };
    writeInputSignal(c.dialogue, otraVoz);
    TestBed.flushEffects();
    expect(c.visualDeHablante(otraVoz)).toBeNull();
    const sistema = { ...vigilante, speakerName: 'Supervisión clínica', lines: [{ order: 1, speakerName: 'Supervisión clínica', text: 'Nota.', emotion: 'neutral' }] };
    writeInputSignal(c.dialogue, sistema);
    TestBed.flushEffects();
    expect(c.visualDeHablante(sistema)).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});

// Bloque I1: si la letra de pixel no carga, la opción conserva su letra en texto.
describe('DialoguePanelComponent - respaldo de las letras', () => {
  it('con la letra sin cargar, la clase de respaldo muestra el texto y quita la imagen', () => {
    expect(source).toContain('.strip--letras-texto .choice-num::after { display: none; }');
    expect(source).toMatch(/\.strip--letras-texto \.choice-num__txt \{ position: static;/);
    expect(source).toContain("prueba.onerror = () => this.letrasEnTexto.set(true);");
  });
});

// Bloque I1 (lo pidió el usuario): «Salida segura» y «Ver pista» dentro del cuadro son placas hermanas de «Volver al mapa».
describe('DialoguePanelComponent - las placas-botón de la cabecera', () => {
  const salida = readFileSync(join(__dirname, 'safe-exit-button.component.ts'), 'utf-8');
  const pistaHtml = readFileSync(join(__dirname, 'scene-hint.component.html'), 'utf-8');
  const pistaScss = readFileSync(join(__dirname, 'scene-hint.component.scss'), 'utf-8');

  it('el cuadro pide la variante «placa»; fuera del cuadro sigue el aspecto de siempre', () => {
    expect(source).toMatch(/<app-safe-exit-button class="panel-head__exit" data-hide-key variante="placa"/);
    expect(source).toContain('<app-scene-hint variante="placa"');
    expect(salida).toContain(`readonly variante = input<'base' | 'placa'>('base');`);
    expect(salida).toContain(`[class.safe-exit-btn--placa]="variante() === 'placa'"`);
    expect(pistaHtml).toContain(`[class.scene-hint--placa]="variante() === 'placa'"`);
    // En la placa la bombilla es de pixel; fuera, el icono de siempre.
    expect(pistaHtml).toContain(`[icon]="variante() === 'placa' ? undefined : 'lightbulb'"`);
  });

  it('el diálogo y la pista reutilizan la placa-botón del juego, con un blanco de al menos 44 px', () => {
    const pixel = readFileSync(join(__dirname, '../../../styles/components/_pixel.scss'), 'utf-8');
    expect(source).toContain('class="panel-back u-boton"');
    expect(source).toContain('class="instant-setting u-boton"');
    expect(source).toContain('class="close-btn u-boton u-boton--principal"');
    expect(pistaHtml).toContain("[class.u-boton]=\"variante() === 'placa'\"");
    expect(pixel).toContain('min-height: 44px');
    expect(salida).toContain('min-height: var(--alto-boton, 44px);');
  });

  it('«Salida segura» lleva brasa y su texto tibio llega a 4,5:1; «Ver pista» apagada se lee y su bombilla se apaga', () => {
    // Relleno y motas de la trama de salida (dialogo_arte.py, material «salida»).
    for (const surface of ['#2E161C', '#3A1E24', '#241016']) expect(contrastRatio('#FFD6C4', surface)).toBeGreaterThanOrEqual(4.5);
    for (const surface of PLACA_ARTE) {
      expect(contrastRatio('#A9A2B8', surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#F2ECDF', surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(salida).toContain('--m: var(--marco-salida); --t: var(--trama-salida);');
    expect(pistaScss).toContain("&[aria-disabled='true']::before { background-image: var(--icono-bombilla-apagada); }");
  });
});
const PLACA_ARTE = ['#1B1826', '#211E2E', '#171421'];

// Bloque I1 (pedido de K1): el aviso breve de la pantalla flotaba encima de las fichas; ahora el cuadro le da su sitio.
describe('DialoguePanelComponent - el aviso breve va dentro del cuadro', () => {
  let fixture: ComponentFixture<DialoguePanelComponent>;
  let component: DialoguePanelComponent;
  const AVISO = 'Ahora conoces algo más: hay otra forma de responder.';
  const host = () => fixture.nativeElement as HTMLElement;
  const conversacion = (choices: DialogueState['choices']): DialogueState => ({
    key: 'aviso', speakerName: 'Laura', portraitKey: null, emotion: 'neutral', notice: 'Puedes conocer más antes de responder.',
    lines: [{ order: 1, speakerName: 'Laura', text: 'Hola.', emotion: 'neutral' }],
    choices,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialoguePanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DialoguePanelComponent);
    component = fixture.componentInstance;
  });
  afterEach(() => { fixture.destroy(); TestBed.resetTestingModule(); });

  function render(d: DialogueState): void {
    writeInputSignal(component.dialogue, d);
    writeInputSignal(component.avisoBreve, AVISO);
    TestBed.flushEffects();
    fixture.detectChanges();
    component.skipTypewriter();
    fixture.detectChanges();
  }

  it('sin fichas, el aviso va en la cabecera del cuadro, sobre «Volver al mapa»', () => {
    render(conversacion([]));
    const aviso = host().querySelector('.panel-head > .panel-head__aviso');
    expect(aviso?.textContent?.trim()).toBe(AVISO);
    expect(aviso?.nextElementSibling?.classList.contains('panel-head__row')).toBe(true);
  });

  it('con las fichas a la vista, el aviso ocupa la fila del de la decisión mientras dura, no encima de las opciones', () => {
    render(conversacion([
      { key: 'a', text: 'Uno', decisionOptionId: 1, requiredToolCode: null, effect: {} },
      { key: 'b', text: 'Dos', decisionOptionId: 2, requiredToolCode: null, effect: {} },
    ]));
    expect(host().querySelector('.panel-head__aviso')).toBeNull();
    const fila = host().querySelector('.strip-body > .choices-notice');
    expect(fila?.textContent?.trim()).toBe(AVISO);
    writeInputSignal(component.avisoBreve, '');
    fixture.detectChanges();
    expect(host().querySelector('.strip-body > .choices-notice')?.textContent?.trim()).toBe('Puedes conocer más antes de responder.');
    expect(fila?.nextElementSibling?.matches('.choices, app-scene-hint')).toBe(true);
  });

  it('con el cuadro sobre el mundo, la barra inferior se oculta sin dejar hueco y queda inerte', () => {
    const pantalla = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
    expect(pantalla).toContain(`[class.bottom-zone--bajo-dialogo]="viewMode() === 'dialogue-cinematic'"`);
    expect(pantalla).toContain('.bottom-zone--bajo-dialogo { visibility: hidden; }');
    // El cuadro nunca se oculta para encuadrar: el pie no tiene que relevarlo.
    expect(pantalla).not.toContain('bottom-zone--encuadrando');
  });

  it('la pantalla no pinta el aviso suelto mientras hay un diálogo sobre el mundo: se lo pasa al cuadro', () => {
    const pantalla = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
    expect(pantalla).toContain("@if (softNotice() && !reacting() && viewMode() !== 'dialogue-cinematic') {");
    expect(pantalla).toMatch(/<app-dialogue-panel class="dialogue-cinematic"[^>]*\[avisoBreve\]="softNotice\(\) \+/);
  });
});

// Bloque I1: sobre el mundo el cuadro tiene un alto acotado y lo publica para la cámara.
describe('DialoguePanelComponent - alto acotado sobre el mundo', () => {
  it('el cuadro no pasa de --dialogo-alto-max y publica data-alto-ocupado', () => {
    expect(source).toContain('.dialogue-strip:not(.dialogue-strip--side) { --dialogo-alto-max: var(--dialogo-banda, min(340px, 46vh)); max-height: var(--dialogo-alto-max); }');
    // En el tramo amplio (fichas de .pixel-juego) la banda sube a 560 px.
    expect(readFileSync(join(__dirname, '../../../styles/tokens/_pixel.scss'), 'utf-8')).toContain('--dialogo-banda: min(560px, 52vh);');
    // La banda de decisión toma el alto que necesita, hasta el tope; si las fichas no caben, la lista se acota a filas enteras.
    expect(source).toContain("height: calc-size(max-content, min(size, var(--dialogo-alto-max)));");
    expect(source).toContain("lista.style.maxHeight = `${Math.ceil(corte + pie)}px`;");
    // Con la lista acotada, bajo ella se dicen las fichas que quedan abajo.
    expect(source).toContain("content: '▼ ' attr(data-mas);");
    expect(source).toContain("anfitrion.dataset['altoOcupado']");
  });

  it('con opciones es una banda que no se desplaza entera: la placa a todo el alto y solo la lista de fichas se desplaza', () => {
    const banda = '.dialogue-strip:not(.dialogue-strip--side).strip--con-opciones';
    expect(source).toMatch(new RegExp(`${banda.replace(/[.()]/g, '\\$&')} \\{[^}]*display: grid;[^}]*height: var\\(--dialogo-alto-max\\);[^}]*grid-template-rows: minmax\\(0, 1fr\\) auto minmax\\(0, auto\\);[^}]*overflow: clip;`));
    expect(source).toContain(`${banda} .placa { grid-column: 1; grid-row: 1 / -1; align-self: end;`);
    expect(source).toContain(`${banda} .strip-main { display: contents; }`);
    // Las filas de fichas nunca más bajas que su texto: con la lista acotada, 1fr y el min-height las dejaban en 48 px.
    expect(source).toContain('grid-auto-rows: minmax(min-content, 1fr);');
    expect(source).toContain(`${banda} .placa { grid-column: 1; grid-row: 1 / -1; align-self: end;`);
    expect(source).toMatch(new RegExp(`${banda.replace(/[.()]/g, '\\$&')} \\.choices \\{[^}]*min-height: 0;[^}]*overflow-y: auto;`));
    // La cabecera («Volver», «Salida segura», la nota de la decisión) va dentro de la banda, en la columna de las fichas.
    expect(source).toMatch(new RegExp(`${banda.replace(/[.()]/g, '\\$&')} \\.panel-head \\{[^}]*grid-column: 2;[^}]*position: static;`));
  });
});

describe('DialoguePanelComponent - páginas solo cuando no cabe (V6, living-world.e2e.ts:101)', () => {
  it('la sonda mide el texto sin el alto mínimo del párrafo y la regla es paginarSiNoCabe', () => {
    // Con el min-height de 4,35em en la sonda ninguna página cabía y cada frase salía sola (tres páginas para 80 caracteres).
    expect(source).toMatch(/sonda\.style\.cssText = `[^`]*min-height:0;/);
    expect(source).toContain('paginarSiNoCabe(text, Math.min(parrafo.offsetHeight - culpa, 6 * renglon), renglon,');
  });

  it('solo resta lo que desborda por el texto: mide la banda con el párrafo plegado', () => {
    expect(source).toContain("parrafo.style.cssText += ';height:0;min-height:0;overflow:hidden';");
    expect(source).toContain('const culpa = sobra - desborde();');
  });
});
