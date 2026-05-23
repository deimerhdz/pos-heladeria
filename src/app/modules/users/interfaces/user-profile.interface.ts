import { UserRole } from '../../../core/interfaces/user.interface';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface UserCreateForm {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}
