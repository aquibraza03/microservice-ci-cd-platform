const { expect } = require("chai");
const { MemoryRepository } = require("../../src/domain/repositories");
const { MemoryConfigurationStore } = require("../../src/configuration/store");
const {
  validateConfiguration,
  exportServiceYaml,
} = require("../../src/configuration/validation");
const SHA = "b".repeat(40);
function valid() {
  return {
    serviceName: "api",
    serviceRoot: ".",
    dockerfilePath: "Dockerfile",
    buildContext: ".",
    buildCommand: "npm run build",
    testCommand: "npm test",
    startCommand: "npm start",
    packageManager: "npm",
    containerPort: 8080,
    cpuRequest: "100m",
    cpuLimit: "500m",
    memoryRequest: "128Mi",
    memoryLimit: "512Mi",
    minReplicas: 1,
    maxReplicas: 3,
    startupPath: "/startup",
    readinessPath: "/ready",
    healthPath: "/health",
    timeoutSeconds: 300,
    retryCount: 2,
    targetEnvironment: "development",
    kubernetesTarget: "kind-local",
    variables: { LOG_LEVEL: "info" },
    secretReferences: ["secrets/api-key"],
    deploymentPolicy: "standard",
  };
}
describe("service configuration drafts", () => {
  let repo, user, org, project, connected, store;
  beforeEach(() => {
    repo = new MemoryRepository();
    user = repo.upsertUser({ subject: "test|one" });
    org = repo.createOrganization(user.id, { name: "Acme", slug: "acme" });
    project = repo.createProject(user.id, org.id, { name: "App", slug: "app" });
    connected = repo.createRepositoryReference(user.id, org.id, project.id, {
      provider: "github",
      externalId: "1",
      name: "acme/app",
      defaultBranch: "main",
      visibility: "private",
      status: "active",
    });
    store = new MemoryConfigurationStore(repo);
  });
  it("saves, recovers and optimistic-locks a sanitized draft", async () => {
    const input = {
      repositoryId: connected.id,
      commitSha: SHA,
      candidateId: "cand_1",
      configuration: { ...valid(), secretValues: { TOKEN: "do-not-store" } },
    };
    const first = await store.saveDraft(user.id, org.id, project.id, input, 0);
    expect(first.version).eq(1);
    expect(first.configuration).not.have.property("secretValues");
    expect((await store.getDraft(user.id, org.id, project.id)).version).eq(1);
    let error;
    try {
      await store.saveDraft(user.id, org.id, project.id, input, 0);
    } catch (e) {
      error = e;
    }
    expect(error.code).eq("VERSION_CONFLICT");
  });
  it("rejects invalid resources, contexts and secret values", () => {
    const result = validateConfiguration({
      ...valid(),
      cpuLimit: "50m",
      buildContext: "../escape",
      secretValues: { TOKEN: "x" },
    });
    expect(result.valid).eq(false);
    expect(result.errors.map((e) => e.field)).include.members([
      "cpuLimit",
      "buildContext",
      "secretReferences",
    ]);
  });
  it("detects commit drift, cross-tenant access and non-disclosure", async () => {
    const result = {
      commitSha: SHA,
      detectionEngineVersion: "1",
      candidates: [{ id: "cand_1", requiresConfirmation: false }],
    };
    const run = await store.createDetection(
      user.id,
      org.id,
      project.id,
      connected.id,
      result,
      "key",
    );
    let error;
    try {
      await store.saveConfiguration(
        user.id,
        org.id,
        project.id,
        {
          detectionId: run.id,
          repositoryId: connected.id,
          commitSha: "c".repeat(40),
          candidateId: "cand_1",
          configuration: valid(),
        },
        validateConfiguration(valid()),
        exportServiceYaml(valid()),
      );
    } catch (e) {
      error = e;
    }
    expect(error.code).eq("COMMIT_DRIFT");
    const other = repo.upsertUser({ subject: "test|two" });
    const otherOrg = repo.createOrganization(other.id, {
      name: "Other",
      slug: "other",
    });
    try {
      await store.getDetection(other.id, otherOrg.id, run.id);
    } catch (e) {
      error = e;
    }
    expect(error.code).eq("DETECTION_NOT_FOUND");
    const saved = await store.saveConfiguration(
      user.id,
      org.id,
      project.id,
      {
        detectionId: run.id,
        repositoryId: connected.id,
        commitSha: SHA,
        candidateId: "cand_1",
        configuration: valid(),
      },
      validateConfiguration(valid()),
      exportServiceYaml(valid()),
    );
    expect(JSON.stringify(saved)).not.contain("do-not-store");
  });
});
