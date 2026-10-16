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

Not built yet (as of Phase 2): the real booking flow, Stripe payments, the
admin calendar, inventory/tote management, the Realtor portal, driver
accounts, financial reporting, referrals, gift certificates, and reviews.
(Everything in that list except reviews has since been built -- see the
later phase sections below.)

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

## Phase 5 (this delivery): money, growth & reporting

Revenue and marketing features, on top of Phase 4's day-to-day operations:

* **Referral codes**: every customer gets a referral code generated
  automatically the first time they look for one (lazy creation, no
  admin setup needed). Realtors get a code created for them as part of
  their account. In Admin -> Referrals, the owner sets:
  * the **referrer's reward** (always applied when their code is used --
    either a flat $ amount or a %), and
  * an optional, independently toggleable **referee discount** ($ or %
    off the referred customer's own order).
  A realtor's own code earns the realtor nothing by default (a "realtors
  earn referrer reward too" toggle exists for later, off by default).
  Referrer rewards are **tracked as owed, not auto-paid** -- the owner
  pays the referrer manually (e-transfer, cash, etc.) and marks the
  reward "Paid" from Admin -> Referrals once they do. A customer can't
  refer themselves.
* **Gift cards**, two ways:
  * **Admin-issued**, for free, from Admin -> Gift Cards (e.g. as a
    customer-service gesture).
  * **Purchased**, by anyone, at `/gift-cards` (public) or by a realtor
    from their own portal -- fixed, admin-configurable denominations
    (e.g. $50/$100/$150), paid through Stripe Checkout. The gift card is
    only created once Stripe confirms the payment.
  A gift card and a referral code **can normally both be used on one
  order**, except: a gift card that came from a **realtor's
  subscription** (see below) can't be combined with a referral code on
  the same order, since the realtor is already getting a discount for
  that customer and this prevents stacking two discounts from the same
  source. Gift cards bought at full price (by the public or by a
  realtor) have no such restriction.
* **Realtor program** (`/realtor`, managed from Admin -> Realtors):
  realtors are staff accounts (`admins` rows with `role: "realtor"`,
  following the exact same pattern as Phase 4's driver accounts) an
  owner creates individually. From their own portal a realtor can see
  their referral code, subscribe to a plan, and buy ad-hoc gift cards.
  * **Subscription tiers** (Admin -> Realtor Tiers): the owner defines
    multiple plans (name, monthly or yearly price, and the gift-card
    value it issues each cycle). Each tier syncs to a Stripe
    Product/Price automatically when saved -- changing a tier's price or
    billing cadence creates a new Stripe Price (Stripe Prices are
    immutable) rather than ever editing one in place.
  * A realtor subscribes through Stripe Checkout (recurring billing).
    Every time Stripe confirms a cycle was paid (`invoice.payment_succeeded`,
    which fires for the first cycle too), that realtor is automatically
    issued a new gift card for that tier's configured value.
  * A realtor can cancel any time; the subscription stays active through
    the period already paid for, then stops.
* **Driver and realtor removal**: Admin -> Drivers/Realtors now has a
  real "Remove" option on each account's edit page (previously you could
  only deactivate one, never remove it). It tries to delete the account
  outright; if that account is referenced by historical records (past
  late fees, a referral code, issued gift cards, a subscription), it
  automatically falls back to deactivating it instead and leaves a note
  in the audit log explaining why, so nothing referencing that account
  ever breaks.
* **Financial reporting** (Admin -> Reports): revenue by day/week/month
  and by package, for a chosen date range, plus totals for late fees
  collected, gift cards sold, referral discounts given, and referral
  rewards still owed. Revenue is recognized on the date payment actually
  succeeded, not the delivery date. A "Export CSV" button downloads the
  same report as a CSV file.
* **Booking flow**: added an optional "Referral code or gift card" entry
  at checkout, and a note near the delivery/pickup address fields that
  addresses farther away may carry a delivery/pickup fee (the existing
  distance-based pricing already calculated this -- this just surfaces
  it before payment instead of only at the final total).

**Scope note:** reviews/testimonials were explicitly deferred past Phase
5 per the business owner's own scoping decision, and are not part of
this delivery.

Database-wise, this phase adds eight new tables (`referral_codes`,
`referral_redemptions`, `gift_card_denominations`, `gift_cards`,
`gift_card_redemptions`, `realtor_subscription_tiers`,
`realtor_subscriptions`) and new columns on `business_settings` (the
referral reward/discount settings) and `orders` (the referral/gift-card
amounts applied to each order). Run `npm run db:push` after updating --
additive only, nothing dropped.

**New Stripe webhook events required.** Your Stripe Dashboard webhook
endpoint now needs to be subscribed to four additional events beyond
Phase 3/4's `payment_intent.succeeded` / `payment_intent.payment_failed`:
`checkout.session.completed`, `invoice.payment_succeeded`,
`customer.subscription.updated`, and `customer.subscription.deleted`.
Add these to the endpoint's event list in the Stripe Dashboard -- no new
environment variables are needed, the existing `STRIPE_WEBHOOK_SECRET`
covers all events on that same endpoint.

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
  realtors/                       Public realtor-program info page + sign-in link
  gift-cards/                     Public gift card purchase page
  setup/                          First-run admin creation
  api/stripe/webhook/route.ts     Stripe webhook (order finalization, gift
                                   card purchases, realtor subscription cycles)
  driver/                         Driver portal (role: "driver" staff accounts)
    login/                        Driver login (separate front door, shared table)
    layout.tsx                    requireStaff() gate + simple header
    page.tsx                      Shared job list (every delivery/pickup due)
    driver-jobs-client.tsx        Mark Delivered/Picked Up (reuses admin actions)
  realtor/                        Realtor portal (role: "realtor" staff accounts)
    login/                        Realtor login (separate front door, shared table)
    layout.tsx                    requireRealtor() gate + simple header
    page.tsx                      Referral code, subscription status/tier
                                   picker, gift card purchase, issued cards
    dashboard-client.tsx          Subscribe/cancel/purchase client forms
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
      drivers/                    Create/edit/remove driver accounts (list/new/[id])
      realtors/                   Create/edit/remove realtor accounts (list/new/[id])
      realtor-tiers/              Subscription tier management (list/new/[id])
      referrals/                  Referral settings + payout tracking
      gift-cards/                 Issue gift cards, manage denominations
      orders/                     Order list/detail, status, tote assignment,
                                   late fees (record + on-demand Stripe charge)
      reports/                    Revenue report (by period/package) + CSV export
      settings/                   Business Settings
lib/
  db/                             Drizzle schema + lazy DB client
  auth/                           Password hashing, sessions, login.ts
                                  (shared by /admin, /driver and /realtor login),
                                  requireAdmin (owner-only), requireStaff
                                  (owner or driver), requireRealtor (realtor-only)
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
                                  above, prices the order (incl. referral/gift
                                  card discounts), creates it + a Stripe
                                  PaymentIntent (or skips payment entirely if a
                                  gift card covers the full total)
  referrals.ts                    Referral code generation/lookup, reward/
                                  discount calculation, redemption recording
  giftcards.ts                    Gift card creation/lookup/redemption,
                                  denomination management, Checkout sessions
  realtor-subscriptions.ts        Stripe Product/Price sync for tiers,
                                  subscription Checkout, cycle-paid handling
  reports.ts                      Revenue aggregation (by period/package) + CSV
  stripe.ts                       Lazy Stripe client
  email.ts                        Gmail SMTP confirmation/cancellation/
                                  reschedule/gift-card-purchase emails
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
                                  in requireAdmin() / requireRealtor()
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
* **Referral/gift-card side effects wait for confirmed payment.**
  `lib/orders.ts` freezes the referral discount, referrer reward owed,
  and gift card amount onto the order row at booking time, but doesn't
  deduct the gift card balance or record the referral redemption yet --
  that happens in the Stripe webhook's `handlePaymentSucceeded`, once
  payment is actually confirmed, the same way `stripeCustomerId`/
  `stripePaymentMethodId` are only captured there. This avoids wrongly
  deducting a gift card or owing a referral reward for a booking whose
  payment never completes. The one exception is a gift card that covers
  the entire order (nothing left to charge, so there's no PaymentIntent
  and no webhook) -- `lib/orders.ts` applies those side effects inline
  instead, mirroring the webhook's own logic.
* **Stripe Prices are immutable**, so `lib/realtor-subscriptions.ts`
  never edits one -- a changed tier price or billing cadence creates a
  new Stripe Price and archives the old one. A name-only tier edit does
  not create a new Price.

## Patch 2 (this delivery) -- deferred order creation, address confidence, calendar/orders readability

This is a bug-fix/UX patch on top of Phase 5, not a new phase. Everything
below builds on the existing codebase, deploy chain, and database -- same
rule as always: extract over the existing project, push to the same repo,
redeploy the same Vercel project against the same Neon database.

**Database change -- run `npm run db:push` after extracting this patch.**
A new `pending_bookings` table was added (additive only, nothing dropped or
renamed).

### 1. Deferred order creation (fixes "no way to go back" + cluttered Orders)

Previously, starting checkout immediately wrote a real `orders` row with
status `payment_pending`, even if the customer never paid -- abandoned or
retried checkouts piled up in Admin -> Orders with no way to remove them,
and there was no safe way to go back and fix something (like a typo'd
address) without restarting the whole booking.

Now: a checkout that requires payment stages its full details in a new
`pending_bookings` table (keyed by the Stripe PaymentIntent id) instead of
writing to `orders`. **Nothing appears in Admin -> Orders until payment
actually succeeds.** The Stripe webhook
(`app/api/stripe/webhook/route.ts`) is the one place that promotes a
staged booking into a real, paid order, the moment `payment_intent.
succeeded` fires -- this is also now where the booking confirmation email
is sent from (previously sent from the booking page itself). A staged
booking that's abandoned (never paid) is cleaned up automatically after 2
hours; no scheduled job needed.

The one exception: a gift card that covers 100% of the total has no
PaymentIntent/webhook at all, so that order is still written directly and
marked paid immediately, exactly as before.

**New: a working Back button on the payment step.** Clicking it cancels
the staged booking + its PaymentIntent and returns to the review step, so
the customer can fix something and submit again -- their old PaymentIntent
is cancelled, not reused.

### 2. Address confidence + confirmation (fixes the rural/ambiguous-address bug)

The OpenRouteService provider was kept (no credit card required for its
free tier, unlike Google Maps Platform) -- the ambiguous-address problem
(e.g. "Township Road 444" with no house number resolving to the wrong
point along a long rural road) is instead addressed with:

* `lib/routing.ts` now reads Pelias's own confidence signals
  (`confidence`, `accuracy`, `match_type`) from the geocoding response and
  exposes `isLowConfidenceGeocode()`.
* The payment step now shows the customer **exactly which address we
  resolved their input to**, for both delivery and pickup. If the match
  looks ambiguous (a centroid/fallback match, or low confidence), a
  warning appears with an "Edit address" link that cancels the staged
  booking and sends them back to fix it -- before anything is charged.

This doesn't eliminate every possible mismatch (a vague address can still
resolve somewhere technically "confident" but wrong), but it surfaces the
cases most likely to be wrong and gives the customer a chance to catch it
before paying, which the OpenRouteService-only setup never did before.

