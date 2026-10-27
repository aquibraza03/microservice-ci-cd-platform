const crypto = require("node:crypto");
const EXEMPT_OPERATIONS = new Set(["preview_cleanup", "credential_revoke", "security_remediation", "approved_rollback", "incident_recovery", "required_deletion"]);

class QuotaManager {
  constructor({ clock = () => new Date(), audit = () => {} } = {}) { this.clock = clock; this.audit = audit; this.limits = new Map(); this.reservations = new Map(); this.keys = new Map(); }
  setLimit(organizationId, resourceType, limit) { if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Invalid limit"); this.limits.set(`${organizationId}:${resourceType}`, limit); }
  reserve({ organizationId, resourceType, quantity = 1, ownerOperation, idempotencyKey, ttlSeconds = 900 }) {
    if (EXEMPT_OPERATIONS.has(ownerOperation)) return { exempt: true, operation: ownerOperation };
    const ik = `${organizationId}:${resourceType}:${idempotencyKey}`; if (this.keys.has(ik)) return structuredClone(this.keys.get(ik));
    this.expire(); const limit = this.limits.get(`${organizationId}:${resourceType}`);
    const active = [...this.reservations.values()].filter((r) => r.organizationId === organizationId && r.resourceType === resourceType && r.status === "active").reduce((n, r) => n + r.quantity, 0);
    if (limit !== undefined && active + quantity > limit) throw Object.assign(new Error("Quota exhausted; retry after a reservation is released"), { code: "QUOTA_EXCEEDED", resourceType });
    const now = this.clock(); const r = Object.freeze({ reservationId: `qrs_${crypto.randomUUID()}`, organizationId, resourceType, quantity, ownerOperation, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(), status: "active", idempotencyKey });
    this.reservations.set(r.reservationId, r); this.keys.set(ik, r); this.audit({ action: "quota.reserved", organizationId, resourceId: r.reservationId }); return structuredClone(r);
  }
  release(reservationId) { const old = this.reservations.get(reservationId); if (!old || old.status !== "active") return { released: false }; const next = Object.freeze({ ...old, status: "released", releasedAt: this.clock().toISOString() }); this.reservations.set(reservationId, next); this.keys.set(`${old.organizationId}:${old.resourceType}:${old.idempotencyKey}`, next); return { released: true, reservation: structuredClone(next) }; }
  expire() { const now = this.clock(); let count = 0; for (const [key, r] of this.reservations) if (r.status === "active" && new Date(r.expiresAt) <= now) { const next = Object.freeze({ ...r, status: "expired", expiredAt: now.toISOString() }); this.reservations.set(key, next); this.keys.set(`${r.organizationId}:${r.resourceType}:${r.idempotencyKey}`, next); count++; } return count; }
  reconcile(activeOperationIds = new Set()) { this.expire(); const leaks = []; for (const r of this.reservations.values()) if (r.status === "active" && !activeOperationIds.has(r.ownerOperation)) leaks.push(r.reservationId); for (const id of leaks) this.release(id); return { releasedLeaks: leaks }; }
}
module.exports = { QuotaManager, EXEMPT_OPERATIONS };
