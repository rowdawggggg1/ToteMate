import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Loads DATABASE_URL from .env.local when drizzle-kit is run directly
// (Next.js loads .env.local automatically for the app itself; this file
// is executed by the separate drizzle-kit CLI process, so it needs its
// own explicit env loading).
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Neon connection string."
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
});
