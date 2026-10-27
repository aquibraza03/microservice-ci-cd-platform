const { describe, it } = require("mocha");
const { expect } = require("chai");
const { BullDeploymentQueue } = require("../../src/queue/deployment-queue");
describe("BullMQ against Redis", () => {
  it("enqueues one deterministic job and executes it", async () => {
    const queueName = `deployments-test-${process.pid}-${Date.now()}`,
      queue = new BullDeploymentQueue({
        connection: { url: process.env.REDIS_URL || "redis://127.0.0.1:6379" },
        queueName,
      });
    let calls = 0;
    const completed = new Promise((resolve, reject) => {
      const worker = queue.createWorker(
        async (job) => {
          calls++;
          return job.data.deploymentId;
        },
        { concurrency: 1 },
      );
      worker.once("completed", async () => {
        await worker.close();
        resolve();
      });
      worker.once("failed", reject);
    });
    const deployment = {
      id: "00000000-0000-4000-8000-000000000001",
      organizationId: "00000000-0000-4000-8000-000000000002",
    };
    await Promise.all([queue.enqueue(deployment), queue.enqueue(deployment)]);
    await completed;
    expect(calls).to.equal(1);
    await queue.close();
  });
});
