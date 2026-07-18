import { DiningOrderStatus } from '../tables/interfaces/dining.interface';

/** Order (comanda) billing statuses → display label / badge classes. */
const ORDER_STATUS: Record<DiningOrderStatus, { label: string; classes: string }> = {
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
