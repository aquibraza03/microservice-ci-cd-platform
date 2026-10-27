const { describe, it } = require("mocha");
const { expect } = require("chai");
const { setup } = require("../deployments/state-and-queue.test");
const {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  PolicyDecisionPoint,
  hasPermission,
} = require("../../src/auth/rbac");
const { MemorySecretReferenceStore } = require("../../src/secrets/store");
const {
  AwsSecretsManagerReferenceProvider,
  KubernetesExternalSecretReferenceProvider,
  renderExternalSecretManifest,
} = require("../../src/secrets/providers");
const { MemoryDeploymentQueue } = require("../../src/queue/deployment-queue");

function secretFixture() {
  const x = setup();
  const environment = x.r.createEnvironmentReference(x.u.id, x.o.id, x.p.id, {
    name: "production",
    type: "production",
    status: "active",
  });
  const connection = {
    id: "connection-1",
    organizationId: x.o.id,
    status: "active",
    expectedAccountId: "123456789012",
  };
  const target = {
    id: "target-1",
    organizationId: x.o.id,
    status: "active",
    capabilityResults: { externalSecrets: true },
  };
  const byocStore = {
    connection: (_user, org, id) => {
      if (org !== x.o.id || id !== connection.id) throw new Error("not found");
      return connection;
    },
    target: (_user, org, id) => {
      if (org !== x.o.id || id !== target.id) throw new Error("not found");
      return target;
    },
  };
  const providers = {
    aws_secrets_manager: new AwsSecretsManagerReferenceProvider(),
    kubernetes_external_secret: new KubernetesExternalSecretReferenceProvider(),
  };
  const store = new MemorySecretReferenceStore(x.r, { providers, byocStore });
  return { x, environment, connection, target, providers, store };
}

