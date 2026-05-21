import { User, UserRole } from '../../core/interfaces/user.interface';

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type TableStatus = 'available' | 'occupied';

export interface Order {
  id: string;
  tableNumber: number;
  items: string[];
  status: OrderStatus;
  total: number;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
}

export interface Table {
  id: string;
  number: number;
  status: TableStatus;
  capacity: number;
}

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Ana García',   email: 'admin@heladeria.com',   role: UserRole.ADMIN },
  { id: '2', name: 'Carlos López', email: 'cajero@heladeria.com',  role: UserRole.CASHIER },
  { id: '3', name: 'María Torres', email: 'cocina@heladeria.com',  role: UserRole.STAFF },
];

export const MOCK_ORDERS: Order[] = [
  { id: 'ORD-001', tableNumber: 3, items: ['Sundae Fresa', 'Agua Mineral'],      status: 'pending',   total: 18.50, createdAt: '10:15' },
  { id: 'ORD-002', tableNumber: 7, items: ['Copa Chocolate', 'Jugo Natural'],    status: 'preparing', total: 22.00, createdAt: '10:22' },
  { id: 'ORD-003', tableNumber: 1, items: ['Waffle con Helado'],                  status: 'preparing', total: 15.00, createdAt: '10:30' },
  { id: 'ORD-004', tableNumber: 5, items: ['Batido Vainilla', 'Sundae Mango'],   status: 'ready',     total: 28.00, createdAt: '10:05' },
  { id: 'ORD-005', tableNumber: 2, items: ['Copa Tres Leches'],                   status: 'pending',   total: 12.50, createdAt: '10:40' },
];

export const MOCK_PRODUCTS: Product[] = [
  { id: 'P-001', name: 'Sundae Fresa',       price: 12.50, category: 'Helados',  stock: 20 },
  { id: 'P-002', name: 'Copa Chocolate',     price: 14.00, category: 'Helados',  stock: 15 },
  { id: 'P-003', name: 'Waffle con Helado',  price: 15.00, category: 'Waffles',  stock: 10 },
  { id: 'P-004', name: 'Batido Vainilla',    price: 10.00, category: 'Batidos',  stock: 25 },
  { id: 'P-005', name: 'Copa Tres Leches',   price: 12.50, category: 'Helados',  stock: 18 },
  { id: 'P-006', name: 'Jugo Natural',       price:  8.00, category: 'Bebidas',  stock: 30 },
];

export const MOCK_TABLES: Table[] = [
  { id: 'T-1', number: 1, status: 'occupied',  capacity: 4 },
  { id: 'T-2', number: 2, status: 'occupied',  capacity: 2 },
  { id: 'T-3', number: 3, status: 'occupied',  capacity: 6 },
  { id: 'T-4', number: 4, status: 'available', capacity: 4 },
  { id: 'T-5', number: 5, status: 'occupied',  capacity: 4 },
  { id: 'T-6', number: 6, status: 'available', capacity: 2 },
  { id: 'T-7', number: 7, status: 'occupied',  capacity: 4 },
  { id: 'T-8', number: 8, status: 'available', capacity: 6 },
];
