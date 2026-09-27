import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Admin users. The initial account is created through /setup.
 * Future phases may add a "driver" role that shares this table with a
 * restricted set of permitted actions, per the locked spec (Section 12 of
 * the final amendment): Admin (owner) and Driver (view-only operational).
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
