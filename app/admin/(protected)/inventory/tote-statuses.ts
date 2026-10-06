// Plain shared constant -- deliberately NOT in actions.ts.
//
// actions.ts has "use server" at the top, and Next.js enforces that a
// "use server" file may only export async functions -- any other export
// (a const, a type, anything non-function) throws at runtime in
// production: "A 'use server' file can only export async functions,
// found object." This broke the production build/the Add Tote flow.
// Keep this status list here, in a file with no "use server" directive,
// and import it from both actions.ts and the client components that need
// the list of values (never re-export it from actions.ts).
export const TOTE_STATUSES = [
  "ready",
  "with_customer",
  "needs_cleaning",
  "damaged",
  "lost",
  "retired",
] as const;
