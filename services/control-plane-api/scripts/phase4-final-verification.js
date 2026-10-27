#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { UsageLedger } = require("../src/billing/ledger");
const { QuotaManager } = require("../src/billing/quotas");
const { EntitlementService } = require("../src/billing/plans");

const now = new Date("2026-09-20T12:00:00.000Z");
const audit = [];
const ledger = new UsageLedger({ clock: () => now, audit: (e) => audit.push(e) });
const plans = new EntitlementService({ clock: () => now });
const quota = new QuotaManager({ clock: () => now, audit: (e) => audit.push(e) });
plans.assign("org_alpha", "foundation"); plans.assign("org_beta", "team");
const first = ledger.append({ organizationId: "org_alpha", meterId: "deployment_count", quantity: 1, sourceResourceId: "synthetic-deployment", idempotencyKey: "synthetic-deployment" });
const replay = ledger.append({ organizationId: "org_alpha", meterId: "deployment_count", quantity: 1, sourceResourceId: "synthetic-deployment", idempotencyKey: "synthetic-deployment" });
const reconciliation = ledger.reconcile({ organizationId: "org_alpha", meterId: "deployment_count", expectedQuantity: 1 });
quota.setLimit("org_alpha", "concurrent_builds", 1);
const reservation = quota.reserve({ organizationId: "org_alpha", resourceType: "concurrent_builds", ownerOperation: "synthetic-job", idempotencyKey: "synthetic-job" });
let denied = false; try { quota.reserve({ organizationId: "org_alpha", resourceType: "concurrent_builds", ownerOperation: "second-job", idempotencyKey: "second-job" }); } catch (e) { denied = e.code === "QUOTA_EXCEEDED"; }
const cleanupExempt = quota.reserve({ organizationId: "org_alpha", resourceType: "concurrent_builds", ownerOperation: "preview_cleanup", idempotencyKey: "cleanup" }).exempt;
const rollbackExempt = quota.reserve({ organizationId: "org_alpha", resourceType: "concurrent_builds", ownerOperation: "approved_rollback", idempotencyKey: "rollback" }).exempt;
const crashRecovery = quota.reconcile(new Set()).releasedLeaks.includes(reservation.reservationId);
const checks = {
  twoOrganizationsDifferentPlans: plans.effective("org_alpha").planId !== plans.effective("org_beta").planId,
  usageRecorded: Boolean(first.event.eventId), replayDeduplicated: replay.duplicate,
  reconciliationMatched: reconciliation.status === "matched", hardLimitDenied: denied,
  cleanupAvailable: cleanupExempt, rollbackAvailable: rollbackExempt, reservationRecovered: crashRecovery,
  crossTenantUsageEmpty: ledger.list("org_beta").items.length === 0,
  administrativeAuditPresent: audit.some((e) => e.action === "usage.recorded"),
};
const blocked = {
  localKubernetesGoldenPath: "No disposable Kubernetes runtime was available during this run.",
  cleanRoomRestore: "Docker, PostgreSQL server, pg_dump and pg_restore were unavailable; inherited Phase 4 Part 2 blocker.",
  restoredLedgerAndAuditVerification: "Depends on a successful clean-room restore.",
  livePagingAndProviders: "No authorized staging credentials or paging destination were supplied.",
};
const report = { generatedAt: new Date().toISOString(), syntheticDataOnly: true, classification: "unit-and-local-process", checks, blocked, passed: Object.values(checks).every(Boolean) && Object.keys(blocked).length === 0 };
const output = path.join(__dirname, "..", "..", "..", "PHASE4_VERIFICATION.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