### 3. Admin Orders list readability

* Order numbers are now shown as a short `#NNNNNN` (the distinguishing
  trailing segment) instead of the full `TM-YYYYMMDD-NNNNNN` string -- hover
  the link to see the full order number, which is still shown in full on
  the order detail page and in emails.
* Added a **Placed** column (when the order was actually created), so it's
  easy to see how recent an order is at a glance.

### 4. Admin Calendar contrast

Delivery/pickup/blocked chips now use solid background colors with white
text (instead of low-opacity tinted backgrounds), date numbers and the
weekday header use the full-contrast text color instead of the muted one,
day cells have a visible border, and a small color-key legend was added
below the grid. This should read clearly regardless of which custom brand
colors are set in Business Settings.

**No new environment variables for this patch.** Same npm install/tsc
sandbox limitation as every prior phase in this environment -- verified by
careful manual re-read of every changed file rather than a local build.

## Patch 3 (this delivery) -- independent delivery/pickup drag on the Admin calendar

Dragging a delivery chip to a new day used to also shift the pickup date by
the same amount (to preserve the rental duration) -- fine for a customer's
own self-service reschedule, but not what you want as the owner moving jobs
around for logistics reasons (e.g. delivering a day early as a courtesy
while still picking up on the originally-promised day, or pushing pickup
back a day).

