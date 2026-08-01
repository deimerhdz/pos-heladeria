import { applyKitchenEvent, KitchenMergeState } from './kitchen-merge';
import { DiningOrder, DiningOrderItem } from '../interfaces/dining.interface';

function order(id: string, items: [string, DiningOrderItem['estado_cocina']][]): DiningOrder {
  return {
    id,
    channel: 'qr',
    status: 'abierta',
    created_at: '2026-08-01T12:00:00',
    items: items.map(([itemId, estado_cocina]) => ({
      id: itemId,
      product_variant_id: 'v1',
      quantity: 1,
      unit_price: '4000',
      estado_cocina,
    })) as DiningOrderItem[],
  } as DiningOrder;
}

function state(over: Partial<KitchenMergeState> = {}): KitchenMergeState {
  return { appliedV: new Map(), busy: new Set(), ...over };
}

function estadoDe(orders: DiningOrder[], itemId: string): string | undefined {
  for (const o of orders) {
    const it = (o.items ?? []).find((i) => i.id === itemId);
    if (it) return it.estado_cocina;
  }
  return undefined;
}

describe('applyKitchenEvent', () => {
  const tablero = () => [order('o1', [['i1', 'pendiente'], ['i2', 'pendiente']])];

  it('aplica un evento nuevo y parchea solo su ítem', () => {
    const r = applyKitchenEvent(
      tablero(),
      { item_id: 'i1', estado_cocina: 'en_preparacion', v: 10 },
      state(),
    );

    expect(r.action).toBe('apply');
    if (r.action !== 'apply') return;
    expect(estadoDe(r.orders, 'i1')).toBe('en_preparacion');
    expect(estadoDe(r.orders, 'i2')).toBe('pendiente');
  });

  it('no muta el array original', () => {
    const original = tablero();
    applyKitchenEvent(original, { item_id: 'i1', estado_cocina: 'listo', v: 10 }, state());
    expect(estadoDe(original, 'i1')).toBe('pendiente');
  });

  it('descarta un evento con versión menor a la ya aplicada', () => {
    const s = state({ appliedV: new Map([['i1', 20]]) });
    const r = applyKitchenEvent(tablero(), { item_id: 'i1', estado_cocina: 'pendiente', v: 10 }, s);
    expect(r.action).toBe('drop');
  });

  it('descarta también la versión igual (el eco de la propia escritura)', () => {
    const s = state({ appliedV: new Map([['i1', 20]]) });
    const r = applyKitchenEvent(tablero(), { item_id: 'i1', estado_cocina: 'listo', v: 20 }, s);
    expect(r.action).toBe('drop');
  });

  it('aplaza mientras el ítem tiene un PATCH en vuelo', () => {
    const s = state({ busy: new Set(['i1']) });
    const r = applyKitchenEvent(tablero(), { item_id: 'i1', estado_cocina: 'listo', v: 99 }, s);
    expect(r.action).toBe('defer');
    // Y no se registra la versión: al recargar mandará el servidor.
    expect(s.appliedV.has('i1')).toBe(false);
  });

  it('`busy` gana sobre la versión: no se descarta lo que está en vuelo', () => {
    const s = state({ busy: new Set(['i1']), appliedV: new Map([['i1', 100]]) });
    const r = applyKitchenEvent(tablero(), { item_id: 'i1', estado_cocina: 'listo', v: 1 }, s);
    expect(r.action).toBe('defer');
  });

  it('la escritura optimista no se revierte con un evento anterior', () => {
    // El cocinero avanzó a 'listo' y el PATCH devolvió rt_v=50.
    const s = state({ appliedV: new Map([['i1', 50]]) });
    const yaListo = [order('o1', [['i1', 'listo'], ['i2', 'pendiente']])];

    // Llega tarde el evento de la transición anterior (v=40).
    const r = applyKitchenEvent(
      yaListo,
      { item_id: 'i1', estado_cocina: 'en_preparacion', v: 40 },
      s,
    );

    expect(r.action).toBe('drop');
    expect(estadoDe(yaListo, 'i1')).toBe('listo');
  });

  it('registra la versión aunque el ítem no esté en el tablero', () => {
    const s = state();
    const r = applyKitchenEvent(tablero(), { item_id: 'fuera', estado_cocina: 'listo', v: 7 }, s);

    expect(r.action).toBe('drop');
    // Para que un evento posterior pero más viejo no lo resucite.
    expect(s.appliedV.get('fuera')).toBe(7);
  });

  it('acepta eventos sucesivos en orden creciente', () => {
    const s = state();
    let orders = tablero();
    for (const [v, estado] of [[10, 'en_preparacion'], [20, 'listo'], [30, 'entregado']] as const) {
      const r = applyKitchenEvent(orders, { item_id: 'i1', estado_cocina: estado, v }, s);
      expect(r.action).toBe('apply');
      if (r.action === 'apply') orders = r.orders;
    }
    expect(estadoDe(orders, 'i1')).toBe('entregado');
    expect(s.appliedV.get('i1')).toBe(30);
  });
});
