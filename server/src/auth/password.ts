import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hashes a password with scrypt and a random salt.
 *
 * @param password - The password.
 * @returns `scrypt$<salt>$<hash>`, both hex.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

/**
 * Checks a password against a hash made by `hashPassword`.
 *
 * @param password - The password.
 * @param stored - The stored hash.
 * @returns Whether the password matches.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, 'hex');
  return timingSafeEqual(scryptSync(password, salt, expected.length), expected);
}
