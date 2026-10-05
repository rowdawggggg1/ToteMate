import type { CSSProperties } from "react";
import type { businessSettings } from "@/lib/db/schema";

type Settings = typeof businessSettings.$inferSelect | undefined;

/**
 * Builds inline CSS custom-property overrides for the public site's theme
 * colors, from whatever is saved in Business Settings. These override the
 * defaults set in app/globals.css's @theme block, so an admin can re-skin
 * the public site at runtime without a rebuild or redeploy.
 *
 * Spread the result onto the `style` prop of each public page's root
 * element. Note that overriding --color-background alone does nothing
 * unless something also applies `bg-[var(--color-background)]`, since CSS
 * variables only affect elements that reference them.
 */
export function buildPublicThemeStyle(settings: Settings): CSSProperties {
  if (!settings) return {};

  const style: Record<string, string> = {};

  if (settings.primaryColor) {
    style["--color-primary"] = settings.primaryColor;
  }
  if (settings.accentColor) {
    style["--color-accent"] = settings.accentColor;
  }
  if (settings.backgroundColor) {
    style["--color-background"] = settings.backgroundColor;
  }

  return style as CSSProperties;
}
