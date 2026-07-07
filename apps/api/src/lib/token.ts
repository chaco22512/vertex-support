/**
 * Session token generation (§2). Cryptographically random, unguessable — NOT
 * sequential or derived from any predictable value. 256 bits, base64url-encoded.
 * Treated as a bearer credential by the API.
 */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
