const { createWorkspace, checkout, cleanup } = require("../worker/workspace");
const { detectRepository } = require("./engine");
const { ControlPlaneError } = require("../errors");
class DetectionService {
  constructor({ repository, gitProvider, resolveCheckout, limits } = {}) {
    this.repository = repository;
    this.gitProvider = gitProvider;
    this.resolveCheckout = resolveCheckout;
    this.limits = limits;
  }
  async detect({ userId, organizationId, repositoryId, commitSha }) {
    const connected = await this.repository.getProviderRepository(
      userId,
      organizationId,
      repositoryId,
    );
    if (connected.status !== "active")
      throw new ControlPlaneError(
        403,
        "GIT_PROVIDER_ACCESS_REVOKED",
        "Repository access is unavailable",
      );
    if (this.resolveCheckout) {
      const root = await this.resolveCheckout({
        userId,
        organizationId,
        repository: connected,
        commitSha,
      });
      return detectRepository({
        root,
        repositoryId,
        commitSha,
        limits: this.limits,
      });
    }
    if (!this.gitProvider)
      throw new ControlPlaneError(
        503,
        "GIT_PROVIDER_NOT_CONFIGURED",
        "Git provider is not configured",
      );
    const workerData = await this.repository.getRepositoryForWorker(
      repositoryId,
      organizationId,
    );
    const workspace = await createWorkspace();
    try {
      const token = await this.gitProvider.token(
        workerData.installation.providerInstallationId,
      );
      const root = await checkout({
        workspace,
        repositoryUrl: `https://github.com/${workerData.repository.name}.git`,
        commitSha,
        token,
        maxBytes: this.limits?.maxBytes || 64 * 1024 * 1024,
      });
      return await detectRepository({
        root,
        repositoryId,
        commitSha,
        limits: this.limits,
      });
    } finally {
      await cleanup(workspace);
    }
  }
}
module.exports = { DetectionService };
