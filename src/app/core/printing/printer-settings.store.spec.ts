import { TestBed } from '@angular/core/testing';
import { PrinterSettingsStore } from './printer-settings.store';

const STORAGE_KEY = 'pos.terminal.paper_width_mm';

describe('PrinterSettingsStore', () => {
  function create(): PrinterSettingsStore {
    // Ver nota en `diner.service.spec.ts`: los specs comparten entorno.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [PrinterSettingsStore] });
    return TestBed.inject(PrinterSettingsStore);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('arranca en 48 mm', () => {
    expect(create().paperWidthMm()).toBe(48);
  });

  it('recuerda el ancho entre sesiones', () => {
    create().setPaperWidth(58);

    expect(localStorage.getItem(STORAGE_KEY)).toBe('58');
    expect(create().paperWidthMm()).toBe(58);
  });

  it('descarta un valor corrupto en vez de dejar la impresión inservible', () => {
    localStorage.setItem(STORAGE_KEY, 'papel gigante');
    expect(create().paperWidthMm()).toBe(48);

    localStorage.setItem(STORAGE_KEY, '37');
    expect(create().paperWidthMm()).toBe(48);
  });
});