describe("Phase 3 Part 2 enterprise authorization", () => {
  it("evaluates every role/action from the fixed registry and defaults to deny", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).to.be.instanceOf(Set);
      for (const action of Object.values(PERMISSIONS))
        expect(hasPermission(role, action)).to.be.a("boolean");
    }
    const pdp = new PolicyDecisionPoint({ version: 9 });
    expect(
      pdp.evaluate({ actor: null, action: "unknown", scope: null }),
    ).to.deep.include({
      decision: "deny",
      allowed: false,
      authorizationVersion: 9,
    });
    expect(hasPermission("owner", PERMISSIONS.ORGANIZATION_OWNERSHIP)).to.equal(
      true,
    );
    expect(hasPermission("admin", PERMISSIONS.ORGANIZATION_OWNERSHIP)).to.equal(
      false,
    );
    expect(hasPermission("security_admin", PERMISSIONS.SECRET_MANAGE)).to.equal(
      true,
    );
    expect(hasPermission("developer", PERMISSIONS.SECRET_MANAGE)).to.equal(
      false,
    );
    expect(hasPermission("operator", PERMISSIONS.ROLLBACK)).to.equal(true);
    expect(hasPermission("approver", PERMISSIONS.APPROVAL_DECIDE)).to.equal(
      true,
    );
    expect(hasPermission("auditor", PERMISSIONS.AUDIT_READ)).to.equal(true);
    expect(hasPermission("viewer", PERMISSIONS.DEPLOYMENT_CREATE)).to.equal(
      false,
    );
  });

  it("enforces organization, project, environment and resource scope", () => {
    const pdp = new PolicyDecisionPoint();
    const membership = {
      userId: "u1",
      organizationId: "o1",
      status: "active",
      authorizationVersion: 3,
      assignments: [{ role: "developer", scopeType: "project", scopeId: "p1" }],
    };
    const actor = { id: "u1", membership };
    expect(
      pdp.evaluate({
        actor,
        action: PERMISSIONS.DEPLOYMENT_CREATE,
        scope: {
          type: "environment",
          id: "e1",
          projectId: "p1",
          organizationId: "o1",
        },
      }).allowed,
    ).to.equal(true);
    expect(
      pdp.evaluate({
        actor,
        action: PERMISSIONS.DEPLOYMENT_CREATE,
        scope: {
          type: "environment",
          id: "e2",
          projectId: "p2",
          organizationId: "o1",
        },
      }).allowed,
    ).to.equal(false);
    expect(
      pdp.evaluate({
        actor,
        action: PERMISSIONS.OBSERVE,
        resource: { organizationId: "o2" },
        scope: { type: "project", id: "p1", organizationId: "o1" },
      }).reasonCode,
    ).to.equal("RESOURCE_SCOPE_MISMATCH");
  });

  it("prevents self escalation, unauthorized grants and final-owner removal", () => {
    const x = setup();
    const admin = x.r.upsertUser({
      subject: "issuer|admin",
      email: "admin@example.test",
    });
    x.r.insertMembership(admin.id, x.o.id, "admin");
    expect(() => x.r.assignRole(admin.id, x.o.id, admin.id, "owner", 1))
      .to.throw()
      .with.property("code", "ROLE_GRANT_FORBIDDEN");
    expect(() => x.r.assignRole(x.u.id, x.o.id, x.u.id, "admin", 1))
      .to.throw()
      .with.property("code", "SELF_ESCALATION_DENIED");
    expect(() => x.r.removeMembership(x.u.id, x.o.id, x.u.id, 1))
      .to.throw()
      .with.property("code", "FINAL_OWNER_REQUIRED");
  });

  it("makes membership removal effective immediately and rejects invitation replay", () => {
    const x = setup();
    const person = x.r.upsertUser({
      subject: "issuer|person",
      email: "person@example.test",
    });
    const invitation = x.r.createInvitation(x.u.id, x.o.id, {
      email: person.email,
      role: "viewer",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    const member = x.r.acceptInvitation(
      person.id,
      x.o.id,
      invitation.invitation.id,
      invitation.token,
    );
    expect(x.r.requireAccess(person.id, x.o.id, PERMISSIONS.OBSERVE)).to.equal(
      member,
    );
    expect(() =>
      x.r.acceptInvitation(
        person.id,
        x.o.id,
        invitation.invitation.id,
        invitation.token,
      ),
    )
      .to.throw()
      .with.property("code", "INVITATION_NOT_USABLE");
    x.r.removeMembership(x.u.id, x.o.id, person.id, member.version);
    expect(() => x.r.requireAccess(person.id, x.o.id, PERMISSIONS.OBSERVE))
      .to.throw()
      .with.property("code", "PERMISSION_DENIED");
  });
});

