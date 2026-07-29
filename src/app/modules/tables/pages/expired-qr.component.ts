import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Aterrizaje de los QR antiguos (`/menu/qr/{uuid}`).
 *
 * Esos códigos llevaban el id de la mesa en claro y el tenant en una cabecera
 * falsificable. Ahora el QR lleva un token firmado (`/menu/t/{jwt}`) y el
 * backend ya no acepta el formato viejo — pero hay códigos impresos pegados en
 * las mesas, así que conviene explicarlo en vez de devolver un 404 mudo.
 */
@Component({
  selector: 'app-expired-qr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-gray-50">
      <div class="text-6xl mb-4">🔄</div>
      <h1 class="text-xl font-bold text-gray-800">Este código QR ya no está vigente</h1>
      <p class="text-gray-500 text-sm mt-2 max-w-xs">
        Pide al personal el código nuevo de tu mesa para ver el menú y hacer tu pedido.
      </p>
    </div>
  `,
})
export class ExpiredQrComponent {}
