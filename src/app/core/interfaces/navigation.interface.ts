import { UserRole } from './user.interface';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles: UserRole[];
}
