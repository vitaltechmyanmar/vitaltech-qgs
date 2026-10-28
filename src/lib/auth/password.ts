import { hash, verify } from "@node-rs/argon2";

/**
 * OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1).
 * Argon2id is the library default algorithm.
 * Keep these in sync with scripts/seed.mjs.
 */
export const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(hashString: string, password: string): Promise<boolean> {
  return verify(hashString, password);
}
