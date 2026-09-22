# ToteMate

A reusable moving-tote rental business platform: public booking site +
private admin system.

This repo is being built in phases so each one can be deployed and verified
working before the next is added.

## Phase 1 (this delivery)

* Database schema (Neon Postgres via Drizzle ORM)
* Admin authentication (email + password, secure sessions, brute-force
  lockout)
* First-run `/setup` flow (creates the first admin account)
* Admin shell: mobile-responsive sidebar/drawer navigation, signed-in
  email, sign out
* Business Settings page (pricing, scheduling, capacity, fees -- all the
  operational variables later phases will read from)
* Lightweight audit log (records who changed what)

Not built yet (coming in later phases): the public marketing site,
packages/add-ons, the booking flow, Stripe payments, the admin calendar,
inventory/tote management, the Realtor portal, driver accounts, financial
reporting, referrals, gift certificates, reviews, and CMS content editing.
The placeholder homepage and dashboard just link forward so the app is
navigable in the meantime.

## Tech stack

* Next.js 16 (App Router, Server Actions)
* TypeScript
* Neon Postgres + Drizzle ORM (`drizzle-orm/neon-serverless`, so real
  multi-statement transactions work -- later phases need them)
* Tailwind CSS v4
* Zod for server-side validation

No session-signing secret is needed: admin sessions use random opaque
tokens (not JWTs) whose SHA-256 hash is stored in the database, with the
raw token only ever living in an HTTP-only cookie.

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Neon database** (if you haven't already) at
   [neon.tech](https://neon.tech), and copy its connection string.

3. **Set your environment variable**

   Copy `.env.example` to `.env.local` and paste in your Neon connection
   string as `DATABASE_URL`.

4. **Push the schema to your database**

   ```bash
   npm run db:push
   ```

   This creates all the tables directly from `lib/db/schema.ts` -- there's
   no separate migration-file step to run.

5. **Run the app locally**

   ```bash
   npm run dev
   ```

6. Visit `http://localhost:3000/setup` and create your admin account. You'll
   be signed in automatically afterward.

## Deploying (GitHub + Vercel + Neon)

1. Push this project to a new GitHub repository.
2. Create a new Vercel project and connect it to that repository.
3. In the Vercel project's **Settings → Environment Variables**, add
   `DATABASE_URL` with the same Neon connection string (or a separate
   production Neon database -- your choice).
4. Before or after the first deploy, run `npm run db:push` once against
   whichever database Vercel is using (you can run this from your local
   machine or from Replit's shell, as long as `DATABASE_URL` in that
   environment points at the same database Vercel is using).
5. Deploy. Once it's live, visit `https://<your-domain>/setup` to create
   your admin account on the production site.

If you're extracting this zip into Replit before pushing to GitHub: extract
it over your project folder, make sure `.env.local` (with your own
`DATABASE_URL`) exists but is *not* committed, then `git add`, commit, and
push as usual.

## Project structure

```
app/
  page.tsx                        Public homepage (placeholder for now)
  setup/                          First-run admin creation
  admin/
    login/                        Admin login (outside the auth gate)
    (protected)/                  Everything behind requireAdmin()
      layout.tsx                  Renders the admin shell
      page.tsx                    Dashboard placeholder
      settings/                   Business Settings
lib/
  db/                             Drizzle schema + lazy DB client
  auth/                           Password hashing, sessions, requireAdmin
  audit.ts                        Audit log writer
  money.ts                        Cents <-> dollars helpers
components/
  admin/admin-shell.tsx           Sidebar + mobile drawer
  ui/                             Shared Field, SubmitButton
proxy.ts                          Next.js 16's request interceptor
                                  (replaces middleware.ts); does a fast
                                  cookie-presence check only -- real
                                  session validation happens server-side
                                  in requireAdmin()
```

## Design notes worth knowing before extending this

* **Server is authoritative, always.** Every mutating Server Action
  independently re-checks `requireAdmin()` even though the pages that
  render its form are already behind the protected layout. Keep doing
  this in later phases -- never rely solely on a page being gated.
* **Money is stored as integer cents**, never floats. Use
  `lib/money.ts`'s `dollarsToCents` / `centsToDollarsString` at the
  boundary between forms and the database.
* **Historical data must never be silently rewritten.** Business Settings
  changes apply going forward only. Once orders exist, they must store
  their own pricing/terms snapshot rather than reading live settings --
  this becomes critical starting in the booking-engine phase.
* **The route group `app/admin/(protected)/`** is what keeps
  `/admin/login` from being wrapped by the authenticated layout (which
  would otherwise create a redirect loop). Any new authenticated admin
  page should go inside that group; anything that must stay public (like
  login) should go outside it.
* **Audit retention is intentionally simple** (per the current spec:
  keep roughly a week's history, no IP/device tracking). A scheduled
  cleanup job hasn't been built yet -- add one later only if it actually
  becomes necessary.
