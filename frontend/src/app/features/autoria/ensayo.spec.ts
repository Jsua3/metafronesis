import { RUTA_ENSAYO, abrirEnsayo, alPulsarProbar, irAlEnsayo } from './ensayo';

function diferido() {
  let resolver!: () => void;
  const promise = new Promise<void>((r) => { resolver = r; });
  return { promise, resolver };
}

function tienda(guardado: Promise<void>) {
  return { caso: () => ({ id: '41' }), sincronizado: () => guardado } as unknown as Parameters<typeof abrirEnsayo>[0];
}

describe('ensayo · abrir el juego real en otra pestaña', () => {
  it('RUTA_ENSAYO arma la ruta del ensayo, con «desde» solo si se pide', () => {
    expect(RUTA_ENSAYO('41')).toBe('/portal/casos/41/ensayo');
    expect(RUTA_ENSAYO('41', 12)).toBe('/portal/casos/41/ensayo?desde=12');
  });

  it('abre la pestaña en el mismo clic y le pone la dirección después de guardar lo pendiente', async () => { // Foco 1
    const pestana = { opener: {}, location: { href: '' }, closed: false };
    const abrir = vi.fn(() => pestana as unknown as Window);
    const guardado = diferido();
    const p = abrirEnsayo(tienda(guardado.promise), 12, abrir);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(pestana.location.href).toBe('');
    guardado.resolver();
    await p;
    expect(pestana.location.href).toBe('/portal/casos/41/ensayo?desde=12');
    expect(pestana.opener).toBeNull();
  });

  it('si el navegador bloquea la pestaña, navega en la misma tras guardar', async () => {
    const abrir = vi.fn(() => null);
    const navegar = vi.fn();
    const guardado = diferido();
    const p = abrirEnsayo(tienda(guardado.promise), undefined, abrir, navegar);
    expect(navegar).not.toHaveBeenCalled();
    guardado.resolver();
    await p;
    expect(navegar).toHaveBeenCalledWith('/portal/casos/41/ensayo');
  });

  it('si la docente cerró la pestaña vacía mientras se guardaba, no hace nada más', async () => {
    const pestana = { opener: {}, location: { href: '' }, closed: false };
    const guardado = diferido();
    const p = abrirEnsayo(tienda(guardado.promise), 3, () => pestana as unknown as Window);
    pestana.closed = true;
    guardado.resolver();
    await p;
    expect(pestana.location.href).toBe('');
  });

  describe('irAlEnsayo · el clic normal de «Probar»: esta misma pestaña, con el borrador al día', () => {
    function tiendaDeNavegar(guardado: Promise<void>, extra: { error?: string | null; conflicto?: unknown } = {}) {
      const navegar = vi.fn(() => Promise.resolve(true));
      const store = {
        caso: () => ({ id: '41', titulo: 'Primera atención' }), sincronizado: () => guardado,
        error: () => extra.error ?? null, conflicto: () => extra.conflicto ?? null, navegar,
      } as unknown as Parameters<typeof irAlEnsayo>[0];
      return { store, navegar };
    }

    it('espera a que lo pendiente llegue al servidor y entonces navega, con el título para el umbral', async () => {
      const guardado = diferido();
      const { store, navegar } = tiendaDeNavegar(guardado.promise);
      const p = irAlEnsayo(store, 12);
      expect(navegar).not.toHaveBeenCalled();
      guardado.resolver();
      expect(await p).toBe(true);
      expect(navegar).toHaveBeenCalledWith('/portal/casos/41/ensayo?desde=12', { umbral: { titulo: 'Primera atención' } });
    });

    it('si quedó un error o un conflicto de guardado no entra: el ensayo mostraría un borrador viejo', async () => {
      const conError = tiendaDeNavegar(Promise.resolve(), { error: 'No se pudo guardar.' });
      expect(await irAlEnsayo(conError.store)).toBe(false);
      expect(conError.navegar).not.toHaveBeenCalled();
      const conConflicto = tiendaDeNavegar(Promise.resolve(), { conflicto: { mensaje: 'x' } });
      expect(await irAlEnsayo(conConflicto.store)).toBe(false);
      expect(conConflicto.navegar).not.toHaveBeenCalled();
    });
  });

  describe('alPulsarProbar · el clic primario va en esta pestaña; Ctrl, Meta, Mayús o el medio, a otra ya sincronizada', () => {
    const clic = (init: Partial<MouseEvent> = {}) => {
      const evento = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...init };
      return evento as unknown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> };
    };
    const tiendaNav = () => {
      const navegar = vi.fn(() => Promise.resolve(true));
      return { store: { caso: () => ({ id: '41', titulo: 'T' }), sincronizado: () => Promise.resolve(), error: () => null, conflicto: () => null, navegar } as unknown as Parameters<typeof alPulsarProbar>[1], navegar };
    };

    it('el clic primario (y Enter, que llega como ese mismo clic) navega una sola vez en esta pestaña', async () => {
      const { store, navegar } = tiendaNav();
      const evento = clic();
      await alPulsarProbar(evento, store, 5);
      expect(evento.preventDefault).toHaveBeenCalledOnce();
      expect(navegar).toHaveBeenCalledTimes(1);
      expect(navegar).toHaveBeenCalledWith('/portal/casos/41/ensayo?desde=5', { umbral: { titulo: 'T' } });
    });

    it.each([['Alt', { altKey: true }], ['el botón derecho', { button: 2 }]])('con %s deja actuar al navegador', async (_nombre, init) => {
      const { store, navegar } = tiendaNav();
      const evento = clic(init as Partial<MouseEvent>);
      await alPulsarProbar(evento, store, 5);
      expect(evento.preventDefault).not.toHaveBeenCalled();
      expect(navegar).not.toHaveBeenCalled();
    });

    it.each([
      ['Ctrl', { ctrlKey: true }], ['Meta', { metaKey: true }], ['Mayús', { shiftKey: true }], ['el botón del medio', { button: 1 }],
    ])('con %s abre otra pestaña en el gesto y le pone la dirección solo después de guardar lo pendiente', async (_nombre, init) => {
      const guardado = diferido();
      const pestana = { opener: {} as unknown, closed: false, location: { href: 'about:blank' }, close: vi.fn() };
      const abrir = vi.fn(() => pestana as unknown as Window);
      const navegar = vi.fn();
      const store = { caso: () => ({ id: '41', titulo: 'T' }), sincronizado: () => guardado.promise, error: () => null, conflicto: () => null, navegar } as unknown as Parameters<typeof alPulsarProbar>[1];
      const evento = clic(init as Partial<MouseEvent>);
      const p = alPulsarProbar(evento, store, 5, abrir);
      expect(evento.preventDefault).toHaveBeenCalledOnce();
      expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
      expect(pestana.opener).toBeNull();
      expect(pestana.location.href).toBe('about:blank');
      guardado.resolver();
      await p;
      expect(pestana.location.href).toBe('/portal/casos/41/ensayo?desde=5');
      expect(navegar).not.toHaveBeenCalled();
    });

    it('con Ctrl y un error de guardado, la pestaña provisional se cierra sin cargar el ensayo', async () => {
      const pestana = { opener: null, closed: false, location: { href: 'about:blank' }, close: vi.fn() };
      const store = { caso: () => ({ id: '41', titulo: 'T' }), sincronizado: () => Promise.resolve(), error: () => 'No se pudo guardar', conflicto: () => null, navegar: vi.fn() } as unknown as Parameters<typeof alPulsarProbar>[1];
      await alPulsarProbar(clic({ ctrlKey: true }), store, undefined, () => pestana as unknown as Window);
      expect(pestana.close).toHaveBeenCalled();
      expect(pestana.location.href).toBe('about:blank');
    });
  });
});
