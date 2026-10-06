import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  date,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Staff accounts: both the business owner/admin and drivers live in this
 * one table, distinguished by `role`, per the locked spec (Section 12 of
 * the final amendment): "owner" (full admin access) or "driver" (shares
 * this table/session/login machinery, but is restricted to the /driver
 * job list -- see lib/auth/admin.ts's requireAdmin() vs requireStaff()).
 * The initial "owner" account is created through /setup; driver accounts
 * are created by an owner from Admin -> Drivers.
 */
export const admins = pgTable("admins", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  isActive: boolean("is_active").notNull().default(true),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Admin sessions use opaque random tokens, not signed JWTs. The raw token
 * lives only in the HTTP-only cookie; only its SHA-256 hash is stored here.
 * This makes sessions individually revocable (Section 2.28 of the spec)
 * without needing a separate signing secret.
 */
export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => admins.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * Single-row (id = 1) business configuration table. Later phases will add
 * more settings here (email, referral, realtor, agreement, etc.) rather
 * than duplicating configuration in code. Money values are stored as
 * integer cents; distances/percentages use exact numeric columns -- never
 * floating point, per the spec's monetary-precision requirement.
 */
export const businessSettings = pgTable("business_settings", {
  id: integer("id").primaryKey().default(1),

  businessName: text("business_name").notNull().default("ToteMate"),
  tagline: text("tagline"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  businessAddress: text("business_address"),
  currency: text("currency").notNull().default("CAD"),
  distanceUnit: text("distance_unit").notNull().default("km"),
  timezone: text("timezone").notNull().default("America/Edmonton"),
  serviceArea: text("service_area"),
  logoUrl: text("logo_url"),

  // Public-site theming. Each is a #rrggbb hex string; defaults match the
  // original hard-coded design tokens in app/globals.css so existing sites
  // look unchanged until an admin picks new colors.
  primaryColor: text("primary_color").notNull().default("#2f5233"),
  accentColor: text("accent_color").notNull().default("#c98a4b"),
  backgroundColor: text("background_color").notNull().default("#faf8f3"),
  // Optional large image shown in the homepage hero. Falls back to a
  // built-in illustration when not set.
  heroImageUrl: text("hero_image_url"),

  minLeadTimeDays: integer("min_lead_time_days").notNull().default(2),

  deliveryFreeRadiusKm: numeric("delivery_free_radius_km", {
    precision: 6,
    scale: 2,
  })
    .notNull()
    .default("0"),
  pickupFreeRadiusKm: numeric("pickup_free_radius_km", {
    precision: 6,
    scale: 2,
  })
    .notNull()
    .default("0"),
  // Hard service-area cutoff, distinct from the free-radius pricing
  // thresholds above: an address farther than this from the business
  // should be rejected at booking time rather than just priced higher.
  // Null means no hard cutoff is enforced. Enforcement itself happens in
  // the booking phase -- this column just stores the admin's chosen limit.
  maxDeliveryRadiusKm: numeric("max_delivery_radius_km", {
    precision: 6,
    scale: 2,
  }),

  // --- Phase 3: booking/routing/scheduling settings ---

  // Geocoded coordinates of the business origin, used by the routing
  // service as the starting point for every delivery/pickup route.
  // Populated automatically when businessAddress is saved (best effort);
  // admin can override manually if geocoding picks the wrong spot.
  businessOriginLat: numeric("business_origin_lat", { precision: 9, scale: 6 }),
  businessOriginLng: numeric("business_origin_lng", { precision: 9, scale: 6 }),

  // Two-letter province/region code addresses must fall within to be
  // considered in-service-area (e.g. "AB" for Alberta). Kept separate from
  // the free-text serviceArea description shown to customers so the
  // routing/booking code has something exact to check against.
  serviceAreaProvinceCode: text("service_area_province_code").notNull().default("AB"),

  // Which moment of the (day-only) delivery date the cancellation-window
  // countdown is measured against, since deliveries have no guaranteed
  // time. "start_of_day" (midnight at the start of the delivery date) is
  // more protective of the business; "end_of_day" (11:59:59 PM on the
  // delivery date) is more lenient to the customer. Configurable because
  // the owner may want to change this later without a code change.
  cancellationCutoffReference: text("cancellation_cutoff_reference")
    .notNull()
    .default("start_of_day"),

  // Current total count of physical totes is derived from the totes table
  // itself (see `totes` below), not stored here.
  deliveryRateCentsPerKm: integer("delivery_rate_cents_per_km")
    .notNull()
    .default(0),
  pickupRateCentsPerKm: integer("pickup_rate_cents_per_km")
    .notNull()
    .default(0),

  readinessBufferDays: integer("readiness_buffer_days").notNull().default(1),

  dailyCapacityEnabled: boolean("daily_capacity_enabled")
    .notNull()
    .default(false),
  maxDeliveriesPerDay: integer("max_deliveries_per_day"),
  maxPickupsPerDay: integer("max_pickups_per_day"),
  maxCombinedJobsPerDay: integer("max_combined_jobs_per_day"),

  overbookingEnabled: boolean("overbooking_enabled").notNull().default(false),

  // "fixed" | "percentage"
  cancellationFeeType: text("cancellation_fee_type").notNull().default("fixed"),
  cancellationFeeAmountCents: integer("cancellation_fee_amount_cents")
    .notNull()
    .default(0),
  cancellationFeePercentage: numeric("cancellation_fee_percentage", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("0"),
  // Hours before scheduled delivery required to qualify for the
  // configured cancellation refund rule at all. Cancelling inside this
  // window means no refund, regardless of the fee settings above.
  cancellationWindowHours: integer("cancellation_window_hours")
    .notNull()
    .default(24),

  lateFeeCentsPerToteDay: integer("late_fee_cents_per_tote_day")
    .notNull()
    .default(0),
  damagedToteFeeCents: integer("damaged_tote_fee_cents").notNull().default(0),
  lostToteFeeCents: integer("lost_tote_fee_cents").notNull().default(0),

  bookingPaused: boolean("booking_paused").notNull().default(false),

  // Doubles as the first-run setup mutex: NULL until the initial admin
  // account has been successfully created (see app/setup/actions.ts).
  setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Lightweight audit log. Per the final amendment (Section 18), this is
 * intentionally simple: retain roughly a week of history, no IP/device
 * tracking infrastructure. A scheduled cleanup job can be added later
 * (e.g. a Vercel Cron route) -- not built in Phase 1 to avoid unnecessary
 * infrastructure before it's needed.
 */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  actorType: text("actor_type").notNull(), // "admin" | "system"
  actorId: uuid("actor_id"),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Rental packages shown on the public site. New packages default to
 * inactive so an incomplete package can never accidentally become
 * publicly bookable (Section 9.24). "price" is the flat price for the
 * package's standard rental period (rentalDurationWeeks) -- full weeks
 * only, per the final amendment (no prorated/daily pricing). A package's
 * own weekly extension price is modeled separately as a package-specific
 * add-on (see addOns.isWeeklyExtension below), not as a column here.
 */
export const packages = pgTable("packages", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  toteQuantity: integer("tote_quantity").notNull(),
  priceCents: integer("price_cents").notNull(),
  rentalDurationWeeks: integer("rental_duration_weeks").notNull().default(1),
  includesDolly: boolean("includes_dolly").notNull().default(false),
  useCaseDescription: text("use_case_description"),
  photoUrl: text("photo_url"),
  isActive: boolean("is_active").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Add-ons. When packageId is set, the add-on is only offered alongside
 * that specific package (this is how package-specific weekly-extension
 * add-ons are modeled, per the final amendment: "the weekly rental
 * extension add-on must be associated with a specific package"). When
 * packageId is null, the add-on is available with any package.
 * isWeeklyExtension marks which one add-on (if any) is "the" extra-week
 * option for its package; only one per package is enforced in the action.
 */
export const addOns = pgTable("add_ons", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  priceCents: integer("price_cents").notNull(),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  packageId: uuid("package_id").references(() => packages.id, {
    onDelete: "cascade",
  }),
  isWeeklyExtension: boolean("is_weekly_extension").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Public FAQ entries. Defaults to active since this is low-risk marketing
 * copy, unlike packages/add-ons which touch pricing.
 */
export const faqs = pgTable("faqs", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// =====================================================================
// Phase 3: Booking, Pricing, Payments
// =====================================================================

/**
 * Individual physical reusable totes. Deliberately simple per the spec
 * (Section 16): a business-facing number, a status, and replacement
 * history -- not a warehouse-management system. `replacesToteId` lets a
 * replacement unit reuse an old business-facing number while keeping a
 * distinct underlying identity, so historical rental counts/profit stay
 * attached to the correct physical unit (Section 19).
 */
export const totes = pgTable("totes", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  number: text("number").notNull(),
  // "ready" | "with_customer" | "needs_cleaning" | "damaged" | "lost" | "retired"
  status: text("status").notNull().default("ready"),
  completedRentalCount: integer("completed_rental_count").notNull().default(0),
  netProfitAttributedCents: integer("net_profit_attributed_cents")
    .notNull()
    .default(0),
  replacesToteId: uuid("replaces_tote_id"),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Versioned rental agreement content (Section 21). Only one version is
 * "active" at a time; new bookings snapshot whichever version is active
 * at signing time onto the order itself (orders.agreementVersionId +
 * agreementContentSnapshot), so editing/publishing a new version here
 * never changes what a past customer is shown to have agreed to.
 */
export const rentalAgreementVersions = pgTable("rental_agreement_versions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  versionLabel: text("version_label").notNull(),
  content: text("content").notNull(),
  // "draft" | "active" | "superseded"
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

/**
 * Owner-blocked dates (Section 12.7). A date here is unavailable for new
 * delivery/pickup selections regardless of capacity/inventory.
 */
export const blockedDates = pgTable(
  "blocked_dates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    date: date("date").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.date)]
);

/**
 * The central order record (Section 20). Pricing/package/add-on/address
 * fields are deliberately duplicated as a frozen snapshot rather than
 * foreign-keyed live lookups, per the historical-snapshot rule: once an
 * order is paid, later changes to packages/add-ons/settings must never
 * alter what this row says the customer bought and paid.
 */
export const orders = pgTable("orders", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderNumber: text("order_number").notNull().unique(),

  // Lifecycle status. "draft" | "payment_pending" | "payment_failed" |
  // "paid" | "scheduled" | "delivered" | "active_rental" | "picked_up" |
  // "completed" | "cancelled" | "refunded"
  status: text("status").notNull().default("draft"),

  // --- Customer (snapshot; the booking's own record of who it's for) ---
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),

  // --- Package snapshot ---
  packageId: uuid("package_id").references(() => packages.id),
  packageName: text("package_name").notNull(),
  packageToteQuantity: integer("package_tote_quantity").notNull(),
  packagePriceCents: integer("package_price_cents").notNull(),
  rentalDurationWeeks: integer("rental_duration_weeks").notNull(),
  includesDolly: boolean("includes_dolly").notNull().default(false),

  // --- Weekly extension snapshot (at most one, package-specific) ---
  weeklyExtensionAddOnId: uuid("weekly_extension_add_on_id"),
  weeklyExtensionName: text("weekly_extension_name"),
  weeklyExtensionPriceCents: integer("weekly_extension_price_cents"),
  extensionWeeks: integer("extension_weeks").notNull().default(0),

  // --- Other add-ons snapshot: [{ addOnId, name, priceCents, quantity }] ---
  addOns: jsonb("add_ons").notNull().default([]),

  // --- Dates ---
  requestedDeliveryDate: date("requested_delivery_date").notNull(),
  confirmedDeliveryDate: date("confirmed_delivery_date").notNull(),
  requestedPickupDate: date("requested_pickup_date").notNull(),
  confirmedPickupDate: date("confirmed_pickup_date").notNull(),
  preferredDeliveryWindow: text("preferred_delivery_window"),
  preferredPickupWindow: text("preferred_pickup_window"),
  actualDeliveredAt: timestamp("actual_delivered_at", { withTimezone: true }),
  actualPickedUpAt: timestamp("actual_picked_up_at", { withTimezone: true }),

  // --- Addresses (snapshot; each as { street, city, province, postalCode,
  //     country, formatted, lat, lng }) ---
  deliveryAddress: jsonb("delivery_address").notNull(),
  pickupSameAsDelivery: boolean("pickup_same_as_delivery").notNull().default(true),
  pickupAddress: jsonb("pickup_address"),
  deliveryInstructions: text("delivery_instructions"),
  pickupInstructions: text("pickup_instructions"),

  // --- Routing/pricing snapshot (Section 14/15 historical inputs) ---
  deliveryDistanceKm: numeric("delivery_distance_km", { precision: 8, scale: 3 }),
  pickupDistanceKm: numeric("pickup_distance_km", { precision: 8, scale: 3 }),
  deliveryFreeRadiusKmUsed: numeric("delivery_free_radius_km_used", {
    precision: 6,
    scale: 2,
  }),
  pickupFreeRadiusKmUsed: numeric("pickup_free_radius_km_used", {
    precision: 6,
    scale: 2,
  }),
  deliveryRateCentsPerKmUsed: integer("delivery_rate_cents_per_km_used"),
  pickupRateCentsPerKmUsed: integer("pickup_rate_cents_per_km_used"),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  pickupFeeCents: integer("pickup_fee_cents").notNull().default(0),
  // Admin manual override of the calculated delivery/pickup price, per the
  // final amendment ("Admin must be able to manually override distance
  // and/or price when necessary"). Null means no override was applied.
  priceOverrideCents: integer("price_override_cents"),
  priceOverrideReason: text("price_override_reason"),

  // --- Final total ---
  finalAmountCents: integer("final_amount_cents").notNull(),
  currency: text("currency").notNull().default("CAD"),

  // --- Payment ---
  // "not_started" | "pending" | "paid" | "failed" | "partially_refunded" | "refunded"
  paymentStatus: text("payment_status").notNull().default("not_started"),
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
  // --- Phase 4: card on file, for on-demand late-fee charging ---
  // Captured from the booking PaymentIntent once it succeeds (see the
  // Stripe webhook). The original PaymentIntent is created with
  // setup_future_usage: "off_session" specifically so this payment method
  // stays chargeable later without the customer re-entering card details.
  // Null for any order whose card wasn't saved (declined off-session use,
  // or booked before this feature existed) -- late fees on those orders
  // can still be recorded, just not charged through the app.
  stripeCustomerId: text("stripe_customer_id"),
  stripePaymentMethodId: text("stripe_payment_method_id"),

  // --- Agreement (Section 21) ---
  agreementVersionId: uuid("agreement_version_id"),
  agreementVersionLabel: text("agreement_version_label"),
  agreementContentSnapshot: text("agreement_content_snapshot"),
  agreementSignatureDataUrl: text("agreement_signature_data_url"),
  agreementSignedAt: timestamp("agreement_signed_at", { withTimezone: true }),

  // --- Manage My Booking secure access ---
  manageTokenHash: text("manage_token_hash").unique(),

  // --- Cancellation ---
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  cancellationFeeCents: integer("cancellation_fee_cents"),

  // --- Notes ---
  internalNotes: text("internal_notes"),

  // --- Completion (Section 20.40) ---
  completedAt: timestamp("completed_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Links a physical tote to the order it's currently (or was) assigned to.
 * Rows are never deleted once the tote has actually been delivered, so
 * historical rental counts/profit allocation (Section 18) always know
 * exactly which physical units went out on a completed rental.
 */
export const orderToteAssignments = pgTable("order_tote_assignments", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  toteId: uuid("tote_id")
    .notNull()
    .references(() => totes.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

/**
 * Late fees applied to an order (Section 20 / final amendment: automatic
 * late fees stay a manual admin action, not an auto-charge). A row here is
 * ALWAYS created the moment an admin applies a fee -- it's recorded and
 * visible on the order immediately, regardless of whether it ever gets
 * charged. Charging it through Stripe (using the card on file captured at
 * booking) is a separate, explicit admin action the owner triggers
 * whenever they choose; it is never automatic. "status" tracks that
 * separately from the fee's existence: "recorded" (not yet charged --
 * the default, and the end state if the owner collects it another way),
 * "charged" (the saved card was successfully charged), or "charge_failed"
 * (an attempt was made but the card was declined/unusable -- still owed,
 * admin can retry or collect manually).
 */
export const orderLateFees = pgTable("order_late_fees", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason"),
  // "recorded" | "charged" | "charge_failed"
  status: text("status").notNull().default("recorded"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  chargeFailureMessage: text("charge_failure_message"),
  chargedAt: timestamp("charged_at", { withTimezone: true }),
  createdByAdminId: uuid("created_by_admin_id").references(() => admins.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Processed Stripe webhook event IDs, purely for idempotency: a
 * payment_intent.succeeded (or any other) event is only ever acted on
 * once, no matter how many times Stripe redelivers it.
 */
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
