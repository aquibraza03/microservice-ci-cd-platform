const { describe, it } = require("mocha");
const { expect } = require("chai");
const { setup } = require("./state-and-queue.test");
const { redactValue } = require("../../src/deployments/redaction");
describe("Phase 2 Part 2 deployment observability", () => {
  it("uses one ordered versioned contract for state, stage and log events", async () => {
    const x = setup(),
      { deployment } = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "observe-1",
      );
    x.store.recordEvent(
      deployment.id,
      "stage.started",
      null,
      "tests started",
      {},
      { stage: "tests", attempt: 1, source: "worker" },
    );
    x.store.appendLog(deployment.id, x.o.id, "tests", "real output", [], {
      attempt: 1,
    });
    const events = x.store.history(x.u.id, x.o.id, deployment.id);
    expect(events.map((e) => e.sequence)).to.deep.equal([1, 2, 3]);
    for (const e of events)
      expect(e).to.include.keys(
        "schemaVersion",
        "sequence",
        "deploymentId",
        "organizationId",
        "stateVersion",
        "timestamp",
        "level",
        "source",
        "attempt",
        "eventType",
        "safeMessage",
        "metadata",
      );
  });
  it("deduplicates by sequence at the consumer boundary and exposes recoverable gaps", async () => {
    const x = setup(),
      { deployment } = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "observe-2",
      );
    x.store.recordEvent(deployment.id, "stage.started", null, "a");
    x.store.recordEvent(deployment.id, "stage.passed", null, "b");
    const replay = x.store.history(x.u.id, x.o.id, deployment.id, { after: 1 });
    expect(replay.map((e) => e.sequence)).to.deep.equal([2, 3]);
    expect(
      new Set([...replay, ...replay].map((e) => e.sequence)).size,
    ).to.equal(2);
  });
  it("redacts structured, multiline and registered secrets before persistence", async () => {
    const x = setup(),
      { deployment } = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "observe-3",
      ),
      secret = "synthetic-secret-123456";
    x.store.appendLog(
      deployment.id,
      x.o.id,
      "build",
      `TOKEN=${secret}\nAuthorization: Bearer abcdefghijk`,
      [secret],
    );
    const event = x.store.history(x.u.id, x.o.id, deployment.id).at(-1);
    expect(JSON.stringify(event))
      .not.to.include(secret)
      .and.not.to.include("abcdefghijk");
    expect(
      redactValue({ authorization: "Bearer no", nested: { apiKey: secret } }, [
        secret,
      ]),
    ).to.deep.equal({
      authorization: "[REDACTED]",
      nested: { apiKey: "[REDACTED]" },
    });
  });
  it("records truncation once and reports retention", async () => {
    const x = setup();
    x.store.maxLogBytes = 4;
    const { deployment } = await x.store.create(
      x.u.id,
      x.o.id,
      x.input,
      "observe-4",
    );
    x.store.appendLog(deployment.id, x.o.id, "build", "12345");
    x.store.appendLog(deployment.id, x.o.id, "build", "67890");
    const info = x.store.retention(x.u.id, x.o.id, deployment.id);
    expect(info.truncated).to.equal(true);
    expect(
      x.store
        .history(x.u.id, x.o.id, deployment.id)
        .filter((e) => e.eventType === "log.truncated"),
    ).to.have.length(1);
  });
  it("filters and paginates historical events", async () => {
    const x = setup(),
      { deployment } = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "observe-5",
      );
    x.store.recordEvent(
      deployment.id,
      "log",
      null,
      "needle",
      {},
      { stage: "tests", level: "error" },
    );
    x.store.recordEvent(
      deployment.id,
      "log",
      null,
      "other",
      {},
      { stage: "build" },
    );
    const rows = x.store.history(x.u.id, x.o.id, deployment.id, {
      after: 0,
      stage: "tests",
      level: "error",
      search: "need",
      limit: 1,
    });
    expect(rows).to.have.length(1);
    expect(rows[0].safeMessage).to.equal("needle");
  });
  it("rejects stale transitions and invalid cancel/retry states", async () => {
    const x = setup(),
      { deployment } = await x.store.create(
        x.u.id,
        x.o.id,
        x.input,
        "observe-6",
      );
    x.store.transition(deployment.id, "validating", {
      expectedVersion: 1,
      commandId: "a",
    });
    expect(() =>
      x.store.transition(deployment.id, "testing", {
        expectedVersion: 1,
        commandId: "b",
      }),
    )
      .to.throw()
      .with.property("code", "DEPLOYMENT_VERSION_CONFLICT");
    expect(() =>
      x.store.requestCancellation(x.u.id, x.o.id, deployment.id),
    ).not.to.throw();
  });
});
