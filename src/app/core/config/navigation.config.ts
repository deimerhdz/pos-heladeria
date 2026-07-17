import { NavItem } from '../interfaces/navigation.interface';
import { UserRole } from '../interfaces/user.interface';

export const NAV_ITEMS: NavItem[] = [
  // Home por rol
  { label: 'Dashboard', icon: '🏠', route: '/dashboard/admin', roles: [UserRole.ADMIN] },
  { label: 'Caja', icon: '💳', route: '/dashboard/caja', roles: [UserRole.CASHIER] },
  { label: 'Cocina', icon: '🍳', route: '/dashboard/cocina', roles: [UserRole.STAFF, UserRole.ADMIN] },

  // Compartidos
  {
    label: 'Órdenes',
    icon: '📋',
    route: '/dashboard/orders',
    roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.STAFF],
  },
  {
    label: 'Productos',
    icon: '🍦',
    route: '/dashboard/products',
    roles: [UserRole.ADMIN, UserRole.CASHIER],
  },
  {
    label: 'Ventas',
    icon: '🧾',
    route: '/dashboard/ventas',
    roles: [UserRole.ADMIN, UserRole.CASHIER],
  },
  {
    label: 'Mesas',
    icon: '🪑',
    route: '/dashboard/tables',
    roles: [UserRole.ADMIN],
  },
  {
    label: 'Sesiones de mesa',
    icon: '🍽️',
    route: '/dashboard/mesas-sesiones',
    roles: [UserRole.ADMIN, UserRole.CASHIER, UserRole.STAFF],
  },

  // Solo Admin
  { label: 'Menú', icon: '📖', route: '/dashboard/menu', roles: [UserRole.ADMIN] },
  { label: 'Usuarios', icon: '👥', route: '/dashboard/users', roles: [UserRole.ADMIN] },
  { label: 'Categorías', icon: '📂', route: '/dashboard/categories', roles: [UserRole.ADMIN] },
  { label: 'Grupos de opciones', icon: '🧩', route: '/dashboard/option-groups', roles: [UserRole.ADMIN] },
  {
    label: 'Unidades de medida',
    icon: '📏',
    route: '/dashboard/unit-measures',
    roles: [UserRole.ADMIN],
  },
  { label: 'Métodos de pago', icon: '💳', route: '/dashboard/metodos-pago', roles: [UserRole.ADMIN] },
  { label: 'Inventario', icon: '📦', route: '/dashboard/inventario', roles: [UserRole.ADMIN] },
  { label: 'Proveedores', icon: '🚚', route: '/dashboard/proveedores', roles: [UserRole.ADMIN] },
  { label: 'Caja', icon: '💰', route: '/dashboard/caja', roles: [UserRole.ADMIN] },
  // { label: 'Cocina',      icon: '👨‍🍳', route: '/dashboard/cocina',     roles: [UserRole.ADMIN] },
  { label: 'Reportes', icon: '📊', route: '/dashboard/reports', roles: [UserRole.ADMIN] },
];

/**
 * Navegación del área Super Admin (dominio raíz). No se filtra por rol: estos
 * ítems se muestran cuando el usuario autenticado es super admin.
 */
export const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Tenants', icon: '🏢', route: '/super-admin/tenants', roles: [UserRole.SUPER_ADMIN] },
  { label: 'Usuarios', icon: '👥', route: '/super-admin/users', roles: [UserRole.SUPER_ADMIN] },
];
