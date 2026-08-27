import QRCode from 'qrcode';
import { TableService } from './table.service';

/**
 * Construye la URL que codifica el QR de una mesa.
 *
 * El token va **firmado** (`GET /orders/tables/{id}/qr-token`): lleva dentro el
 * tenant y la mesa, así que el enlace funciona en cualquier dominio y el
 * comensal nunca ve ni puede manipular el id de la mesa.
 */
export function menuUrlForToken(signedToken: string): string {
  return `${window.location.origin}/menu/t/${signedToken}`;
}

/** Genera el PNG (data URL) del QR de una mesa a partir de su token firmado. */
export async function qrDataUrl(signedToken: string, width = 256): Promise<string> {
  return QRCode.toDataURL(menuUrlForToken(signedToken), { width, margin: 2 });
}

/** Token firmado + URL + PNG de una mesa, listos para pintar o imprimir. */
export interface TableQrArtifacts {
  menuUrl: string;
  dataUrl: string;
}

/** Pide el token firmado de la mesa y genera su QR. */
export async function buildTableQr(
  tables: TableService,
  tableId: string,
  width = 256,
): Promise<TableQrArtifacts> {
  const { qr_token } = await tables.getQrToken(tableId);
  return { menuUrl: menuUrlForToken(qr_token), dataUrl: await qrDataUrl(qr_token, width) };
}

/** Variantes de tamaño para el PNG compuesto con el identificador de mesa. */
export type QrPreset = 'mostrador' | 'sticker';

interface QrPresetConfig {
  canvasWidth: number;
  canvasHeight: number;
  /** Ancho del módulo QR — misma proporción (~78-80%) del lienzo en ambos presets. */
  qrWidth: number;
  qrTop: number;
  fontSize: number;
}

/** Valores de referencia de `research.md` Decisión 3. */
const QR_PRESETS: Record<QrPreset, QrPresetConfig> = {
  mostrador: { canvasWidth: 900, canvasHeight: 1100, qrWidth: 700, qrTop: 60, fontSize: 48 },
  sticker: { canvasWidth: 380, canvasHeight: 460, qrWidth: 300, qrTop: 30, fontSize: 22 },
};

/** Carga una data URL en un `<img>` y espera a que esté lista para dibujar. */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el QR generado.'));
    img.src = dataUrl;
  });
}

/**
 * Compone, sobre un `<canvas>` 2D nativo, el QR ya generado por `qrDataUrl`
 * junto con el identificador de la mesa como texto, dentro de una zona de
 * seguridad, en uno de dos tamaños con nombre ("Mostrador"/"Sticker").
 *
 * No cambia el destino codificado: `signedToken` es exactamente el mismo que
 * ya usan `qrDataUrl`/`buildTableQr` (FR-012).
 */
export async function labeledQrDataUrl(
  signedToken: string,
  tableLabel: string,
  preset: QrPreset,
): Promise<string> {
  const cfg = QR_PRESETS[preset];
  const qrUrl = await qrDataUrl(signedToken, cfg.qrWidth);
  const qrImage = await loadImage(qrUrl);

  const canvas = document.createElement('canvas');
  canvas.width = cfg.canvasWidth;
  canvas.height = cfg.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo componer el QR: canvas 2D no disponible.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cfg.canvasWidth, cfg.canvasHeight);

  const qrLeft = (cfg.canvasWidth - cfg.qrWidth) / 2;
  ctx.drawImage(qrImage, qrLeft, cfg.qrTop, cfg.qrWidth, cfg.qrWidth);

  ctx.fillStyle = '#111827';
  ctx.font = `bold ${cfg.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(tableLabel, cfg.canvasWidth / 2, cfg.qrTop + cfg.qrWidth + cfg.fontSize + 20);

  return canvas.toDataURL('image/png');
}
