import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MenuCartService } from './menu-cart.service';
import { MenuApiService } from './menu-api.service';
import { CartItemResponse, CartResponse } from '../interfaces/table.interface';

function item(partial: Partial<CartItemResponse>): CartItemResponse {
  return {
    id: 'i1',
    product_id: 'p1',
    product_name: 'Coca-Cola',
    quantity: 1,
    unit_price: '2500.00',
    subtotal: '2500.00',
    table_session_id: 's1',
    customer_name: 'Juan',
    is_mine: true,
    ...partial,
  };
}

function cart(items: CartItemResponse[]): CartResponse {
  return { table_id: 't1', items, total: '0' };
}

describe('MenuCartService', () => {
  let service: MenuCartService;
  let api: {
    getCart: ReturnType<typeof vi.fn>;
    addCartItem: ReturnType<typeof vi.fn>;
    updateCartItem: ReturnType<typeof vi.fn>;
    removeCartItem: ReturnType<typeof vi.fn>;
    createOrder: ReturnType<typeof vi.fn>;
    getActiveOrders: ReturnType<typeof vi.fn>;
    extractError: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      getCart: vi.fn(),
      addCartItem: vi.fn(),
      updateCartItem: vi.fn(),
      removeCartItem: vi.fn(),
      createOrder: vi.fn(),
      getActiveOrders: vi.fn().mockResolvedValue([]),
      extractError: vi.fn().mockReturnValue('error'),
    };
    TestBed.configureTestingModule({
      providers: [MenuCartService, { provide: MenuApiService, useValue: api }],
    });
    service = TestBed.inject(MenuCartService);
  });

  it('derives mine/others and product quantity from is_mine', async () => {
    api.getCart.mockResolvedValue(
      cart([
        item({ id: 'a', product_id: 'p1', quantity: 2, is_mine: true }),
        item({ id: 'b', product_id: 'p2', is_mine: false, customer_name: 'Ana' }),
      ]),
    );
    await service.refresh();

    expect(service.myItems().map(i => i.id)).toEqual(['a']);
    expect(service.otherItems().map(i => i.id)).toEqual(['b']);
    expect(service.myQuantityForProduct('p1')).toBe(2);
    expect(service.myQuantityForProduct('p2')).toBe(0);
    expect(service.totalItems()).toBe(3);
  });

  it('decrementProduct removes the item when quantity reaches zero', async () => {
    api.getCart.mockResolvedValue(cart([item({ id: 'a', product_id: 'p1', quantity: 1 })]));
    await service.refresh();
    api.removeCartItem.mockResolvedValue(cart([]));

    await service.decrementProduct('p1');

    expect(api.removeCartItem).toHaveBeenCalledWith('a');
    expect(api.updateCartItem).not.toHaveBeenCalled();
  });

  it('loadActiveOrders fills the orders signal', async () => {
    api.getActiveOrders.mockResolvedValue([
      { id: 'o1', table_id: 't1', scope: 'table', status: 'pending', total: '5000.00', created_at: '2026-01-01' },
    ]);

    await service.loadActiveOrders();

    expect(service.orders().map(o => o.id)).toEqual(['o1']);
    expect(service.ordersError()).toBeNull();
  });

  it('createOrder refreshes the cart and loads active orders on success', async () => {
    api.createOrder.mockResolvedValue({ id: 'o1', scope: 'individual' });
    api.getCart.mockResolvedValue(cart([]));
    api.getActiveOrders.mockResolvedValue([
      { id: 'o1', table_id: 't1', scope: 'individual', status: 'pending', total: '2500.00', created_at: '2026-01-01' },
    ]);

    const ok = await service.createOrder('individual');

    expect(ok).toBe(true);
    expect(api.createOrder).toHaveBeenCalledWith('individual');
    expect(api.getCart).toHaveBeenCalled();
    expect(api.getActiveOrders).toHaveBeenCalled();
    expect(service.orders().length).toBe(1);
    expect(service.lastOrderConfirmed()).toBe(true);
  });

  it('createOrder surfaces an error and returns false on failure', async () => {
    api.createOrder.mockRejectedValue(new Error('boom'));

    const ok = await service.createOrder('table');

    expect(ok).toBe(false);
    expect(service.error()).toBe('error');
  });
});
