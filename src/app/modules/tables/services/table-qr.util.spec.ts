import QRCode from 'qrcode';
import { vi } from 'vitest';
import { TableService } from './table.service';
import {
  buildTableQr,
  labeledQrDataUrl,
  menuUrlForToken,
  qrDataUrl,
} from './table-qr.util';

/**
 * jsdom no implementa `HTMLCanvasElement.getContext('2d')` ni la carga real de
 * `Image` (no hay decodificación de imágenes en este entorno de test) —
 * agregar una librería de canvas solo para el test violaría el Principio IX
 * (sin dependencia nueva para esto). Se sustituyen ambos con dobles mínimos:
 * el contexto 2D registra las llamadas de dibujo (para poder verificar el
 * texto del identificador de mesa) y `Image` dispara `onload` en cuanto se le
 * asigna un `src`, como si la carga ya hubiera terminado.
 */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src(): string {
    return this._src;
  }
}

interface FakeCtx {
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
}

function installCanvasDoubles(): { texts: () => string[] } {
  const texts: string[] = [];
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const ctx: FakeCtx = {
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn((text: string) => texts.push(text)),
    };
    return ctx as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return `data:image/png;fake;w=${this.width};h=${this.height}`;
  });
  return { texts: () => texts };
}

/** Extrae `width`/`height` del data URL fabricado por el doble de `toDataURL`. */
function dims(dataUrl: string): { width: number; height: number } {
  const w = Number(/w=(\d+)/.exec(dataUrl)?.[1]);
  const h = Number(/h=(\d+)/.exec(dataUrl)?.[1]);
  return { width: w, height: h };
}

describe('table-qr.util', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('línea base (sin cambios)', () => {
    it('menuUrlForToken construye la URL del menú a partir del token firmado', () => {
      expect(menuUrlForToken('tok-1')).toBe(`${window.location.origin}/menu/t/tok-1`);
    });

    it('qrDataUrl genera un PNG (data URL) del QR de la mesa', async () => {
      const url = await qrDataUrl('tok-1');
      expect(url.startsWith('data:image/png')).toBe(true);
    });

    it('buildTableQr pide el token firmado y genera su QR', async () => {
      const tables = { getQrToken: vi.fn().mockResolvedValue({ qr_token: 'signed-1' }) };
      const result = await buildTableQr(tables as unknown as TableService, 'table-1');

      expect(tables.getQrToken).toHaveBeenCalledWith('table-1');
      expect(result.menuUrl).toBe(menuUrlForToken('signed-1'));
      expect(result.dataUrl.startsWith('data:image/png')).toBe(true);
    });
  });

  describe('labeledQrDataUrl (Bug 2, FR-008, FR-010 a FR-013)', () => {
    it('el preset "mostrador" produce un canvas de mayor tamaño que "sticker"', async () => {
      const { texts } = installCanvasDoubles();
      const mostrador = dims(await labeledQrDataUrl('tok-1', 'Mesa 1', 'mostrador'));
      const sticker = dims(await labeledQrDataUrl('tok-1', 'Mesa 1', 'sticker'));
      void texts;

      expect(mostrador.width).toBeGreaterThan(sticker.width);
      expect(mostrador.height).toBeGreaterThan(sticker.height);
    });

    it('ambos presets incluyen el texto del identificador de mesa recibido por parámetro', async () => {
      const { texts } = installCanvasDoubles();

      await labeledQrDataUrl('tok-1', 'Mesa 7', 'mostrador');
      expect(texts().join(' ')).toContain('Mesa 7');

      await labeledQrDataUrl('tok-1', 'Mesa 8 · Terraza', 'sticker');
      expect(texts().join(' ')).toContain('Mesa 8 · Terraza');
    });

    it('ambos presets decodifican al mismo menuUrlForToken(signedToken) que la función ya existente — el destino codificado no cambia', async () => {
      installCanvasDoubles();
      const spy = vi.spyOn(QRCode, 'toDataURL');

      await labeledQrDataUrl('tok-9', 'Mesa 1', 'mostrador');
      await labeledQrDataUrl('tok-9', 'Mesa 1', 'sticker');

      expect(spy).toHaveBeenCalledTimes(2);
      for (const call of spy.mock.calls) {
        expect(call[0]).toBe(menuUrlForToken('tok-9'));
      }
    });
  });
});
