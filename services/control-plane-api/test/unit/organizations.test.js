const { expect } = require("chai");
const { MemoryRepository } = require("../../src/domain/repositories");
const { PERMISSIONS } = require("../../src/auth/rbac");
describe("organization lifecycle and isolation", () => {
  let repo, owner, outsider, org;
  beforeEach(() => {
    repo = new MemoryRepository();
    owner = repo.upsertUser({
      subject: "issuer|owner",
      email: "owner@example.test",
    });
    outsider = repo.upsertUser({
      subject: "issuer|outsider",
      email: "outside@example.test",
    });
    org = repo.createOrganization(owner.id, { name: "Acme", slug: "acme" });
  });
  it("provisions and updates a stable user", () => {
    const same = repo.upsertUser({
      subject: "issuer|owner",
      email: "new@example.test",
      displayName: "Owner",
    });
    expect(same.id).to.equal(owner.id);
    expect(same.email).to.equal("new@example.test");
  });
  it("creates an organization and owner membership", () => {
    expect(
      repo.requireAccess(owner.id, org.id, PERMISSIONS.ORGANIZATION_ADMIN).role,
    ).to.equal("owner");
  });
  it("rejects duplicate membership", () => {
    repo.addMembership(owner.id, org.id, outsider.id, "viewer");
    expect(() =>
      repo.addMembership(owner.id, org.id, outsider.id, "viewer"),
    ).to.throw(/already exists/);
  });
  it("enforces membership and cross-tenant resource lookup", () => {
    const project = repo.createProject(owner.id, org.id, {
      name: "API",
      slug: "api",
    });
    expect(() => repo.getProject(outsider.id, org.id, project.id)).to.throw(
      /Permission denied/,
    );
    const other = repo.createOrganization(outsider.id, {
      name: "Other",
      slug: "other",
    });
    expect(() => repo.getProject(outsider.id, other.id, project.id)).to.throw(
      /not found/,
    );
  });
  it("restricts membership and role changes to organization administrators", () => {
    repo.addMembership(owner.id, org.id, outsider.id, "viewer");
    expect(() => repo.listMemberships(outsider.id, org.id)).to.throw(
      /Permission denied/,
    );
    const changed = repo.assignRole(
      owner.id,
      org.id,
      outsider.id,
      "developer",
      1,
    );
    expect(changed.role).to.equal("developer");
    expect(() =>
      repo.assignRole(owner.id, org.id, outsider.id, "admin", 1),
    ).to.throw(/modified/);
  });
  it("selects only an organization where the user is active", () => {
    expect(() => repo.setCurrentOrganization(outsider.id, org.id)).to.throw(
      /Permission denied/,
    );
    repo.addMembership(owner.id, org.id, outsider.id, "viewer");
    expect(
      repo.setCurrentOrganization(outsider.id, org.id).currentOrganizationId,
    ).to.equal(org.id);
  });
});
