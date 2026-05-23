import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from './sidebar.component';
import { HeaderComponent } from './header.component';
import { LayoutService } from './layout.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent],
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

      <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
        <app-header />
        <main class="flex-1 overflow-y-auto p-4 md:p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class DashboardLayoutComponent {
  readonly layoutService = inject(LayoutService);

  constructor() {
    inject(Router).events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.layoutService.close());
  }
}
