const { describe, it } = require("mocha");
const { expect } = require("chai");
const { setup } = require("../deployments/state-and-queue.test");
const { MemoryAuditService } = require("../../src/audit/service");
const { validateInput } = require("../../src/audit/schema");

function fixture(options = {}) {
  const value = setup();
  const auditor = value.r.upsertUser({
    subject: "issuer|auditor",
    email: "auditor@example.test",
  });
  const viewer = value.r.upsertUser({
    subject: "issuer|viewer",
    email: "viewer@example.test",
  });
  value.r.insertMembership(auditor.id, value.o.id, "auditor");
  value.r.insertMembership(viewer.id, value.o.id, "viewer");
  const service = new MemoryAuditService(value.r, {
    integrityKeys: { 1: Buffer.alloc(32, 4) },
    ...options,
  });
  const append = (index, overrides = {}) =>
    service.append({
      organizationId: value.o.id,
      actorId: value.u.id,
      action: "deployment.state.changed",
      resourceType: "deployment",
      resourceId: `dep-${index}`,
      result: "success",
      requestId: `request-${index}`,
      correlationId: "release-1",
      sourceCategory: "deployment",
      idempotencyKey: `event-${index}`,
      metadata: { index },
      ...overrides,
    });
  return { ...value, auditor, viewer, service, append };
}

describe("Phase 3 Part 4 enterprise audit", () => {
  it("redacts structured secrets and neutralizes log-forging characters", () => {
    const event = validateInput({
      organizationId: "org-1",
      action: "credential\nrotated",
      resourceType: "connection",
      result: "success",
      sourceCategory: "security",
      metadata: {
        authorization: "Bearer SYNTHETIC_CANARY",
        nested: { kubeconfig: "SYNTHETIC_CANARY", safe: "line\r\nforged" },
      },
    });
    expect(JSON.stringify(event)).not.to.include("SYNTHETIC_CANARY");
    expect(event.action).to.equal("credential rotated");
    expect(event.metadata.nested.safe).to.equal("line forged");
  });

  it("orders events and deduplicates logical retries", () => {
    const f = fixture();
    const first = f.append(1);
    expect(f.append(1).id).to.equal(first.id);
    expect(f.append(2).sequence).to.equal(2);
    expect(f.service.verify(f.auditor.id, f.o.id).valid).to.equal(true);
  });

  it("detects modified, deleted, inserted and reordered chain content", () => {
    for (const mutation of ["modified", "deleted", "inserted", "reordered"]) {
      const f = fixture();
      f.append(1);
      f.append(2);
      f.append(3);
      const rows = f.service.events.get(f.o.id);
      if (mutation === "modified") rows[1] = { ...rows[1], result: "failure" };
      if (mutation === "deleted") rows.splice(1, 1);
      if (mutation === "inserted")
        rows.splice(1, 0, { ...rows[0], id: "injected", sequence: 9 });
      if (mutation === "reordered") [rows[0], rows[1]] = [rows[1], rows[0]];
      expect(f.service.verify(f.auditor.id, f.o.id).valid, mutation).to.equal(
        false,
      );
    }
  });

  it("enforces tenant access and keeps auditor access read-only", () => {
    const f = fixture();
    f.append(1);
    expect(() => f.service.search(f.viewer.id, f.o.id))
      .to.throw()
      .with.property("code", "PERMISSION_DENIED");
    expect(f.service.search(f.auditor.id, f.o.id).items).to.have.length(1);
    expect(() => f.service.setRetention(f.auditor.id, f.o.id, 90))
      .to.throw()
      .with.property("code", "PERMISSION_DENIED");
    const other = f.r.createOrganization(f.u.id, {
      name: "Other",
      slug: "other-audit",
    });
    expect(() => f.service.search(f.auditor.id, other.id))
      .to.throw()
      .with.property("code", "PERMISSION_DENIED");
  });

  it("filters with stable pagination and exports JSONL once", () => {
    const f = fixture();
    f.append(1);
    f.append(2, { result: "failure" });
    f.append(3);
    const page = f.service.search(f.auditor.id, f.o.id, {
      limit: 1,
      result: "success",
    });
    expect(page.items).to.have.length(1);
    expect(page.pagination.hasMore).to.equal(true);
    const exported = f.service.requestExport(
      f.auditor.id,
      f.o.id,
      { correlationId: "release-1" },
      "export-key",
    );
    const again = f.service.requestExport(
      f.auditor.id,
      f.o.id,
      {},
      "export-key",
    );
    expect(again.id).to.equal(exported.id);
    const downloaded = f.service.download(
      f.auditor.id,
      f.o.id,
      exported.id,
      exported.downloadToken,
    );
    expect(downloaded.body).not.to.include("SYNTHETIC_CANARY");
    expect(() =>
      f.service.download(
        f.auditor.id,
        f.o.id,
        exported.id,
        exported.downloadToken,
      ),
    )
      .to.throw()
      .with.property("code", "AUDIT_EXPORT_NOT_FOUND");
  });

  it("expires download grants and bounds export ranges", () => {
    let now = new Date("2026-01-01T00:00:00Z");
    const f = fixture({ clock: () => now, exportTtlMs: 1000 });
    f.append(1);
    const exported = f.service.requestExport(f.auditor.id, f.o.id, {}, "short");
    now = new Date("2026-01-01T00:01:00Z");
    expect(() =>
      f.service.download(
        f.auditor.id,
        f.o.id,
        exported.id,
        exported.downloadToken,
      ),
    )
      .to.throw()
      .with.property("code", "AUDIT_EXPORT_EXPIRED");
    expect(() =>
      f.service.requestExport(
        f.auditor.id,
        f.o.id,
        { from: "2020-01-01", to: "2026-01-01" },
        "wide",
      ),
    )
      .to.throw()
      .with.property("code", "AUDIT_EXPORT_RANGE_TOO_LARGE");
  });
});
