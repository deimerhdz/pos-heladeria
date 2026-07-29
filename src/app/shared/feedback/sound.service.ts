import { Injectable, signal } from '@angular/core';

const MUTED_KEY = 'pos.terminal.sound_muted';

/** Los dos tonos de la campana, en Hz, y cuánto dura cada uno. */
const BELL_TONES = [
  { hz: 880, at: 0, seconds: 0.32 },
  { hz: 660, at: 0.16, seconds: 0.42 },
];

/**
 * Avisos sonoros del personal (por ahora, la campana de pedido nuevo).
 *
 * El sonido se **sintetiza** con WebAudio en vez de reproducir un archivo: no
 * hay nada que descargar y no depende de que la caja tenga conexión.
 *
 * Nada de lo que pasa aquí puede tumbar la pantalla: si el navegador bloquea el
 * audio (aún no hubo interacción) o no trae `AudioContext`, se ignora en
 * silencio. Un POS tiene que seguir cobrando sin sonido.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  /** Avisos silenciados; se recuerda entre sesiones. */
  readonly muted = signal(this.read());

  private context: AudioContext | null = null;

  toggleMute(): void {
    this.setMuted(!this.muted());
  }

  setMuted(muted: boolean): void {
    this.muted.set(muted);
    try {
      localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    } catch {
      /* storage bloqueado: vale solo para esta sesión */
    }
  }

  /** Campana de dos tonos para avisar de un pedido nuevo. */
  bell(): void {
    if (this.muted()) return;
    try {
      const ctx = this.audioContext();
      if (!ctx) return;
      // El navegador suspende el contexto hasta que el usuario interactúa.
      if (ctx.state === 'suspended') void ctx.resume();

      for (const tone of BELL_TONES) {
        const start = ctx.currentTime + tone.at;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(tone.hz, start);
        // Caída exponencial: suena a campana y no a pitido.
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.seconds);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + tone.seconds);
      }
    } catch {
      /* sin audio disponible: el aviso visual sigue estando */
    }
  }

  private audioContext(): AudioContext | null {
    if (this.context) return this.context;
    const Ctor =
      typeof window !== 'undefined'
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)
        : undefined;
    this.context = Ctor ? new Ctor() : null;
    return this.context;
  }

  private read(): boolean {
    try {
      return localStorage.getItem(MUTED_KEY) === '1';
    } catch {
      return false;
    }
  }
}
