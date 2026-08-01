import { DiningOrder, KitchenStatus } from '../interfaces/dining.interface';

/**
 * Aplicación de un evento de cocina sobre el tablero, **sin revertir lo que el
 * cocinero acaba de hacer**.
 *
 * El KDS escribe de forma optimista: tras el `PATCH` parchea `estado_cocina`
 * localmente en vez de recargar. Un evento que llegue justo a la vez —de otra
 * pantalla, o el eco de la propia escritura pasando por el bus— puede traer un
 * estado anterior y revertirlo visualmente. Ha pasado.
 *
 * Dos defensas, en este orden:
 *
 * 1. **`busy`**: si el ítem tiene un PATCH en vuelo, no se toca. El resultado
 *    del PATCH es más fresco que cualquier evento anterior a él, y aplicar el
 *    evento haría parpadear la tarjeta bajo el dedo del cocinero. Se aplaza.
 * 2. **`appliedV`**: se descarta cualquier evento con versión menor o igual a la
 *    ya aplicada a ese ítem. `v` viene del id del stream de Redis, que es
 *    estrictamente monótono por tenant, así que el orden es fiable aunque los
 *    eventos lleguen desordenados.
 */
export interface KitchenEvent {
  readonly item_id: string;
  readonly estado_cocina: string;
  readonly v: number;
}

export interface KitchenMergeState {
  /** Última versión aplicada por ítem. Se siembra con el `rt_v` del PATCH. */
  readonly appliedV: Map<string, number>;
  /** Ítems con una escritura en vuelo. */
  readonly busy: ReadonlySet<string>;
}

export type KitchenMergeResult =
  /** Aplicar: `orders` ya viene con el ítem parcheado. */
  | { readonly action: 'apply'; readonly orders: DiningOrder[] }
  /** Descartar: el evento es más viejo que lo ya aplicado. */
  | { readonly action: 'drop' }
  /** Aplazar: hay un PATCH en vuelo; recargar cuando termine. */
  | { readonly action: 'defer' };

export function applyKitchenEvent(
  orders: DiningOrder[],
  ev: KitchenEvent,
  state: KitchenMergeState,
): KitchenMergeResult {
  if (state.busy.has(ev.item_id)) return { action: 'defer' };

  const aplicada = state.appliedV.get(ev.item_id) ?? 0;
  if (ev.v <= aplicada) return { action: 'drop' };

  let tocado = false;
  const next = orders.map((order) => {
    if (!(order.items ?? []).some((i) => i.id === ev.item_id)) return order;
    tocado = true;
    return {
      ...order,
      items: (order.items ?? []).map((i) =>
        i.id === ev.item_id
          ? { ...i, estado_cocina: ev.estado_cocina as KitchenStatus }
          : i,
      ),
    };
  });

  // El ítem no está en el tablero (otra mesa, o ya salió de las columnas
  // activas): registrar la versión igual, para que un evento posterior más
  // viejo no lo resucite.
  state.appliedV.set(ev.item_id, ev.v);
  return tocado ? { action: 'apply', orders: next } : { action: 'drop' };
}
