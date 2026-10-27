const METERS = Object.freeze({
  build_execution_seconds: {
    id: "build_execution_seconds", version: 1, unit: "seconds",
    sourceOfTruth: "durable deployment stage timestamps", startEvent: "build.started", stopEvent: "build.finished",
    inclusion: "executed build stages", exclusion: "queued time and stages that never started",
    rounding: "ceiling to whole second", minimumBillableUnit: 1,
    deduplicationKey: "deployment_id:attempt:build", failedBehavior: "meter elapsed execution", cancelledBehavior: "meter elapsed execution",
    lateEventBehavior: "post to original open period; adjustment after close", correctionMethod: "linked adjustment",
    reconciliationSource: "deployment stage records",
  },
  active_preview_seconds: {
    id: "active_preview_seconds", version: 1, unit: "seconds",
    sourceOfTruth: "preview lifecycle records", startEvent: "preview.ready", stopEvent: "preview.cleaned",
    inclusion: "ready preview lifetime", exclusion: "failed previews before ready",
    rounding: "ceiling to whole second", minimumBillableUnit: 1,
    deduplicationKey: "preview_id:revision:lifetime", failedBehavior: "exclude before ready", cancelledBehavior: "stop at cleanup",
    lateEventBehavior: "split by billing-period boundary", correctionMethod: "linked adjustment",
    reconciliationSource: "preview revisions",
  },
  deployment_count: {
    id: "deployment_count", version: 1, unit: "count",
    sourceOfTruth: "durable deployment creation", startEvent: "deployment.created", stopEvent: "same event",
    inclusion: "accepted unique deployments", exclusion: "rejected and idempotent duplicate requests",
    rounding: "exact integer", minimumBillableUnit: 1,
    deduplicationKey: "deployment_id", failedBehavior: "included after acceptance", cancelledBehavior: "included after acceptance",
    lateEventBehavior: "post to original open period; adjustment after close", correctionMethod: "linked adjustment",
    reconciliationSource: "deployment records",
  },
  organization_seat_count: {
    id: "organization_seat_count", version: 1, unit: "seat_day",
    sourceOfTruth: "active organization memberships", startEvent: "daily snapshot", stopEvent: "daily snapshot",
    inclusion: "active human members", exclusion: "revoked invitations and service accounts",
    rounding: "one seat per UTC day", minimumBillableUnit: 1,
    deduplicationKey: "organization_id:utc_date:membership_id", failedBehavior: "not applicable", cancelledBehavior: "not applicable",
    lateEventBehavior: "linked adjustment", correctionMethod: "linked adjustment",
    reconciliationSource: "membership records",
  },
  custom_domain_count: {
    id: "custom_domain_count", version: 1, unit: "domain_day",
    sourceOfTruth: "verified active custom-domain records", startEvent: "daily snapshot", stopEvent: "daily snapshot",
    inclusion: "verified active domains", exclusion: "pending, failed, or removed domains",
    rounding: "one domain per UTC day", minimumBillableUnit: 1,
    deduplicationKey: "organization_id:utc_date:domain_id", failedBehavior: "exclude", cancelledBehavior: "exclude",
    lateEventBehavior: "linked adjustment", correctionMethod: "linked adjustment",
    reconciliationSource: "custom domain records",
  },
  deployment_target_count: {
    id: "deployment_target_count", version: 1, unit: "target_day",
    sourceOfTruth: "active deployment-target records", startEvent: "daily snapshot", stopEvent: "daily snapshot",
    inclusion: "active validated targets", exclusion: "draft, disabled, and revoked targets",
    rounding: "one target per UTC day", minimumBillableUnit: 1,
    deduplicationKey: "organization_id:utc_date:target_id", failedBehavior: "exclude", cancelledBehavior: "exclude",
    lateEventBehavior: "linked adjustment", correctionMethod: "linked adjustment",
    reconciliationSource: "deployment target records",
  },
});

function getMeter(id, version = 1) {
  const meter = METERS[id];
  if (!meter || meter.version !== version) throw Object.assign(new Error("Unsupported meter version"), { code: "METER_UNSUPPORTED" });
  return meter;
}

module.exports = { METERS, getMeter };
