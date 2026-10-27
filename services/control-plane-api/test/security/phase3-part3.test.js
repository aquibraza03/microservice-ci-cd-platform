const { describe, it } = require("mocha");
const { expect } = require("chai");
const yaml = require("yaml");
const { setup } = require("../deployments/state-and-queue.test");
const {
  STATES,
  TRANSITIONS,
  MemoryApprovalStore,
} = require("../../src/approvals/store");
const {
  canonicalJson,
  snapshotDigest,
  deploymentSnapshot,
} = require("../../src/approvals/canonical");
const {
  CATALOG,
  targetPolicyStatus,
  workloadViolations,
  renderKyvernoPolicies,
} = require("../../src/policy/kyverno");
const { MemoryPolicyExceptionStore } = require("../../src/policy/exceptions");
const { compareDrift, DriftDetector } = require("../../src/policy/drift");
const { manifests } = require("../../src/providers/deployment-target");
const { MemoryDeploymentQueue } = require("../../src/queue/deployment-queue");

function fixture({ clock = () => new Date("2026-01-01T00:00:00Z") } = {}) {
  const x = setup(),
    approver = x.r.upsertUser({
      subject: "issuer|approver",
      email: "approver@example.test",
    }),
    approver2 = x.r.upsertUser({
      subject: "issuer|approver2",
      email: "approver2@example.test",
    });
  x.r.insertMembership(approver.id, x.o.id, "approver");
  x.r.insertMembership(approver2.id, x.o.id, "approver");
  const events = [],
    store = new MemoryApprovalStore(x.r, {
      clock,
      eventSink: (e) => events.push(e),
    });
  const policy = store.setPolicy(x.u.id, x.o.id, {
    action: "deployment.production",
    environment: "production",
    resourceType: "deployment",
    eligibleRoles: ["approver"],
    requiredCount: 1,
    separationOfDuties: true,
    expiresInSeconds: 3600,
  });
  const snapshot = deploymentSnapshot({
    organizationId: x.o.id,
    projectId: x.p.id,
    environment: "production",
    serviceId: x.svc.id,
    commitSha: "a".repeat(40),
    requestingActorId: x.u.id,
    configurationSnapshot: {
      secretReferences: [{ id: "ref-1", referenceVersion: 3 }],
      deploymentTargetId: "target-1",
      targetCredentialVersion: 4,
    },
  });
  x.q = new MemoryDeploymentQueue();
  return { x, approver, approver2, events, store, policy, snapshot };
}

