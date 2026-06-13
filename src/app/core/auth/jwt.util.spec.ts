import { decodeClaims, isExpired } from './jwt.util';
import { JwtClaims } from './auth.models';

// Real access token sample from the backend (signature irrelevant; only the
// payload is decoded). Claims: user{ mariaArias@gmail.com, ADMIN, tenant 1 }.
const SAMPLE_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJ1c2VyIjp7ImVtYWlsIjoibWFyaWFBcmlhc0BnbWFpbC5jb20iLCJ1aWQiOiJmNGY2MjE0Yy02YzM1LTQ3OWEtYmVlNi1mZDAxMmUyOGZjYmYiLCJ0ZW5hbnRfaWQiOjEsImlzX3N1cGVyX2FkbWluIjpmYWxzZSwicm9sZSI6IkFETUlOIn0sImV4cCI6MTc4MDYwNTU0NCwianRpIjoiYTZhYWY0MjgtMzFkMy00YzEzLWFhZjgtNjUyZWEzMmY0OWVhIiwicmVmcmVzaCI6ZmFsc2V9.' +
  'Q8a1A7du32IPez5DxG6B3DXHMMCw32xhcpeyhGrpxx8';

describe('decodeClaims', () => {
  it('decodes the payload of a valid token', () => {
    const claims = decodeClaims(SAMPLE_ACCESS_TOKEN);
    expect(claims).not.toBeNull();
    expect(claims!.user.email).toBe('mariaArias@gmail.com');
    expect(claims!.user.uid).toBe('f4f6214c-6c35-479a-bee6-fd012e28fcbf');
    expect(claims!.user.role).toBe('ADMIN');
    expect(claims!.user.tenant_id).toBe(1);
    expect(claims!.user.is_super_admin).toBe(false);
    expect(claims!.exp).toBe(1780605544);
    expect(claims!.refresh).toBe(false);
  });

  it('returns null for a malformed token (wrong segment count)', () => {
    expect(decodeClaims('not-a-jwt')).toBeNull();
    expect(decodeClaims('only.two')).toBeNull();
  });

  it('returns null when the payload is not valid JSON', () => {
    expect(decodeClaims('aaa.bbb.ccc')).toBeNull();
  });
});

describe('isExpired', () => {
  const base = (exp: number): JwtClaims => ({
    user: { email: 'a@b.c', uid: 'x', tenant_id: 1, is_super_admin: false, role: 'ADMIN' },
    exp,
    jti: 'j',
    refresh: false,
  });

  it('is true for a token in the past', () => {
    expect(isExpired(base(Math.floor(Date.now() / 1000) - 100))).toBe(true);
  });

  it('is false for a token comfortably in the future', () => {
    expect(isExpired(base(Math.floor(Date.now() / 1000) + 3600))).toBe(false);
  });

  it('treats a token within the skew window as expired', () => {
    const almost = Math.floor(Date.now() / 1000) + 10;
    expect(isExpired(base(almost), 30)).toBe(true);
  });
});
