const { isolationKey } = require("./hostname");
const { withTransaction, bindTransactions } = require('../database/transaction');
class PreviewController {
  constructor({ store, deploymentStore, deploymentQueue }) {
    Object.assign(this, { store, deploymentStore, deploymentQueue });
  }
  async handleProviderEvent(event) {
    if (event.eventType !== "pull_request") return null;
    const policy = await this.store.eventPolicy(event.organizationId, event.repositoryId);
    if (!policy) return null;
    const action = event.metadata?.action,
      current = await this.store.eventPreview(event.organizationId, event.repositoryId, event.pullRequestNumber);
    if (action === "closed")
      return current
        ? this.store.scheduleCleanup(
            current.id,
            event.metadata?.merged ? "merged" : "closed",
            event.organizationId,
          )
        : null;
    if (!["opened", "reopened", "synchronize"].includes(action)) return null;
    return this._deploy(
      policy.createdBy,
      event.organizationId,
      {
        projectId: policy.projectId,
        serviceId: policy.serviceId,
        repositoryId: policy.repositoryId,
        pullRequestNumber: event.pullRequestNumber,
        commitSha: event.commitSha,
        branch: event.branch || policy.branch,
        forked: event.forkedPullRequest,
        providerTrustVerified: true,
        providerDeliveryId: event.deliveryId,
      },
      `github:${event.deliveryId}`,
      policy,
    );
  }
  async createManual(userId, organizationId, input, key) {
    const policy = await this.store.getPolicy(organizationId, input.serviceId);
    return this._deploy(
      userId,
      organizationId,
      { ...input, forked: false, providerTrustVerified: false },
      key,
      policy,
      "manual_preview",
    );
  }
  async _deploy(userId, organizationId, input, key, policy, triggerSource) {
    const iso = isolationKey({
        organizationId,
        serviceId: input.serviceId,
        prNumber: input.pullRequestNumber,
        commitSha: input.commitSha,
      }),
      snapshot = structuredClone(
        policy?.configurationSnapshot || input.configurationSnapshot || {},
      ),
      fork = Boolean(input.forked);
    snapshot.preview = {
      isolationKey: iso,
      untrusted: fork,
      expiresAfterSeconds: policy?.ttlSeconds || 86400,
      quotas: {
        cpuMillicores: policy?.maxCpuMillicores || 500,
        memoryMebibytes: policy?.maxMemoryMebibytes || 512,
        storageMebibytes: policy?.maxStorageMebibytes || 1024,
      },
    };
    if (fork) {
      delete snapshot.secrets;
      delete snapshot.secretValues;
      delete snapshot.secretReferences;
      snapshot.environment = "preview-untrusted";
    }
    const persist = async () => {
    const created = await this.deploymentStore.create(
      userId,
      organizationId,
      {
        projectId: input.projectId,
        serviceId: input.serviceId,
        repositoryId: input.repositoryId,
        branch: input.branch || policy?.branch || "main",
        commitSha: input.commitSha,
        triggerSource:
          triggerSource ||
          (input.pullRequestNumber ? "pull_request_preview" : "manual_preview"),
        environment: "preview",
        configurationSnapshot: snapshot,
      },
      `preview-deploy:${key}`,
    );
    const preview = await this.store.create(
      userId,
      organizationId,
      { ...input, deploymentId: created.deployment.id },
      key,
    );
    return { created, preview };
    };
    const pool = this.store.pool;
    if (pool) bindTransactions(pool);
    const { created, preview } = pool ? await withTransaction(pool, persist) : await persist();
    if (created.created) await this.deploymentQueue.enqueue(created.deployment);
    return preview;
  }
}
module.exports = { PreviewController };
