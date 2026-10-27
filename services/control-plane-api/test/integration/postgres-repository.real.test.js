const { Pool } = require("pg");
const { expect } = require("chai");
const { PostgresRepository } = require("../../src/domain/postgres-repository");
const { ControlPlaneError } = require("../../src/errors");

describe("PostgresRepository against a real Postgres instance", () => {
  let pool;
  let repo;

  before(async () => {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgres://control_plane:testpass@127.0.0.1:5432/control_plane_test",
    });
    repo = new PostgresRepository(pool);
    // clean slate between full test runs
    await pool.query(
      "TRUNCATE organizations, users, organization_members, projects, project_members, repository_references, environment_references, user_sessions, audit_events RESTART IDENTITY CASCADE",
    );
  });

  after(async () => {
    await pool.end();
  });

  let user;
  let org;
  let project;

  it("upsertUser inserts a new user", async () => {
    user = await repo.upsertUser({
      subject: "auth0|abc123",
      email: "a@example.com",
      displayName: "Alice",
    });
    expect(user.id).to.be.a("string");
    expect(user.email).to.equal("a@example.com");
  });

  it("upsertUser updates on conflict (same external_subject)", async () => {
    const updated = await repo.upsertUser({
      subject: "auth0|abc123",
      email: "alice2@example.com",
      displayName: "Alice Updated",
    });
    expect(updated.id).to.equal(user.id); // same row, not a new insert
    expect(updated.email).to.equal("alice2@example.com");
  });

  it("createOrganization runs in a real transaction and adds owner membership", async () => {
    org = await repo.createOrganization(user.id, {
      name: "Acme Inc",
      slug: "acme",
      displayName: "Acme",
    });
    expect(org.name).to.equal("Acme Inc");
    const members = await pool.query(
      "SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2",
      [org.id, user.id],
    );
    expect(members.rows[0].role).to.equal("owner");
  });

  it("createOrganization rolls back the transaction if the user doesn't exist", async () => {
    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    let threw = false;
    try {
      await repo.createOrganization(fakeUserId, {
        name: "Ghost Org",
        slug: "ghost",
        displayName: "Ghost",
      });
    } catch (err) {
      threw = true;
      expect(err).to.be.instanceOf(ControlPlaneError);
      expect(err.code).to.equal("USER_NOT_FOUND");
    }
    expect(threw).to.equal(true);
    // verify rollback actually happened - no org row leaked
    const check = await pool.query(
      "SELECT 1 FROM organizations WHERE slug=$1",
      ["ghost"],
    );
    expect(check.rowCount).to.equal(0);
  });

  it("listOrganizations returns orgs for the member", async () => {
    const orgs = await repo.listOrganizations(user.id);
    expect(orgs.map((o) => o.slug)).to.include("acme");
  });

  it("requireAccess denies a non-member using the centralized policy contract", async () => {
    const outsider = await repo.upsertUser({
      subject: "auth0|outsider",
      email: "o@example.com",
    });
    let threw = false;
    try {
      await repo.requireAccess(outsider.id, org.id);
    } catch (err) {
      threw = true;
      expect(err.code).to.equal("PERMISSION_DENIED");
      expect(err.status).to.equal(403);
      expect(err.details.reasonCode).to.equal("MEMBERSHIP_INACTIVE");
    }
    expect(threw).to.equal(true);
  });

  it("createProject enforces owner/admin role", async () => {
    project = await repo.createProject(user.id, org.id, {
      name: "Backend",
      slug: "backend",
      description: "Core API",
    });
    expect(project.slug).to.equal("backend");
    const pm = await pool.query(
      "SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2",
      [project.id, user.id],
    );
    expect(pm.rows[0].role).to.equal("owner");
  });

  it("createProject denies non-admin/owner members", async () => {
    const member = await repo.upsertUser({
      subject: "auth0|member1",
      email: "m@example.com",
    });
    await pool.query(
      "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1,$2,'viewer')",
      [org.id, member.id],
    );
    let threw = false;
    try {
      await repo.createProject(member.id, org.id, {
        name: "Other",
        slug: "other",
      });
    } catch (err) {
      threw = true;
      expect(err.code).to.equal("PERMISSION_DENIED");
    }
    expect(threw).to.equal(true);
  });

  it("listProjects filters by search and status", async () => {
    const bySearch = await repo.listProjects(user.id, org.id, {
      search: "back",
    });
    expect(bySearch.map((p) => p.slug)).to.include("backend");
    const byStatus = await repo.listProjects(user.id, org.id, {
      status: "active",
    });
    expect(byStatus.map((p) => p.slug)).to.include("backend");
    const noMatch = await repo.listProjects(user.id, org.id, {
      search: "nonexistent-xyz",
    });
    expect(noMatch).to.have.length(0);
  });

  it("getProject 404s for a project in a different org", async () => {
    let threw = false;
    try {
      await repo.getProject(
        user.id,
        org.id,
        "00000000-0000-0000-0000-000000000000",
      );
    } catch (err) {
      threw = true;
      expect(err.code).to.equal("PROJECT_NOT_FOUND");
    }
    expect(threw).to.equal(true);
  });

  it("createRepositoryReference and listRepositoryReferences round-trip", async () => {
    await repo.createRepositoryReference(user.id, org.id, project.id, {
      provider: "github",
      externalId: "123",
      name: "acme/backend",
      defaultBranch: "main",
      visibility: "private",
    });
    const refs = await repo.listRepositoryReferences(user.id, org.id);
    expect(refs.map((r) => r.name)).to.include("acme/backend");
  });

  it("createEnvironmentReference and listEnvironmentReferences round-trip", async () => {
    await repo.createEnvironmentReference(user.id, org.id, project.id, {
      name: "production",
      type: "production",
    });
    const envs = await repo.listEnvironmentReferences(user.id, org.id);
    expect(envs.map((e) => e.name)).to.include("production");
  });

  it("protects memberships and rejects duplicates", async () => {
    const member = await repo.upsertUser({
      subject: "issuer|member2",
      email: "member2@example.test",
    });
    await repo.addMembership(user.id, org.id, member.id, "viewer");
    try {
      await repo.addMembership(user.id, org.id, member.id, "viewer");
      throw new Error("expected duplicate rejection");
    } catch (error) {
      expect(error.code).to.equal("MEMBERSHIP_EXISTS");
    }
    try {
      await repo.listMemberships(member.id, org.id);
      throw new Error("expected permission rejection");
    } catch (error) {
      expect(error.code).to.equal("PERMISSION_DENIED");
    }
  });

  it("isolates organizations, projects, repositories and environments across tenants", async () => {
    const otherUser = await repo.upsertUser({
      subject: "issuer|tenant-b",
      email: "b@example.test",
    });
    const otherOrg = await repo.createOrganization(otherUser.id, {
      name: "Tenant B",
      slug: "tenant-b",
    });
    const otherProject = await repo.createProject(otherUser.id, otherOrg.id, {
      name: "Other API",
      slug: "other-api",
    });
    await repo.createRepositoryReference(
      otherUser.id,
      otherOrg.id,
      otherProject.id,
      {
        provider: "github",
        externalId: "tenant-b/1",
        name: "tenant-b/api",
        defaultBranch: "main",
        visibility: "private",
      },
    );
    await repo.createEnvironmentReference(
      otherUser.id,
      otherOrg.id,
      otherProject.id,
      { name: "production", type: "production" },
    );
    for (const operation of [
      () => repo.requireAccess(user.id, otherOrg.id),
      () => repo.getProject(user.id, otherOrg.id, otherProject.id),
      () => repo.listRepositoryReferences(user.id, otherOrg.id),
      () => repo.listEnvironmentReferences(user.id, otherOrg.id),
      () => repo.listMemberships(user.id, otherOrg.id),
    ]) {
      try {
        await operation();
        throw new Error("expected tenant rejection");
      } catch (error) {
        expect(error.code).to.equal("PERMISSION_DENIED");
      }
    }
    expect(
      (await repo.listRepositoryReferences(otherUser.id, otherOrg.id)).map(
        (item) => item.name,
      ),
    ).to.deep.equal(["tenant-b/api"]);
    expect(
      (await repo.listEnvironmentReferences(otherUser.id, otherOrg.id)).map(
        (item) => item.name,
      ),
    ).to.deep.equal(["production"]);
  });
});
