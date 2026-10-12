"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";
import { createCustomOrder, createCustomOrderCheckoutLink } from "@/lib/custom-orders";

const addressSchema = z.object({
  street: z.string().trim().min(1, "Street address is required."),
  city: z.string().trim().min(1, "City is required."),
  province: z.string().trim().min(1, "Province/region is required."),
  postalCode: z.string().trim().min(1, "Postal/ZIP code is required."),
  country: z.string().trim().min(1, "Country is required."),
});

const createCustomOrderSchema = z.object({
  packageId: z.string().uuid("Choose a package."),
  extensionWeeks: z.coerce.number().int().min(0).default(0),

  customerName: z.string().trim().min(1, "Customer name is required."),
  customerEmail: z.string().trim().email("Enter a valid email address."),
  customerPhone: z.string().trim().min(1, "Phone number is required."),

  requestedDeliveryDate: z.string().trim().min(1, "Choose a delivery date."),

  deliveryStreet: z.string().trim().min(1, "Street address is required."),
  deliveryCity: z.string().trim().min(1, "City is required."),
  deliveryProvince: z.string().trim().min(1, "Province/region is required."),
  deliveryPostalCode: z.string().trim().min(1, "Postal/ZIP code is required."),
  deliveryCountry: z.string().trim().min(1, "Country is required."),
  deliveryInstructions: z.string().trim().optional().default(""),

  pickupSameAsDelivery: z.coerce.boolean(),
  pickupStreet: z.string().trim().optional().default(""),
  pickupCity: z.string().trim().optional().default(""),
  pickupProvince: z.string().trim().optional().default(""),
  pickupPostalCode: z.string().trim().optional().default(""),
  pickupCountry: z.string().trim().optional().default(""),
  pickupInstructions: z.string().trim().optional().default(""),

  deliveryFee: z.coerce.number().min(0).default(0),
  pickupFee: z.coerce.number().min(0).default(0),
  priceOverride: z.string().trim().optional().default(""),
  priceOverrideReason: z.string().trim().optional().default(""),

  internalNotes: z.string().trim().optional().default(""),
  paymentMethod: z.enum(["mark_paid", "charge_stripe"]),
});

export type CreateCustomOrderActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  // Set once the order has actually been created -- a successful mark-paid
  // creation has no link; a charge_stripe creation does.
  createdOrderNumber?: string;
  createdOrderId?: string;
  checkoutUrl?: string | null;
};

export async function createCustomOrderAction(
  _prevState: CreateCustomOrderActionState,
  formData: FormData
): Promise<CreateCustomOrderActionState> {
  const admin = await requireAdmin();

  const raw = {
    packageId: formData.get("packageId"),
    extensionWeeks: formData.get("extensionWeeks"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    requestedDeliveryDate: formData.get("requestedDeliveryDate"),
    deliveryStreet: formData.get("deliveryStreet"),
    deliveryCity: formData.get("deliveryCity"),
    deliveryProvince: formData.get("deliveryProvince"),
    deliveryPostalCode: formData.get("deliveryPostalCode"),
    deliveryCountry: formData.get("deliveryCountry"),
    deliveryInstructions: formData.get("deliveryInstructions"),
    pickupSameAsDelivery: formData.get("pickupSameAsDelivery") === "on",
    pickupStreet: formData.get("pickupStreet"),
    pickupCity: formData.get("pickupCity"),
    pickupProvince: formData.get("pickupProvince"),
    pickupPostalCode: formData.get("pickupPostalCode"),
    pickupCountry: formData.get("pickupCountry"),
    pickupInstructions: formData.get("pickupInstructions"),
    deliveryFee: formData.get("deliveryFee"),
    pickupFee: formData.get("pickupFee"),
    priceOverride: formData.get("priceOverride"),
    priceOverrideReason: formData.get("priceOverrideReason"),
    internalNotes: formData.get("internalNotes"),
    paymentMethod: formData.get("paymentMethod"),
  };

  const parsed = createCustomOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors, error: "Please fix the highlighted fields." };
  }
  const data = parsed.data;

  if (!data.pickupSameAsDelivery) {
    const pickupAddr = addressSchema.safeParse({
      street: data.pickupStreet,
      city: data.pickupCity,
      province: data.pickupProvince,
      postalCode: data.pickupPostalCode,
      country: data.pickupCountry,
    });
    if (!pickupAddr.success) {
      return { ok: false, error: "A full pickup address is required when it's not the same as delivery." };
    }
  }

  const result = await createCustomOrder({
    packageId: data.packageId,
    extensionWeeks: data.extensionWeeks,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    requestedDeliveryDate: data.requestedDeliveryDate,
    deliveryAddress: {
      street: data.deliveryStreet,
      city: data.deliveryCity,
      province: data.deliveryProvince,
      postalCode: data.deliveryPostalCode,
      country: data.deliveryCountry,
    },
    deliveryInstructions: data.deliveryInstructions,
    pickupSameAsDelivery: data.pickupSameAsDelivery,
    pickupAddress: data.pickupSameAsDelivery
      ? undefined
      : {
          street: data.pickupStreet,
          city: data.pickupCity,
          province: data.pickupProvince,
          postalCode: data.pickupPostalCode,
          country: data.pickupCountry,
        },
    pickupInstructions: data.pickupInstructions,
    deliveryFeeCents: dollarsToCents(data.deliveryFee),
    pickupFeeCents: dollarsToCents(data.pickupFee),
    priceOverrideCents: data.priceOverride === "" ? null : dollarsToCents(data.priceOverride),
    priceOverrideReason: data.priceOverrideReason,
    internalNotes: data.internalNotes,
    paymentMethod: data.paymentMethod,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await writeAudit({
    actor: { type: "admin", id: admin.id, email: admin.email },
    action: "ORDER_CREATED_BY_ADMIN",
    entityType: "order",
    entityId: result.orderId,
    notes: `${data.customerName} -- ${data.paymentMethod === "mark_paid" ? "marked paid" : "Stripe payment link sent"}`,
  });

  revalidatePath("/admin/orders");
  revalidatePath("/admin/calendar");

  return {
    ok: true,
    createdOrderNumber: result.orderNumber,
    createdOrderId: result.orderId,
    checkoutUrl: result.checkoutUrl,
  };
}

export type RegenerateLinkState = { ok: boolean; error?: string; checkoutUrl?: string };

export async function regenerateCustomOrderCheckoutLinkAction(
  orderId: string
): Promise<RegenerateLinkState> {
  await requireAdmin();
  const result = await createCustomOrderCheckoutLink(orderId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, checkoutUrl: result.checkoutUrl };
}
