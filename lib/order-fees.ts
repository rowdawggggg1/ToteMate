/**
 * Shared fee-type list for the "Order Fees" feature (Patch 4 -- late
 * returns, damaged/lost totes, damaged/lost dollies, other). Lives in its
 * own plain module (not app/admin/(protected)/orders/actions.ts) because a
 * "use server" file is only allowed to export async functions -- a plain
 * exported const like this one breaks the Next.js build if it's exported
 * from a server-actions file. Both the server actions (which validate
 * against these values) and the client form component (which renders them
 * as <option>s) import this.
 */
export const FEE_TYPES = [
  { value: "late", label: "Late return" },
  { value: "damaged_tote", label: "Damaged tote" },
  { value: "lost_tote", label: "Lost tote" },
  { value: "damaged_dolly", label: "Damaged dolly" },
  { value: "lost_dolly", label: "Lost dolly" },
  { value: "other", label: "Other" },
] as const;
