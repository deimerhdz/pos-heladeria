import { UserRole } from './user.interface';
import { ModuleAccess } from '../../modules/plan/interfaces/plan-summary.interface';

export interface NavItem {
  label: string;
  /** Semantic icon name resolved by the icon system (see IconComponent). */
  icon: string;
  route: string;
  /** Section this item belongs to (see NAV_GROUP_ORDER). */
  group: string;
  roles: UserRole[];
  /** Clave de `ModuleAccess` que gobierna este ítem (spec 033, Historias 4/5):
   * si el plan vigente del tenant no la incluye (o el tenant está vencido),
   * el ítem se oculta del sidebar. Sin definir = siempre visible para los
   * roles indicados (no todo módulo está gobernado por el plan). */
  moduleKey?: keyof ModuleAccess;
}

/** Order in which sidebar sections are rendered. */
export const NAV_GROUP_ORDER = [
  'PRINCIPAL',
  'OPERACIONES',
  'CATÁLOGO',
  'ADMINISTRACIÓN',
  'PLATAFORMA',
] as const;
