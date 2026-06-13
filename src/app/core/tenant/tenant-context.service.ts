import { computed, Injectable, signal, Signal } from '@angular/core';
import { TenantContext, TenantKind } from './tenant-context.model';

/**
 * Global, synchronous, read-only holder of the resolved tenant context.
 * Populated exactly once at startup by the tenant initializer; consumers only
 * read derived signals.
 */
@Injectable({ providedIn: 'root' })
export class TenantContextService {
  private readonly _context = signal<TenantContext | null>(null);

  /** The resolved context. Throws if read before initialization. */
  readonly context: Signal<TenantContext> = computed(() => {
    const ctx = this._context();
    if (ctx === null) {
      throw new Error(
        'TenantContextService read before initialization. ' +
          'Ensure provideTenantInitializer() runs at startup.'
      );
    }
    return ctx;
  });

  readonly isSuperAdmin: Signal<boolean> = computed(
    () => this.context().kind === TenantKind.SuperAdmin
  );

  readonly tenantSlug: Signal<string | null> = computed(() => {
    const ctx = this.context();
    return ctx.kind === TenantKind.Tenant ? ctx.slug : null;
  });

  /** Fix the context once. Intended for the startup initializer only. */
  initialize(context: TenantContext): void {
    if (this._context() !== null) {
      throw new Error('TenantContextService.initialize() called more than once.');
    }
    this._context.set(context);
  }
}
