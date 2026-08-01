/**
 * Intervalo que se detiene cuando la pestaña deja de verse.
 *
 * Un comensal con el móvil en el bolsillo seguía sondeando cada 10 s: peticiones
 * que nadie mira y que además escribían en Postgres. Con esto, el coste de una
 * pestaña en segundo plano es exactamente cero.
 *
 * Al volver a primera plana se ejecuta la función **de inmediato** antes de
 * rearrancar el intervalo: si no, tras desbloquear el móvil habría que esperar un
 * periodo entero para ver datos frescos, que es peor que no haber pausado nada.
 *
 * `setPeriod()` existe para el tiempo real: con SSE conectado el sondeo baja a
 * un minuto y sube a diez segundos cuando el stream se cae.
 */
export interface VisibleInterval {
  /** Detiene el intervalo y quita el listener de visibilidad. Idempotente. */
  stop(): void;
  /** Cambia el periodo en caliente. Si no cambió, no hace nada. */
  setPeriod(ms: number): void;
  /** Periodo actual, en ms. */
  readonly periodMs: number;
}

export interface VisibleIntervalOptions {
  /** Ejecutar `fn()` al volver la pestaña a primer plano. Por defecto `true`. */
  runOnResume?: boolean;
}

/** ¿Se está viendo la pestaña? En entornos sin `document` asumimos que sí. */
function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function startVisibleInterval(
  fn: () => void,
  ms: number,
  opts: VisibleIntervalOptions = {},
): VisibleInterval {
  const runOnResume = opts.runOnResume ?? true;

  let periodMs = ms;
  let handle: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const clear = (): void => {
    if (handle !== null) {
      clearInterval(handle);
      handle = null;
    }
  };

  const arm = (): void => {
    clear();
    if (!stopped && isVisible()) handle = setInterval(fn, periodMs);
  };

  const onVisibilityChange = (): void => {
    if (stopped) return;
    if (isVisible()) {
      // Recuperar el retraso acumulado antes de rearrancar el ciclo.
      if (runOnResume) fn();
      arm();
    } else {
      clear();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  arm();

  return {
    get periodMs() {
      return periodMs;
    },
    setPeriod(next: number): void {
      if (next === periodMs) return;
      periodMs = next;
      arm();
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      clear();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    },
  };
}