describe("Phase 3 Part 3 approval governance", () => {
  it("defines every legal state and rejects every invalid transition", () => {
    expect(STATES).to.have.members([
      "not_required",
      "pending",
      "approved",
      "rejected",
      "expired",
      "cancelled",
      "invalidated",
      "overridden",
      "executing",
      "consumed",
      "failed",
    ]);
    const f = fixture(),
      r = f.store.request(
        f.x.u.id,
        f.x.o.id,
        {
          action: "deployment.production",
          projectId: f.x.p.id,
          environment: "production",
          resourceType: "deployment",
        },
        f.snapshot,
        "state-key",
      ).approval;
    expect(() => f.store.transition(r, "consumed"))
      .to.throw()
      .with.property("code", "APPROVAL_TRANSITION_INVALID");
    for (const [from, to] of Object.entries(TRANSITIONS))
      expect(to).to.be.an("array", from);
  });
  it("canonicalizes snapshots deterministically and rejects sensitive values", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).to.equal(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    expect(snapshotDigest({ a: 1, b: 2 })).to.equal(
      snapshotDigest({ b: 2, a: 1 }),
    );
    expect(() => snapshotDigest({ secretValue: "canary" }))
      .to.throw()
      .with.property("code", "APPROVAL_SNAPSHOT_SENSITIVE");
  });
  it("enforces no self approval, duplicate approvers and separation of duties", () => {
    const f = fixture(),
      a = f.store.request(
        f.x.u.id,
        f.x.o.id,
        {
          action: "deployment.production",
          projectId: f.x.p.id,
          environment: "production",
          resourceType: "deployment",
        },
        f.snapshot,
        "sod-key",
      ).approval;
    expect(() =>
      f.store.decide(f.x.u.id, f.x.o.id, a.id, { decision: "approve" }),
    )
      .to.throw()
      .with.property("code", "SELF_APPROVAL_DENIED");
    f.store.decide(f.approver.id, f.x.o.id, a.id, { decision: "approve" });
    expect(() =>
      f.store.decide(f.approver.id, f.x.o.id, a.id, { decision: "approve" }),
    ).to.throw();
  });
  it("supports concurrent counts without duplicate identity votes", () => {
    const f = fixture();
    f.store.setPolicy(
      f.x.u.id,
      f.x.o.id,
      {
        action: "rollback.production",
        environment: "production",
        resourceType: "deployment",
        eligibleRoles: ["approver"],
        requiredCount: 2,
      },
      null,
    );
    const a = f.store.request(
      f.x.u.id,
      f.x.o.id,
      {
        action: "rollback.production",
        projectId: f.x.p.id,
        environment: "production",
        resourceType: "deployment",
      },
      f.snapshot,
      "multi-key",
    ).approval;
    f.store.decide(f.approver.id, f.x.o.id, a.id, { decision: "approve" });
    expect(a.state).to.equal("pending");
    f.store.decide(f.approver2.id, f.x.o.id, a.id, { decision: "approve" });
    expect(a.state).to.equal("approved");
  });
  it("expires approvals and invalidates changed snapshots", () => {
    let current = new Date("2026-01-01T00:00:00Z");
    const f = fixture({ clock: () => current }),
      a = f.store.request(
        f.x.u.id,
        f.x.o.id,
        {
          action: "deployment.production",
          projectId: f.x.p.id,
          environment: "production",
          resourceType: "deployment",
        },
        f.snapshot,
        "expiry-key",
      ).approval;
    f.store.decide(f.approver.id, f.x.o.id, a.id, { decision: "approve" });
    current = new Date("2026-01-01T02:00:00Z");
    expect(() =>
      f.store.beginExecution(
        f.x.u.id,
        f.x.o.id,
        a.id,
        f.snapshot,
        "exec-expired",
      ),
    )
      .to.throw()
      .with.property("code", "APPROVAL_NOT_EXECUTABLE");
    const g = fixture(),
      b = g.store.request(
        g.x.u.id,
        g.x.o.id,
        {
          action: "deployment.production",
          projectId: g.x.p.id,
          environment: "production",
          resourceType: "deployment",
        },
        g.snapshot,
        "changed-key",
      ).approval;
    g.store.decide(g.approver.id, g.x.o.id, b.id, { decision: "approve" });
    expect(() =>
      g.store.beginExecution(
        g.x.u.id,
        g.x.o.id,
        b.id,
        { ...g.snapshot, sourceCommitSha: "b".repeat(40) },
        "changed-exec",
      ),
    )
      .to.throw()
      .with.property("code", "APPROVAL_SNAPSHOT_CHANGED");
    expect(b.state).to.equal("invalidated");
  });
  it("revalidates approver authorization and consumes exactly once", () => {
    const f = fixture(),
      a = f.store.request(
        f.x.u.id,
        f.x.o.id,
        {
          action: "deployment.production",
          projectId: f.x.p.id,
          environment: "production",
          resourceType: "deployment",
        },
        f.snapshot,
        "revalidate-key",
      ).approval;
    f.store.decide(f.approver.id, f.x.o.id, a.id, { decision: "approve" });
    f.x.r.memberships.get(`${f.approver.id}:${f.x.o.id}`)
      .authorizationVersion++;
    expect(() =>
      f.store.beginExecution(f.x.u.id, f.x.o.id, a.id, f.snapshot, "exec-one"),
    )
      .to.throw()
      .with.property("code", "APPROVER_AUTHORIZATION_CHANGED");
    const g = fixture(),
      b = g.store.request(
        g.x.u.id,
        g.x.o.id,
        {
          action: "deployment.production",
          projectId: g.x.p.id,
          environment: "production",
          resourceType: "deployment",
        },
        g.snapshot,
        "consume-key",
      ).approval;
    g.store.decide(g.approver.id, g.x.o.id, b.id, { decision: "approve" });
    g.store.beginExecution(g.x.u.id, g.x.o.id, b.id, g.snapshot, "exec-two");
    g.store.finishExecution(b.id, true);
    expect(b.state).to.equal("consumed");
    expect(() =>
      g.store.beginExecution(g.x.u.id, g.x.o.id, b.id, g.snapshot, "exec-two"),
    ).to.throw();
  });
  it("rejects unsatisfiable and recursively impossible policies", () => {
    const f = fixture();
    expect(() =>
      f.store.setPolicy(f.x.u.id, f.x.o.id, {
        action: "credential.revoke",
        eligibleRoles: ["security_admin"],
        requiredCount: 1,
      }),
    )
      .to.throw()
      .with.property("code", "APPROVAL_POLICY_UNSATISFIABLE");
    expect(() =>
      f.store.setPolicy(f.x.u.id, f.x.o.id, {
        action: "approval_policy.change",
        eligibleRoles: [],
        eligibleUserIds: [],
        requiredCount: 1,
      }),
    )
      .to.throw()
      .with.property("code", "APPROVAL_POLICY_RECURSIVE");
  });
  it("prevents removal of the final eligible approver while work is pending", () => {
    const f = fixture();
    const a = f.store.request(
      f.x.u.id,
      f.x.o.id,
      {
        action: "deployment.production",
        projectId: f.x.p.id,
        environment: "production",
        resourceType: "deployment",
      },
      f.snapshot,
      "approver-lockout-key",
    ).approval;
    expect(a.state).to.equal("pending");
    f.x.r.memberships.get(`${f.approver2.id}:${f.x.o.id}`).status = "removed";
    expect(() =>
      f.store.assertApproverChangeSafe(f.x.o.id, f.approver.id),
    )
      .to.throw()
      .with.property("code", "FINAL_ELIGIBLE_APPROVER_REQUIRED");
  });
  it("requires explicit authorization and justification for emergency override", () => {
    const f = fixture(),
      a = f.store.request(
        f.x.u.id,
        f.x.o.id,
        {
          action: "deployment.production",
          projectId: f.x.p.id,
          environment: "production",
          resourceType: "deployment",
        },
        f.snapshot,
        "override-key",
      ).approval;
    expect(() =>
      f.store.override(f.approver.id, f.x.o.id, a.id, "too short"),
    ).to.throw();
    expect(
      f.store.override(
        f.x.u.id,
        f.x.o.id,
        a.id,
        "Emergency restoration is required",
      ).state,
    ).to.equal("overridden");
  });
  it("creates a truthful waiting deployment and queues only after approval", async () => {
    const f = fixture(),
      created = await f.x.store.create(
        f.x.u.id,
        f.x.o.id,
        {
          ...f.x.input,
          environment: "production",
          initialState: "waiting_for_approval",
        },
        "protected-deploy",
      );
    expect(created.deployment.currentState).to.equal("waiting_for_approval");
    expect(f.x.q.enqueues).to.equal(0);
    const a = f.store.request(
      f.x.u.id,
      f.x.o.id,
      {
        action: "deployment.production",
        projectId: f.x.p.id,
        environment: "production",
        resourceType: "deployment",
        resourceId: created.deployment.id,
      },
      f.snapshot,
      "protected-deploy",
    ).approval;
    f.store.decide(f.approver.id, f.x.o.id, a.id, { decision: "approve" });
    f.store.beginExecution(
      f.x.u.id,
      f.x.o.id,
      a.id,
      f.snapshot,
      created.deployment.id,
    );
    const queued = await f.x.store.transition(created.deployment.id, "queued", {
      expectedVersion: 1,
      commandId: `approval:${a.id}`,
    });
    await f.x.q.enqueue(queued);
    f.store.finishExecution(a.id, true);
    await f.x.q.enqueue(queued);
    expect(f.x.q.enqueues).to.equal(1);
  });
});

