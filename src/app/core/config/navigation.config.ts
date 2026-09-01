import { NavItem } from '../interfaces/navigation.interface';
import { UserRole } from '../interfaces/user.interface';

export const NAV_ITEMS: NavItem[] = [
  // ── PRINCIPAL ──────────────────────────────────────────────────────────
  {
    label: 'Dashboard',
    icon: 'dashboard',
    route: '/dashboard/admin',
    group: 'PRINCIPAL',
    roles: [UserRole.ADMIN],
  },
  {
    label: 'Ventas',
    icon: 'sales',
    route: '/dashboard/ventas',
    group: 'PRINCIPAL',
    roles: [UserRole.ADMIN, UserRole.CASHIER],
  },
  {
    label: 'Reportes',
    icon: 'reports',
    route: '/dashboard/reports',
    group: 'PRINCIPAL',
    roles: [UserRole.ADMIN],
  },

  // ── OPERACIONES ────────────────────────────────────────────────────────
  {
    label: 'Órdenes',
    icon: 'orders',
    route: '/dashboard/orders',
    group: 'OPERACIONES',
    roles: [UserRole.ADMIN, UserRole.CASHIER],
  },
  {
    label: 'Mesas',
    icon: 'tables',
    route: '/dashboard/mesas',
    group: 'OPERACIONES',
    roles: [UserRole.ADMIN],
  },
  {
    label: 'Terminal de mesas',
    icon: 'sessions',
    route: '/dashboard/mesas-sesiones',
    group: 'OPERACIONES',
    roles: [UserRole.ADMIN, UserRole.CASHIER],
  },

  // ── CATÁLOGO ───────────────────────────────────────────────────────────
  {
    label: 'Productos',
    icon: 'products',
    route: '/dashboard/products',
    group: 'CATÁLOGO',
    roles: [UserRole.ADMIN],
  },
  {
    label: 'Categorías',
    icon: 'categories',
    route: '/dashboard/categories',
    group: 'CATÁLOGO',
    roles: [UserRole.ADMIN],
  },
  {
    label: 'Promociones',
    icon: 'promotions',
    route: '/dashboard/promotions',
    group: 'CATÁLOGO',
    roles: [UserRole.ADMIN],
    moduleKey: 'promociones',
  },
  // spec 063 (A-63): "Presentaciones" se elimina — la entidad `Presentation` y
  // su modelo de datos (spec 040) se revierten.

  // ── ADMINISTRACIÓN ─────────────────────────────────────────────────────
  {
    label: 'Inventario',
    icon: 'inventory',
    route: '/dashboard/inventario',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN],
    moduleKey: 'inventario',
  },
  {
    label: 'Proveedores',
    icon: 'suppliers',
    route: '/dashboard/proveedores',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN],
  },
  {
    label: 'Caja',
    icon: 'cash',
    route: '/dashboard/caja',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN, UserRole.CASHIER],
  },
  {
    label: 'Usuarios',
    icon: 'users',
    route: '/dashboard/users',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN],
  },
  {
    label: 'Ajustes',
    icon: 'settings',
    route: '/dashboard/ajustes',
    group: 'ADMINISTRACIÓN',
    roles: [UserRole.ADMIN],
  },
];

/**
 * Navegación del área Super Admin (dominio raíz). No se filtra por rol: estos
 * ítems se muestran cuando el usuario autenticado es super admin.
 */
export const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  {
    label: 'Tenants',
    icon: 'tenants',
    route: '/super-admin/tenants',
    group: 'PLATAFORMA',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    label: 'Usuarios',
    icon: 'users',
    route: '/super-admin/users',
    group: 'PLATAFORMA',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    label: 'Métodos de pago',
    icon: 'payment-methods',
    route: '/super-admin/payment-methods-catalog',
    group: 'PLATAFORMA',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    label: 'Planes',
    icon: 'layers',
    route: '/super-admin/plans',
    group: 'PLATAFORMA',
    roles: [UserRole.SUPER_ADMIN],
  },
];
