const { Queue, Worker, QueueEvents } = require("bullmq");
const JOB_OPTIONS = Object.freeze({
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
});
const WORKER_OPTIONS = Object.freeze({
  lockDuration: 30000,
  maxStalledCount: 2,
  stalledInterval: 15000,
});
class BullDeploymentQueue {
  constructor({
    connection,
    queueName = "deployments",
    quota = async () => true,
    traceManager = null,
    metrics = null,
  } = {}) {
    this.connection = connection;
    this.name = queueName;
    this.quota = quota;
    this.traceManager = traceManager;
    this.metrics = metrics;
    this.queue = new Queue(queueName, {
      connection,
      defaultJobOptions: JOB_OPTIONS,
    });
  }
  async enqueue(deployment) {
    const started = process.hrtime.bigint();
    let result = "success";
    try {
      if (!(await this.quota(deployment.organizationId)))
        throw Object.assign(new Error("Organization queue quota exceeded"), {
          code: "ORGANIZATION_QUEUE_QUOTA",
        });
      const existing = await this.queue.getJob(deployment.id);
      if (existing) {
        if (await existing.isFailed()) await existing.retry();
        return existing;
      }
      return await this.queue.add(
        "deployment",
        {
          deploymentId: deployment.id,
          organizationId: deployment.organizationId,
          telemetry: this.traceManager
            ? this.traceManager.queueMetadata(
                deployment.telemetryContext || this.traceManager.accept({}),
                deployment.workflowId || deployment.id,
              )
            : undefined,
        },
        { jobId: deployment.id },
      );
    } catch (error) {
      result = "failure";
      throw error;
    } finally {
      this.metrics?.observe(
        "redis_operation_duration_seconds",
        { operation: "enqueue", result },
        Number(process.hrtime.bigint() - started) / 1e9,
      );
    }
  }
  async cancel(id) {
    const job = await this.queue.getJob(id);
    if (job && (await job.isWaiting())) await job.remove();
  }
  async depth() {
    const started = process.hrtime.bigint();
    let result = "success";
    try {
      const counts = await this.queue.getJobCounts(
        "wait",
        "active",
        "delayed",
        "failed",
        "completed",
      );
      if (this.metrics)
        for (const [state, value] of Object.entries(counts))
          this.metrics.set("queue_depth", { queue: this.name, state }, value);
      return counts;
    } catch (error) {
      result = "failure";
      throw error;
    } finally {
      this.metrics?.observe(
        "redis_operation_duration_seconds",
        { operation: "depth", result },
        Number(process.hrtime.bigint() - started) / 1e9,
      );
    }
  }
  async close() {
    await this.queue.close();
  }
  createWorker(
    processor,
    { concurrency = 2, lockDuration = WORKER_OPTIONS.lockDuration } = {},
  ) {
    return new Worker(this.name, processor, {
      connection: this.connection,
      concurrency,
      lockDuration,
      maxStalledCount: WORKER_OPTIONS.maxStalledCount,
      stalledInterval: WORKER_OPTIONS.stalledInterval,
    });
  }
  events() {
    return new QueueEvents(this.name, { connection: this.connection });
  }
}
class MemoryDeploymentQueue {
  constructor({ traceManager = null, metrics = null } = {}) {
    this.jobs = new Map();
    this.enqueues = 0;
    this.traceManager = traceManager;
    this.metrics = metrics;
  }
  async enqueue(d) {
    if (!this.jobs.has(d.id)) {
      this.jobs.set(d.id, {
        id: d.id,
        data: {
          deploymentId: d.id,
          organizationId: d.organizationId,
          telemetry: this.traceManager
            ? this.traceManager.queueMetadata(
                d.telemetryContext || this.traceManager.accept({}),
                d.workflowId || d.id,
              )
            : undefined,
        },
        attemptsMade: 0,
      });
      this.enqueues++;
    }
    return this.jobs.get(d.id);
  }
  async cancel(id) {
    this.jobs.delete(id);
  }
  async depth() {
    const value = {
      wait: this.jobs.size,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    };
    if (this.metrics)
      for (const [state, count] of Object.entries(value))
        this.metrics.set("queue_depth", { queue: "deployments", state }, count);
    return value;
  }
  async close() {}
}
module.exports = {
  BullDeploymentQueue,
  MemoryDeploymentQueue,
  JOB_OPTIONS,
  WORKER_OPTIONS,
};
