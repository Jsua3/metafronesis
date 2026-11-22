import { settleWithin } from './settle-within.util';

describe('settleWithin', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  it('devuelve el resultado si llega dentro del plazo y no deja temporizadores', async () => {
    await expect(settleWithin(Promise.resolve('ok'), 1500)).resolves.toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('no espera más del plazo; el trabajo sigue en segundo plano', async () => {
    let finish!: (value: string) => void;
    const work = new Promise<string>(resolve => { finish = resolve; });
    const result = settleWithin(work, 1500);

    vi.advanceTimersByTime(1500);
    await expect(result).resolves.toBeUndefined();

    finish('tarde');
    await expect(work).resolves.toBe('tarde');
  });

  it('un fallo no bloquea el arranque', async () => {
    await expect(settleWithin(Promise.reject(new Error('red')), 1500)).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
