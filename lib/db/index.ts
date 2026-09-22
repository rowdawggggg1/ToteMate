import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Required for the websocket-based Neon driver to work in Node.js server
// environments (Vercel's Node runtime), not just the browser/edge.
neonConfig.webSocketConstructor = ws;

let pool: Pool | undefined;
let dbInstance: NeonDatabase<typeof schema> | undefined;

/**
 * Returns a lazily-created Drizzle client. Nothing connects until this is
 * actually called from inside a request/action -- importing this module
 * must never throw or open a connection at build time (Vercel's build step
 * has no database access and no reason to need one).
 *
 * We use the neon-serverless (websocket) driver rather than neon-http
 * because it supports real multi-statement transactions, which later
 * phases rely on heavily (booking creation, tote assignment, payments).
 */
export function getDb() {
  if (!dbInstance) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Add it to your environment configuration (see .env.example)."
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}
