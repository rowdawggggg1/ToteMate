import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

type AuditActor =
  | { type: "admin"; id: string; email: string }
  | { type: "system" };

export async function writeAudit(params: {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  notes?: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLogs).values({
    actorType: params.actor.type,
    actorId: params.actor.type === "admin" ? params.actor.id : null,
    actorEmail: params.actor.type === "admin" ? params.actor.email : null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    beforeValue: params.before ?? null,
    afterValue: params.after ?? null,
    notes: params.notes ?? null,
  });
}
