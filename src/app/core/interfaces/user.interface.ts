export enum UserRole {
  ADMIN = 'admin',
  CASHIER = 'cashier',
  STAFF = 'staff',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
