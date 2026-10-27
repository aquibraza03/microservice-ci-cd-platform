const { ControlPlaneError } = require("../errors");
const SUPPORTED = new Set([
  "push",
  "pull_request",
  "installation",
  "installation_repositories",
  "repository",
  "ping",
]);
function branchFromRef(ref) {
  return typeof ref === "string" && ref.startsWith("refs/heads/")
    ? ref.slice(11)
    : null;
}
class GitHubWebhookService {
  constructor(provider, repository, { previewController = null } = {}) {
    this.provider = provider;
    this.repository = repository;
    this.previewController = previewController;
  }
  async handle(headers, raw) {
    const signature = headers["x-hub-signature-256"];
    if (!this.provider.verifyWebhook(raw, signature))
      throw new ControlPlaneError(
        401,
        "WEBHOOK_SIGNATURE_INVALID",
        "Webhook signature is invalid",
      );
    const type = headers["x-github-event"] || "";
    const deliveryId = headers["x-github-delivery"] || "";
    if (!/^[A-Za-z0-9-]{1,128}$/.test(deliveryId))
      throw new ControlPlaneError(
        400,
        "WEBHOOK_DELIVERY_INVALID",
        "Webhook delivery ID is invalid",
      );
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new ControlPlaneError(
        400,
        "INVALID_JSON",
        "Request body must be valid JSON",
      );
    }
    const installation = await this.repository.findInstallationByProviderId(
      payload.installation?.id,
    );
    const repository = payload.repository
      ? await this.repository.findRepositoryByProviderId(payload.repository.id)
      : null;
    const recorded = await this.repository.recordWebhookDelivery({
      provider: "github",
      deliveryId,
      eventType: type,
      installationId: installation?.id || null,
      repositoryId: repository?.id || null,
      organizationId: installation?.organizationId || null,
    });
    if (recorded.duplicate) return { status: "duplicate", deliveryId };
    if (!SUPPORTED.has(type)) return { status: "ignored", eventType: type };
    if (type === "installation") {
      const state =
        payload.action === "suspend"
          ? "suspended"
          : payload.action === "deleted"
            ? "revoked"
            : payload.action === "unsuspend"
              ? "active"
              : null;
      if (state)
        await this.repository.setInstallationStateByProvider(
          payload.installation?.id,
          state,
        );
      return { status: "accepted", eventType: type };
    }
    if (type === "repository" && repository) {
      if (this.repository.updateProviderRepository)
        await this.repository.updateProviderRepository(
          repository.id,
          payload.action,
          payload.repository,
        );
      return { status: "accepted", eventType: type };
    }
    if (["push", "pull_request"].includes(type)) {
      if (
        !installation ||
        !repository ||
        repository.organizationId !== installation.organizationId
      )
        return { status: "ignored", reason: "unconnected_repository" };
      const pr = payload.pull_request;
      const event = {
        organizationId: repository.organizationId,
        repositoryId: repository.id,
        deliveryId: recorded.delivery.id,
        eventType: type,
        branch:
          type === "push" ? branchFromRef(payload.ref) : pr?.head?.ref || null,
        commitSha: type === "push" ? payload.after : pr?.head?.sha || null,
        sender: payload.sender?.login || null,
        eventTimestamp:
          payload.head_commit?.timestamp || new Date().toISOString(),
        triggerSource: type === "push" ? "git_push" : "pull_request",
        pullRequestNumber: pr ? payload.number : null,
        forkedPullRequest: Boolean(
          pr?.head?.repo?.fork || pr?.head?.repo?.id !== pr?.base?.repo?.id,
        ),
        metadata: {
          action: payload.action || null,
          merged: Boolean(pr?.merged),
          providerDeliveryId: deliveryId,
          headRepositoryId: pr?.head?.repo?.id ? String(pr.head.repo.id) : null,
          baseRepositoryId: pr?.base?.repo?.id ? String(pr.base.repo.id) : null,
        },
      };
      await this.repository.recordGitEvent(event);
      if (type === "pull_request" && this.previewController)
        await this.previewController.handleProviderEvent({
          ...event,
          deliveryId,
        });
      return { status: "accepted", eventType: type, eventId: event.deliveryId };
    }
    return { status: "accepted", eventType: type };
  }
}
module.exports = { GitHubWebhookService, branchFromRef };
