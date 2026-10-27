const crypto = require("crypto");
const { ControlPlaneError } = require("../errors");
const { withTransaction } = require("../database/transaction");
const {
  PERMISSIONS,
  PolicyDecisionPoint,
  hasPermission,
  assertRole,
} = require("../auth/rbac");
const { sessionHash } = require("./repositories");
function id() {
  return crypto.randomUUID();
}
const userColumns = `id, external_subject AS "externalSubject", email, display_name AS "displayName", avatar_url AS "avatarUrl", status, current_organization_id AS "currentOrganizationId", version, created_at AS "createdAt", updated_at AS "updatedAt"`;
const orgColumns = `id, name, slug, display_name AS "displayName", status, version, created_at AS "createdAt", updated_at AS "updatedAt"`;

class PostgresRepository {
  constructor(pool) {
    if (!pool) throw new Error("PostgreSQL pool is required");
    this.pool = pool;
    this.policy = new PolicyDecisionPoint({ version: 2 });
  }
  async upsertUser(identity) {
    const result = await this.pool.query(
      `INSERT INTO users (id, external_subject, email, display_name, avatar_url) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (external_subject) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, avatar_url=EXCLUDED.avatar_url, version=users.version+1, updated_at=NOW() RETURNING ${userColumns}`,
      [
        id(),
        identity.subject,
        identity.email || null,
        identity.displayName || null,
        identity.avatarUrl || null,
      ],
    );
    return result.rows[0];
  }
  async getCurrentUser(userId) {
    const result = await this.pool.query(
      `SELECT ${userColumns} FROM users WHERE id=$1 AND status='active'`,
      [userId],
    );
    if (result.rowCount !== 1)
      throw new ControlPlaneError(404, "USER_NOT_FOUND", "User not found");
    return result.rows[0];
  }
  async createOrganization(userId, input) {
    return withTransaction(this.pool, async (client) => {
      const user = await client.query(
        "SELECT id FROM users WHERE id=$1 FOR UPDATE",
        [userId],
      );
      if (user.rowCount !== 1)
        throw new ControlPlaneError(
          404,
          "USER_NOT_FOUND",
          "User identity not found",
        );
      const organizationId = id();
      const organization = await client.query(
        `INSERT INTO organizations (id,name,slug,display_name) VALUES ($1,$2,$3,$4) RETURNING ${orgColumns}`,
        [
          organizationId,
          input.name,
          input.slug,
          input.displayName || input.name,
        ],
      );
      await client.query(
        "INSERT INTO organization_members (organization_id,user_id,role) VALUES ($1,$2,'owner')",
        [organizationId, userId],
      );
      await client.query(
        "UPDATE users SET current_organization_id=COALESCE(current_organization_id,$1), version=version+1, updated_at=NOW() WHERE id=$2",
        [organizationId, userId],
      );
      return organization.rows[0];
    });
  }
  async listOrganizations(userId) {
    const result = await this.pool.query(
      `SELECT ${orgColumns
        .split(", ")
        .map((c) => `o.${c}`)
        .join(
          ", ",
        )} FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1 AND m.status='active' ORDER BY o.name`,
      [userId],
    );
    return result.rows;
  }
  async getOrganization(orgId) {
    const result = await this.pool.query(
      `SELECT ${orgColumns} FROM organizations WHERE id=$1`,
      [orgId],
    );
    return result.rows[0] || null;
  }
  async requireOrganization(orgId) {
    const org = await this.getOrganization(orgId);
    if (!org)
      throw new ControlPlaneError(
        404,
        "ORGANIZATION_NOT_FOUND",
        "Organization not found",
      );
    return org;
  }
  async authorizationDecision(
    userId,
    organizationId,
    action,
    { resource = null, scope = null, context = {} } = {},
  ) {
    const result = await this.pool.query(
      'SELECT user_id AS "userId", organization_id AS "organizationId", role, status, version, authorization_version AS "authorizationVersion" FROM organization_members WHERE user_id=$1 AND organization_id=$2',
      [userId, organizationId],
    );
    const membership = result.rows[0];
    if (membership)
      membership.assignments = [
        {
          role: membership.role,
          scopeType: "organization",
          scopeId: organizationId,
        },
      ];
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
  async requireAccess(
    userId,
    organizationId,
    permission = PERMISSIONS.OBSERVE,
    options,
  ) {
    const decision = await this.authorizationDecision(
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
    const result = await this.pool.query(
      'SELECT user_id AS "userId", organization_id AS "organizationId", role, status, version, authorization_version AS "authorizationVersion" FROM organization_members WHERE user_id=$1 AND organization_id=$2',
      [userId, organizationId],
    );
    return result.rows[0];
  }
  async effectivePermissions(userId, organizationId) {
    const membership = await this.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.ORGANIZATION_READ,
    );
    return {
      authorizationVersion: Number(membership.authorizationVersion),
      policyVersion: this.policy.version,
      assignments: [
        {
          role: membership.role,
          scopeType: "organization",
          scopeId: organizationId,
        },
      ],
      permissions: Object.values(PERMISSIONS).filter((p) =>
        hasPermission(membership.role, p),
      ),
    };
  }
  async listMemberships(actorId, organizationId) {
    await this.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.MEMBERSHIP_READ,
    );
    const result = await this.pool.query(
      'SELECT m.user_id AS "userId",m.organization_id AS "organizationId",m.role,m.status,m.version,u.email,u.display_name AS "displayName" FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY u.email NULLS LAST,u.id',
      [organizationId],
    );
    return result.rows;
  }
  async addMembership(actorId, organizationId, userId, role = "viewer") {
    await this.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.MEMBERSHIP_ASSIGN,
    );
    assertRole(role);
    const actor = await this.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.MEMBERSHIP_ASSIGN,
    );
    if (role === "owner" && actor.role !== "owner")
      throw new ControlPlaneError(
        403,
        "ROLE_GRANT_FORBIDDEN",
        "Owner role can be granted only by an owner",
      );
    if (["admin", "security_admin"].includes(role) && actor.role !== "owner")
      throw new ControlPlaneError(
        403,
        "ROLE_GRANT_FORBIDDEN",
        "This role can be granted only by an owner",
      );
    try {
      const result = await this.pool.query(
        'INSERT INTO organization_members (organization_id,user_id,role) VALUES ($1,$2,$3) RETURNING user_id AS "userId",organization_id AS "organizationId",role,status,version',
        [organizationId, userId, role],
      );
      return result.rows[0];
    } catch (error) {
      if (error.code === "23505")
        throw new ControlPlaneError(
          409,
          "MEMBERSHIP_EXISTS",
          "Membership already exists",
        );
      if (error.code === "23503")
        throw new ControlPlaneError(
          404,
          "MEMBERSHIP_TARGET_NOT_FOUND",
          "Membership target not found",
        );
      throw error;
    }
  }
  async assignRole(
    actorId,
    organizationId,
    targetUserId,
    role,
    expectedVersion,
  ) {
    await this.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.MEMBERSHIP_ASSIGN,
    );
    assertRole(role);
    if (actorId === targetUserId)
      throw new ControlPlaneError(
        403,
        "SELF_ESCALATION_DENIED",
        "Users cannot change their own role",
      );
    const actor = await this.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.MEMBERSHIP_ASSIGN,
    );
    if (role === "owner" && actor.role !== "owner")
      throw new ControlPlaneError(
        403,
        "ROLE_GRANT_FORBIDDEN",
        "Owner role can be granted only by an owner",
      );
    const result = await withTransaction(this.pool, async (client) => {
      const current = await client.query(
        "SELECT role,version FROM organization_members WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
        [organizationId, targetUserId],
      );
      if (current.rowCount !== 1) return { rowCount: 0, rows: [] };
      if (current.rows[0].role === "owner" && role !== "owner") {
        const owners = await client.query(
          "SELECT user_id FROM organization_members WHERE organization_id=$1 AND role='owner' AND status='active' FOR UPDATE",
          [organizationId],
        );
        if (owners.rowCount <= 1)
          throw new ControlPlaneError(
            409,
            "FINAL_OWNER_REQUIRED",
            "The final active owner cannot be removed or demoted",
          );
      }
      return client.query(
        'UPDATE organization_members SET role=$1,version=version+1,authorization_version=authorization_version+1,updated_at=NOW() WHERE organization_id=$2 AND user_id=$3 AND version=$4 RETURNING user_id AS "userId",organization_id AS "organizationId",role,status,version,authorization_version AS "authorizationVersion"',
        [role, organizationId, targetUserId, expectedVersion],
      );
    });
    if (result.rowCount !== 1) {
      const exists = await this.pool.query(
        "SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2",
        [organizationId, targetUserId],
      );
      throw new ControlPlaneError(
        exists.rowCount ? 409 : 404,
        exists.rowCount ? "VERSION_CONFLICT" : "MEMBERSHIP_NOT_FOUND",
        exists.rowCount ? "Membership was modified" : "Membership not found",
      );
    }
    return result.rows[0];
  }
  async removeMembership(
    actorId,
    organizationId,
    targetUserId,
    expectedVersion,
  ) {
    await this.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.MEMBERSHIP_REMOVE,
    );
    return withTransaction(this.pool, async (client) => {
      const current = await client.query(
        "SELECT role,status,version FROM organization_members WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
        [organizationId, targetUserId],
      );
      if (current.rowCount !== 1 || current.rows[0].status !== "active")
        throw new ControlPlaneError(
          404,
          "MEMBERSHIP_NOT_FOUND",
          "Membership not found",
        );
      if (Number(current.rows[0].version) !== expectedVersion)
        throw new ControlPlaneError(
          409,
          "VERSION_CONFLICT",
          "Membership was modified",
        );
      if (current.rows[0].role === "owner") {
        const owners = await client.query(
          "SELECT user_id FROM organization_members WHERE organization_id=$1 AND role='owner' AND status='active' FOR UPDATE",
          [organizationId],
        );
        if (owners.rowCount <= 1)
          throw new ControlPlaneError(
            409,
            "FINAL_OWNER_REQUIRED",
            "The final active owner cannot be removed or demoted",
          );
      }
      const result = await client.query(
        'UPDATE organization_members SET status=\'removed\',version=version+1,authorization_version=authorization_version+1,updated_at=NOW() WHERE organization_id=$1 AND user_id=$2 RETURNING user_id AS "userId",organization_id AS "organizationId",role,status,version,authorization_version AS "authorizationVersion"',
        [organizationId, targetUserId],
      );
      return result.rows[0];
    });
  }
  async createInvitation(actorId, organizationId, input) {
    const actor = await this.requireAccess(
      actorId,
      organizationId,
      PERMISSIONS.MEMBERSHIP_INVITE,
    );
    assertRole(input.role);
    if (input.role === "owner" && actor.role !== "owner")
      throw new ControlPlaneError(
        403,
        "ROLE_GRANT_FORBIDDEN",
        "Owner role can be granted only by an owner",
      );
    if (
      ["admin", "security_admin"].includes(input.role) &&
      actor.role !== "owner"
    )
      throw new ControlPlaneError(
        403,
        "ROLE_GRANT_FORBIDDEN",
        "This role can be granted only by an owner",
      );
    const token = crypto.randomBytes(32).toString("base64url");
    const result = await this.pool.query(
      `INSERT INTO organization_invitations
       (id,organization_id,email_normalized,role,token_hash,status,expires_at,created_by)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)
       RETURNING id,organization_id AS "organizationId",email_normalized AS email,role,status,expires_at AS "expiresAt",created_at AS "createdAt"`,
      [
        id(),
        organizationId,
        input.email.toLowerCase(),
        input.role,
        sessionHash(token),
        input.expiresAt,
        actorId,
      ],
    );
    return { invitation: result.rows[0], token };
  }
  async acceptInvitation(userId, organizationId, invitationId, token) {
    return withTransaction(this.pool, async (client) => {
      const invitation = await client.query(
        `SELECT id,organization_id,email_normalized,role,status,expires_at,token_hash
         FROM organization_invitations WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [invitationId, organizationId],
      );
      if (invitation.rowCount !== 1)
        throw new ControlPlaneError(
          404,
          "INVITATION_NOT_FOUND",
          "Invitation not found",
        );
      const row = invitation.rows[0];
      if (
        row.status !== "pending" ||
        new Date(row.expires_at).getTime() <= Date.now() ||
        sessionHash(token) !== row.token_hash
      )
        throw new ControlPlaneError(
          409,
          "INVITATION_NOT_USABLE",
          "Invitation is expired, revoked, or already used",
        );
      const user = await client.query(
        "SELECT email FROM users WHERE id=$1 AND status='active'",
        [userId],
      );
      if (
        user.rowCount !== 1 ||
        user.rows[0].email?.toLowerCase() !== row.email_normalized
      )
        throw new ControlPlaneError(
          403,
          "INVITATION_IDENTITY_MISMATCH",
          "Invitation identity does not match",
        );
      const membership = await client.query(
        `INSERT INTO organization_members (organization_id,user_id,role)
         VALUES ($1,$2,$3)
         RETURNING user_id AS "userId",organization_id AS "organizationId",role,status,version,authorization_version AS "authorizationVersion"`,
        [organizationId, userId, row.role],
      );
      await client.query(
        "UPDATE organization_invitations SET status='accepted',accepted_at=NOW() WHERE id=$1",
        [invitationId],
      );
      return membership.rows[0];
    });
  }
  async setCurrentOrganization(userId, organizationId) {
    await this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const result = await this.pool.query(
      `UPDATE users SET current_organization_id=$1,version=version+1,updated_at=NOW() WHERE id=$2 RETURNING ${userColumns}`,
      [organizationId, userId],
    );
    return result.rows[0];
  }
  async listProjects(userId, organizationId, query = {}) {
    await this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const values = [organizationId];
    const filters = ["organization_id=$1"];
    if (query.status) {
      values.push(query.status);
      filters.push(`status=$${values.length}`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      filters.push(
        `(name ILIKE $${values.length} OR slug ILIKE $${values.length})`,
      );
    }
    const result = await this.pool.query(
      `SELECT id,organization_id AS "organizationId",name,slug,description,status,version,created_at AS "createdAt",updated_at AS "updatedAt" FROM projects WHERE ${filters.join(" AND ")} ORDER BY name`,
      values,
    );
    return result.rows;
  }
  async createProject(userId, organizationId, input) {
    await this.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        'INSERT INTO projects (id,organization_id,name,slug,description) VALUES ($1,$2,$3,$4,$5) RETURNING id,organization_id AS "organizationId",name,slug,description,status,version,created_at AS "createdAt",updated_at AS "updatedAt"',
        [id(), organizationId, input.name, input.slug, input.description || null],
      );
      await client.query(
        "INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'owner')",
        [result.rows[0].id, userId],
      );
      return result.rows[0];
    });
  }
  async getProject(userId, organizationId, projectId) {
    await this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",name,slug,description,status,version,created_at AS "createdAt",updated_at AS "updatedAt" FROM projects WHERE id=$1 AND organization_id=$2',
      [projectId, organizationId],
    );
    if (result.rowCount !== 1)
      throw new ControlPlaneError(
        404,
        "PROJECT_NOT_FOUND",
        "Project not found",
      );
    return result.rows[0];
  }
  async createService(userId, organizationId, projectId, input) {
    await this.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    await this.getProject(userId, organizationId, projectId);
    await this.getProviderRepository(
      userId,
      organizationId,
      input.repositoryId,
    );
    const result = await this.pool.query(
      'INSERT INTO services(organization_id,project_id,repository_id,name,service_path) VALUES($1,$2,$3,$4,$5) RETURNING id,organization_id AS "organizationId",project_id AS "projectId",repository_id AS "repositoryId",name,service_path AS "servicePath",version,created_at AS "createdAt",updated_at AS "updatedAt"',
      [
        organizationId,
        projectId,
        input.repositoryId,
        input.name,
        input.servicePath || ".",
      ],
    );
    return result.rows[0];
  }
  async getService(userId, organizationId, serviceId) {
    await this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",project_id AS "projectId",repository_id AS "repositoryId",name,service_path AS "servicePath",version FROM services WHERE id=$1 AND organization_id=$2',
      [serviceId, organizationId],
    );
    if (!result.rowCount)
      throw new ControlPlaneError(
        404,
        "SERVICE_NOT_FOUND",
        "Service not found",
      );
    return result.rows[0];
  }
  async listServices(userId, organizationId, projectId) {
    await this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    return (
      await this.pool.query(
        'SELECT id,organization_id AS "organizationId",project_id AS "projectId",repository_id AS "repositoryId",name,service_path AS "servicePath",version FROM services WHERE organization_id=$1 AND project_id=$2 ORDER BY name',
        [organizationId, projectId],
      )
    ).rows;
  }
  async listRepositoryReferences(userId, organizationId) {
    await this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",project_id AS "projectId",provider,external_id AS "externalId",name,default_branch AS "defaultBranch",visibility,status,version FROM repository_references WHERE organization_id=$1 ORDER BY name',
      [organizationId],
    );
    return result.rows;
  }
  async createRepositoryReference(userId, organizationId, projectId, input) {
    await this.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    await this.getProject(userId, organizationId, projectId);
    const result = await this.pool.query(
      'INSERT INTO repository_references (id,organization_id,project_id,provider,external_id,name,default_branch,visibility) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,organization_id AS "organizationId",project_id AS "projectId",provider,external_id AS "externalId",name,default_branch AS "defaultBranch",visibility,status,version',
      [
        id(),
        organizationId,
        projectId,
        input.provider,
        input.externalId,
        input.name,
        input.defaultBranch,
        input.visibility,
      ],
    );
    return result.rows[0];
  }
  async createInstallation(userId, organizationId, input) {
    await this.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    try {
      const result = await this.pool.query(
        'INSERT INTO git_provider_installations (organization_id,provider,provider_installation_id,account_id,account_login,account_type,repository_selection,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (provider,provider_installation_id) DO UPDATE SET connection_state=\'active\',updated_at=NOW(),version=git_provider_installations.version+1 WHERE git_provider_installations.organization_id=EXCLUDED.organization_id RETURNING id,organization_id AS "organizationId",provider,provider_installation_id AS "providerInstallationId",account_id AS "accountId",account_login AS "accountLogin",account_type AS "accountType",repository_selection AS "repositorySelection",connection_state AS "connectionState",created_by AS "createdBy",version',
        [
          organizationId,
          input.provider,
          input.providerInstallationId,
          input.accountId,
          input.accountLogin,
          input.accountType,
          input.repositorySelection,
          userId,
        ],
      );
      if (result.rowCount !== 1)
        throw new ControlPlaneError(
          403,
          "INSTALLATION_OWNERSHIP_CONFLICT",
          "Installation belongs to another organization",
        );
      return result.rows[0];
    } catch (error) {
      if (error.code === "23505")
        throw new ControlPlaneError(
          403,
          "INSTALLATION_OWNERSHIP_CONFLICT",
          "Installation belongs to another organization",
        );
      throw error;
    }
  }
  async listInstallations(userId, organizationId) {
    await this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",provider,provider_installation_id AS "providerInstallationId",account_id AS "accountId",account_login AS "accountLogin",account_type AS "accountType",repository_selection AS "repositorySelection",connection_state AS "connectionState",version,created_at AS "createdAt",updated_at AS "updatedAt" FROM git_provider_installations WHERE organization_id=$1 ORDER BY created_at',
      [organizationId],
    );
    return result.rows;
  }
  async requireInstallation(
    userId,
    organizationId,
    installationId,
    permission = PERMISSIONS.OBSERVE,
  ) {
    await this.requireAccess(userId, organizationId, permission);
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",provider,provider_installation_id AS "providerInstallationId",connection_state AS "connectionState" FROM git_provider_installations WHERE id=$1 AND organization_id=$2',
      [installationId, organizationId],
    );
    if (result.rowCount !== 1)
      throw new ControlPlaneError(
        404,
        "INSTALLATION_NOT_FOUND",
        "Installation not found",
      );
    if (result.rows[0].connectionState !== "active")
      throw new ControlPlaneError(
        403,
        "GIT_PROVIDER_ACCESS_REVOKED",
        "Git provider access is unavailable",
      );
    return result.rows[0];
  }
  async disconnectInstallation(userId, organizationId, installationId) {
    await this.requireInstallation(
      userId,
      organizationId,
      installationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        'UPDATE git_provider_installations SET connection_state=\'disconnected\',version=version+1,updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING id,organization_id AS "organizationId",provider,connection_state AS "connectionState",version',
        [installationId, organizationId],
      );
      await client.query(
        "UPDATE repository_references SET status='disconnected',disconnected_at=NOW(),version=version+1,updated_at=NOW() WHERE installation_id=$1 AND organization_id=$2",
        [installationId, organizationId],
      );
      return result.rows[0];
    });
  }
  async connectProviderRepository(
    userId,
    organizationId,
    projectId,
    installationId,
    metadata,
    selectedBranch,
  ) {
    await this.requireInstallation(
      userId,
      organizationId,
      installationId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    await this.getProject(userId, organizationId, projectId);
    try {
      const result = await this.pool.query(
        'INSERT INTO repository_references (id,organization_id,project_id,provider,installation_id,external_id,name,repository_owner,repository_name,default_branch,selected_branch,visibility,connected_by,connected_at,last_synced_at) VALUES ($1,$2,$3,\'github\',$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()) RETURNING id,organization_id AS "organizationId",project_id AS "projectId",provider,installation_id AS "installationId",external_id AS "externalId",name,repository_owner AS "repositoryOwner",repository_name AS "repositoryName",default_branch AS "defaultBranch",selected_branch AS "selectedBranch",visibility,status,version',
        [
          id(),
          organizationId,
          projectId,
          installationId,
          metadata.id,
          metadata.fullName,
          metadata.owner,
          metadata.name,
          metadata.defaultBranch,
          selectedBranch,
          metadata.visibility,
          userId,
        ],
      );
      return result.rows[0];
    } catch (error) {
      if (error.code === "23505")
        throw new ControlPlaneError(
          409,
          "REPOSITORY_ALREADY_CONNECTED",
          "Repository is already connected",
        );
      throw error;
    }
  }
  async getProviderRepository(
    userId,
    organizationId,
    repositoryId,
    permission = PERMISSIONS.OBSERVE,
  ) {
    await this.requireAccess(userId, organizationId, permission);
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",project_id AS "projectId",provider,installation_id AS "installationId",external_id AS "externalId",name,default_branch AS "defaultBranch",selected_branch AS "selectedBranch",visibility,status,version FROM repository_references WHERE id=$1 AND organization_id=$2',
      [repositoryId, organizationId],
    );
    if (result.rowCount !== 1)
      throw new ControlPlaneError(
        404,
        "REPOSITORY_NOT_FOUND",
        "Repository not found",
      );
    return result.rows[0];
  }
  async getRepositoryForWorker(repositoryId, organizationId) {
    const result = await this.pool.query(
      'SELECT r.id,r.organization_id AS "organizationId",r.project_id AS "projectId",r.external_id AS "externalId",r.name,r.installation_id AS "installationId",r.status,i.provider_installation_id AS "providerInstallationId",i.connection_state AS "connectionState" FROM repository_references r JOIN git_provider_installations i ON i.id=r.installation_id AND i.organization_id=r.organization_id WHERE r.id=$1 AND r.organization_id=$2',
      [repositoryId, organizationId],
    );
    if (!result.rowCount)
      throw new ControlPlaneError(
        404,
        "REPOSITORY_NOT_FOUND",
        "Repository not found",
      );
    const row = result.rows[0];
    if (row.status !== "active" || row.connectionState !== "active")
      throw new ControlPlaneError(
        403,
        "GIT_PROVIDER_ACCESS_REVOKED",
        "Git provider access is unavailable",
      );
    return {
      repository: row,
      installation: {
        id: row.installationId,
        organizationId,
        providerInstallationId: row.providerInstallationId,
        connectionState: row.connectionState,
      },
    };
  }
  async disconnectProviderRepository(userId, organizationId, repositoryId) {
    await this.getProviderRepository(
      userId,
      organizationId,
      repositoryId,
      PERMISSIONS.REPOSITORY_MANAGE,
    );
    const result = await this.pool.query(
      "UPDATE repository_references SET status='disconnected',disconnected_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING id,status,version",
      [repositoryId, organizationId],
    );
    return result.rows[0];
  }
  async findInstallationByProviderId(providerInstallationId) {
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",provider_installation_id AS "providerInstallationId",connection_state AS "connectionState" FROM git_provider_installations WHERE provider=\'github\' AND provider_installation_id=$1',
      [providerInstallationId],
    );
    return result.rows[0] || null;
  }
  async findRepositoryByProviderId(providerId) {
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",installation_id AS "installationId",external_id AS "externalId",name,status FROM repository_references WHERE provider=\'github\' AND external_id=$1 AND status=\'active\'',
      [String(providerId)],
    );
    return result.rows[0] || null;
  }
  async updateProviderRepository(repositoryId, action, metadata) {
    if (["deleted", "transferred"].includes(action)) {
      await this.pool.query(
        "UPDATE repository_references SET status='disconnected',disconnected_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$1",
        [repositoryId],
      );
    } else if (action === "renamed") {
      await this.pool.query(
        "UPDATE repository_references SET name=$1,repository_owner=$2,repository_name=$3,version=version+1,updated_at=NOW() WHERE id=$4",
        [metadata.full_name, metadata.owner.login, metadata.name, repositoryId],
      );
    }
  }
  async refreshProviderRepository(repositoryId, metadata) {
    await this.pool.query(
      "UPDATE repository_references SET name=$1,repository_owner=$2,repository_name=$3,default_branch=$4,visibility=$5,last_synced_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$6",
      [
        metadata.fullName,
        metadata.owner,
        metadata.name,
        metadata.defaultBranch,
        metadata.visibility,
        repositoryId,
      ],
    );
  }
  async setInstallationStateByProvider(providerInstallationId, state) {
    const result = await this.pool.query(
      'UPDATE git_provider_installations SET connection_state=$1,version=version+1,updated_at=NOW() WHERE provider=\'github\' AND provider_installation_id=$2 RETURNING id,organization_id AS "organizationId",connection_state AS "connectionState"',
      [state, providerInstallationId],
    );
    return result.rows[0] || null;
  }
  async recordWebhookDelivery(input) {
    try {
      const result = await this.pool.query(
        "INSERT INTO git_webhook_deliveries (provider,delivery_id,event_type,installation_id,repository_id,organization_id,status) VALUES ($1,$2,$3,$4,$5,$6,'accepted') RETURNING id",
        [
          input.provider,
          input.deliveryId,
          input.eventType,
          input.installationId,
          input.repositoryId,
          input.organizationId,
        ],
      );
      return {
        duplicate: false,
        delivery: { id: result.rows[0].id, ...input },
      };
    } catch (error) {
      if (error.code === "23505") return { duplicate: true, delivery: null };
      throw error;
    }
  }
  async recordGitEvent(input) {
    const result = await this.pool.query(
      "INSERT INTO git_events (organization_id,repository_id,delivery_id,event_type,branch,commit_sha,sender,event_timestamp,trigger_source,pull_request_number,forked_pull_request,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
      [
        input.organizationId,
        input.repositoryId,
        input.deliveryId,
        input.eventType,
        input.branch,
        input.commitSha,
        input.sender,
        input.eventTimestamp,
        input.triggerSource,
        input.pullRequestNumber,
        input.forkedPullRequest,
        input.metadata,
      ],
    );
    return { id: result.rows[0].id, ...input };
  }
  async listEnvironmentReferences(userId, organizationId) {
    await this.requireAccess(userId, organizationId, PERMISSIONS.OBSERVE);
    const result = await this.pool.query(
      'SELECT id,organization_id AS "organizationId",project_id AS "projectId",name,type,status,version FROM environment_references WHERE organization_id=$1 ORDER BY name',
      [organizationId],
    );
    return result.rows;
  }
  async createEnvironmentReference(userId, organizationId, projectId, input) {
    await this.requireAccess(
      userId,
      organizationId,
      PERMISSIONS.ENVIRONMENT_MANAGE,
    );
    await this.getProject(userId, organizationId, projectId);
    const result = await this.pool.query(
      'INSERT INTO environment_references (id,organization_id,project_id,name,type) VALUES ($1,$2,$3,$4,$5) RETURNING id,organization_id AS "organizationId",project_id AS "projectId",name,type,status,version',
      [id(), organizationId, projectId, input.name, input.type],
    );
    return result.rows[0];
  }
  async createSession(userId, jti, expiresAt) {
    await this.pool.query(
      "INSERT INTO user_sessions (id,user_id,token_jti_hash,expires_at) VALUES ($1,$2,$3,$4)",
      [id(), userId, sessionHash(jti), expiresAt],
    );
  }
  async isSessionActive(jti, subject) {
    const result = await this.pool.query(
      "SELECT 1 FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_jti_hash=$1 AND u.external_subject=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW()",
      [sessionHash(jti), subject],
    );
    return result.rowCount === 1;
  }
  async revokeSession(userId, jti) {
    await this.pool.query(
      "UPDATE user_sessions SET revoked_at=NOW() WHERE user_id=$1 AND token_jti_hash=$2 AND revoked_at IS NULL",
      [userId, sessionHash(jti)],
    );
  }
  async recordAudit(event) {
    const result = await this.pool.query(
      "INSERT INTO audit_events (id,actor_user_id,organization_id,project_id,action,resource_type,resource_id,request_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
      [
        id(),
        event.actorUserId || null,
        event.organizationId || null,
        event.projectId || null,
        event.action,
        event.resourceType,
        event.resourceId || null,
        event.requestId,
        event.metadata || {},
      ],
    );
    return result.rows[0];
  }
}
module.exports = { PostgresRepository };
