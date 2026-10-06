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

## Phase 2 update: branding, photos, and SMS contact

Patched into Phase 2 after initial delivery, in response to feedback that
the public site had no way to customize its look:

* **Business Settings → Branding & Photos**: logo URL, hero image URL, and
  three color pickers (primary / accent / background) that re-skin the
  public site's CSS variables at runtime -- no rebuild or redeploy needed.
  There's no file-upload widget yet; paste a link to an image hosted
  elsewhere (e.g. an image host, or your own storage once that exists).
* **Package photos**: packages already had a `photoUrl` field in the admin
  form; it's now actually rendered on the public package cards.
* **Homepage hero redesign**: two-column layout with headline/CTAs on one
  side and either your hero image or a simple built-in illustration on the
  other, instead of the old centered-text-only hero.
* **Text instead of Call**: the phone number on the homepage, footer, and
  anywhere else it appears now links via `sms:` and says "Text Us" /
  "Text {number}" instead of `tel:` / "Call Us", since this business wants
  texts, not calls.
* **Maximum delivery radius**: a new optional "hard cutoff" setting
  (Business Settings → Delivery & Pickup Pricing), separate from the
  existing free-radius pricing threshold. It just stores the admin's
  chosen limit for now -- actually rejecting out-of-range addresses at
  booking time is implemented in the booking phase.

Database-wise, this adds five columns to `business_settings`:
`primary_color`, `accent_color`, `background_color`, `hero_image_url`,
`max_delivery_radius_km`. Same update instructions apply: overwrite your
Replit project, push, re-run `npm run db:push` -- additive only, nothing
dropped.

## Phase 3 (this delivery): booking, pricing & payments

The real booking flow, end to end:

* **Public booking flow (`/book`)**: a 5-step wizard -- choose a package,
  add-ons and an optional weekly extension; pick a delivery date and
  enter addresses/contact info; review the order and sign the rental
  agreement (drawn signature, not typed); pay with Stripe; see a
  confirmation screen with a "Manage My Booking" link. Every dollar
  amount shown on the payment step comes from the server -- nothing is
  priced in the browser.
* **Pricing engine** (`lib/pricing.ts`): the locked formula --
  `max(0, one-way distance - free radius) x 2 x rate per km`, calculated
  independently for the delivery leg and the pickup leg, distance never
  rounded until the final cents figure. Package price, add-ons, and a
  whole-weeks-only extension add up to the computed total; an admin's
  manual price override (if set on an order) always wins over that
  computed total.
* **Routing** (`lib/routing.ts`): OpenRouteService geocoding + driving
  distance, abstracted behind plain functions so swapping providers later
  doesn't touch booking/pricing code. A routing failure always surfaces a
  clear error -- it never falls back to a guessed distance. Service-area
  eligibility (a two-letter province/region code, set in Business
  Settings -> Service Area & Routing) is checked *before* any distance is
  calculated.
* **Availability engine** (`lib/availability.ts`): minimum lead time,
  owner-blocked dates, daily capacity, and tote inventory (accounting for
  the post-pickup readiness buffer and the overbooking setting) --
  centralized here so the booking flow, admin, and Manage My Booking
  reschedule all use the exact same rules.
* **Stripe integration**: PaymentIntents (not Products/Prices, since each
  order's amount is computed dynamically), confirmed with Stripe Elements
  on the booking page, finalized by a webhook
  (`/api/stripe/webhook`) that's idempotent against redelivery and
  double-checks the charged amount before marking an order paid. No
  temporary inventory "holds" are created while someone is mid-checkout --
  availability is re-checked right before creating the order, and the
  webhook is a second, independent checkpoint. This is a deliberate,
  documented trade-off for a small business: a real reservation-hold
  system would be over-engineering at this scale.
* **Confirmation & cancellation emails** (`lib/email.ts`): sent via Gmail
  SMTP (nodemailer).
* **Manage My Booking** (`/manage/[orderId]?token=...`): a secure,
  token-based page (same opaque-token-hash pattern as admin sessions) a
  customer can use to view their booking, reschedule the delivery date
  (subject to the same availability engine), or cancel (refund amount
  calculated from the cancellation fee settings and the admin-configurable
  cutoff described below).
* **Admin: Inventory** (`/admin/inventory`): simple physical tote
  records (number, status, notes, completed-rental count, net profit
  attributed) with a "Replace this tote" action for a damaged/lost tote
  that preserves its history under a new physical record.
* **Admin: Rental Agreements** (`/admin/agreements`): versioned
  agreement content; only one version is ever "active" (what new
  bookings sign); publishing a new draft supersedes the previous one
  without touching any order that already signed against it. Comes with
  a clearly-labeled starter template -- **not legal advice**; have a
  lawyer review your actual wording.
* **Admin: Blocked Dates** (`/admin/blocked-dates`): add/remove dates the
  public site won't offer for delivery or pickup.
* **Admin: Orders** (`/admin/orders`): list + detail view with the full
  order snapshot, status progression (Delivered -> Picked Up ->
  Completed, which also updates each assigned tote's status and rental
  count), physical tote assignment, a manual price-override field (record
  -only -- it does not automatically adjust the Stripe charge), and
  internal notes.
* **Business Settings additions** (Service Area & Routing section):
  service-area province/region code, an optional manual override for the
  business's routing origin coordinates (auto-geocoded best-effort from
  the business address otherwise), and -- per explicit request -- the
  cancellation window (`cancellation_window_hours`, already configurable
  from Phase 2) now has a companion **cutoff reference** setting
  (start-of-day vs. end-of-day) so *both* how many hours and which exact
  moment they're measured from can be changed later without touching code.

