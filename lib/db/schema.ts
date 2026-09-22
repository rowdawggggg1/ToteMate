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
