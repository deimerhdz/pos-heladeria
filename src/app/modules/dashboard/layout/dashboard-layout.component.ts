import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from './sidebar.component';
import { HeaderComponent } from './header.component';
import { LayoutService } from './layout.service';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { ToastContainerComponent } from '../../../shared/feedback/toast-container.component';
import { ConfirmDialogComponent } from '../../../shared/feedback/confirm-dialog.component';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent, ToastContainerComponent, ConfirmDialogComponent],
  template: `
    <div class="flex h-screen bg-gray-50 overflow-hidden">
      <!-- Overlay backdrop — solo visible en móvil cuando el sidebar está abierto -->
      @if (layoutService.sidebarOpen()) {
        <div
          class="fixed inset-0 bg-black/40 z-30 md:hidden"
          (click)="layoutService.close()"
        ></div>
      }

      <app-sidebar />

      <!--
        El sidebar es "fixed" en todos los breakpoints (spec 036, FR-012): en
        escritorio no ocupa espacio de flexbox por sí solo, así que este
        margen es lo que le cede el ancho al contenido cuando está colapsado
        (y se lo devuelve cuando vuelve a abrirse). En móvil no aplica
        (prefijo "md:" en el nombre de la clase) — ahí sigue siendo un
        slide-over con backdrop, sin desplazar el contenido.
      -->
      <div
        class="flex flex-col flex-1 min-w-0 overflow-hidden transition-[margin-left] duration-300 ease-in-out"
        [class.md:ml-64]="layoutService.sidebarOpen()"
      >
        <app-header />
        <main class="flex-1 overflow-y-auto p-4 md:p-6">
          <router-outlet />
        </main>
      </div>

      <app-toast-container />
      <app-confirm-dialog />
    </div>
  `,
})
export class DashboardLayoutComponent implements OnInit {
  readonly layoutService = inject(LayoutService);
  private readonly tenantInfo = inject(TenantInfoService);

  /** Carga el branding del negocio una vez para todo el dashboard (lo pinta el sidebar). */
  ngOnInit(): void {
    void this.tenantInfo.load();
  }

  constructor() {
    inject(Router).events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        // Spec 036 (FR-012): `sidebarOpen()` ahora también controla el panel
        // de escritorio, no solo el slide-over móvil — cerrar sin condición
        // en cada navegación (como antes) colapsaba el sidebar de escritorio
        // en cuanto el usuario cambiaba de página, perdiendo su elección.
        // Solo tiene sentido auto-cerrar en móvil (el slide-over debe
        // taparse tras navegar); en escritorio la navegación no debe tocar
        // el estado del sidebar.
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
          this.layoutService.close();
        }
      });
  }
}
