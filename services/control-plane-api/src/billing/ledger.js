const crypto = require("node:crypto");
const { getMeter } = require("./catalog");

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const clone = (v) => structuredClone(v);

class UsageLedger {
  constructor({ clock = () => new Date(), audit = () => {} } = {}) {
    this.clock = clock; this.audit = audit; this.events = []; this.keys = new Map(); this.reconciliations = [];
  }
  append(input) {
    const meter = getMeter(input.meterId, input.meterVersion || 1);
    if (!input.organizationId || !input.idempotencyKey || !input.sourceResourceId) throw Object.assign(new Error("Missing usage identity"), { code: "USAGE_INVALID" });
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) throw Object.assign(new Error("Quantity must be a non-negative integer"), { code: "USAGE_QUANTITY_INVALID" });
    const key = `${input.organizationId}:${meter.id}:${meter.version}:${input.idempotencyKey}`;
    if (this.keys.has(key)) return { event: clone(this.keys.get(key)), duplicate: true };
    const received = this.clock();
    const occurred = input.occurredAt ? new Date(input.occurredAt) : received;
    if (!Number.isFinite(occurred.getTime()) || occurred > new Date(received.getTime() + 300000)) throw Object.assign(new Error("Invalid trusted occurrence time"), { code: "USAGE_TIME_INVALID" });
    const event = Object.freeze({
      eventId: id("use"), schemaVersion: 1, organizationId: input.organizationId,
      meterId: meter.id, meterVersion: meter.version, quantity: input.quantity, unit: meter.unit,
      windowStart: input.windowStart || occurred.toISOString(), windowEnd: input.windowEnd || occurred.toISOString(),
      sourceResourceType: input.sourceResourceType || "unknown", sourceResourceId: input.sourceResourceId,
      sourceEventId: input.sourceEventId || null, idempotencyKey: input.idempotencyKey,
      occurredAt: occurred.toISOString(), receivedAt: received.toISOString(),
      processingStatus: occurred < new Date(received.getTime() - 86400000) ? "late" : "accepted",
      adjustmentOf: input.adjustmentOf || null,
    });
    this.events.push(event); this.keys.set(key, event);
    this.audit({ action: input.adjustmentOf ? "usage.adjusted" : "usage.recorded", organizationId: input.organizationId, resourceId: event.eventId, meterId: meter.id });
    return { event: clone(event), duplicate: false };
  }
  adjust({ originalEventId, quantity, reason, idempotencyKey, actorId }) {
    const original = this.events.find((e) => e.eventId === originalEventId);
    if (!original) throw Object.assign(new Error("Usage event not found"), { code: "USAGE_NOT_FOUND" });
    if (!reason || !actorId) throw Object.assign(new Error("Adjustment reason and actor required"), { code: "ADJUSTMENT_INVALID" });
    return this.append({ ...original, quantity, idempotencyKey, sourceResourceId: original.eventId, sourceResourceType: "usage_event", adjustmentOf: original.eventId, occurredAt: this.clock().toISOString() });
  }
  list(organizationId, { meterId, cursor = 0, limit = 50 } = {}) {
    const rows = this.events.filter((e) => e.organizationId === organizationId && (!meterId || e.meterId === meterId));
    return { items: clone(rows.slice(cursor, cursor + Math.min(limit, 100))), nextCursor: cursor + limit < rows.length ? cursor + limit : null };
  }
  aggregate(organizationId, { start, end } = {}) {
    const from = start ? new Date(start) : new Date(0); const to = end ? new Date(end) : new Date("9999-12-31");
    const totals = {};
    for (const e of this.events) if (e.organizationId === organizationId && new Date(e.occurredAt) >= from && new Date(e.occurredAt) < to) totals[`${e.meterId}:v${e.meterVersion}`] = (totals[`${e.meterId}:v${e.meterVersion}`] || 0) + e.quantity;
    return totals;
  }
  reconcile({ organizationId, meterId, expectedQuantity, start, end }) {
    const recordedQuantity = Object.entries(this.aggregate(organizationId, { start, end })).filter(([k]) => k.startsWith(`${meterId}:`)).reduce((n, [, q]) => n + q, 0);
    const row = { reconciliationId: id("rec"), organizationId, meterId, expectedQuantity, recordedQuantity, difference: expectedQuantity - recordedQuantity, status: expectedQuantity === recordedQuantity ? "matched" : "mismatch", checkedAt: this.clock().toISOString() };
    this.reconciliations.push(Object.freeze(row)); this.audit({ action: "usage.reconciled", organizationId, resourceId: row.reconciliationId, result: row.status }); return clone(row);
  }
}

module.exports = { UsageLedger };
