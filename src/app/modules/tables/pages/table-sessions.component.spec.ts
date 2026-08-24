import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryClient, provideTanStackQuery } from '@tanstack/angular-query-experimental';
import { TableSessionsComponent } from './table-sessions.component';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { PromotionService } from '../../promotions/services/promotion.service';

/** Spec 029, Historia 2: el atajo F4 (descuento manual) se retiró por
 *  completo — presionarlo ya no dispara ninguna acción. No se llama
 *  `fixture.detectChanges()` a propósito: evita `ngOnInit()`/`store.init()`
 *  (que dispara varias peticiones HTTP no relacionadas con este atajo) — se
 *  ejercita `onKey()` directamente sobre la instancia del componente. */
describe('TableSessionsComponent — atajo F4 retirado (spec 029)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        PosTerminalStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
  });

  it('F4 no produce ningún efecto observable', () => {
    const event = new KeyboardEvent('keydown', { key: 'F4', cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    expect(() => fixture.componentInstance.onKey(event)).not.toThrow();
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});

/** Spec 029, Historia 4 (FR-001): el diálogo de éxito ya no imprime el caso
 *  de un solo comprobante — duplicaba "Imprimir Factura" de la barra
 *  lateral. El caso de cuenta dividida (varios comprobantes) sí se
 *  conserva. `store.init()` se anula (`vi.spyOn`) para poder llamar
 *  `fixture.detectChanges()` y renderizar el diálogo sin disparar las
 *  peticiones HTTP de `ngOnInit`, ajenas a lo que prueba este bloque.
 *
 *  `TableSessionsComponent` declara `providers: [PosTerminalStore]` en su
 *  propio `@Component` (instancia aislada por componente, no la del
 *  `TestBed`) — hay que tomar el store desde `fixture.componentInstance`,
 *  no desde `TestBed.inject`, o el mock de `init()` queda sobre una
 *  instancia distinta a la que usa el componente. */
describe('TableSessionsComponent — diálogo de éxito sin botón duplicado (spec 029)', () => {
  let fixture: ComponentFixture<TableSessionsComponent>;
  let store: PosTerminalStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TableSessionsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: PromotionService, useValue: { loadActive: () => {}, activePromotions: () => [], ready: () => false, now: () => new Date() } },
      ],
    });
    fixture = TestBed.createComponent(TableSessionsComponent);
    store = fixture.componentInstance.store;
    vi.spyOn(store, 'init').mockResolvedValue(undefined);
  });

  const printButtons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).filter((b) =>
      (b as HTMLButtonElement).textContent?.includes('🧾'),
    ) as HTMLButtonElement[];

  it('un solo comprobante: no ofrece ningún botón de impresión en el diálogo', () => {
    store.successOpen.set(true);
    store.lastSale.set({ total: 10000, customer: 'Consumidor Final' });
    store.lastReceipts.set([{ saleId: 's1', customerName: null, total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number]]);
    fixture.detectChanges();

    expect(printButtons()).toHaveLength(0);
  });

  it('cuenta dividida: conserva "Imprimir todos" y el botón por comensal', () => {
    store.successOpen.set(true);
    store.lastSale.set({ total: 20000, customer: 'Mostrador' });
    store.lastReceipts.set([
      { saleId: 's1', customerName: 'Ana', total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number],
      { saleId: 's2', customerName: 'Beto', total: 10000 } as ReturnType<PosTerminalStore['lastReceipts']>[number],
    ]);
    fixture.detectChanges();

    const textos = printButtons().map((b) => b.textContent?.trim());
    expect(textos).toContain('🧾 Imprimir todos');
    expect(textos.filter((t) => t === '🧾 Imprimir')).toHaveLength(2);
  });
});
