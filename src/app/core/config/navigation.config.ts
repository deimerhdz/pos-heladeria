import { NavItem } from '../interfaces/navigation.interface';
import { UserRole } from '../interfaces/user.interface';

export const NAV_ITEMS: NavItem[] = [
  // Home por rol
  { label: 'Dashboard',   icon: '🏠', route: '/dashboard/admin',      roles: [UserRole.ADMIN] },
  { label: 'Caja',        icon: '💳', route: '/dashboard/caja',        roles: [UserRole.CASHIER] },
  { label: 'Cocina',      icon: '🍳', route: '/dashboard/cocina',      roles: [UserRole.STAFF] },

  // Compartidos
  { label: 'Órdenes',     icon: '📋', route: '/dashboard/orders',      roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.STAFF] },
  { label: 'Productos',   icon: '🍦', route: '/dashboard/products',    roles: [UserRole.ADMIN, UserRole.CASHIER] },
  { label: 'Mesas',       icon: '🪑', route: '/dashboard/tables',      roles: [UserRole.ADMIN, UserRole.CASHIER] },

  // Solo Admin
  { label: 'Usuarios',    icon: '👥', route: '/dashboard/users',       roles: [UserRole.ADMIN] },
  { label: 'Categorías',  icon: '📂', route: '/dashboard/categories',  roles: [UserRole.ADMIN] },
  { label: 'Caja',        icon: '💰', route: '/dashboard/caja',        roles: [UserRole.ADMIN] },
  { label: 'Cocina',      icon: '👨‍🍳', route: '/dashboard/cocina',     roles: [UserRole.ADMIN] },
  { label: 'Reportes',    icon: '📊', route: '/dashboard/reports',     roles: [UserRole.ADMIN] },
];
