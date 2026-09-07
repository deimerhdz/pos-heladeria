import { Component, OnDestroy, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DinerTokenStore } from '../services/diner-token.store';

/**
 * Shell sin `path` que envuelve `/menu/t/:token` (`PublicMenuComponent`) y
 * `/menu/t/:token/checkout/**` (spec 077, corrección post-implementación).
 *
 * Antes cada uno abría/cerraba su propia conexión SSE del comensal
 * (`RealtimeService.connectDiner()`/`.disconnect()`), y al ser rutas
 * hermanas, navegar del menú al checkout destruía `PublicMenuComponent` y con
 * él la única conexión — el comensal quedaba sin tiempo real mientras
 * pagaba, justo cuando podía llegarle la confirmación de pago. Este shell es
 * ahora el único dueño de esa conexión (mismo rol que `DashboardLayoutComponent`
 * ya cumple del lado del staff), así que sobrevive a la navegación entre el
 * menú y el checkout.
 *
 * El comensal no tiene sesión hasta que confirma su nombre, así que no hay un
 * `ngOnInit` imperativo: se reacciona al signal de `DinerTokenStore`, que es
 * la misma señal que ya usan `exit()`/`expireSession()` de `PublicMenuComponent`
 * para marcar "se acabó la sesión".
 */
@Component({
  selector: 'app-diner-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class DinerShellComponent implements OnDestroy {
  private readonly realtime = inject(RealtimeService);
  private readonly tokenStore = inject(DinerTokenStore);

  constructor() {
    effect(() => {
      const token = this.tokenStore.token();
      if (token) {
        this.realtime.connectDiner(token);
      } else {
        this.realtime.disconnect();
      }
    });
  }

  ngOnDestroy(): void {
    this.realtime.disconnect();
  }
}
