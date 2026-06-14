import { OrderStatus } from '../tables/interfaces/table.interface';

/** Backend order statuses → display label / badge classes. */
const ORDER_STATUS: Record<OrderStatus, { label: string; classes: string }> = {
  pending: { label: 'En espera', classes: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'En preparación', classes: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completada', classes: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelada', classes: 'bg-gray-100 text-gray-500' },
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS[status]?.label ?? status;
}

export function orderStatusClass(status: OrderStatus): string {
  return ORDER_STATUS[status]?.classes ?? 'bg-gray-100 text-gray-500';
}
