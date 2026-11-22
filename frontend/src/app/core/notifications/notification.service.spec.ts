import { firstValueFrom } from 'rxjs';

import { MAX_NOTIFICATIONS, NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    service = new NotificationService();
  });

  afterEach(() => vi.useRealTimers());

  async function texts(): Promise<string[]> {
    return (await firstValueFrom(service.messages$)).map(m => m.text);
  }

  it('los avisos de éxito se cierran a los 5 s', async () => {
    service.success('Guardado');
    vi.advanceTimersByTime(4999);
    expect(await texts()).toEqual(['Guardado']);
    vi.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it('las advertencias duran 8 s', async () => {
    service.warning('Cuidado');
    vi.advanceTimersByTime(7999);
    expect(await texts()).toEqual(['Cuidado']);
    vi.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it('los errores no se cierran solos', async () => {
    service.error('Falló');
    vi.advanceTimersByTime(60_000);
    expect(await texts()).toEqual(['Falló']);
  });

  it('pausar conserva el tiempo restante y reanudar lo retoma', async () => {
    service.success('Guardado');
    const [{ id }] = await firstValueFrom(service.messages$);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3000);
    service.pause(id);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(await texts()).toEqual(['Guardado']);
    service.resume(id);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1999);
    expect(await texts()).toEqual(['Guardado']);
    vi.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it(`no mantiene más de ${MAX_NOTIFICATIONS} avisos: descarta el más antiguo`, async () => {
    for (let i = 1; i <= MAX_NOTIFICATIONS + 1; i++) service.error(`E${i}`);
    expect(await texts()).toEqual(['E2', 'E3', 'E4', 'E5']);
  });

  it('al superar el tope libera el temporizador del aviso descartado', async () => {
    for (let i = 1; i <= MAX_NOTIFICATIONS + 1; i++) service.success(`S${i}`);
    expect(await texts()).toEqual(['S2', 'S3', 'S4', 'S5']);
    expect(vi.getTimerCount()).toBe(MAX_NOTIFICATIONS);
  });

  describe('deduplicación', () => {
    it('dos errores iguales dejan un solo aviso', async () => {
      service.error('Sin conexión con el servidor.');
      service.error('Sin conexión con el servidor.');
      expect(await texts()).toEqual(['Sin conexión con el servidor.']);
    });

    it('cuatro peticiones paralelas con el mismo error dejan un solo aviso', async () => {
      for (let i = 0; i < 4; i++) service.error('Sin conexión con el servidor.');
      expect(await texts()).toEqual(['Sin conexión con el servidor.']);
    });

    it('un error y un éxito con el mismo texto dejan dos', async () => {
      service.error('Listo');
      service.success('Listo');
      const messages = await firstValueFrom(service.messages$);
      expect(messages.map(m => m.type)).toEqual(['error', 'success']);
    });

    it('el mismo tipo con otro texto no se descarta', async () => {
      service.error('Uno');
      service.error('Dos');
      expect(await texts()).toEqual(['Uno', 'Dos']);
    });

    it('aplica a todos los tipos y a show() directo', async () => {
      service.warning('W');
      service.warning('W');
      service.info('I');
      service.info('I');
      service.show('success', 'S');
      service.show('success', 'S');
      expect(await texts()).toEqual(['W', 'I', 'S']);
    });

    it('un aviso cerrado deja de contar para la deduplicación', async () => {
      service.error('Falló');
      const [{ id }] = await firstValueFrom(service.messages$);
      service.dismiss(id);
      service.error('Falló');
      expect(await texts()).toEqual(['Falló']);
    });

    it('un aviso que se cerró solo deja de contar', async () => {
      service.success('Guardado');
      vi.advanceTimersByTime(5000);
      service.success('Guardado');
      expect(await texts()).toEqual(['Guardado']);
    });

    it('el duplicado descartado no deja temporizadores', async () => {
      service.success('Guardado');
      service.success('Guardado');
      expect(vi.getTimerCount()).toBe(1);
    });
  });

  // req: BLOQUE-H (H-23) — F6-12: quien emite un aviso accionable (el juego) necesita retirarlo cuando deja de valer.
  describe('show() devuelve el id del aviso', () => {
    it('el de uno nuevo y, si es un repetido, el del que ya estaba visible', async () => {
      const first = service.show('error', 'Falló');
      const repeated = service.show('error', 'Falló');
      const [{ id }] = await firstValueFrom(service.messages$);
      expect(first).toBe(id);
      expect(repeated).toBe(id);
    });

    it('con ese id se puede retirar, y un aviso sin cierre automático (0) espera a que se cierre', async () => {
      const id = service.show('warning', 'Habla con la familia', 0);
      vi.advanceTimersByTime(60_000);
      expect(await texts()).toEqual(['Habla con la familia']);
      service.dismiss(id);
      expect(await texts()).toEqual([]);
    });
  });

  it('dismiss cancela el temporizador pendiente', async () => {
    service.success('Guardado');
    const [{ id }] = await firstValueFrom(service.messages$);
    expect(vi.getTimerCount()).toBe(1);
    service.dismiss(id);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(await texts()).toEqual([]);
  });

  it('clear vacía la lista y cancela todos los temporizadores', async () => {
    service.success('Uno');
    service.warning('Dos');
    service.info('Tres');
    expect(vi.getTimerCount()).toBe(3);
    service.clear();
    expect(await texts()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