Now, on the Admin calendar, delivery and pickup chips move **independently**:
dragging a delivery chip only changes the delivery date (pickup stays put),
and pickup chips are now draggable too (only before the order has been
delivered), moving just the pickup date. Blocked dates, daily capacity, and
tote-inventory limits are still fully checked either way. The
customer-facing Manage My Booking reschedule is unchanged -- it still moves
both dates together, since that's what preserves what the customer actually
paid for.

No schema change, no new environment variables.

## Patch 4 (this delivery) -- order fees generalized, realtor referee discount, admin cancellation, rental extensions, custom orders

Seven changes, all additive (run `npm run db:push` after deploying this patch):

**1. Order fees generalized beyond "late fees."** The old Late Fees section
on an order is now "Fees," covering late returns, damaged/lost totes, and
new damaged/lost dolly fees (configurable default amounts on the Settings
page, alongside the existing tote fees). Same always-recorded,
charged-on-demand pattern as before -- adding a fee never auto-charges the
card on file; charging it is always a separate, explicit click. Schema: the
`order_late_fees` table (left named as-is to avoid a destructive rename)
gained a `fee_type` column, defaulted to `"late"` so every existing row
keeps its original meaning. `addLateFeeAction`/`chargeLateFeeAction` are
now `addOrderFeeAction`/`chargeOrderFeeAction`.

