import {
  DiningOrder,
  DiningOrderStatus,
  KitchenStatus,
} from '../tables/interfaces/dining.interface';

/**
 * Fuente única de los estados del flujo de mesas y de cómo se pintan.
 *
 * Son **dos ejes independientes**: el pedido avanza por facturación
 * (`DiningOrderStatus`) y cada ítem avanza por cocina (`KitchenStatus`). La UI
 * necesita los dos para decidir qué se puede hacer.
 */

// ── Pedido (facturación) ───────────────────────────────────────────────────

const ORDER_STATUS: Record<DiningOrderStatus, { label: string; classes: string }> = {
  // Enviado por el comensal, pendiente de que el personal lo acepte.
  // No ha descontado inventario y cocina no lo ve.
  recibida: { label: 'Por confirmar', classes: 'bg-violet-100 text-violet-700' },
  abierta: { label: 'Abierta', classes: 'bg-amber-100 text-amber-700' },
  bloqueada: { label: 'Bloqueada', classes: 'bg-orange-100 text-orange-700' },
  pagada: { label: 'Pagada', classes: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', classes: 'bg-gray-100 text-gray-500' },
};

export function orderStatusLabel(status: DiningOrderStatus): string {
  return ORDER_STATUS[status]?.label ?? status;
}

export function orderStatusClass(status: DiningOrderStatus): string {
  return ORDER_STATUS[status]?.classes ?? 'bg-gray-100 text-gray-500';
}

/** Estados en los que el pedido ya no admite cambios. */
export const TERMINAL_ORDER_STATUSES: readonly DiningOrderStatus[] = ['pagada', 'cancelada'];

export function isTerminalOrder(status: DiningOrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

// ── Cocina (por ítem) ──────────────────────────────────────────────────────

const KITCHEN_STATUS: Record<KitchenStatus, { label: string; classes: string }> = {
  pendiente: { label: 'Pendiente', classes: 'bg-gray-100 text-gray-600' },
  en_preparacion: { label: 'En preparación', classes: 'bg-blue-100 text-blue-700' },
  listo: { label: 'Listo', classes: 'bg-green-100 text-green-700' },
  entregado: { label: 'Entregado', classes: 'bg-emerald-100 text-emerald-700' },
  anulado: { label: 'Anulado', classes: 'bg-gray-100 text-gray-400' },
};

export function kitchenStatusLabel(status: KitchenStatus): string {
  return KITCHEN_STATUS[status]?.label ?? status;
}

export function kitchenStatusClass(status: KitchenStatus): string {
  return KITCHEN_STATUS[status]?.classes ?? 'bg-gray-100 text-gray-500';
}

/**
 * Avance de cocina, solo hacia adelante. `null` = no hay siguiente paso.
 * Retroceder o saltarse un paso lo rechaza el backend con `409`.
 */
const KITCHEN_NEXT: Partial<Record<KitchenStatus, KitchenStatus>> = {
  pendiente: 'en_preparacion',
  en_preparacion: 'listo',
  listo: 'entregado',
};

export function nextKitchenStatus(status: KitchenStatus): KitchenStatus | null {
  return KITCHEN_NEXT[status] ?? null;
}

/** Estados de cocina que impiden bloquear/cobrar: la comida aún está en curso. */
export const KITCHEN_NOT_READY: readonly KitchenStatus[] = ['pendiente', 'en_preparacion'];

// ── Reglas que la UI necesita ──────────────────────────────────────────────

/** Un pedido `recibida` espera que el personal lo acepte para entrar a cocina. */
export function esperaConfirmacion(order: Pick<DiningOrder, 'status'>): boolean {
  return order.status === 'recibida';
}

/**
 * ¿Puede el **comensal** cancelar este pedido?
 *
 * Solo si nada se ha empezado a preparar: en `recibida` (nunca tocó inventario)
 * o en `abierta` con todos sus ítems aún `pendiente`. En cuanto cocina arranca,
 * el insumo ya se consumió y la cancelación es pérdida — decisión del personal,
 * no del cliente.
 *
 * Es la misma regla que aplica el backend; la UI la replica para ocultar el
 * botón en vez de dejar que el usuario choque con un `409`.
 */
export function puedeCancelarComensal(order: Pick<DiningOrder, 'status' | 'items'>): boolean {
  if (order.status === 'recibida') return true;
  if (order.status !== 'abierta') return false;
  const items = order.items ?? [];
  return items.every((it) => it.estado_cocina === 'pendiente' || it.estado_cocina === 'anulado');
}
