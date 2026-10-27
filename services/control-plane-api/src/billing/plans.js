const PLANS = Object.freeze({
  foundation: Object.freeze({ id: "foundation", version: 1, currency: "USD", supportTier: "community", entitlements: { seats: 5, concurrent_builds: 1, active_previews: 2, custom_domains: 2, deployment_targets: 1, log_retention_days: 7 } }),
  team: Object.freeze({ id: "team", version: 1, currency: "USD", supportTier: "standard_provisional", entitlements: { seats: 25, concurrent_builds: 5, active_previews: 10, custom_domains: 20, deployment_targets: 5, log_retention_days: 30 } }),
});
class EntitlementService {
  constructor({ clock = () => new Date() } = {}) { this.clock = clock; this.subscriptions = new Map(); this.overrides = []; }
  assign(organizationId, planId, effectiveAt = this.clock().toISOString()) { const plan = PLANS[planId]; if (!plan) throw Object.assign(new Error("Unknown plan"), { code: "PLAN_UNKNOWN" }); const row = { organizationId, planId, planVersion: plan.version, effectiveAt }; this.subscriptions.set(organizationId, row); return structuredClone(row); }
  override({ organizationId, entitlement, value, expiresAt, reason }) { if (!reason || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid override"); const row = { organizationId, entitlement, value, expiresAt, reason, createdAt: this.clock().toISOString() }; this.overrides.push(row); return structuredClone(row); }
  effective(organizationId) { const sub = this.subscriptions.get(organizationId); if (!sub) return null; const values = { ...PLANS[sub.planId].entitlements }; const now = this.clock(); for (const o of this.overrides) if (o.organizationId === organizationId && (!o.expiresAt || new Date(o.expiresAt) > now)) values[o.entitlement] = o.value; return { ...structuredClone(sub), entitlements: values }; }
}
module.exports = { PLANS, EntitlementService };
