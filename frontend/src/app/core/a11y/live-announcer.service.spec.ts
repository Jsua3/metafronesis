import { TestBed } from '@angular/core/testing';

import {
  LIVE_CLEAR_MIN_MS, LIVE_DUPLICATE_WINDOW_MS, LIVE_WRITE_DELAY_MS, LiveRegionAnnouncer,
} from './live-announcer.service';

/**
 * Regiones vivas persistentes (plan visual F6-12; H-08, H-09, H-10; WCAG 4.1.3): dos, montadas al arrancar, vaciadas
 * antes de escribir y sin repetir el mismo mensaje por dos caminos. Cada región trae solo su rol (`status` con
 * `polite`, `alert` con `assertive`): ningún `role="status"` con `aria-live="assertive"`.
 */
// req: BLOQUE-H (H-08, H-09, H-10), RNF-004
describe('LiveRegionAnnouncer', () => {
  let announcer: LiveRegionAnnouncer;
  const region = (politeness: 'polite' | 'assertive') =>
    document.querySelector<HTMLElement>(`[data-live-region="${politeness}"]`)!;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    announcer = TestBed.inject(LiveRegionAnnouncer);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('monta las dos regiones al crearse, como hijas directas de <body> y vacías', () => {
    for (const politeness of ['polite', 'assertive'] as const) {
      const element = region(politeness);
      expect(element.parentElement).toBe(document.body);
      expect(element.getAttribute('aria-live')).toBe(politeness);
      expect(element.getAttribute('aria-atomic')).toBe('true');
      expect(element.textContent).toBe('');
    }
    expect(document.querySelectorAll('[data-live-region]').length).toBe(2);
  });

  it('cada región lleva el rol que le corresponde: nunca role="status" con aria-live="assertive"', () => {
    expect(region('polite').getAttribute('role')).toBe('status');
    expect(region('assertive').getAttribute('role')).toBe('alert');
    expect(document.querySelector('[aria-live="assertive"][role="status"]')).toBeNull();
  });

  it('vacía antes de escribir y escribe pasado el retardo (así un texto igual se vuelve a leer)', () => {
    region('polite').textContent = 'Texto viejo';
    announcer.announce('Entraste a la sala de escucha.');
    expect(region('polite').textContent).toBe('');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS - 1);
    expect(region('polite').textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(region('polite').textContent).toBe('Entraste a la sala de escucha.');
  });

  it('el mismo mensaje por dos caminos dentro de la ventana se anuncia una sola vez', () => {
    announcer.announce('La puerta está bloqueada.');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('La puerta está bloqueada.');
    // El segundo camino llega 100 ms después con el mismo texto: ni vacía ni reescribe la región (un lector lo
    // leería dos veces).
    vi.advanceTimersByTime(100);
    announcer.announce('La puerta está bloqueada.');
    expect(region('polite').textContent).toBe('La puerta está bloqueada.');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('La puerta está bloqueada.');
  });

  it('pasada la ventana, repetir la misma acción vuelve a anunciar (la persona la repitió)', () => {
    announcer.announce('La puerta está bloqueada.');
    vi.advanceTimersByTime(LIVE_DUPLICATE_WINDOW_MS + LIVE_WRITE_DELAY_MS);
    announcer.announce('La puerta está bloqueada.');
    expect(region('polite').textContent).toBe(''); // se vació para volver a escribir
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('La puerta está bloqueada.');
  });

  it('force repite aunque sea idéntico dentro de la ventana', () => {
    announcer.announce('Guardado.');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    announcer.announce('Guardado.', 'polite', { force: true });
    expect(region('polite').textContent).toBe('');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('Guardado.');
  });

  it('dos mensajes que llegan antes de escribirse se leen los dos, en orden y en una sola escritura (no se pierde el primero)', () => {
    // «Obtuviste…» y «Interactuar…» salen en el mismo instante: el segundo no puede cancelar al primero.
    announcer.announce('Obtuviste: Kit PAP. Ya está en tu barra de herramientas.');
    announcer.announce('Interactuar: Hablar con Familia en crisis');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS - 1);
    expect(region('polite').textContent).toBe('');
    vi.advanceTimersByTime(1);
    expect(region('polite').textContent)
      .toBe('Obtuviste: Kit PAP. Ya está en tu barra de herramientas. Interactuar: Hablar con Familia en crisis');
  });

  it('el lote une con un punto lo que no trae puntuación y no suma el mismo mensaje dos veces', () => {
    announcer.announce('Entraste a Urgencias');
    announcer.announce('Interactuar: Hablar con Enfermera');
    announcer.announce('Interactuar: Hablar con Enfermera');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('Entraste a Urgencias. Interactuar: Hablar con Enfermera');
  });

  it('lo que llega después de escribirse empieza un lote nuevo (reemplaza, como un anuncio normal)', () => {
    announcer.announce('Primero.');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    announcer.announce('Segundo.');
    expect(region('polite').textContent).toBe('');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('Segundo.');
  });

  it('assertive y polite son independientes: uno no vacía ni deduplica al otro', () => {
    announcer.announce('Se guardó tu reflexión.', 'polite');
    announcer.announce('No pudimos reanudar el intento.', 'assertive');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('Se guardó tu reflexión.');
    expect(region('assertive').textContent).toBe('No pudimos reanudar el intento.');
    // El mismo texto en la otra región no es un repetido: son dos canales distintos del lector.
    announcer.announce('Se guardó tu reflexión.', 'assertive');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('assertive').textContent).toBe('Se guardó tu reflexión.');
  });

  it('el texto no se queda en la región: se vacía a los segundos', () => {
    announcer.announce('Intento reanudado.');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('Intento reanudado.');
    vi.advanceTimersByTime(LIVE_CLEAR_MIN_MS);
    expect(region('polite').textContent).toBe('');
  });

  it('un mensaje largo no se vacía mientras se lee: la espera crece con su longitud', () => {
    const long = 'Antes de pasar, habla con la Familia en crisis (en el extremo izquierdo, al frente). '.repeat(3).trim();
    announcer.announce(long);
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS + LIVE_CLEAR_MIN_MS);
    expect(region('polite').textContent).toBe(long);
    vi.advanceTimersByTime(long.length * 100);
    expect(region('polite').textContent).toBe('');
  });

  it('un mensaje vacío o de solo espacios no vacía lo que se estaba diciendo', () => {
    announcer.announce('Intento reanudado.');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    announcer.announce('   ');
    expect(region('polite').textContent).toBe('Intento reanudado.');
  });

  it('la ventana de repetidos mira el texto normalizado (saltos y espacios dobles no lo disfrazan)', () => {
    announcer.announce('La puerta   está\nbloqueada.');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    announcer.announce('La puerta está bloqueada.');
    expect(region('polite').textContent).toBe('La puerta está bloqueada.');
    vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);
    expect(region('polite').textContent).toBe('La puerta está bloqueada.');
  });

  describe('con un diálogo modal abierto', () => {
    // Chromium y Firefox ocultan a los lectores todo lo que queda fuera de un `aria-modal="true"` activo, también las
    // regiones vivas: el LiveAnnouncer del CDK lo resuelve con `aria-owns`; esta región hace lo mismo para cualquier
    // modal (el del panel de diálogo del juego no es una capa del CDK).
    let modal: HTMLElement;

    beforeEach(() => {
      modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    });

    afterEach(() => modal.remove());

    it('el modal posee las dos regiones al anunciar, también si se abrió después de crear el servicio', () => {
      expect(modal.hasAttribute('aria-owns')).toBe(false);
      announcer.announce('Se abre el resultado del caso.');
      const owns = (modal.getAttribute('aria-owns') ?? '').split(' ');
      expect(owns).toContain(region('polite').id);
      expect(owns).toContain(region('assertive').id);
      expect(region('polite').id).not.toBe('');
    });

    // La bitácora es un `aria-modal` SIEMPRE en el DOM (cerrada lleva aria-hidden): si «poseyera» las regiones, las
    // regiones quedarían dentro de un subárbol oculto y NINGÚN anuncio se leería mientras el juego esté abierto.
    it('un modal oculto (aria-hidden, inert o hidden) no posee las regiones, aunque esté en el documento', () => {
      for (const hide of ['aria-hidden', 'inert', 'hidden'] as const) {
        modal.removeAttribute('aria-owns');
        modal.removeAttribute('aria-hidden');
        modal.removeAttribute('inert');
        modal.removeAttribute('hidden');
        modal.setAttribute(hide, hide === 'aria-hidden' ? 'true' : '');
        announcer.announce(`Mensaje ${hide}.`);
        vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS + LIVE_DUPLICATE_WINDOW_MS);
        expect(modal.hasAttribute('aria-owns'), hide).toBe(false);
      }
    });

    it('un modal dentro de un contenedor oculto tampoco las posee', () => {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('aria-hidden', 'true');
      wrapper.appendChild(modal);
      document.body.appendChild(wrapper);
      announcer.announce('Uno.');
      expect(modal.hasAttribute('aria-owns')).toBe(false);
      wrapper.remove();
      document.body.appendChild(modal);
    });

    it('un modal que se cierra suelta las regiones en el siguiente anuncio (y la bitácora cerrada nunca las retiene)', () => {
      announcer.announce('Uno.');
      expect(modal.getAttribute('aria-owns')).toContain(region('polite').id);

      modal.setAttribute('aria-hidden', 'true'); // se cerró
      vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS + LIVE_DUPLICATE_WINDOW_MS);
      announcer.announce('Dos.');
      expect(modal.hasAttribute('aria-owns')).toBe(false);

      modal.setAttribute('aria-hidden', 'false'); // vuelve a abrirse (así lo pinta la bitácora)
      vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS + LIVE_DUPLICATE_WINDOW_MS);
      announcer.announce('Tres.');
      expect(modal.getAttribute('aria-owns')).toContain(region('assertive').id);
    });

    it('un modal que aparece entre el anuncio y la escritura también las posee (el panel se pinta tras su efecto)', () => {
      modal.remove();
      announcer.announce('Primera línea.');
      const late = document.createElement('div');
      late.setAttribute('aria-modal', 'true');
      document.body.appendChild(late);

      vi.advanceTimersByTime(LIVE_WRITE_DELAY_MS);

      expect((late.getAttribute('aria-owns') ?? '').split(' ')).toContain(region('polite').id);
      late.remove();
      document.body.appendChild(modal);
    });

    it('conserva el aria-owns ajeno y no repite el id en cada anuncio', () => {
      modal.setAttribute('aria-owns', 'otro-elemento');
      announcer.announce('Uno.');
      announcer.announce('Dos.', 'assertive');
      const owns = (modal.getAttribute('aria-owns') ?? '').split(' ');
      expect(owns.filter(id => id === 'otro-elemento').length).toBe(1);
      expect(owns.filter(id => id === region('polite').id).length).toBe(1);
      expect(owns.filter(id => id === region('assertive').id).length).toBe(1);
    });

    it('un elemento que no es modal queda como estaba', () => {
      const plain = document.createElement('div');
      document.body.appendChild(plain);
      announcer.announce('Uno.');
      expect(plain.hasAttribute('aria-owns')).toBe(false);
      plain.remove();
    });

    it('al destruirse el servicio el modal suelta sus ids y conserva los ajenos', () => {
      modal.setAttribute('aria-owns', 'otro-elemento');
      announcer.announce('Uno.');
      TestBed.resetTestingModule();
      expect(modal.getAttribute('aria-owns')).toBe('otro-elemento');
    });
  });

  it('al destruirse retira sus regiones (no quedan huérfanas entre pantallas ni pruebas)', () => {
    TestBed.resetTestingModule();
    expect(document.querySelectorAll('[data-live-region]').length).toBe(0);
  });
});
