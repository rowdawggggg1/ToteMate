import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/**
 * Hashes a password with scrypt (a spec-approved algorithm) using Node's
 * built-in crypto module. No external hashing library is needed.
 * Stored format: "<hexSalt>:<hexDerivedKey>".
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;

  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  if (keyBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(keyBuffer, derivedKey);
}
