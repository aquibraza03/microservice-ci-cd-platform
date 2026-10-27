const { expect } = require("chai");
const { withTransaction } = require("../../src/database/transaction");
describe("database transaction", () => {
  it("rolls back and releases on failure", async () => {
    const calls = [];
    const client = {
      query: async (q) => calls.push(q),
      release: () => calls.push("RELEASE"),
    };
    const pool = { connect: async () => client };
    try {
      await withTransaction(pool, async () => {
        throw new Error("boom");
      });
    } catch (error) {
      expect(error.message).to.equal("boom");
    }
    expect(calls).to.deep.equal(["BEGIN", "ROLLBACK", "RELEASE"]);
  });
});
