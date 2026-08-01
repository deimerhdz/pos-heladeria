import { SseClient } from './sse-client';
import { RealtimeStatus } from './realtime-event.model';

/** `EventSource` de mentira: expone los disparadores para conducir el test. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, ((ev: Event) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (ev: Event) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }

  close(): void {
    this.closed = true;
  }

  // --- disparadores ---
  fireOpen(): void {
    this.onopen?.();
  }

  fireError(): void {
    this.onerror?.();
  }

  fire(type: string, data: unknown, id?: string): void {
    const ev = { data: JSON.stringify(data), lastEventId: id ?? '' } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(ev as unknown as Event);
  }
}

function build(
  o: {
    url?: (lastId: string | null) => Promise<string>;
  } = {},
) {
  const onEvent = vi.fn<(type: string, data: unknown, id: string | null) => void>();
  const onStatus = vi.fn<(status: RealtimeStatus) => void>();
  const urls: (string | null)[] = [];
  const url =
    o.url ??
    ((lastId: string | null) => {
      urls.push(lastId);
      return Promise.resolve(`/stream?n=${urls.length}${lastId ? `&last_event_id=${lastId}` : ''}`);
    });
  const client = new SseClient({
    url,
    onEvent,
    onStatus,
    factory: (u) => new FakeEventSource(u) as unknown as EventSource,
  });
  return { client, onEvent, onStatus, urls };
}

/** Deja correr las promesas pendientes (la url es async). */
const settle = () => Promise.resolve().then(() => Promise.resolve());

describe('SseClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    // Sin jitter: el backoff es determinista para poder afirmar sobre él.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('abre la conexión y reporta los estados', async () => {
    const { client, onStatus } = build();
    client.start();
    await settle();

    expect(FakeEventSource.instances).toHaveLength(1);
    FakeEventSource.instances[0].fireOpen();

    const estados = onStatus.mock.calls.map((c) => c[0] as RealtimeStatus);
    expect(estados).toEqual(['connecting', 'open']);
    client.stop();
  });

  it('entrega los eventos ya parseados', async () => {
    const { client, onEvent } = build();
    client.start();
    await settle();
    FakeEventSource.instances[0].fireOpen();
    FakeEventSource.instances[0].fire('order.created', { type: 'order.created', v: 7 }, '1730-0');

    expect(onEvent).toHaveBeenCalledWith(
      'order.created',
      { type: 'order.created', v: 7 },
      '1730-0',
    );
    client.stop();
  });

  it('descarta un frame ilegible sin romper el stream', async () => {
    const { client, onEvent } = build();
    client.start();
    await settle();
    const es = FakeEventSource.instances[0];
    es.fireOpen();

    // JSON roto a mano.
    for (const fn of (es as any).listeners.get('order.created') ?? []) {
      fn({ data: '{no-es-json', lastEventId: '1-0' } as unknown as Event);
    }
    expect(onEvent).not.toHaveBeenCalled();

    es.fire('order.created', { type: 'order.created', v: 1 }, '2-0');
    expect(onEvent).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it('reintenta con backoff exponencial acotado', async () => {
    const { client } = build();
    client.start();
    await settle();

    // 1º fallo → ~1s
    FakeEventSource.instances[0].fireError();
    expect(FakeEventSource.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(2);

    // 2º fallo → ~2s (a 1s todavía no)
    FakeEventSource.instances[1].fireError();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(3);

    client.stop();
  });

  it('el backoff no crece por encima del tope', async () => {
    const { client } = build();
    client.start();
    await settle();

    for (let i = 0; i < 12; i++) {
      FakeEventSource.instances.at(-1)!.fireError();
      await vi.advanceTimersByTimeAsync(30_000);
    }
    const antes = FakeEventSource.instances.length;
    FakeEventSource.instances.at(-1)!.fireError();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeEventSource.instances.length).toBe(antes + 1);

    client.stop();
  });

  it('reinicia el backoff al reconectar con éxito', async () => {
    const { client } = build();
    client.start();
    await settle();

    FakeEventSource.instances[0].fireError();
    await vi.advanceTimersByTimeAsync(1000);
    FakeEventSource.instances[1].fireError();
    await vi.advanceTimersByTimeAsync(2000);
    FakeEventSource.instances[2].fireOpen(); // éxito → contador a cero

    FakeEventSource.instances[2].fireError();
    await vi.advanceTimersByTimeAsync(1000); // vuelve a ser 1s, no 4s
    expect(FakeEventSource.instances).toHaveLength(4);

    client.stop();
  });

  it('re-evalúa la url en cada intento (ticket nuevo) y propaga last_event_id', async () => {
    const { client, urls } = build();
    client.start();
    await settle();

    FakeEventSource.instances[0].fireOpen();
    FakeEventSource.instances[0].fire('order.created', { v: 1 }, '1730-5');
    FakeEventSource.instances[0].fireError();
    await vi.advanceTimersByTimeAsync(1000);

    // La url se pidió dos veces: la segunda con el último id visto.
    expect(urls).toEqual([null, '1730-5']);
    expect(FakeEventSource.instances[1].url).toContain('last_event_id=1730-5');

    client.stop();
  });

  it('emite `reconnected` solo a partir de la segunda apertura', async () => {
    const { client, onEvent } = build();
    client.start();
    await settle();

    FakeEventSource.instances[0].fireOpen();
    expect(onEvent).not.toHaveBeenCalledWith('reconnected', null, null);

    FakeEventSource.instances[0].fireError();
    await vi.advanceTimersByTimeAsync(1000);
    FakeEventSource.instances[1].fireOpen();
    expect(onEvent).toHaveBeenCalledWith('reconnected', null, null);

    client.stop();
  });

  it('stop() cierra la fuente y corta los reintentos', async () => {
    const { client } = build();
    client.start();
    await settle();

    const es = FakeEventSource.instances[0];
    es.fireError();
    client.stop();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(es.closed).toBe(true);
  });

  it('reintenta también si falla el minteo de la url (ticket)', async () => {
    let intentos = 0;
    const { client } = build({
      url: () => {
        intentos += 1;
        return intentos === 1 ? Promise.reject(new Error('sin red')) : Promise.resolve('/ok');
      },
    });
    client.start();
    await settle();

    expect(FakeEventSource.instances).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeEventSource.instances).toHaveLength(1);

    client.stop();
  });
});
