import { JwtClaims } from './auth.models';

/**
 * Decode the payload of a JWT without verifying its signature (verification is
 * the backend's responsibility). Returns `null` for malformed tokens.
 */
export function decodeClaims(token: string): JwtClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const json = base64UrlDecode(parts[1]);
    const claims = JSON.parse(json) as JwtClaims;
    if (!claims || typeof claims.exp !== 'number' || !claims.user) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * True when the token is expired (or within `skewSeconds` of expiring), so a
 * token about to expire is treated as already stale.
 */
export function isExpired(claims: JwtClaims, skewSeconds = 30): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return claims.exp <= nowSeconds + skewSeconds;
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  // Decode UTF-8 bytes (handles non-ASCII in claims).
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
