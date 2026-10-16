/**
 * Formats a moment in time in the BUSINESS's timezone (Business Settings ->
 * timezone, e.g. "America/Edmonton"), never the server's.
 *
 * Why this exists: server-rendered pages run on Vercel, whose servers are
 * on UTC. `Intl.DateTimeFormat`/`toLocaleString()` with no explicit
 * `timeZone` formats in the *server's* zone, so an order placed at 3:00 PM
 * in Edmonton showed as 9:00 PM (or 10:00 PM) in the Orders list. Always
 * pass the business timezone for anything rendered on the server.
 */
export function formatDateTime(
  date: Date | string | number,
  timeZone: string,
  style: { dateStyle?: "short" | "medium" | "long"; timeStyle?: "short" | "medium" } = {
    dateStyle: "medium",
    timeStyle: "short",
  }
): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { ...style, timeZone }).format(new Date(date));
  } catch {
    // An invalid timezone string in settings must never crash a page.
    return new Intl.DateTimeFormat("en-CA", { ...style, timeZone: "America/Edmonton" }).format(
      new Date(date)
    );
  }
}
