const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { PERMISSIONS } = require("../auth/rbac");
const {
  normalizeHostname,
  previewHostname,
  isolationKey,
} = require("./hostname");
const now = () => new Date().toISOString(),
  id = () => crypto.randomUUID(),
  hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
class MemoryPreviewStore {
  getPolicy(org, serviceId) { return this.policies.get(`${org}:${serviceId}`); }
  eventPolicy(org, repositoryId) { return [...this.policies.values()].find(x => x.organizationId === org && x.repositoryId === repositoryId && x.enabled); }
  eventPreview(org, repositoryId, pr) { return [...this.previews.values()].find(x => x.organizationId === org && x.repositoryId === repositoryId && x.pullRequestNumber === pr && x.lifecycleStatus !== 'removed'); }
  previewRecord(org, id) {
    const x = this.previews.get(id);
    if (!x || x.organizationId !== org) throw new ControlPlaneError(404, 'PREVIEW_NOT_FOUND', 'Preview not found');
    return x;
  }
  routeRecord(org, id) {
    const x = this.routes.get(id);
    if (!x || x.organizationId !== org) throw new ControlPlaneError(404, 'ROUTE_NOT_FOUND', 'Route not found');
    return x;
  }
  previewRoute(org, id) { return [...this.routes.values()].find(x => x.organizationId === org && x.previewId === id); }
  setDeploymentResource(org, id, value) { this.previewRecord(org, id).deploymentResource = value; }
  setDomainStatus(org, id, status) { const x = this._domain(org, id); x.status = status; return x; }
  knownPreviewIds(org) { return [...this.previews.values()].filter(x => !org || x.organizationId === org).map(x => x.id); }
  certificateRoutes(org) { return [...this.routes.values()].filter(x => !org || x.organizationId === org); }
  constructor(
    repository,
    {
      baseDomain = "preview.local",
      challengeTtlMs = 900000,
      previewTtlMs = 86400000,
    } = {},
  ) {
    Object.assign(this, {
      repository,
      baseDomain,
      challengeTtlMs,
      previewTtlMs,
    });
    this.policies = new Map();
    this.previews = new Map();
    this.revisions = new Map();
    this.routes = new Map();
    this.domains = new Map();
    this.challenges = new Map();
    this.cleanupJobs = new Map();
    this.audit = [];
  }
  policy(userId, org, input) {
    this.repository.requireAccess(userId, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    this.repository.getProject(userId, org, input.projectId);
    const service = this.repository.getService(userId, org, input.serviceId),
      repo = this.repository.getProviderRepository(
        userId,
        org,
        input.repositoryId,
      );
    if (
      service.projectId !== input.projectId ||
      service.repositoryId !== repo.id
    )
      throw new ControlPlaneError(
        404,
        "PREVIEW_RESOURCE_NOT_FOUND",
        "Preview resources not found",
      );
    const key = `${org}:${input.serviceId}`,
      value = {
        id: this.policies.get(key)?.id || id(),
        organizationId: org,
        createdBy: userId,
        enabled: input.enabled !== false,
        ttlSeconds: Math.min(Math.max(input.ttlSeconds || 86400, 300), 604800),
        maxCpuMillicores: Math.min(input.maxCpuMillicores || 500, 1000),
        maxMemoryMebibytes: Math.min(input.maxMemoryMebibytes || 512, 1024),
        maxStorageMebibytes: Math.min(input.maxStorageMebibytes || 1024, 2048),
        projectId: input.projectId,
        serviceId: input.serviceId,
        repositoryId: input.repositoryId,
        allowForkPreviews: input.allowForkPreviews !== false,
        branch: input.branch || "main",
        configurationSnapshot: structuredClone(
          input.configurationSnapshot || {},
        ),
      };
    this.policies.set(key, value);
    return value;
  }
  create(userId, org, input, key) {
    this.repository.requireAccess(userId, org, PERMISSIONS.DEPLOYMENT_CREATE);
    const policy = this.policies.get(`${org}:${input.serviceId}`);
    if (!policy?.enabled)
      throw new ControlPlaneError(
        409,
        "PREVIEW_POLICY_DISABLED",
        "Preview policy is unavailable",
      );
    this.repository.getProject(userId, org, input.projectId);
    this.repository.getService(userId, org, input.serviceId);
    this.repository.getProviderRepository(userId, org, input.repositoryId);
    if (!/^[a-f0-9]{40,64}$/i.test(input.commitSha))
      throw new ControlPlaneError(
        400,
        "COMMIT_SHA_INVALID",
        "An immutable commit SHA is required",
      );
    if (input.forked && !input.providerTrustVerified)
      throw new ControlPlaneError(
        403,
        "FORK_TRUST_UNVERIFIED",
        "Fork trust requires verified provider metadata",
      );
    const duplicate = [...this.revisions.values()].find(
      (x) => x.idempotencyKey === `${org}:${key}`,
    );
    if (duplicate)
      return {
        preview: this.previews.get(duplicate.previewId),
        revision: duplicate,
        created: false,
      };
    let preview = [...this.previews.values()].find(
      (x) =>
        x.organizationId === org &&
        x.serviceId === input.serviceId &&
        x.pullRequestNumber === input.pullRequestNumber &&
        x.lifecycleStatus !== "removed",
    );
    if (!preview) {
      preview = {
        id: id(),
        organizationId: org,
        projectId: input.projectId,
        serviceId: input.serviceId,
        repositoryId: input.repositoryId,
        pullRequestNumber: input.pullRequestNumber ?? null,
        isolationKey: isolationKey({
          organizationId: org,
          serviceId: input.serviceId,
          prNumber: input.pullRequestNumber,
          commitSha: input.commitSha,
        }),
        generatedHostname: previewHostname({
          organizationId: org,
          serviceId: input.serviceId,
          prNumber: input.pullRequestNumber,
          baseDomain: this.baseDomain,
        }),
        createdAt: now(),
        expiresAt: new Date(
          Date.now() + policy.ttlSeconds * 1000,
        ).toISOString(),
        lifecycleStatus: "pending",
        cleanupStatus: "not_requested",
        activeRevisionId: null,
      };
      this.previews.set(preview.id, preview);
    }
    let revision = [...this.revisions.values()].find(
      (x) => x.previewId === preview.id && x.commitSha === input.commitSha,
    );
    if (!revision) {
      revision = {
        id: id(),
        previewId: preview.id,
        organizationId: org,
        deploymentId: input.deploymentId || null,
        commitSha: input.commitSha.toLowerCase(),
        providerDeliveryId: input.providerDeliveryId || null,
        trustLevel: input.forked ? "fork_verified" : "same_repository",
        protectedSecretsAllowed: !input.forked,
        secretProfile: input.forked ? "untrusted-preview" : "trusted-preview",
        status: "pending",
        idempotencyKey: `${org}:${key}`,
        createdAt: now(),
      };
      this.revisions.set(revision.id, revision);
    }
    preview.activeRevisionId = revision.id;
    preview.lifecycleStatus = "building";
    return { preview, revision, created: true };
  }
  list(userId, org) {
    this.repository.requireAccess(userId, org, PERMISSIONS.OBSERVE);
    return [...this.previews.values()].filter((x) => x.organizationId === org);
  }
  get(userId, org, previewId) {
    this.repository.requireAccess(userId, org, PERMISSIONS.OBSERVE);
    const preview = this.previews.get(previewId);
    if (!preview || preview.organizationId !== org)
      throw new ControlPlaneError(
        404,
        "PREVIEW_NOT_FOUND",
        "Preview not found",
      );
    return {
      ...preview,
      revision: this.revisions.get(preview.activeRevisionId) || null,
      route:
        [...this.routes.values()].find((x) => x.previewId === preview.id) ||
        null,
    };
  }
  markReady(
    previewId,
    { routeId, deploymentHealthy, httpVerified, scope = "local", organizationId },
  ) {
    const p = this.previews.get(previewId),
      route = this.routes.get(routeId);
    if (!p || !route || route.previewId !== p.id || (organizationId && p.organizationId !== organizationId))
      throw new ControlPlaneError(
        404,
        "PREVIEW_ROUTE_NOT_FOUND",
        "Preview route not found",
      );
    if (
      route.status !== "ready" ||
      !deploymentHealthy ||
      !httpVerified ||
      (route.tlsRequired && route.certificateStatus !== "ready")
    )
      throw new ControlPlaneError(
        409,
        "PREVIEW_NOT_VERIFIED",
        "Route, TLS, health and HTTP verification must pass",
      );
    route.verificationScope = scope;
    route.lastVerifiedAt = now();
    p.lifecycleStatus = "ready";
    this.revisions.get(p.activeRevisionId).status = "ready";
    return p;
  }
  route(userId, org, input) {
    this.repository.requireAccess(userId, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    const p = this.get(userId, org, input.previewId);
    const existing = [...this.routes.values()].find(
      (x) => x.hostname === p.generatedHostname,
    );
    if (existing) return existing;
    const value = {
      id: id(),
      organizationId: org,
      serviceId: p.serviceId,
      previewId: p.id,
      hostname: p.generatedHostname,
      routeKind: "ingress",
      namespace: input.namespace,
      resourceName: input.resourceName,
      backendService: input.backendService,
      backendPort: input.backendPort,
      status: "requested",
      tlsRequired: input.tlsRequired !== false,
      certificateStatus: input.tlsRequired === false ? "ready" : "requested",
      verificationScope: null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.routes.set(value.id, value);
    return value;
  }
  updateRoute(org, routeId, input) {
    const route = this.routes.get(routeId);
    if (!route || route.organizationId !== org)
      throw new ControlPlaneError(404, "ROUTE_NOT_FOUND", "Route not found");
    Object.assign(route, input, { updatedAt: now() });
    return route;
  }
  requestDomain(userId, org, input) {
    this.repository.requireAccess(userId, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    this.repository.getProject(userId, org, input.projectId);
    this.repository.getService(userId, org, input.serviceId);
    const hostname = normalizeHostname(input.hostname),
      claimed = [...this.domains.values()].find(
        (x) => x.hostnameAscii === hostname && x.status !== "removed",
      );
    if (claimed)
      throw new ControlPlaneError(
        409,
        "DOMAIN_ALREADY_CLAIMED",
        "Domain is already claimed",
      );
    const domain = {
        id: id(),
        organizationId: org,
        projectId: input.projectId,
        serviceId: input.serviceId,
        hostnameAscii: hostname,
        hostnameDisplay: String(input.hostname),
        status: "pending_verification",
        createdBy: userId,
        createdAt: now(),
        updatedAt: now(),
      },
      token = crypto.randomBytes(32).toString("base64url"),
      challenge = {
        id: id(),
        customDomainId: domain.id,
        tokenHash: hash(token),
        dnsRecordName: `_platform-verification.${hostname}`,
        expiresAt: new Date(Date.now() + this.challengeTtlMs).toISOString(),
        verifiedAt: null,
        attempts: 0,
      };
    this.domains.set(domain.id, domain);
    this.challenges.set(domain.id, challenge);
    return {
      domain,
      instructions: {
        type: "TXT",
        name: challenge.dnsRecordName,
        value: `platform-verification=${token}`,
        expiresAt: challenge.expiresAt,
      },
    };
  }
  verifyDomain(userId, org, domainId, { token, dnsValues = [] }) {
    this.repository.requireAccess(userId, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    const domain = this._domain(org, domainId),
      challenge = this.challenges.get(domainId);
    if (!challenge || Date.parse(challenge.expiresAt) <= Date.now())
      throw new ControlPlaneError(
        410,
        "DOMAIN_CHALLENGE_EXPIRED",
        "Domain verification challenge expired",
      );
    challenge.attempts++;
    const candidate =
      token ||
      dnsValues
        .map((x) => String(x).replace(/^platform-verification=/, ""))
        .find(Boolean);
    if (!candidate || hash(candidate) !== challenge.tokenHash)
      throw new ControlPlaneError(
        422,
        "DOMAIN_VERIFICATION_FAILED",
        "Domain control could not be verified",
      );
    challenge.verifiedAt = now();
    domain.status = "verified";
    domain.updatedAt = now();
    return domain;
  }
  activateDomain(userId, org, domainId, input) {
    this.repository.requireAccess(userId, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    const domain = this._domain(org, domainId);
    if (domain.status !== "verified")
      throw new ControlPlaneError(
        409,
        "DOMAIN_NOT_VERIFIED",
        "Domain ownership must be verified before activation",
      );
    const existing = [...this.routes.values()].find(
      (x) => x.hostname === domain.hostnameAscii && x.status !== "removed",
    );
    if (existing && existing.organizationId !== org)
      throw new ControlPlaneError(
        409,
        "DOMAIN_ALREADY_CLAIMED",
        "Domain is already claimed",
      );
    const route = existing || {
      id: id(),
      organizationId: org,
      serviceId: domain.serviceId,
      previewId: null,
      hostname: domain.hostnameAscii,
      routeKind: "ingress",
      namespace: input.namespace,
      resourceName: input.resourceName,
      backendService: input.backendService,
      backendPort: input.backendPort,
      status: "requested",
      tlsRequired: true,
      certificateStatus: "requested",
      verificationScope: null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.routes.set(route.id, route);
    domain.routeId = route.id;
    domain.status = "activating";
    domain.updatedAt = now();
    return { domain, route };
  }
  removeDomain(userId, org, domainId) {
    this.repository.requireAccess(userId, org, PERMISSIONS.ENVIRONMENT_MANAGE);
    const d = this._domain(org, domainId);
    d.status = "removed";
    d.removedAt = now();
    d.routeId = null;
    this.challenges.delete(domainId);
    return d;
  }
  listDomains(userId, org) {
    this.repository.requireAccess(userId, org, PERMISSIONS.OBSERVE);
    return [...this.domains.values()].filter(
      (x) => x.organizationId === org && x.status !== "removed",
    );
  }
  _domain(org, id) {
    const d = this.domains.get(id);
    if (!d || d.organizationId !== org || d.status === "removed")
      throw new ControlPlaneError(404, "DOMAIN_NOT_FOUND", "Domain not found");
    return d;
  }
  scheduleCleanup(previewId, reason = "expired", org) {
    const p = this.previews.get(previewId);
    if (org && p?.organizationId !== org) throw new ControlPlaneError(404, 'PREVIEW_NOT_FOUND', 'Preview not found');
    if (!p) return null;
    let job = this.cleanupJobs.get(previewId);
    if (!job) {
      const route = [...this.routes.values()].find(
        (x) => x.previewId === previewId,
      );
      job = {
        id: id(),
        previewId,
        organizationId: p.organizationId,
        status: "pending",
        attempt: 0,
        nextAttemptAt: now(),
        finalizerDeadline: new Date(Date.now() + 3600000).toISOString(),
        ownedResourceIds: {
          isolationKey: p.isolationKey,
          routeId: route?.id || null,
        },
        reason,
      };
      this.cleanupJobs.set(previewId, job);
    }
    p.cleanupStatus = "pending";
    p.lifecycleStatus = "closing";
    return job;
  }
  due(org) {
    for (const p of this.previews.values())
      if (
        (!org || p.organizationId === org) && Date.parse(p.expiresAt) <= Date.now() &&
        !["removed", "closing"].includes(p.lifecycleStatus)
      )
        this.scheduleCleanup(p.id);
    return [...this.cleanupJobs.values()].filter(
      (x) =>
        (!org || x.organizationId === org) && ["pending", "retry"].includes(x.status) &&
        Date.parse(x.nextAttemptAt) <= Date.now(),
    );
  }
  cleanupComplete(job) {
    const p = this.previews.get(job.previewId);
    job.status = "completed";
    p.cleanupStatus = "completed";
    p.lifecycleStatus = "removed";
    const route = [...this.routes.values()].find((x) => x.previewId === p.id);
    if (route) {
      route.status = "removed";
      route.certificateStatus = "removed";
    }
    this.audit.push({
      action: "preview.cleanup_completed",
      previewId: p.id,
      organizationId: p.organizationId,
      at: now(),
    });
    return p;
  }
  cleanupFailed(job, error) {
    job.attempt++;
    job.status =
      Date.now() >= Date.parse(job.finalizerDeadline) ? "failed" : "retry";
    job.lastError = String(error.message || error).slice(0, 500);
    job.nextAttemptAt = new Date(
      Date.now() + Math.min(60000, 1000 * 2 ** job.attempt),
    ).toISOString();
    return job;
  }
  async handleProviderEvent(event) {
    if (event.eventType !== "pull_request") return null;
    const policy = [...this.policies.values()].find(
      (item) =>
        item.organizationId === event.organizationId &&
        item.repositoryId === event.repositoryId &&
        item.enabled,
    );
    if (!policy) return null;
    const action = event.metadata?.action;
    const current = [...this.previews.values()].find(
      (item) =>
        item.organizationId === event.organizationId &&
        item.repositoryId === event.repositoryId &&
        item.pullRequestNumber === event.pullRequestNumber &&
        item.lifecycleStatus !== "removed",
    );
    if (["closed"].includes(action))
      return current
        ? this.scheduleCleanup(
            current.id,
            event.metadata?.merged ? "merged" : "closed",
          )
        : null;
    if (!["opened", "reopened", "synchronize"].includes(action)) return null;
    return this.create(
      policy.createdBy,
      event.organizationId,
      {
        projectId: policy.projectId,
        serviceId: policy.serviceId,
        repositoryId: policy.repositoryId,
        pullRequestNumber: event.pullRequestNumber,
        commitSha: event.commitSha,
        forked: event.forkedPullRequest,
        providerTrustVerified: true,
        providerDeliveryId: event.deliveryId,
      },
      `github:${event.deliveryId}`,
    );
  }
}
module.exports = { MemoryPreviewStore };
