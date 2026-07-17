import { DiningOrderStatus } from '../tables/interfaces/dining.interface';

/** Backend order statuses → display label / badge classes. */
const ORDER_STATUS: Record<DiningOrderStatus, { label: string; classes: string }> = {
  pending: { label: 'En espera', classes: 'bg-amber-100 text-amber-700' },
  preparing: { label: 'En preparación', classes: 'bg-blue-100 text-blue-700' },
  served: { label: 'Servida', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelada', classes: 'bg-gray-100 text-gray-500' },
};

export function orderStatusLabel(status: DiningOrderStatus): string {
  return ORDER_STATUS[status]?.label ?? status;
}

export function orderStatusClass(status: DiningOrderStatus): string {
  return ORDER_STATUS[status]?.classes ?? 'bg-gray-100 text-gray-500';
}
