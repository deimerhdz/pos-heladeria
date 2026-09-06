import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { VisibleInterval, startVisibleInterval } from '../../../core/realtime/visible-interval';

/**
 * Cabecera de terminal compartida entre `table-sessions.component.ts` y
 * `manual-order-page.component.ts` (rediseño de `create-order/code.html`):
 * turno, reloj/fecha, estado de conexión, turno de caja y bloqueo de
 * terminal. Sin `@Input`/`@Output` -- resuelve `PosTerminalStore` por DI
 * jerárquica, ya que ambas páginas host la proveen (`providers:
 * [PosTerminalStore]`), así que este componente, declarado en su template,
 * recibe la misma instancia sin que nadie se la pase explícitamente.
 */
@Component({
  selector: 'app-pos-terminal-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="h-14 bg-white border-b border-[#e5e7eb] px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0">
      <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <div class="flex flex-col min-w-0">
          <span class="text-[11px] font-bold uppercase tracking-wider text-[#111827] truncate">Terminal de mesas</span>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="w-2 h-2 rounded-[6px] shrink-0" [class]="connectionDotClass()"></span>
            <span class="text-[11px] font-semibold text-[#4b5563] whitespace-nowrap">{{ connectionLabel() }}</span>
          </div>
        </div>
        <div class="hidden sm:block h-6 w-px bg-[#e5e7eb] mx-1"></div>
        <div class="hidden sm:flex items-center gap-2 text-[#4b5563]">
          <svg class="w-[18px] h-[18px] stroke-[#6b7280] shrink-0" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span class="text-[12px] font-medium text-[#4b5563] whitespace-nowrap">{{ shiftLabel() }}</span>
        </div>
      </div>

      <div class="hidden md:flex items-center gap-2 px-3 py-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-[6px] shrink-0">
        <span class="text-[12px] font-semibold text-[#111827] tabular-nums tracking-[-0.01em]">{{ clockLabel() }}</span>
        <span class="text-[#6b7280] text-[11px]">·</span>
        <span class="text-[11px] text-[#6b7280] tabular-nums">{{ dateLabel() }}</span>
      </div>

      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span class="hidden sm:flex h-9 px-3 rounded-[6px] bg-[#f3f4f6] text-[#111827] font-semibold text-[12px] items-center">POS</span>
        <div class="hidden sm:block h-6 w-px bg-[#e5e7eb]"></div>
        @if (store.cashIsOpen()) {
          <div
            class="h-9 px-2.5 sm:px-3 rounded-[6px] bg-[#f3f4f6] flex items-center gap-1.5 text-[12px] font-medium text-[#15803d]"
            [title]="'Turno abierto' + (store.cashShift()?.user_name ? ' · ' + store.cashShift()?.user_name : '')"
          >
            <span class="w-2 h-2 rounded-[6px] bg-[#15803d] shrink-0"></span>
            <span class="hidden sm:inline whitespace-nowrap">Caja abierta</span>
          </div>
        } @else {
          <button
            (click)="goToCash()"
            title="Abrir turno de caja"
            class="h-9 px-2.5 sm:px-3 rounded-[6px] border border-[#e5e7eb] bg-transparent hover:bg-[#f3f4f6] flex items-center gap-1.5 text-[12px] font-medium text-[#4b5563] transition-colors"
          >
            <svg class="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
              <rect height="14" rx="2" width="20" x="2" y="5"></rect>
              <line x1="2" x2="22" y1="10" y2="10"></line>
            </svg>
            <span class="hidden sm:inline">Turno caja</span>
          </button>
        }
        <button
          (click)="onLockTerminal()"
          title="Bloquear terminal"
          class="h-9 w-9 rounded-[6px] border border-[#e5e7eb] bg-transparent hover:bg-[#f3f4f6] flex items-center justify-center text-[#4b5563] transition-colors"
        >
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" viewBox="0 0 24 24">
            <rect height="11" rx="2" ry="2" width="18" x="3" y="11"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </button>
      </div>
    </header>
  `,
})
export class PosTerminalHeaderComponent implements OnInit, OnDestroy {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  /** Reloj/fecha/turno de la barra superior -- un tick por minuto (no hace
   *  falta más precisión), pausado en segundo plano. */
  readonly clockLabel = signal(this.formatClock(new Date()));
  readonly dateLabel = signal(this.formatDate(new Date()));
  readonly shiftLabel = signal(this.formatShift(new Date()));
  private clockTimer?: VisibleInterval;

  ngOnInit(): void {
    this.clockTimer = startVisibleInterval(() => {
      const now = new Date();
      this.clockLabel.set(this.formatClock(now));
      this.dateLabel.set(this.formatDate(now));
      this.shiftLabel.set(this.formatShift(now));
    }, 30_000);
  }

  ngOnDestroy(): void {
    this.clockTimer?.stop();
  }

  private formatClock(d: Date): string {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private formatDate(d: Date): string {
    return d.toLocaleDateString('es-CO');
  }

  /** "Turno {Mañana/Tarde/Noche}: {usuario}" -- mismo dato que ya muestra el
   *  header global del dashboard (AuthService.currentUser()). */
  private formatShift(d: Date): string {
    const h = d.getHours();
    const periodo = h < 12 ? 'Mañana' : h < 19 ? 'Tarde' : 'Noche';
    const nombre = this.authService.currentUser()?.name;
    return nombre ? `Turno ${periodo}: ${nombre}` : `Turno ${periodo}`;
  }

  connectionDotClass(): string {
    return this.store.realtimeStatus() === 'open' ? 'bg-[#10b981]' : 'bg-[#f59e0b]';
  }

  connectionLabel(): string {
    return this.store.realtimeStatus() === 'open' ? 'En línea · Sincronizado' : 'Sincronizando…';
  }

  /** Botón/insignia de turno de caja del header: la apertura en sí vive en la
   *  página de caja (ese flujo ya existe ahí) -- aquí solo se navega, sin
   *  duplicar ese estado dentro de la terminal. */
  goToCash(): void {
    this.router.navigate(['/dashboard/caja']);
  }

  /** "Bloquear Terminal" del mockup: no existe ningún mecanismo de bloqueo de
   *  sesión/PIN en el backend todavía -- se deja el botón (fidelidad visual)
   *  pero avisa en vez de fingir una función que no está implementada. */
  onLockTerminal(): void {
    this.toast.info('El bloqueo de terminal todavía no está disponible.');
  }
}
