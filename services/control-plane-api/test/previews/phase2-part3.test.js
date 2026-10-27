const { describe, it } = require("mocha");
const { expect } = require("chai");
const { setup } = require("../deployments/state-and-queue.test");
const { MemoryPreviewStore } = require("../../src/previews/store");
const {
  normalizeHostname,
  previewHostname,
} = require("../../src/previews/hostname");
const {
  routeManifests,
  TestIngressRouter,
} = require("../../src/previews/routing");
const { PreviewReconciler } = require("../../src/previews/reconciler");
const { PreviewController } = require("../../src/previews/controller");
const { manifests } = require("../../src/providers/deployment-target");
function fixture(options = {}) {
  const x = setup(),
    store = new MemoryPreviewStore(x.r, {
      baseDomain: "preview.local",
      ...options,
    });
  store.policy(x.u.id, x.o.id, {
    projectId: x.p.id,
    serviceId: x.svc.id,
    repositoryId: x.repo.id,
    ttlSeconds: 3600,
  });
  return {
    x,
    store,
    input: {
      projectId: x.p.id,
      serviceId: x.svc.id,
      repositoryId: x.repo.id,
      pullRequestNumber: 7,
      commitSha: "b".repeat(40),
      providerTrustVerified: true,
    },
  };
}
describe("Phase 2 Part 3 previews, domains and TLS", () => {
  it("creates and queues an immutable preview deployment through the controller", async () => {
    const { x, store, input } = fixture(),
      queued = [],
      controller = new PreviewController({
        store,
        deploymentStore: x.store,
        deploymentQueue: { enqueue: async (d) => queued.push(d) },
      }),
      result = await controller.createManual(
        x.u.id,
        x.o.id,
        { ...input, branch: "main" },
        "manual-controller",
      );
    const deployment = x.store.deployments.get(result.revision.deploymentId);
    expect(deployment).to.include({
      commitSha: input.commitSha,
      environment: "preview",
      triggerSource: "manual_preview",
    });
    expect(deployment.configurationSnapshot.preview.isolationKey).to.equal(
      result.preview.isolationKey,
    );
    expect(queued).to.have.length(1);
  });
  it("handles opened updated and reopened PRs as immutable revisions with a stable URL", async () => {
    const { x, store, input } = fixture(),
      a = await store.handleProviderEvent({
        organizationId: x.o.id,
        repositoryId: x.repo.id,
        eventType: "pull_request",
        pullRequestNumber: 7,
        commitSha: input.commitSha,
        forkedPullRequest: false,
        deliveryId: "open",
        metadata: { action: "opened" },
      }),
      b = await store.handleProviderEvent({
        organizationId: x.o.id,
        repositoryId: x.repo.id,
        eventType: "pull_request",
        pullRequestNumber: 7,
        commitSha: "c".repeat(40),
        forkedPullRequest: false,
        deliveryId: "sync",
        metadata: { action: "synchronize" },
      }),
      c = await store.handleProviderEvent({
        organizationId: x.o.id,
        repositoryId: x.repo.id,
        eventType: "pull_request",
        pullRequestNumber: 7,
        commitSha: "d".repeat(40),
        forkedPullRequest: false,
        deliveryId: "reopen",
        metadata: { action: "reopened" },
      });
    expect(a.preview.id).to.equal(b.preview.id).and.equal(c.preview.id);
    expect(
      new Set([a.revision.id, b.revision.id, c.revision.id]).size,
    ).to.equal(3);
    expect(a.preview.generatedHostname).to.equal(c.preview.generatedHostname);
  });
  it("deduplicates webhook delivery and commit revisions", () => {
    const { x, store, input } = fixture(),
      a = store.create(x.u.id, x.o.id, input, "delivery-1"),
      b = store.create(x.u.id, x.o.id, input, "delivery-1");
    expect(a.created).to.equal(true);
    expect(b.created).to.equal(false);
    expect(store.revisions.size).to.equal(1);
  });
  it("derives fork trust only from verified provider metadata and removes protected secrets", () => {
    const { x, store, input } = fixture();
    expect(() =>
      store.create(
        x.u.id,
        x.o.id,
        { ...input, forked: true, providerTrustVerified: false },
        "fork-unsafe",
      ),
    )
      .to.throw()
      .with.property("code", "FORK_TRUST_UNVERIFIED");
    const result = store.create(
      x.u.id,
      x.o.id,
      { ...input, forked: true },
      "fork-safe",
    );
    expect(result.revision).to.include({
      protectedSecretsAllowed: false,
      secretProfile: "untrusted-preview",
    });
  });
  it("enforces bounded preview quotas", () => {
    const { x, store } = fixture();
    const p = store.policy(x.u.id, x.o.id, {
      projectId: x.p.id,
      serviceId: x.svc.id,
      repositoryId: x.repo.id,
      maxCpuMillicores: 99999,
      maxMemoryMebibytes: 99999,
      maxStorageMebibytes: 99999,
    });
    expect(p).to.include({
      maxCpuMillicores: 1000,
      maxMemoryMebibytes: 1024,
      maxStorageMebibytes: 2048,
    });
  });
  it("closes merged PRs and expiration catches missed webhooks", async () => {
    const { x, store, input } = fixture({ previewTtlMs: 1 }),
      created = store.create(x.u.id, x.o.id, input, "expire");
    created.preview.expiresAt = new Date(Date.now() - 1).toISOString();
    expect(store.due()).to.have.length(1);
    const merged = store.create(
      x.u.id,
      x.o.id,
      { ...input, pullRequestNumber: 8 },
      "merge",
    );
    await store.handleProviderEvent({
      organizationId: x.o.id,
      repositoryId: x.repo.id,
      eventType: "pull_request",
      pullRequestNumber: 8,
      metadata: { action: "closed", merged: true },
    });
    expect(store.cleanupJobs.has(merged.preview.id)).to.equal(true);
  });
  it("performs idempotent ownership-safe cleanup and orphan reconciliation", async () => {
    const { x, store, input } = fixture(),
      created = store.create(x.u.id, x.o.id, input, "cleanup"),
      router = new TestIngressRouter(),
      route = store.route(x.u.id, x.o.id, {
        previewId: created.preview.id,
        namespace: "platform-org",
        resourceName: created.preview.isolationKey,
        backendService: "project-api",
        backendPort: 3000,
      });
    await router.apply({
      ...route,
      routeId: route.id,
      previewId: created.preview.id,
      organizationId: x.o.id,
    });
    store.scheduleCleanup(created.preview.id);
    const reconciler = new PreviewReconciler({ store, router });
    expect((await reconciler.reconcileCleanup())[0].status).to.equal(
      "completed",
    );
    expect(await reconciler.reconcileCleanup()).to.deep.equal([]);
    router.items.set("alien", {
      routeId: "alien",
      organizationId: "other",
      previewId: "gone",
    });
    let rejected = false;
    try {
      await reconciler.reconcileOrphans([
        {
          namespace: "x",
          name: "x",
          labels: {
            "platform.example/managed": "true",
            "platform.example/preview-id": "gone",
            "platform.example/route-id": "alien",
            "platform.example/organization-id": "org",
          },
        },
      ]);
    } catch (error) {
      rejected = error.code === "RESOURCE_OWNERSHIP_MISMATCH";
    }
    expect(rejected).to.equal(true);
  });
  it("normalizes IDNA, blocks wildcards reserved names and collisions", () => {
    expect(normalizeHostname("BÜCHER.Example.")).to.equal(
      "xn--bcher-kva.example",
    );
    for (const bad of ["*.example.com", "admin.example.com", "bad..example"])
      expect(() => normalizeHostname(bad)).to.throw();
    const a = previewHostname({
        organizationId: "a",
        serviceId: "svc",
        prNumber: 1,
        baseDomain: "preview.local",
      }),
      b = previewHostname({
        organizationId: "b",
        serviceId: "svc",
        prNumber: 1,
        baseDomain: "preview.local",
      });
    expect(a).not.to.equal(b);
    expect(a.length).to.be.at.most(253);
  });
  it("creates only Ingress routing with owned labels and certificate request", () => {
    const items = routeManifests({
      hostname: "x.preview.local",
      organizationId: "org",
      previewId: "pv",
      routeId: "rt",
      resourceName: "pv-a",
      namespace: "platform-org",
      backendService: "svc",
      backendPort: 3000,
      tlsRequired: true,
      clusterIssuer: "local-ca",
      ingressClass: "nginx",
    });
    expect(items.map((x) => x.kind)).to.deep.equal(["Certificate", "Ingress"]);
    expect(items[1].spec.rules[0].host).to.equal("x.preview.local");
  });
  it("isolates preview workloads in the organization namespace with restrictive identity and storage", () => {
    const items = manifests({
        organizationSlug: "org",
        projectSlug: "project",
        serviceSlug: "api",
        deploymentId: "dep",
        imageReference: `registry/x@sha256:${"a".repeat(64)}`,
        port: 3000,
        resources: {
          requests: { cpu: "100m", memory: "128Mi" },
          limits: { cpu: "500m", memory: "512Mi" },
        },
        startupPath: "/",
        readinessPath: "/ready",
        healthPath: "/health",
        preview: {
          isolationKey: "pv-abc",
          untrusted: true,
          quotas: { storageMebibytes: 512 },
        },
      }),
      deployment = items.find((x) => x.kind === "Deployment"),
      service = items.find((x) => x.kind === "Service");
    expect(deployment.metadata.namespace).to.equal("platform-org");
    expect(deployment.metadata.name).to.include("pv-abc");
    expect(deployment.spec.template.spec.automountServiceAccountToken).to.equal(
      false,
    );
    expect(
      deployment.spec.template.spec.containers[0].resources.limits[
        "ephemeral-storage"
      ],
    ).to.equal("512Mi");
    expect(service.spec.type).to.equal("ClusterIP");
  });
  it("keeps route and TLS failure truthful", async () => {
    const { x, store, input } = fixture(),
      created = store.create(x.u.id, x.o.id, input, "route-fail"),
      route = store.route(x.u.id, x.o.id, {
        previewId: created.preview.id,
        namespace: "n",
        resourceName: "r",
        backendService: "s",
        backendPort: 80,
      }),
      router = new TestIngressRouter({
        fail: "route",
        certificateStatus: "failed",
      });
    let failed = false;
    try {
      await router.apply(route);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    store.updateRoute(x.o.id, route.id, {
      status: "failed",
      certificateStatus: (await router.certificate(route)).status,
    });
    expect(() =>
      store.markReady(created.preview.id, {
        routeId: route.id,
        deploymentHealthy: true,
        httpVerified: true,
      }),
    )
      .to.throw()
      .with.property("code", "PREVIEW_NOT_VERIFIED");
  });
  it("verifies custom domains with hashed expiring challenges and prevents duplicate or cross-tenant claims", () => {
    const { x, store } = fixture(),
      requested = store.requestDomain(x.u.id, x.o.id, {
        projectId: x.p.id,
        serviceId: x.svc.id,
        hostname: "Shop.Example.com",
      }),
      token = requested.instructions.value.split("=")[1];
    expect(store.challenges.get(requested.domain.id).tokenHash).not.to.equal(
      token,
    );
    expect(
      store.verifyDomain(x.u.id, x.o.id, requested.domain.id, { token }).status,
    ).to.equal("verified");
    expect(() =>
      store.requestDomain(x.u.id, x.o.id, {
        projectId: x.p.id,
        serviceId: x.svc.id,
        hostname: "shop.example.com",
      }),
    )
      .to.throw()
      .with.property("code", "DOMAIN_ALREADY_CLAIMED");
    const other = x.r.upsertUser({ subject: "other" }),
      org = x.r.createOrganization(other.id, { name: "Other", slug: "other" });
    expect(() =>
      store.verifyDomain(other.id, org.id, requested.domain.id, { token }),
    )
      .to.throw()
      .with.property("code", "DOMAIN_NOT_FOUND");
  });
  it("rejects expired challenge, activation before proof, and removes ownership", () => {
    const { x, store } = fixture(),
      a = store.requestDomain(x.u.id, x.o.id, {
        projectId: x.p.id,
        serviceId: x.svc.id,
        hostname: "one.example.com",
      }),
      b = store.requestDomain(x.u.id, x.o.id, {
        projectId: x.p.id,
        serviceId: x.svc.id,
        hostname: "two.example.com",
      });
    expect(() => store.activateDomain(x.u.id, x.o.id, a.domain.id, {}))
      .to.throw()
      .with.property("code", "DOMAIN_NOT_VERIFIED");
    store.challenges.get(b.domain.id).expiresAt = new Date(
      Date.now() - 1,
    ).toISOString();
    expect(() =>
      store.verifyDomain(x.u.id, x.o.id, b.domain.id, { token: "no" }),
    )
      .to.throw()
      .with.property("code", "DOMAIN_CHALLENGE_EXPIRED");
    expect(store.removeDomain(x.u.id, x.o.id, a.domain.id).status).to.equal(
      "removed",
    );
  });
  it("tracks certificate expiry warnings and blocks host-header shaped input", () => {
    const { x, store } = fixture();
    expect(() =>
      store.requestDomain(x.u.id, x.o.id, {
        projectId: x.p.id,
        serviceId: x.svc.id,
        hostname: "good.example.com/evil",
      }),
    )
      .to.throw()
      .with.property("code", "DOMAIN_INVALID");
    store.routes.set("r", {
      id: "r",
      hostname: "cert.example.com",
      certificateStatus: "ready",
      certificateExpiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    expect(
      new PreviewReconciler({
        store,
        router: new TestIngressRouter(),
      }).certificateWarnings(),
    ).to.have.length(1);
  });
});