describe("Phase 3 Part 2 managed secret references", () => {
  it("stores and returns metadata without plaintext and validates AWS scope", async () => {
    const f = secretFixture();
    const canary = "canary-secret-value-never-persist";
    const created = f.store.create(f.x.u.id, f.x.o.id, {
      projectId: f.x.p.id,
      environmentId: f.environment.id,
      providerConnectionId: f.connection.id,
      displayName: "Database password",
      providerType: "aws_secrets_manager",
      externalIdentifier:
        "arn:aws:secretsmanager:ap-south-1:123456789012:secret:prod/database",
      injectionKey: "DATABASE_PASSWORD",
      protected: true,
    });
    expect(JSON.stringify(created)).not.to.include("prod/database");
    expect(JSON.stringify(f.store.references)).not.to.include(canary);
    const valid = await f.store.validate(f.x.u.id, f.x.o.id, created.id, 1);
    expect(valid.status).to.equal("active");
    expect(JSON.stringify(valid)).not.to.include("prod/database");
  });

  it("enforces authorization, rotation versions, disable/revoke and provider revocation", async () => {
    const f = secretFixture();
    const viewer = f.x.r.upsertUser({ subject: "issuer|viewer" });
    f.x.r.insertMembership(viewer.id, f.x.o.id, "viewer");
    const input = {
      projectId: f.x.p.id,
      environmentId: f.environment.id,
      providerConnectionId: f.connection.id,
      displayName: "API",
      providerType: "aws_secrets_manager",
      externalIdentifier:
        "arn:aws:secretsmanager:ap-south-1:123456789012:secret:prod/api",
      injectionKey: "API_KEY",
      protected: true,
    };
    expect(() => f.store.create(viewer.id, f.x.o.id, input)).to.throw();
    const made = f.store.create(f.x.u.id, f.x.o.id, input);
    await f.store.validate(f.x.u.id, f.x.o.id, made.id, 1);
    const rotated = f.store.rotate(
      f.x.u.id,
      f.x.o.id,
      made.id,
      { versionSelector: "AWSPREVIOUS" },
      2,
    );
    expect(rotated).to.include({ referenceVersion: 2, status: "draft" });
    f.connection.status = "revoked";
    let error;
    try {
      await f.store.validate(f.x.u.id, f.x.o.id, made.id, 3);
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal("SECRET_PROVIDER_CONNECTION_UNAVAILABLE");
    const disabled = f.store.lifecycle(
      f.x.u.id,
      f.x.o.id,
      made.id,
      "disable",
      4,
    );
    expect(disabled.status).to.equal("disabled");
    const revoked = f.store.lifecycle(f.x.u.id, f.x.o.id, made.id, "revoke", 5);
    expect(revoked.status).to.equal("revoked");
  });

  it("excludes protected secrets from previews and fork events and keeps queues/log-shaped data clean", async () => {
    const f = secretFixture();
    const made = f.store.create(f.x.u.id, f.x.o.id, {
      projectId: f.x.p.id,
      environmentId: f.environment.id,
      providerConnectionId: f.connection.id,
      displayName: "Protected",
      providerType: "aws_secrets_manager",
      externalIdentifier:
        "arn:aws:secretsmanager:ap-south-1:123456789012:secret:prod/protected",
      injectionKey: "TOKEN",
      protected: true,
    });
    await f.store.validate(f.x.u.id, f.x.o.id, made.id, 1);
    f.store.attach(f.x.u.id, f.x.o.id, f.x.svc.id, [made.id], 0);
    const args = {
      projectId: f.x.p.id,
      serviceId: f.x.svc.id,
      environmentId: f.environment.id,
    };
    expect(() =>
      f.store.deploymentReferences(f.x.u.id, f.x.o.id, {
        ...args,
        isPreview: true,
      }),
    )
      .to.throw()
      .with.property("code", "PROTECTED_SECRET_PREVIEW_DENIED");
    expect(() =>
      f.store.deploymentReferences(f.x.u.id, f.x.o.id, {
        ...args,
        forked: true,
      }),
    )
      .to.throw()
      .with.property("code", "PROTECTED_SECRET_PREVIEW_DENIED");
    const refs = f.store.deploymentReferences(f.x.u.id, f.x.o.id, args);
    const queue = new MemoryDeploymentQueue();
    await queue.enqueue({
      id: "d1",
      organizationId: f.x.o.id,
      configurationSnapshot: { secretReferences: refs },
    });
    const serialized = JSON.stringify({
      refs,
      jobs: [...queue.jobs.values()],
      logs: [],
    });
    expect(serialized).not.to.include("prod/protected");
    expect(serialized).not.to.include("canary-secret");
  });

  it("renders External Secrets runtime delivery without resolving plaintext and keeps build secrets unsupported", async () => {
    const f = secretFixture();
    const provider = f.providers.kubernetes_external_secret;
    expect(
      provider.capabilities().some((x) => x.id === "build-secret" && x.enabled),
    ).to.equal(false);
    const raw = {
      id: "sec_example123",
      referenceVersion: 4,
      externalIdentifier: "tenant/prod/db",
      versionSelector: "v4",
      injectionKey: "DATABASE_URL",
    };
    const validated = await provider.validateReference(raw, {
      target: f.target,
    });
    expect(validated.status).to.equal("active");
    const manifest = renderExternalSecretManifest({
      reference: raw,
      namespace: "team-a",
      workloadName: "api",
      provider,
    });
    expect(manifest.kind).to.equal("ExternalSecret");
    expect(JSON.stringify(manifest)).not.to.include("canary-secret-value");
    expect(manifest.spec.data[0].remoteRef.key).to.equal("tenant/prod/db");
  });
});
