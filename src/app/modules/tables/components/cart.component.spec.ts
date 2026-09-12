import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CartComponent } from './cart.component';
import { CartLine, DiningCartService } from '../services/dining-cart.service';

/**
 * spec 081 (US2/US3): el paso de +/- de cada línea lo decide
 * `DiningCartService.stepFor(line)` (research.md D3) — este fake expone un mapa
 * simple para poder fijar el paso de cada línea sin pasar por HTTP real.
 */
class FakeDiningCartService {
  readonly lines = signal<CartLine[]>([]);
  readonly total = signal(0);
  readonly busy = signal(false);
  readonly isEmpty = signal(false);
  steps = new Map<string, number>();
  stepFor(line: CartLine): number {
    return this.steps.get(line.id) ?? 1;
  }
}

function line(partial: Partial<CartLine> = {}): CartLine {
  return {
    id: 'i1',
    productName: 'Producto',
    variantName: 'Único',
    optionNames: [],
    quantity: 2,
    notes: null,
    unitPrice: 5000,
    lineTotal: 10000,
    productVariantId: 'v1',
    optionKey: '',
    ...partial,
  };
}

describe('CartComponent', () => {
  let fixture: ComponentFixture<CartComponent>;
  let component: CartComponent;
  let cart: FakeDiningCartService;

  function create(): void {
    TestBed.resetTestingModule();
    cart = new FakeDiningCartService();
    TestBed.configureTestingModule({
      imports: [CartComponent],
      providers: [{ provide: DiningCartService, useValue: cart }],
    });
    fixture = TestBed.createComponent(CartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function buttons(): { minus: HTMLButtonElement; plus: HTMLButtonElement } {
    const els = fixture.nativeElement.querySelectorAll('button');
    const minus = Array.from(els as NodeListOf<HTMLButtonElement>).find((b) => b.textContent?.trim() === '−')!;
    const plus = Array.from(els as NodeListOf<HTMLButtonElement>).find((b) => b.textContent?.trim() === '+')!;
    return { minus, plus };
  }

  // ── spec 081 (US2): el paso lo decide stepFor(line), no siempre 1 ─────────

  it('el botón "+" emite quantity + stepFor(line) para una línea con paso registrado (FR-004)', () => {
    create();
    cart.lines.set([line({ id: 'i1', quantity: 2 })]);
    cart.steps.set('i1', 2);
    fixture.detectChanges();

    let emitted: { itemId: string; quantity: number } | undefined;
    component.quantityChanged.subscribe((e) => (emitted = e));
    buttons().plus.click();

    expect(emitted).toEqual({ itemId: 'i1', quantity: 4 });
  });

  it('el botón "−" emite quantity - stepFor(line), retirando la línea al llegar a 0 (FR-006)', () => {
    create();
    cart.lines.set([line({ id: 'i1', quantity: 2 })]);
    cart.steps.set('i1', 2);
    fixture.detectChanges();

    let emitted: { itemId: string; quantity: number } | undefined;
    component.quantityChanged.subscribe((e) => (emitted = e));
    buttons().minus.click();

    // setQuantity() del servicio real retira la línea cuando la cantidad llega a 0
    // (dining-cart.service.ts, sin cambios) — este componente solo emite el valor.
    expect(emitted).toEqual({ itemId: 'i1', quantity: 0 });
  });

  it('con quantity == 4 y paso 2, "−" baja a 2 (un paso completo), no a 3', () => {
    create();
    cart.lines.set([line({ id: 'i1', quantity: 4 })]);
    cart.steps.set('i1', 2);
    fixture.detectChanges();

    let emitted: { itemId: string; quantity: number } | undefined;
    component.quantityChanged.subscribe((e) => (emitted = e));
    buttons().minus.click();

    expect(emitted).toEqual({ itemId: 'i1', quantity: 2 });
  });

  // ── spec 081 (US3): sin paso registrado, se comporta igual que siempre ────

  it('sin paso registrado (línea agregada desde una categoría normal), +/- suman y restan de a 1 (FR-009/FR-010)', () => {
    create();
    cart.lines.set([line({ id: 'i1', quantity: 1 })]); // stepFor(i1) == 1, por defecto del fake
    fixture.detectChanges();

    let emitted: { itemId: string; quantity: number } | undefined;
    component.quantityChanged.subscribe((e) => (emitted = e));
    buttons().plus.click();

    expect(emitted).toEqual({ itemId: 'i1', quantity: 2 });
  });
});
