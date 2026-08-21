import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { ManualOrderPanelComponent } from './manual-order-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';

/** Feature 028, T021/T026: CTA "+ Crear Orden Manual" en el estado vacío de
 *  una mesa libre. El atajo F3 se prueba en el store (`startManualOrder`),
 *  que es lo que dispara este mismo botón y lo que enlaza `table-sessions
 *  .component.ts` con `@HostListener('window:keydown')`. */
describe('ManualOrderPanelComponent', () => {
  let fixture: ComponentFixture<ManualOrderPanelComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ManualOrderPanelComponent],
      providers: [
        PosTerminalStore,
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
  });

  it('el botón "+ Crear Orden Manual" empieza a armar el pedido', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.includes('Crear Orden Manual'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    fixture.detectChanges();

    expect(store.manualOrderBuilding()).toBe(true);
    expect(store.catalogOpen()).toBe(true);
  });

  it('menciona el atajo F3', () => {
    store.selectedTableId.set('t1');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('F3');
  });
});
