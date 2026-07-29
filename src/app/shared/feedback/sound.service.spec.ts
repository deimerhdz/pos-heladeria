import { TestBed } from '@angular/core/testing';
import { SoundService } from './sound.service';

const MUTED_KEY = 'pos.terminal.sound_muted';

describe('SoundService', () => {
  function create(): SoundService {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [SoundService] });
    return TestBed.inject(SoundService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('arranca sonando', () => {
    expect(create().muted()).toBe(false);
  });

  it('recuerda el silencio entre sesiones', () => {
    create().toggleMute();

    expect(localStorage.getItem(MUTED_KEY)).toBe('1');
    // Una instancia nueva (otra pestaña, o tras recargar) lo lee de vuelta.
    expect(create().muted()).toBe(true);
  });

  it('vuelve a activar el sonido', () => {
    const sound = create();
    sound.toggleMute();
    sound.toggleMute();

    expect(sound.muted()).toBe(false);
    expect(create().muted()).toBe(false);
  });

  it('no revienta cuando el navegador no da audio', () => {
    // jsdom no implementa AudioContext: es justo el caso que no debe tumbar la
    // terminal. Sin sonido se sigue cobrando.
    expect(() => create().bell()).not.toThrow();
  });

  it('no suena si está silenciado', () => {
    const sound = create();
    sound.setMuted(true);

    expect(() => sound.bell()).not.toThrow();
    expect(sound.muted()).toBe(true);
  });
});
