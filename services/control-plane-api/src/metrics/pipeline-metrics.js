class PipelineMetrics {
  constructor() {
    this.values = {
      completed_jobs: 0,
      failed_jobs: 0,
      retried_jobs: 0,
      cancellations: 0,
      queue_delay_ms: 0,
      build_duration_ms: 0,
    };
    this.durations = [];
    this.workerHeartbeat = 0;
  }
  inc(name) {
    this.values[name] = (this.values[name] || 0) + 1;
  }
  set(name, value) {
    this.values[name] = value;
  }
  observe(stage, ms) {
    this.durations.push({ stage, ms });
  }
  heartbeat() {
    this.workerHeartbeat = Date.now();
  }
  render(queue = {}) {
    const lines = [
      "# TYPE platform_queue_depth gauge",
      `platform_queue_depth ${queue.wait || 0}`,
      `platform_queue_delay_milliseconds ${this.values.queue_delay_ms}`,
      `platform_active_jobs ${queue.active || 0}`,
      `platform_completed_jobs_total ${this.values.completed_jobs}`,
      `platform_failed_jobs_total ${this.values.failed_jobs}`,
      `platform_retried_jobs_total ${this.values.retried_jobs}`,
      `platform_cancellations_total ${this.values.cancellations}`,
      `platform_build_duration_milliseconds ${this.values.build_duration_ms}`,
      `platform_worker_heartbeat_age_seconds ${this.workerHeartbeat ? Math.max(0, (Date.now() - this.workerHeartbeat) / 1000) : -1}`,
    ];
    for (const d of this.durations)
      lines.push(
        `platform_stage_duration_milliseconds{stage="${d.stage}"} ${d.ms}`,
      );
    return lines.join("\n") + "\n";
  }
}
module.exports = { PipelineMetrics };
