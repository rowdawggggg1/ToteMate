# ToteMate

A reusable moving-tote rental business platform: public booking site +
private admin system.

This repo is being built in phases so each one can be deployed and verified
working before the next is added.

## Phase 1

* Database schema (Neon Postgres via Drizzle ORM)
* Admin authentication (email + password, secure sessions, brute-force
  lockout)
* First-run `/setup` flow (creates the first admin account)
* Admin shell: mobile-responsive sidebar/drawer navigation, signed-in
  email, sign out
* Business Settings page (pricing, scheduling, capacity, fees -- all the
  operational variables later phases will read from)
* Lightweight audit log (records who changed what)

## Phase 2 (this delivery)

* **Packages** (admin CRUD, public display): name, price, tote quantity,
  rental duration in full weeks, dolly inclusion, "Most Popular" flag
  (only one at a time), display order, active/inactive
* **Add-ons** (admin CRUD, public-ready): general add-ons available with
  every package, or package-specific add-ons -- including each package's
  own weekly-extension add-on (only one per package, enforced
  transactionally), matching the locked pricing model
* **FAQs** (admin CRUD, public display)
* **Public homepage**: hero, how-it-works, live packages grid, benefits,
  service area, live FAQ accordion, contact section, footer -- all pulling
  from the database and from Business Settings, not hard-coded
* `/book` and `/realtors` placeholder pages so nav links aren't broken
  ahead of the booking-flow and Realtor-portal phases
* Added a **cancellation refund window** setting (hours before delivery
  required to qualify for a refund at all) to Business Settings -- this
  was previously a fixed 24-hour rule and is now admin-configurable

**Scope note:** homepage copy (hero headline, benefit descriptions, "how
it works" step text) is currently well-chosen static content, not yet
editable through a CMS. Only FAQs are database-backed content in this
phase. A richer content-editing pass can be added later if wanted --
deliberately not building a full page-builder now, per the "don't
over-engineer" guidance in the spec.

Not built yet: the real booking flow, Stripe payments, the admin
calendar, inventory/tote management, the Realtor portal, driver accounts,
financial reporting, referrals, gift certificates, and reviews.

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

## Updating from Phase 1

If you already have Phase 1 deployed: extract this zip over your existing
Replit project (overwrite), commit, and push -- same repo, same Vercel
project, same Neon database as before. **Do not create a new database.**

This phase adds three new tables (`packages`, `add_ons`, `faqs`) and one
new column on `business_settings` (`cancellation_window_hours`). Run
`npm run db:push` again against your existing database to apply these --
it's additive only, so your existing admin account and saved settings are
untouched. If it prompts for confirmation, it should be safe to accept
since nothing here drops or renames anything; read the prompt before
confirming regardless.

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
  page.tsx                        Public homepage (live packages/FAQs)
  book/                           Booking placeholder (real flow: later phase)
  realtors/                       Realtor portal placeholder (real one: later phase)
  setup/                          First-run admin creation
  admin/
    login/                        Admin login (outside the auth gate)
    (protected)/                  Everything behind requireAdmin()
      layout.tsx                  Renders the admin shell
      page.tsx                    Dashboard placeholder
      packages/                   Package management (list/new/[id])
      add-ons/                    Add-on management (list/new/[id])
      faqs/                       FAQ management (list/new/[id])
      settings/                   Business Settings
lib/
  db/                             Drizzle schema + lazy DB client
  auth/                           Password hashing, sessions, requireAdmin
  catalog.ts                      Shared getActivePackages/getActiveFaqs/
                                  getActiveAddOnsForPackage -- the one
                                  place that defines "publicly bookable";
                                  reuse this in the booking phase too
  audit.ts                        Audit log writer
  money.ts                        Cents <-> dollars helpers
components/
  admin/admin-shell.tsx           Sidebar + mobile drawer
  public/                         Site header/footer, package card
  ui/                             Shared Field, SubmitButton, ConfirmSubmitButton
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
* **Packages and add-ons can currently be hard-deleted.** That's only
  safe because no orders exist yet to reference them. Once the booking
  phase adds an `orders` table, `deletePackageAction` and
  `deleteAddOnAction` (in their respective `actions.ts` files) need to
  check for referencing orders first and deactivate instead of deleting
  if any exist -- there's a comment marking this in both files.
* **`lib/catalog.ts` is the single source of truth for "what's publicly
  offered."** The homepage uses `getActivePackages()` /
  `getActiveFaqs()`; the future booking flow should use the same
  functions (plus `getActiveAddOnsForPackage()`) rather than querying the
  tables directly, so there's never a second, slightly different
  definition of "active."
* **Audit retention is intentionally simple** (per the current spec:
  keep roughly a week's history, no IP/device tracking). A scheduled
  cleanup job hasn't been built yet -- add one later only if it actually
  becomes necessary.
