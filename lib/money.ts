/**
 * All money is stored as integer cents in the database. These helpers are
 * the only place dollar-string <-> cents conversion happens, so every
 * screen formats and parses money the same way.
 */

export function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function dollarsToCents(input: string | number): number {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}