**Scope notes / deferred to a later phase:** referral codes, gift cards,
and the Realtor program (no such entities exist yet, so the booking flow
has no "codes" step); financial reporting; reviews. (Driver accounts, an
admin calendar, and manual late fees were originally listed here too --
all three shipped in Phase 4, below.) None of these block using the app
for real bookings today.

Database-wise, this phase adds six new tables (`totes`,
`rental_agreement_versions`, `blocked_dates`, `orders`,
`order_tote_assignments`, `stripe_webhook_events`) and new columns on
`business_settings` (`business_origin_lat`, `business_origin_lng`,
`service_area_province_code`, `cancellation_cutoff_reference`). Run
`npm run db:push` after updating -- additive only, nothing dropped.

**New environment variables** (see `.env.example` for details):
`OPENROUTESERVICE_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, `NEXT_PUBLIC_BASE_URL`. The app will still start
without these, but booking will fail with a clear error at whichever
step needs the missing one (geocoding, payment, or email) until they're
set.

**Before this phase works end-to-end**, an admin needs to, once: set a
business address in Settings (so a routing origin can be geocoded) and
confirm the service-area province code; publish at least one rental
agreement version in Admin -> Agreements; add some physical totes in
Admin -> Inventory. The `/book` page shows a plain "booking isn't quite
ready yet" message instead of the wizard until there's an active
package and an active agreement version.

## Phase 4 (this delivery): operations

Running the business day-to-day, on top of Phase 3's booking engine:

* **Driver accounts** (`/driver`, managed from `/admin/drivers`): drivers
  are staff accounts (`admins` rows with `role: "driver"`) an owner
  creates individually, but every driver who signs in sees the *same*
  shared job list -- every scheduled delivery and every pickup due, for
  every driver -- rather than a per-driver assignment. A driver can mark
  a job "Delivered" or "Picked Up" from there; those are the exact same
  actions the full admin Orders page uses, just also reachable by a
  driver account. A driver account cannot reach `/admin` at all --
  `requireAdmin()` (used by every admin page/action) now only lets
  `role: "owner"` through; `requireStaff()` is the separate, narrower
  check that allows either role, used only where a driver legitimately
  needs it.
* **Admin calendar** (`/admin/calendar`): a month view of every scheduled
  delivery and pickup plus blocked dates. Dragging a *delivery* onto a
  new day reschedules that order (delivery and pickup move together,
  re-running the exact same availability checks as the customer's own
  Manage My Booking reschedule -- `lib/reschedule.ts` is now the one
  shared implementation both use). Pickup chips and blocked dates are
  shown for reference but aren't draggable: moving a pickup date on its
  own (for an order that's already out with the customer) is a
  rental-extension decision, not a simple date move, and isn't something
  this phase invents a pricing rule for.
* **Late fees** (on each order's detail page): an admin can record a late
  fee at any time -- it's saved and shown on the order immediately,
  regardless of whether it's ever charged. Separately, if the order has a
  card on file, an admin can click "Charge Card on File" whenever *they*
  decide to -- it is never automatic. The card is captured the moment the
  original booking payment succeeds (the booking PaymentIntent is created
  with `setup_future_usage: "off_session"` specifically for this), so a
  late fee charged weeks later doesn't need the customer to do anything.
  If there's no card on file (orders booked before this feature existed)
  or a charge attempt fails (declined, expired card, etc.), the fee
  simply stays recorded as owed -- collecting it another way is always
  the fallback, never an error state the admin has to work around.

**Scope notes / deferred to Phase 5:** referral codes, gift cards, the
Realtor program, financial reporting, and reviews -- these are
revenue/marketing features, not day-to-day operations, so they're held
for Phase 5 (Money + Growth + Polish) per an explicit scoping decision
made with the business owner rather than assumed.

Database-wise, this phase adds one new table (`order_late_fees`) and two
new columns on `orders` (`stripe_customer_id`, `stripe_payment_method_id`).
No new `admins` columns were needed -- the `role` column already existed
from Phase 1 for exactly this purpose. Run `npm run db:push` after
updating -- additive only, nothing dropped.

No new environment variables for this phase.

**Before late-fee charging works for a given order**, that order has to
have been booked *after* this phase was deployed -- only then does the
booking flow save a card on file. Orders from before this phase can still
have late fees recorded, just not charged through the app.

## Tech stack

* Next.js 16 (App Router, Server Actions)
* TypeScript
* Neon Postgres + Drizzle ORM (`drizzle-orm/neon-serverless`, so real
  multi-statement transactions work -- later phases need them)
* Tailwind CSS v4
* Zod for server-side validation
* Stripe (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`) for
  payments
