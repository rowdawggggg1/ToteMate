import { createHash, randomBytes } from "crypto";

/**
 * Same pattern as admin sessions (lib/auth/session.ts): the "Manage My
 * Booking" link carries an opaque random token, and only its SHA-256 hash
 * is ever stored in the database. Shared here since both order creation
 * (lib/orders.ts) and the manage-booking lookup page need it.
 */
export function generateManageToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
