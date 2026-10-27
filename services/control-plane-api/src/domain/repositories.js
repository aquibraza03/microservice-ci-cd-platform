const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const {
  PERMISSIONS,
  PolicyDecisionPoint,
  hasPermission,
  assertRole,
} = require("../auth/rbac");
function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
function now() {
  return new Date().toISOString();
}
function sessionHash(jti) {
  return crypto.createHash("sha256").update(jti).digest("hex");
}

class MemoryRepository {
  constructor() {
    this.organizations = new Map();
    this.users = new Map();
    this.memberships = new Map();
    this.invitations = new Map();
    this.policy = new PolicyDecisionPoint({ version: 2 });
    this.projects = new Map();
    this.services = new Map();
    this.projectMembers = new Map();
    this.repositories = new Map();
    this.installations = new Map();
    this.deliveries = new Map();
    this.gitEvents = [];
    this.environments = new Map();
    this.sessions = new Map();
    this.auditEvents = [];
  }
  upsertUser(identity) {
    const existing = [...this.users.values()].find(
      (item) => item.externalSubject === identity.subject,
    );
    if (existing) {
      Object.assign(existing, {
        email: identity.email || null,
        displayName: identity.displayName || null,
        avatarUrl: identity.avatarUrl || null,
        updatedAt: now(),
      });
      return existing;
    }
    const timestamp = now();
    const entity = {
      id: id("usr"),
      externalSubject: identity.subject,
      email: identity.email || null,
      displayName: identity.displayName || null,
      avatarUrl: identity.avatarUrl || null,
      status: "active",
      currentOrganizationId: null,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.set(entity.id, entity);
    return entity;
  }
  getCurrentUser(userId) {
    const user = this.users.get(userId);
    if (!user)
      throw new ControlPlaneError(404, "USER_NOT_FOUND", "User not found");
    return user;
  }
  createOrganization(userId, input) {
    if (!this.users.has(userId))
      throw new ControlPlaneError(
        404,
        "USER_NOT_FOUND",
        "User identity not found",
      );
    if (
      [...this.organizations.values()].some((item) => item.slug === input.slug)
    )
      throw new ControlPlaneError(
        409,
        "ORGANIZATION_SLUG_CONFLICT",
        "Organization slug already exists",
      );
    const timestamp = now();
    const entity = {
      id: id("org"),
      name: input.name,
      slug: input.slug,
      displayName: input.displayName || input.name,
      status: "active",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.organizations.set(entity.id, entity);
    this.insertMembership(userId, entity.id, "owner");
    this.users.get(userId).currentOrganizationId ||= entity.id;
    return entity;
  }
  getOrganization(orgId) {
    return this.organizations.get(orgId) || null;
  }
  requireOrganization(orgId) {
    const organization = this.getOrganization(orgId);
    if (!organization)
      throw new ControlPlaneError(
        404,
        "ORGANIZATION_NOT_FOUND",
        "Organization not found",
      );
    return organization;
  }
  listOrganizations(userId) {
    return [...this.memberships.values()]
      .filter((m) => m.userId === userId && m.status === "active")
      .map((m) => this.getOrganization(m.organizationId))
      .filter(Boolean);
  }
  insertMembership(userId, organizationId, role = "viewer") {
    assertRole(role);
    if (!this.users.has(userId) || !this.organizations.has(organizationId))
      throw new ControlPlaneError(
        404,
        "MEMBERSHIP_TARGET_NOT_FOUND",
        "Membership target not found",
      );
    const key = `${userId}:${organizationId}`;
    if (this.memberships.has(key))
      throw new ControlPlaneError(
        409,
        "MEMBERSHIP_EXISTS",
        "Membership already exists",
      );
    const entity = {
      userId,
      organizationId,
      status: "active",
      role,
      authorizationVersion: 1,
      assignments: [
        { role, scopeType: "organization", scopeId: organizationId },
      ],
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    this.memberships.set(key, entity);
    return entity;
  }
  addMembership(actorId, organizationId, userId, role = "viewer") {
    this.requireAccess(actorId, organizationId, PERMISSIONS.MEMBERSHIP_ASSIGN);
    this.assertRoleGrantable(actorId, organizationId, role);
    return this.insertMembership(userId, organizationId, role);
  }
  authorizationDecision(
    userId,
    organizationId,
    action,
    { resource = null, scope = null, context = {} } = {},
  ) {
    this.requireOrganization(organizationId);
    const membership = this.memberships.get(`${userId}:${organizationId}`);
    return this.policy.evaluate({
      actor: { id: userId, membership },
      action,
      resource,
      scope: scope || {
        type: "organization",
        id: organizationId,
        organizationId,
      },
      context,
    });
  }
  requireAccess(
    userId,
    organizationId,
    permission = PERMISSIONS.OBSERVE,
    options,
  ) {
    const decision = this.authorizationDecision(
      userId,
      organizationId,
      permission,
      options,
    );
    if (!decision.allowed)
      throw new ControlPlaneError(
        403,
        "PERMISSION_DENIED",
        "Permission denied",
        {
          reasonCode: decision.reasonCode,
          authorizationVersion: decision.authorizationVersion,
        },
      );
    return this.memberships.get(`${userId}:${organizationId}`);
  }
  effectivePermissions(userId, organizationId) {
    const membership = this.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.ORGANIZATION_READ,
    );
    return {
      authorizationVersion: membership.authorizationVersion,
      policyVersion: this.policy.version,
      assignments: structuredClone(membership.assignments),
      permissions: Object.values(PERMISSIONS).filter((p) =>
        membership.assignments.some((a) => hasPermission(a.role, p)),
      ),
    };
  }
  assertRoleGrantable(actorId, organizationId, role) {
    assertRole(role);
    const actor = this.memberships.get(`${actorId}:${organizationId}`);
    if (!actor || actor.status !== "active")
      throw new ControlPlaneError(
        403,
        "MEMBERSHIP_INACTIVE",
        "Permission denied",
      );
    if (role === "owner" && actor.role !== "owner")
      throw new ControlPlaneError(
        403,
        "ROLE_GRANT_FORBIDDEN",
        "Owner role can be granted only by an owner",
      );
    if (["security_admin", "admin"].includes(role) && actor.role !== "owner")
      throw new ControlPlaneError(
        403,
        "ROLE_GRANT_FORBIDDEN",
        "This role can be granted only by an owner",
      );
    return true;
  }
  listMemberships(actorId, organizationId) {
    this.requireAccess(actorId, organizationId, PERMISSIONS.MEMBERSHIP_READ);
    return [...this.memberships.values()].filter(
      (m) => m.organizationId === organizationId,
    );
  }
  assignRole(actorId, organizationId, targetUserId, role, expectedVersion) {
    this.requireAccess(actorId, organizationId, PERMISSIONS.MEMBERSHIP_ASSIGN);
    this.assertRoleGrantable(actorId, organizationId, role);
    const membership = this.memberships.get(
      `${targetUserId}:${organizationId}`,
    );
    if (!membership)
      throw new ControlPlaneError(
        404,
        "MEMBERSHIP_NOT_FOUND",
        "Membership not found",
      );
    if (expectedVersion !== membership.version)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Membership was modified",
      );
    if (actorId === targetUserId && role !== membership.role)
      throw new ControlPlaneError(
        403,
        "SELF_ESCALATION_DENIED",
        "Users cannot change their own role",
      );
    if (membership.role === "owner" && role !== "owner")
      this.assertNotFinalOwner(organizationId, targetUserId);
    membership.role = role;
    membership.assignments = [
      { role, scopeType: "organization", scopeId: organizationId },
    ];
    membership.authorizationVersion += 1;
    membership.version += 1;
    membership.updatedAt = now();
    return membership;
  }
  assertNotFinalOwner(organizationId, targetUserId) {
    const owners = [...this.memberships.values()].filter(
      (m) =>
        m.organizationId === organizationId &&
        m.status === "active" &&
        m.role === "owner",
    );
    if (owners.length <= 1 && owners[0]?.userId === targetUserId)
      throw new ControlPlaneError(
        409,
        "FINAL_OWNER_REQUIRED",
        "The final active owner cannot be removed or demoted",
      );
  }
  removeMembership(actorId, organizationId, targetUserId, expectedVersion) {
    this.requireAccess(actorId, organizationId, PERMISSIONS.MEMBERSHIP_REMOVE);
    const membership = this.memberships.get(
      `${targetUserId}:${organizationId}`,
    );
    if (!membership || membership.status !== "active")
      throw new ControlPlaneError(
        404,
        "MEMBERSHIP_NOT_FOUND",
        "Membership not found",
      );
    if (membership.version !== expectedVersion)
      throw new ControlPlaneError(
        409,
        "VERSION_CONFLICT",
        "Membership was modified",
      );
    if (membership.role === "owner")
      this.assertNotFinalOwner(organizationId, targetUserId);
    membership.status = "removed";
    membership.authorizationVersion += 1;
    membership.version += 1;
    membership.updatedAt = now();
    return membership;
  }
  createInvitation(actorId, organizationId, input) {
    this.requireAccess(actorId, organizationId, PERMISSIONS.MEMBERSHIP_INVITE);
    this.assertRoleGrantable(actorId, organizationId, input.role);
    const token = crypto.randomBytes(32).toString("base64url");
    const invitation = {
      id: id("inv"),
      organizationId,
      email: input.email.toLowerCase(),
      role: input.role,
      tokenHash: sessionHash(token),
      expiresAt: input.expiresAt,
      status: "pending",
      createdAt: now(),
    };
    this.invitations.set(invitation.id, invitation);
    return { invitation: { ...invitation, tokenHash: undefined }, token };
  }
  acceptInvitation(userId, organizationId, invitationId, token) {
    const invitation = this.invitations.get(invitationId);
    if (!invitation || invitation.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "INVITATION_NOT_FOUND",
        "Invitation not found",
      );
    if (
      invitation.status !== "pending" ||
      new Date(invitation.expiresAt).getTime() <= Date.now() ||
      sessionHash(token) !== invitation.tokenHash
    )
      throw new ControlPlaneError(
        409,
        "INVITATION_NOT_USABLE",
        "Invitation is expired, revoked, or already used",
      );
    const user = this.getCurrentUser(userId);
    if (user.email?.toLowerCase() !== invitation.email)
      throw new ControlPlaneError(
        403,
        "INVITATION_IDENTITY_MISMATCH",
        "Invitation identity does not match",
      );
    const membership = this.insertMembership(
      userId,
      organizationId,
      invitation.role,
    );
    invitation.status = "accepted";
    invitation.acceptedAt = now();
    return membership;
  }
  setCurrentOrganization(userId, organizationId) {
    this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const user = this.getCurrentUser(userId);
    user.currentOrganizationId = organizationId;
    user.version += 1;
    user.updatedAt = now();
    return user;
  }
  listProjects(userId, organizationId, query = {}) {
    this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    let items = [...this.projects.values()].filter(
      (item) => item.organizationId === organizationId,
    );
    if (query.status)
      items = items.filter((item) => item.status === query.status);
    if (query.search)
      items = items.filter((item) =>
        `${item.name} ${item.slug}`
          .toLowerCase()
          .includes(query.search.toLowerCase()),
      );
    return items;
  }
  createProject(userId, organizationId, input) {
    this.requireAccess(userId, organizationId, PERMISSIONS.REPOSITORY_MANAGE);
    if (
      [...this.projects.values()].some(
        (item) =>
          item.organizationId === organizationId && item.slug === input.slug,
      )
    )
      throw new ControlPlaneError(
        409,
        "PROJECT_SLUG_CONFLICT",
        "Project slug already exists",
      );
    const timestamp = now();
    const entity = {
      id: id("prj"),
      organizationId,
      name: input.name,
      slug: input.slug,
      description: input.description || null,
      status: "active",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.projects.set(entity.id, entity);
    return entity;
  }
  getProject(userId, organizationId, projectId) {
    this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const project = this.projects.get(projectId);
    if (!project || project.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "PROJECT_NOT_FOUND",
        "Project not found",
      );
    return project;
  }
  createService(userId, organizationId, projectId, input) {
    this.requireAccess(userId, organizationId, PERMISSIONS.REPOSITORY_MANAGE);
    this.getProject(userId, organizationId, projectId);
    this.getProviderRepository(userId, organizationId, input.repositoryId);
    const entity = {
      id: id("svc"),
      organizationId,
      projectId,
      repositoryId: input.repositoryId,
      name: input.name,
      servicePath: input.servicePath || ".",
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    this.services.set(entity.id, entity);
    return entity;
  }
  getService(userId, organizationId, serviceId) {
    this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const item = this.services.get(serviceId);
    if (!item || item.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "SERVICE_NOT_FOUND",
        "Service not found",
      );
    return item;
  }
  listServices(userId, organizationId, projectId) {
    this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    return [...this.services.values()].filter(
      (s) => s.organizationId === organizationId && s.projectId === projectId,
    );
  }
  listRepositoryReferences(userId, organizationId) {
    this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    return [...this.repositories.values()].filter(
      (item) => item.organizationId === organizationId,
    );
  }
  createRepositoryReference(userId, organizationId, projectId, input) {
    this.requireAccess(userId, organizationId, PERMISSIONS.REPOSITORY_MANAGE);
    this.getProject(userId, organizationId, projectId);
    const timestamp = now();
    const entity = {
      id: id("repo"),
      organizationId,
      projectId,
      ...input,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.repositories.set(entity.id, entity);
    return entity;
  }
  createInstallation(userId, organizationId, input) {
    this.requireAccess(userId, organizationId, PERMISSIONS.REPOSITORY_MANAGE);
    const existing = [...this.installations.values()].find(
      (i) =>
        i.provider === input.provider &&
        i.providerInstallationId === String(input.providerInstallationId),
    );
    if (existing && existing.organizationId !== organizationId)
      throw new ControlPlaneError(
        403,
        "INSTALLATION_OWNERSHIP_CONFLICT",
        "Installation belongs to another organization",
      );
    if (existing) {
      Object.assign(existing, input, {
        connectionState: "active",
        updatedAt: now(),
      });
      return existing;
    }
    const entity = {
      id: id("ins"),
      organizationId,
      ...input,
      providerInstallationId: String(input.providerInstallationId),
      connectionState: "active",
      createdBy: userId,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    this.installations.set(entity.id, entity);
    return entity;
  }
  listInstallations(userId, organizationId) {
    this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    return [...this.installations.values()].filter(
      (i) => i.organizationId === organizationId,
    );
  }
  requireInstallation(
    userId,
    organizationId,
    installationId,
    permission = PERMISSIONS.OBSERVE,
  ) {
    this.requireAccess(userId, organizationId, permission);
    const item = this.installations.get(installationId);
    if (!item || item.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "INSTALLATION_NOT_FOUND",
        "Installation not found",
      );
    if (item.connectionState !== "active")
      throw new ControlPlaneError(
        403,
        "GIT_PROVIDER_ACCESS_REVOKED",
        "Git provider access is unavailable",
      );
    return item;
  }
  setInstallationStateByProvider(providerInstallationId, state) {
    const item = [...this.installations.values()].find(
      (i) => i.providerInstallationId === String(providerInstallationId),
    );
    if (item) {
      item.connectionState = state;
      item.version += 1;
      item.updatedAt = now();
    }
    return item || null;
  }
  disconnectInstallation(userId, organizationId, installationId) {
    const item = this.requireInstallation(
      userId,
      organizationId,
      installationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    item.connectionState = "disconnected";
    item.version += 1;
    item.updatedAt = now();
    for (const repo of this.repositories.values())
      if (repo.installationId === item.id) {
        repo.status = "disconnected";
        repo.disconnectedAt = now();
      }
    return item;
  }
  connectProviderRepository(
    userId,
    organizationId,
    projectId,
    installationId,
    metadata,
    selectedBranch,
  ) {
    const installation = this.requireInstallation(
      userId,
      organizationId,
      installationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    this.getProject(userId, organizationId, projectId);
    const conflict = [...this.repositories.values()].find(
      (r) =>
        r.provider === installation.provider &&
        String(r.externalId) === String(metadata.id) &&
        r.organizationId !== organizationId,
    );
    if (conflict)
      throw new ControlPlaneError(
        403,
        "REPOSITORY_OWNERSHIP_CONFLICT",
        "Repository belongs to another organization",
      );
    return this.createRepositoryReference(userId, organizationId, projectId, {
      provider: installation.provider,
      installationId: installation.id,
      externalId: String(metadata.id),
      name: metadata.fullName,
      repositoryOwner: metadata.owner,
      repositoryName: metadata.name,
      defaultBranch: metadata.defaultBranch,
      selectedBranch,
      visibility: metadata.visibility,
      status: "active",
      connectedBy: userId,
      connectedAt: now(),
      lastSyncedAt: now(),
    });
  }
  getProviderRepository(
    userId,
    organizationId,
    repositoryId,
    permission = PERMISSIONS.OBSERVE,
  ) {
    this.requireAccess(userId, organizationId, permission);
    const item = this.repositories.get(repositoryId);
    if (!item || item.organizationId !== organizationId)
      throw new ControlPlaneError(
        404,
        "REPOSITORY_NOT_FOUND",
        "Repository not found",
      );
    return item;
  }
  getRepositoryForWorker(repositoryId, organizationId) {
    const item = this.repositories.get(repositoryId);
    if (
      !item ||
      item.organizationId !== organizationId ||
      item.status !== "active"
    )
      throw new ControlPlaneError(
        404,
        "REPOSITORY_NOT_FOUND",
        "Repository not found",
      );
    const installation = this.installations.get(item.installationId);
    if (
      !installation ||
      installation.organizationId !== organizationId ||
      installation.connectionState !== "active"
    )
      throw new ControlPlaneError(
        403,
        "GIT_PROVIDER_ACCESS_REVOKED",
        "Git provider access is unavailable",
      );
    return { repository: item, installation };
  }
  disconnectProviderRepository(userId, organizationId, repositoryId) {
    const item = this.getProviderRepository(
      userId,
      organizationId,
      repositoryId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    item.status = "disconnected";
    item.disconnectedAt = now();
    item.version += 1;
    item.updatedAt = now();
    return item;
  }
  findInstallationByProviderId(providerInstallationId) {
    return (
      [...this.installations.values()].find(
        (i) => i.providerInstallationId === String(providerInstallationId),
      ) || null
    );
  }
  findRepositoryByProviderId(providerId) {
    return (
      [...this.repositories.values()].find(
        (r) =>
          String(r.externalId) === String(providerId) && r.status === "active",
      ) || null
    );
  }
  updateProviderRepository(repositoryId, action, metadata) {
    const item = this.repositories.get(repositoryId);
    if (!item) return null;
    if (["deleted", "transferred"].includes(action))
      item.status = "disconnected";
    if (action === "renamed") {
      item.name = metadata.full_name;
      item.repositoryOwner = metadata.owner.login;
      item.repositoryName = metadata.name;
    }
    item.updatedAt = now();
    return item;
  }
  refreshProviderRepository(repositoryId, metadata) {
    const item = this.repositories.get(repositoryId);
    if (!item) return null;
    Object.assign(item, {
      name: metadata.fullName,
      repositoryOwner: metadata.owner,
      repositoryName: metadata.name,
      defaultBranch: metadata.defaultBranch,
      visibility: metadata.visibility,
      lastSyncedAt: now(),
      updatedAt: now(),
    });
    return item;
  }
  recordWebhookDelivery(input) {
    const key = `${input.provider}:${input.deliveryId}`;
    if (this.deliveries.has(key))
      return { duplicate: true, delivery: this.deliveries.get(key) };
    const delivery = {
      id: id("del"),
      ...input,
      status: "accepted",
      receivedAt: now(),
    };
    this.deliveries.set(key, delivery);
    return { duplicate: false, delivery };
  }
  recordGitEvent(input) {
    const event = { id: id("evt"), ...input, createdAt: now() };
    this.gitEvents.push(event);
    return event;
  }
  listEnvironmentReferences(userId, organizationId) {
    this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    return [...this.environments.values()].filter(
      (item) => item.organizationId === organizationId,
    );
  }
  createEnvironmentReference(userId, organizationId, projectId, input) {
    this.requireAccess(userId, organizationId, PERMISSIONS.ENVIRONMENT_MANAGE);
    this.getProject(userId, organizationId, projectId);
    const timestamp = now();
    const entity = {
      id: id("env"),
      organizationId,
      projectId,
      ...input,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.environments.set(entity.id, entity);
    return entity;
  }
  createSession(userId, jti, expiresAt) {
    this.sessions.set(sessionHash(jti), { userId, expiresAt, revokedAt: null });
  }
  isSessionActive(jti, externalSubject) {
    const session = this.sessions.get(sessionHash(jti));
    const user = [...this.users.values()].find(
      (item) => item.externalSubject === externalSubject,
    );
    return Boolean(
      session &&
      user &&
      session.userId === user.id &&
      !session.revokedAt &&
      new Date(session.expiresAt).getTime() > Date.now(),
    );
  }
  revokeSession(userId, jti) {
    const session = this.sessions.get(sessionHash(jti));
    if (session?.userId === userId) session.revokedAt = now();
  }
  recordAudit(event) {
    const auditEvent = { id: id("audit"), ...event, createdAt: now() };
    this.auditEvents.push(auditEvent);
    return auditEvent;
  }
}
module.exports = { MemoryRepository, sessionHash };