* OpenRouteService (plain `fetch` calls, no SDK) for geocoding/routing
* Nodemailer over Gmail SMTP for transactional email

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
  book/                           Public booking flow (5-step wizard)
    page.tsx                      Loads packages/add-ons/active agreement
    booking-wizard.tsx             All the step UI + Stripe Elements
    actions.ts                    submitBookingAction, confirmation email
  manage/[id]/                    Manage My Booking (token-based, no login)
    page.tsx                      Validates the token, shows the booking
    manage-booking-client.tsx     Cancel / reschedule UI
    actions.ts                    cancelBookingAction, rescheduleBookingAction
  realtors/                       Realtor portal placeholder (real one: later phase)
  setup/                          First-run admin creation
  api/stripe/webhook/route.ts     Stripe webhook (idempotent order finalization)
  driver/                         Driver portal (role: "driver" staff accounts)
    login/                        Driver login (separate front door, shared table)
    layout.tsx                    requireStaff() gate + simple header
    page.tsx                      Shared job list (every delivery/pickup due)
    driver-jobs-client.tsx        Mark Delivered/Picked Up (reuses admin actions)
  admin/
    login/                        Admin login (outside the auth gate)
    (protected)/                  Everything behind requireAdmin() (owner-only)
      layout.tsx                  Renders the admin shell
      page.tsx                    Dashboard placeholder
      packages/                   Package management (list/new/[id])
      add-ons/                    Add-on management (list/new/[id])
      faqs/                       FAQ management (list/new/[id])
      inventory/                  Physical tote records + replace workflow
      agreements/                 Rental agreement versions (draft/publish)
      blocked-dates/              Owner-blocked delivery/pickup dates
      calendar/                   Month view, drag-to-reschedule deliveries
      drivers/                    Create/edit driver accounts (list/new/[id])
      orders/                     Order list/detail, status, tote assignment,
                                   late fees (record + on-demand Stripe charge)
      settings/                   Business Settings
lib/
  db/                             Drizzle schema + lazy DB client
  auth/                           Password hashing, sessions, login.ts
                                  (shared by /admin and /driver login),
                                  requireAdmin (owner-only) vs requireStaff
                                  (owner or driver)
  reschedule.ts                   Shared "move this order's delivery date"
                                  logic -- used by Manage My Booking AND
                                  the admin calendar's drag-and-drop
  catalog.ts                      Shared getActivePackages/getActiveFaqs/
                                  getActiveAddOnsForPackage -- the one
                                  place that defines "publicly bookable"
  routing.ts                      OpenRouteService geocoding + distance,
                                  service-area check (Section 14)
  pricing.ts                      The locked pricing formula (Section 15) --
                                  the only place order totals are computed
  availability.ts                 Lead time, blocked dates, daily capacity,
                                  tote inventory, cancellation-window math --
                                  shared by booking, admin, and Manage My Booking
  orders.ts                       The booking pipeline: validates everything
                                  above, prices the order, creates it +
                                  a Stripe PaymentIntent
  stripe.ts                       Lazy Stripe client
  email.ts                        Gmail SMTP confirmation/cancellation/
                                  reschedule emails
  manage-token.ts                 Manage My Booking's opaque-token-hash
                                  helper (same pattern as admin sessions)
  audit.ts                        Audit log writer
  money.ts                        Cents <-> dollars helpers
components/
  admin/admin-shell.tsx           Sidebar + mobile drawer
  public/                         Site header/footer, package card,
                                  signature-pad.tsx (drawn e-signature)
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
* **Packages and add-ons now deactivate instead of hard-deleting once an
  order references them** (`deletePackageAction` / `deleteAddOnAction`).
  This was safe to hard-delete in Phase 2 because no orders existed yet;
  now that they do, deleting a referenced package would violate its
  foreign key from `orders`, so both actions check first and fall back to
  setting `isActive: false`.
* **Orders snapshot everything at booking time** (customer info,
  package/add-on names and prices, addresses, routing/pricing inputs,
  the agreement content itself). This is why it's safe for catalog
  content, settings, and agreement versions to keep changing after an
  order exists -- nothing reads those live values back for a past order.
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