**2. Realtor-owned referral codes can have their own referee discount.**
Business Settings -> Referral Program now has separate "Referee discount"
sections for ordinary customer codes vs. realtor-owned codes, so a realtor's
own code can give their referrals a different discount than a regular
customer's code does. New `business_settings` columns:
`referral_referee_discount_realtor_enabled/type/value_cents/percentage`.

**3. Admin order cancellation.** Any order not already in a dead-end status
(draft, payment pending/failed, scheduled, or delivered) can now be
cancelled directly from its detail page -- separate from the customer's own
self-service cancel, and broader in scope so it also works for cleaning up
old test/clutter orders. The admin can let the automatic cancellation-fee
rule calculate the refund, or type in a manual override amount. Cancelling
never deletes the order -- it's just how an order leaves the default Orders
list (see #5). No schema change -- reuses the existing `cancelled_at` /
`cancellation_reason` / `cancellation_fee_cents` / `refunded_amount_cents`
columns.

**4. Rental extensions after booking (or after delivery).** If a customer
decides mid-rental they need the totes longer, an order's detail page now
has an "Rental extensions" section: pick extra weeks, and it's added
on to the *same* order (not a separate one) at that order's own locked
weekly-extension rate, immediately pushing the pickup date out -- after
re-checking that the fleet can actually support the longer window (blocked
dates / daily capacity / tote inventory), so it never silently overbooks.
Same always-recorded/charge-on-demand pattern as fees. New table:
`order_extensions` (weeks, amount, previous/new pickup date, status,
Stripe fields, mirroring `order_late_fees`'s shape).

**5. Cancelled/refunded orders hidden by default.** The Orders list now
hides `cancelled` and `refunded` orders by default (a "Show
cancelled/refunded" link brings them back) -- so #3 can also be used to
clear out old clutter without it piling up in the default view forever.

**6. Admin-created custom orders.** Orders -> "+ New Order" lets you create
a booking yourself for a phone call, email, or walk-in customer: pick an
existing package, dates, addresses, and enter the delivery/pickup fee
directly (no ORS geocoding for a custom order -- type what you want to
charge). Unlike the public booking flow, there's no minimum-lead-time rule
and no signed rental agreement required (note how you handled that in the
order's internal notes if relevant) -- but blocked dates, daily capacity,
and tote inventory are still fully checked. You choose per order how
payment works:
  - **Mark as paid now** -- for cash/e-transfer/etc. collected outside the
    app; the order is created already paid and scheduled.
  - **Send a Stripe payment link** -- the order is created right away as
    "payment pending" (showing in the Orders list, holding its spot in the
    schedule), and you get a Stripe Checkout link to text/email the
    customer. A "Payment link" section on the order page lets you
    regenerate the link if needed. Once paid, the Stripe webhook marks the
    order paid/scheduled automatically and saves the card on file (so a
    later fee/extension can still be charged on-demand, same as any other
    order).

No schema change for #6 itself (reuses `orders` as-is) -- it's really
schema changes #1/#2/#4 above plus the new `/admin/orders/new` page and a
new Checkout-session purpose (`custom_order_payment`) handled in the Stripe
webhook.

**7. Reviews.** A customer can leave a 1-5 star rating + optional comment
(with an optional "post anonymously" checkbox) for a completed order:

  - **Requesting a review.** A review-request email (with a one-time,
    tokenized link to `/review/[orderId]`, the same opaque-token pattern as
    "Manage My Booking") goes out automatically when an order is marked
    completed, *unless* you turn that off under Business Settings ->
    Reviews ("Automatically email a review request..."). Whether that's on
    or off, you can always send or resend one manually from an order's page
    (shows up once the order is picked up or completed) -- useful for
    requesting a review on an older order, or resending a lost link. Only
    one review per order; once submitted, the link stops working.
  - **Moderation.** Every submitted review starts as "pending" in
    Admin -> Reviews. You approve or reject each one -- a rejected review
    is never shown publicly. Separately, an *approved* review has its own
    "Show on public site" / "Hide from public site" toggle (same idea as a
    FAQ's active/inactive toggle), so you can pull a review out of public
    view later without re-doing the approval. Reviews can also be deleted
    outright.
  - **Public display.** The homepage shows a Google-reviews-style summary
    ("4.8 out of 5 (23 reviews)") plus a grid of review cards -- built only
    from reviews that are both approved AND currently toggled public. The
    section is simply omitted if there are no public reviews yet.

New `reviews` table (one row per submitted review: rating, comment,
customer name/anonymous flag, moderation status, public toggle). New
columns on `orders` (`review_token_hash`, `review_requested_at`,
`review_submitted_at`) and on `business_settings`
(`review_auto_request_enabled`).

**8. Build fix.** `app/admin/(protected)/orders/actions.ts` has `"use
server"` at the top, and Next.js requires every export from a `"use
server"` file to be an async function -- the `FEE_TYPES` constant (added
in #1 above) broke `npm run build` with "A 'use server' file can only
export async functions, found object." Moved `FEE_TYPES` to its own plain
module, `lib/order-fees.ts` (no `"use server"` directive), imported from
both the server actions and the fee-form component. Same pattern already
used for `TOTE_STATUSES` in `app/admin/(protected)/inventory/
tote-statuses.ts` -- worth remembering for any future shared constant that
a "use server" file needs.

**9. A reassurance note on the address fields.** The delivery/pickup
address step on the public booking page now shows a small note under the
address fields -- "Having trouble entering your address... feel free to
email us / text us" -- using your Business Settings contact email/phone,
shown only when at least one is set.

**No new environment variables for this patch.** Same npm install/tsc
sandbox limitation as every prior phase in this environment -- verified by
careful manual re-read of every changed file rather than a local build.

## Patch 5 (this delivery) -- address accuracy, checkout speed, map preview, sequential order numbers, layout fixes

Run `npm install` (new dependency: `leaflet`, for the map preview -- see #4)
and `npm run db:push` (one new `business_settings` column) after deploying
this patch.

**1. Fixed: admin order cancellation failing with "Invalid input."**
Cancelling an order that was never paid always failed, because the
"Refund override" field only renders in the form when the order *was*
paid -- so for an unpaid order, the browser never submitted that field at
all, and `formData.get("refundOverride")` came back `null` rather than
simply missing. Zod's `.optional()` only treats `undefined` as "not
provided" and rejects `null`, so validation failed every time. Fixed in
`app/admin/(protected)/orders/actions.ts`'s `adminCancelOrderAction` by
coalescing `null` to `""` before validating. No schema change.

**2. Structured geocoding, to fix addresses like "5303 60 St, Camrose, AB"
matching the wrong thing.** The previous free-text geocoding concatenated
the whole address into one string and let the geocoder's natural-language
parser split it back apart -- which, especially against sparse rural-
Alberta data, could drop the house number entirely and match just the
street. `lib/routing.ts` now also offers `geocodeAddressStructured` /
`geocodeAndValidateServiceAreaStructured`, which send the house number/
street, city, province, and postal code as separate fields to
OpenRouteService's *structured* geocoding endpoint instead, skipping that
parsing step. The public booking flow (`lib/orders.ts`) now uses the
structured path; Business Settings' single free-text business-address
field still uses the original free-text path (there's nothing to split
there). This narrows the problem significantly but can't guarantee a
perfect match for every address ORS has sparse data for -- see #4 for the
complementary fix (a map preview so the customer can see and correct the
resolved point themselves).

**3. Faster checkout.** The booking pipeline used to run every external
call (geocode delivery, geocode pickup, distance delivery, distance
pickup, plus the three availability checks) one after another. Delivery
and pickup are independent of each other, so their geocode calls now run
in parallel via `Promise.all`, and so do their distance calls; the three
availability checks (delivery-date, pickup-day capacity, tote inventory)
run concurrently too, since none of them actually depends on another's
result. Checkout should feel noticeably snappier, especially for a
different-pickup-address booking (previously 4 sequential routing calls,
now 2 batches of 2).

**4. Map preview with a draggable pin, before the rental agreement.** On
the address step, a new "Preview on map" link runs the same structured
geocode the real booking will use and shows the resolved point on an
OpenStreetMap map (`components/public/address-map-preview.tsx`, plain
Leaflet -- no API key, no paid mapping dependency). If the match was
low-confidence, a note says so right there and invites the customer to
drag the pin to the correct spot or add more address detail -- so an
ambiguous address can be fixed on the spot instead of only surfacing as a
warning after checkout. Dragging the pin doesn't change the saved address
text, only the exact point used for delivery/pickup distance pricing
(`CreateBookingInput.deliveryLatLngOverride`/`pickupLatLngOverride` in
`lib/orders.ts`) -- the typed address still has to pass the service-area
check on its own. The existing step-4 low-confidence warning (with its
"Edit" link back to the address step) is left in place as a safety net for
anyone who skips the map check.

**5. Fixed: going back to fix the address wiped the signature, silently
forcing a re-sign.** The rental-agreement step's signature pad is only
rendered while that step is showing, so navigating away (e.g. using the
address-confidence warning's "Edit" link) and back unmounted and
remounted the canvas -- the "I agree" checkbox still looked checked, but
the actual drawn signature was gone, so submitting failed with "Please
sign and agree" and the customer had to sign again with no visible reason
why. `components/public/signature-pad.tsx` now accepts an `initialDataUrl`
to restore a previous signature on mount and an `onChange` callback so the
wizard can keep its own copy in state across remounts.

**6. The rental-agreement step now starts at the top, not wherever the
previous step left the scroll position.** This step shows the referral
code / gift card fields above the agreement and signature pad, but since
every step renders in the same page (no navigation between them), the
browser kept whatever scroll position the previous step was left at --
which could land a customer already scrolled down near the signature pad,
past the referral/gift-card fields, with no reason to ever scroll back up
to notice them. The wizard now scrolls to the top of the page on every
step change.

**7. Sequential order numbers ("TM-1", "TM-2", ...) instead of a random
6-digit suffix** ("TM-20261012-873219"), so orders are easier to track and
reference out loud. Both order-creation paths (public booking, admin
custom orders) now pull from one shared, atomically-incremented counter
(`business_settings.next_order_number`, via `lib/order-number.ts` --
a single `UPDATE ... RETURNING`, safe under concurrent bookings thanks to
Postgres's row lock). A new **"Reset Testing Data"** section at the bottom
of Business Settings lets you permanently delete every order (fees,
extensions, reviews, and referral/gift-card redemptions all cascade-delete
with it) and reset the counter back to 1, once you're done test-booking --
it requires typing an exact confirmation phrase first, since this can't be
undone. Totes left "with customer" or "needs cleaning" by deleted test
orders are reset to "ready"; totes you've marked damaged/lost/retired
yourself are left alone. Gift card balances and referral usage from test
orders are **not** rolled back automatically -- double-check those pages
too if you used test codes/cards. New column:
`business_settings.next_order_number` (defaults to 1).

**8. "Where We Serve" moved to the top of the homepage**, right under the
hero, instead of near the bottom below the reviews section -- so service
area is one of the first things a visitor sees.

**9. Fixed: checkout getting permanently stuck on "Checking
availability..." with nothing in the logs.** A `fetch()` call with no
timeout just hangs if the routing provider stalls or a connection drops
silently -- there's nothing for `catch`/`console.error` to report, and on
Vercel it just runs out the clock on the function's own execution-time
limit, which kills the request without an application-level error. Added:
an explicit ~12s timeout (via `AbortController`) on every OpenRouteService
call in `lib/routing.ts`, a shorter explicit timeout on the Stripe client
(`lib/stripe.ts`), `export const maxDuration = 30` on the booking Server
Actions (`app/book/actions.ts`, raises Vercel's allowed execution time --
**note:** a Hobby-plan project's limit is hard-fixed at 10s regardless and
ignores this; if checkouts still stall after deploying this patch, that's
the next thing to check in the Vercel project's plan/Functions settings),
and a 35-second client-side give-up-and-show-an-error fallback in the
booking wizard itself, so the button can never again be stuck indefinitely
with no way for the customer to retry.

**10. Address messaging + speed follow-up.** (a) An address that already
has a house number no longer gets told to "add a house number": if the map
data we use simply has no point for that exact house (common in smaller
Alberta towns), the match falls back to the street, and the customer now
sees a soft note ("we'll deliver to the address you typed") instead of a
warning. The strong warning is reserved for a match in a *different town*
than typed, or a street-level match with no house number given.
(b) Address searches are now biased toward your business location and
restricted to Canada, so a common street name like "60 St" resolves to
the nearby town first. (c) Checkout speed: geocoding/routing now runs *at
the same time as* the database availability checks (previously after),
and several independent lookups run together. Every checkout now writes
`[booking-timing] <step>: +Nms` lines to the server logs (Vercel -> Logs)
so any remaining slowness can be pinned on one specific step.

**11. Map now appears automatically.** The "Preview on map" link on the
address step was easy to miss (and optional), so it's gone from there. The
agree-and-sign step now opens with "Confirm delivery location": the address
is looked up on its own and an OpenStreetMap map with a pin is shown right
away -- tap the map or drag the pin to correct it. (Pickup gets its own map
if it's a different address.) A pin placed earlier is remembered if the
customer navigates back and forth, and is cleared if they edit the address.
Leaflet's stylesheet is now loaded at runtime from unpkg instead of
imported from node_modules.

**No other schema changes.** Only new column this patch:
`business_settings.next_order_number`.

## Patch 6 (this delivery) -- build fix + order times in the right timezone

(Patch 5's fixes are included -- this is the full project.)

**1. Build fix.** `app/book/actions.ts` is a `"use server"` file, and
Next.js only allows async functions to be exported from those -- the
`export const maxDuration = 30` I had added there (Patch 5, item 9) broke
`npm run build`, and the "cannot find submitBookingAction / ..." errors in
`booking-wizard.tsx` were just fallout from that module failing to compile.
`maxDuration` is a *route segment config*, so it now lives in
`app/book/page.tsx` (still 30s, and it still covers the booking Server
Actions called from that page). Re-scanned every `"use server"` file in the
project: no other non-async exports. (A Hobby-plan Vercel project caps
function time at 10s regardless of this setting.)

**2. Order times were wrong.** Server-rendered pages run on Vercel, which
is on UTC, and the Orders list formatted "Placed" without a timezone -- so
it showed UTC instead of your local time. New `lib/format-datetime.ts`
formats in the timezone set in Business Settings (default
America/Edmonton). Applied to the Orders list "Placed" column, the order
detail page (which now also shows a "Placed:" line, plus Delivered/Picked
up times), and the drivers/realtors "Last signed in" lines. No schema
change.
