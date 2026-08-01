import { startVisibleInterval } from './visible-interval';

/** Fuerza `document.visibilityState` y dispara el evento, como hace el navegador. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('startVisibleInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('ejecuta la función en cada periodo mientras la pestaña se ve', () => {
    const fn = vi.fn();
    const iv = startVisibleInterval(fn, 1000);

    vi.advanceTimersByTime(3000);

    expect(fn).toHaveBeenCalledTimes(3);
    iv.stop();
  });

  it('no ejecuta nada con la pestaña oculta', () => {
    const fn = vi.fn();
    const iv = startVisibleInterval(fn, 1000);

    setVisibility('hidden');
    vi.advanceTimersByTime(10_000);

    expect(fn).not.toHaveBeenCalled();
    iv.stop();
  });

  it('ejecuta la función de inmediato al volver la pestaña, sin esperar un periodo', () => {
    const fn = vi.fn();
    const iv = startVisibleInterval(fn, 1000);

    setVisibility('hidden');
    vi.advanceTimersByTime(10_000);
    setVisibility('visible');

    // Inmediata, antes de que corra un solo periodo.
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    iv.stop();
  });

  it('respeta runOnResume:false', () => {
    const fn = vi.fn();
    const iv = startVisibleInterval(fn, 1000, { runOnResume: false });

    setVisibility('hidden');
    setVisibility('visible');

    expect(fn).not.toHaveBeenCalled();
    iv.stop();
  });

  it('setPeriod cambia el ritmo en caliente', () => {
    const fn = vi.fn();
    const iv = startVisibleInterval(fn, 1000);

    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(2);

    // Con SSE arriba el sondeo se relaja.
    iv.setPeriod(10_000);
    expect(iv.periodMs).toBe(10_000);

    vi.advanceTimersByTime(9000);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(3);
    iv.stop();
  });

  it('setPeriod al mismo valor no reinicia el ciclo en curso', () => {
    const fn = vi.fn();
    const iv = startVisibleInterval(fn, 1000);

    vi.advanceTimersByTime(900);
    iv.setPeriod(1000);
    vi.advanceTimersByTime(100);

    // Si hubiera rearmado, aquí aún no habría llamado.
    expect(fn).toHaveBeenCalledTimes(1);
    iv.stop();
  });

  it('stop() detiene el intervalo y desengancha el listener', () => {
    const fn = vi.fn();
    const iv = startVisibleInterval(fn, 1000);

    iv.stop();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();

    // Un cambio de visibilidad después de stop() no debe resucitarlo.
    setVisibility('hidden');
    setVisibility('visible');
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('stop() es idempotente', () => {
    const iv = startVisibleInterval(vi.fn(), 1000);
    iv.stop();
    expect(() => iv.stop()).not.toThrow();
  });

  it('arranca en pausa si la pestaña ya estaba oculta', () => {
    setVisibility('hidden');
    const fn = vi.fn();
    const iv = startVisibleInterval(fn, 1000);

    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    iv.stop();
  });
});