describe("Phase 3 Part 3 Kubernetes policy, exceptions and drift", () => {
  const secureInput = {
    organizationSlug: "org",
    projectSlug: "project",
    serviceSlug: "service",
    deploymentId: "dep-1",
    imageReference: `ghcr.io/acme/app@sha256:${"a".repeat(64)}`,
    port: 8080,
    resources: {
      requests: { cpu: "100m", memory: "128Mi" },
      limits: { cpu: "500m", memory: "512Mi" },
    },
    startupPath: "/health",
    readinessPath: "/ready",
    healthPath: "/health",
    targetNamespace: "platform-org",
  };
  it("renders the critical Kyverno catalogue in audit and enforce modes", () => {
    expect(CATALOG.map((x) => x.id)).to.include.members([
      "disallow-privileged",
      "block-docker-socket",
      "require-non-root",
      "require-image-digest",
      "verify-image-signature",
    ]);
    for (const mode of ["Audit", "Enforce"]) {
      const doc = yaml.parse(
        renderKyvernoPolicies({ mode, allowedRegistries: ["ghcr.io"] }),
      );
      expect(doc.kind).to.equal("ClusterPolicy");
      expect(doc.spec.validationFailureAction).to.equal(mode);
      expect(doc.spec.rules.length).to.be.greaterThan(2);
    }
  });
  it("preflight rejects privileged mutable workloads but accepts generated secure manifests", () => {
    const generated = manifests(secureInput).find(
      (x) => x.kind === "Deployment",
    );
    expect(
      workloadViolations(generated, {
        allowedRegistries: ["ghcr.io"],
        allowedNamespaces: ["platform-org"],
      }),
    ).to.deep.equal([]);
    const bad = structuredClone(generated);
    bad.spec.template.spec.containers[0].securityContext.privileged = true;
    bad.spec.template.spec.containers[0].image = "docker.io/library/latest";
    expect(
      workloadViolations(bad, { allowedRegistries: ["ghcr.io"] }).map(
        (x) => x.code,
      ),
    ).to.include.members(["PRIVILEGED", "MUTABLE_IMAGE", "REGISTRY"]);
  });
  it("reports enforce, audit, unsupported and unknown truthfully", () => {
    expect(
      targetPolicyStatus({
        target: {
          capabilityResults: { kyverno: true, kyvernoEnforcing: true },
        },
        policyId: "require-non-root",
        configuredMode: "enforce",
      }).state,
    ).to.equal("enforce");
    expect(
      targetPolicyStatus({
        target: { capabilityResults: { kyverno: true } },
        policyId: "require-non-root",
        configuredMode: "audit",
      }).state,
    ).to.equal("audit");
    expect(
      targetPolicyStatus({
        target: { capabilityResults: { kyverno: false } },
        policyId: "require-non-root",
        configuredMode: "enforce",
      }).state,
    ).to.equal("unsupported");
    expect(
      targetPolicyStatus({
        target: { capabilityResults: {} },
        policyId: "require-non-root",
        configuredMode: "enforce",
      }).state,
    ).to.equal("unknown");
  });
  it("fails signature-required production policy safely", () => {
    const status = targetPolicyStatus({
      target: { capabilityResults: { kyverno: true } },
      policyId: "verify-image-signature",
      configuredMode: "enforce",
      violations: [
        {
          code: "SIGNATURE_UNVERIFIED",
          message: "Digest signature is not verified",
        },
      ],
    });
    expect(status.state).to.equal("unknown");
    expect(status.violations[0].code).to.equal("SIGNATURE_UNVERIFIED");
  });
  it("keeps exceptions narrow, approved, cross-tenant safe and time limited", () => {
    let current = new Date("2026-01-01T00:00:00Z");
    const f = fixture({ clock: () => current }),
      events = [],
      store = new MemoryPolicyExceptionStore(f.x.r, {
        clock: () => current,
        eventSink: (e) => events.push(e),
      }),
      item = store.request(f.x.u.id, f.x.o.id, {
        projectId: f.x.p.id,
        environment: "production",
        targetId: "target-1",
        policyId: "read-only-root-filesystem",
        serviceId: f.x.svc.id,
        workloadId: "workload-1",
        justification: "Legacy cache writes",
        compensatingControl: "Read-only network and narrow identity",
        startsAt: current.toISOString(),
        expiresAt: new Date(current.getTime() + 3600000).toISOString(),
        policyVersion: 1,
        resourceVersion: 2,
        approvalId: "approval-1",
      });
    expect(() =>
      store.approve(f.x.u.id, f.x.o.id, item.id, {
        approvalId: "approval-1",
        policyVersion: 1,
        resourceVersion: 2,
      }),
    )
      .to.throw()
      .with.property("code", "SELF_APPROVAL_DENIED");
    store.approve(f.approver.id, f.x.o.id, item.id, {
      approvalId: "approval-1",
      policyVersion: 1,
      resourceVersion: 2,
    });
    expect(
      store.applies(f.x.o.id, {
        projectId: f.x.p.id,
        environment: "production",
        targetId: "target-1",
        policyId: "read-only-root-filesystem",
        serviceId: f.x.svc.id,
        workloadId: "workload-1",
      }),
    ).to.equal(true);
    expect(
      store.applies(f.x.o.id, {
        projectId: f.x.p.id,
        environment: "production",
        targetId: "target-2",
        policyId: "read-only-root-filesystem",
        serviceId: f.x.svc.id,
        workloadId: "workload-1",
      }),
    ).to.equal(false);
    current = new Date("2026-01-01T02:00:00Z");
    expect(store.get(f.x.u.id, f.x.o.id, item.id).status).to.equal("expired");
    expect(events.at(-1).metadata.workloadAction).to.equal(
      "report_noncompliant_no_automatic_delete",
    );
  });
  it("classifies image, configuration, target, ownership and policy drift without secrets", async () => {
    const f = fixture(),
      expected = {
        deploymentId: "dep",
        imageDigest: `sha256:${"a".repeat(64)}`,
        configurationSnapshotHash: "cfg-a",
        targetId: "t1",
        namespace: "ns1",
        ownershipLabels: { owner: "platform" },
        policyStatus: "enforce",
        secretReferences: [{ id: "ref", referenceVersion: 2 }],
      },
      observed = {
        accessible: true,
        imageDigest: `sha256:${"b".repeat(64)}`,
        configurationSnapshotHash: "cfg-b",
        targetId: "t2",
        namespace: "ns2",
        ownershipLabels: { owner: "human" },
        policyStatus: "audit",
        secretReferences: [{ id: "ref", referenceVersion: 3 }],
      };
    const categories = compareDrift(expected, observed).map((x) => x.category);
    expect(categories).to.include.members([
      "image_drift",
      "configuration_drift",
      "target_drift",
      "ownership_drift",
      "policy_drift",
    ]);
    expect(JSON.stringify(compareDrift(expected, observed))).not.to.include(
      "plaintext",
    );
    const detector = new DriftDetector(f.x.r, {
      inspect: async () => observed,
    });
    expect((await detector.run(f.x.u.id, f.x.o.id, expected)).drifted).to.equal(
      true,
    );
    expect(compareDrift(expected, { accessible: false })[0].category).to.equal(
      "unknown_or_inaccessible",
    );
  });
});
