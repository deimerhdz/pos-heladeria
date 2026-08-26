import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ManualOrderPanelComponent } from './manual-order-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';

/**
 * Feature 028, T021/T026: estado vacío de una mesa libre. Spec 036 (ajuste
 * posterior): el CTA "+ Crear Orden Manual" ya no abre el catálogo embebido
 * (`startManualOrder()`) — navega a la vista dedicada
 * `manual-order-page.component.ts`. El atajo F3 se prueba en
 * `table-sessions.component.ts` (dispara la misma navegación).
 */
describe('ManualOrderPanelComponent', () => {
  let fixture: ComponentFixture<ManualOrderPanelComponent>;
  let store: PosTerminalStore;
  let router: Router;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManualOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // El store arrastra varios servicios que usan TanStack Query
        // (`PromotionService`, `SalesService`…) — hace falta un `QueryClient`
        // real en el TestBed aunque este spec no ejercite ninguno de sus datos.
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(ManualOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    router = TestBed.inject(Router);
  });

  it('el botón "+ Crear Orden Manual" navega a la vista dedicada de armado de pedido', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear Orden Manual'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/mesas-sesiones', 't1', 'orden-manual']);
  });

  it('sin mesa seleccionada, el CTA no navega', () => {
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear Orden Manual'),
    ) as HTMLButtonElement;
    button.click();

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('menciona el atajo F3', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('F3');
  });
});
