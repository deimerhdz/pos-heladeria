import { UserRole } from './user.interface';

export interface NavItem {
  label: string;
  /** Semantic icon name resolved by the icon system (see IconComponent). */
  icon: string;
  route: string;
  /** Section this item belongs to (see NAV_GROUP_ORDER). */
  group: string;
  roles: UserRole[];
}

/** Order in which sidebar sections are rendered. */
export const NAV_GROUP_ORDER = [
  'PRINCIPAL',
  'OPERACIONES',
  'CATÁLOGO',
  'ADMINISTRACIÓN',
  'PLATAFORMA',
] as const;
