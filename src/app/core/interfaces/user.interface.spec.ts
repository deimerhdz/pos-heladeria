import { displayNameFromEmail, mapBackendRole, UserRole } from './user.interface';

describe('mapBackendRole', () => {
  it('maps UPPERCASE backend roles to the enum', () => {
    expect(mapBackendRole('ADMIN')).toBe(UserRole.ADMIN);
    expect(mapBackendRole('CASHIER')).toBe(UserRole.CASHIER);
  });

  it('accepts already-lowercase roles', () => {
    expect(mapBackendRole('admin')).toBe(UserRole.ADMIN);
  });

  // Sin esto, un JWT vivo con el rol retirado daría sesión inválida y echaría
  // al usuario en vez de degradarlo al rol equivalente.
  it('degrades the retired STAFF role to CASHIER', () => {
    expect(mapBackendRole('STAFF')).toBe(UserRole.CASHIER);
    expect(mapBackendRole('staff')).toBe(UserRole.CASHIER);
  });

  it('returns null for unknown or empty roles', () => {
    expect(mapBackendRole('SUPERVISOR')).toBeNull();
    expect(mapBackendRole('')).toBeNull();
  });
});

describe('displayNameFromEmail', () => {
  it('uses the local part of the email', () => {
    expect(displayNameFromEmail('mariaArias@gmail.com')).toBe('mariaArias');
  });

  it('falls back to the whole string when there is no @', () => {
    expect(displayNameFromEmail('plainname')).toBe('plainname');
  });
});
