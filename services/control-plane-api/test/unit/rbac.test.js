const { expect } = require("chai");
const { ROLES, PERMISSIONS, hasPermission } = require("../../src/auth/rbac");
describe("central RBAC matrix", () => {
  it("enforces every role boundary", () => {
    for (const role of ROLES)
      expect(hasPermission(role, PERMISSIONS.OBSERVE)).to.equal(true);
    for (const permission of Object.values(PERMISSIONS))
      expect(hasPermission("owner", permission)).to.equal(true);
    expect(hasPermission("admin", PERMISSIONS.ORGANIZATION_OWNERSHIP)).to.equal(
      false,
    );
    expect(hasPermission("admin", PERMISSIONS.SECRET_MANAGE)).to.equal(false);
    expect(hasPermission("developer", PERMISSIONS.REPOSITORY_MANAGE)).to.equal(
      true,
    );
    expect(
      hasPermission("developer", PERMISSIONS.DEPLOYMENT_PRODUCTION),
    ).to.equal(false);
    expect(
      hasPermission("operator", PERMISSIONS.DEPLOYMENT_PRODUCTION),
    ).to.equal(true);
    expect(hasPermission("operator", PERMISSIONS.REPOSITORY_MANAGE)).to.equal(
      false,
    );
    expect(hasPermission("viewer", PERMISSIONS.DEPLOYMENT_CREATE)).to.equal(
      false,
    );
    expect(hasPermission("viewer", PERMISSIONS.SECRET_MANAGE)).to.equal(false);
  });
});
