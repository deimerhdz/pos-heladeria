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
