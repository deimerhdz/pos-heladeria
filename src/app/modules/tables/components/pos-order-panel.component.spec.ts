import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { PosOrderPanelComponent } from './pos-order-panel.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';
import { DiningOrder } from '../interfaces/dining.interface';

/** Pedido con un solo ítem ya en cocina ('listo'), origen mesero. `paid` se
 *  fija por test (spec 029, Historia 1: "Anular" desaparece una vez pagado). */
function orderConItemListo(paid: boolean): DiningOrder {
  return {
    id: 'o1',
    channel: 'waiter',
    status: 'abierta',
    version: 1,
    dining_table_id: 't1',
    customer_name: null,
    created_at: '2026-08-21T10:00:00',
    paid,
    items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: 'listo' }],
  } as DiningOrder;
}

/** Spec 029, Historia 1 (FR-007): un pedido ya pagado no se puede anular —
 *  el botón "Anular" deja de mostrarse en el panel de pedido. */
describe('PosOrderPanelComponent — anulación bloqueada tras pago', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const anularButton = (): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLButtonElement).textContent?.trim() === 'Anular',
    ) as HTMLButtonElement | undefined;

  it('no muestra "Anular" cuando el pedido seleccionado ya está pagado', () => {
    store.orders.set([orderConItemListo(true)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(anularButton()).toBeUndefined();
  });

  it('sí muestra "Anular" cuando el pedido seleccionado todavía no está pagado', () => {
    store.orders.set([orderConItemListo(false)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();

    expect(anularButton()).toBeDefined();
  });
});

/** Spec 029, Historia 2 (FR-009/010/011): ningún control de descuento
 *  manual — el atajo F4 y su popover se retiraron por completo; el único
 *  descuento posible es el automático por promoción. */
describe('PosOrderPanelComponent — sin descuento manual', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.orders.set([orderConItemListo(false)]);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('no existe ningún botón/campo para aplicar un descuento manual', () => {
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Aplicar descuento');
    expect(texto).not.toContain('F4');
    expect(fixture.nativeElement.querySelector('input[type="number"]')).toBeNull();
  });

  it('el descuento mostrado en el total es siempre $0 sin promociones activas', () => {
    expect(store.totals().discount).toBe(0);
  });
});

/** Spec 029, Historia 3 (FR-013): el encabezado del pedido distingue tres
 *  estados — "en preparación", "pago pendiente" y "listo para cobrar" —, ya
 *  no solo dos. */
describe('PosOrderPanelComponent — encabezado de tres estados (spec 029)', () => {
  let fixture: ComponentFixture<PosOrderPanelComponent>;
  let store: PosTerminalStore;
  let http: HttpTestingController;

  function orderCon(estado: 'pendiente' | 'listo', paid: boolean): DiningOrder {
    return {
      id: 'o1',
      channel: 'waiter',
      status: 'abierta',
      version: 1,
      dining_table_id: 't1',
      customer_name: null,
      created_at: '2026-08-21T10:00:00',
      paid,
      items: [{ id: 'i1', product_variant_id: 'v1', quantity: 1, unit_price: '10000', estado_cocina: estado }],
    } as DiningOrder;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PosOrderPanelComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });

    fixture = TestBed.createComponent(PosOrderPanelComponent);
    store = TestBed.inject(PosTerminalStore);
    http = TestBed.inject(HttpTestingController);
    store.selectedTableId.set('t1');
    store.selectedOrderId.set('o1');
  });

  afterEach(() => http.verify());

  it('cocina en curso → "en preparación", sin importar el pago', () => {
    store.orders.set([orderCon('pendiente', false)]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('en preparación');
  });

  it('cocina lista pero sin pagar → "pago pendiente"', () => {
    store.orders.set([orderCon('listo', false)]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('pago pendiente');
  });

  it('cocina lista y pagado → "listo para cobrar"', () => {
    store.orders.set([orderCon('listo', true)]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('listo para cobrar');
  });
});
