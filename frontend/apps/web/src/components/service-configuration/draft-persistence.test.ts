import { describe, expect, it } from "vitest";
import { sanitizeBrowserDraft } from "./draft-persistence";
describe("configuration draft persistence", () => {
  it("never persists transient secret values", () => {
    const draft = {
      repositoryId: "r",
      projectId: "p",
      commitSha: "a".repeat(40),
      candidateId: "c",
      version: 1,
      configuration: {
        serviceName: "api",
        serviceRoot: ".",
        dockerfilePath: "Dockerfile",
        buildContext: ".",
        buildCommand: "",
        testCommand: "",
        startCommand: "",
        packageManager: "npm",
        containerPort: 8080,
        cpuRequest: "100m",
        cpuLimit: "500m",
        memoryRequest: "128Mi",
        memoryLimit: "512Mi",
        minReplicas: 1,
        maxReplicas: 2,
        startupPath: "/startup",
        readinessPath: "/ready",
        healthPath: "/health",
        timeoutSeconds: 300,
        retryCount: 2,
        targetEnvironment: "development" as const,
        kubernetesTarget: "kind-local",
        variables: {},
        secretReferences: ["api-key"],
        deploymentPolicy: "standard",
        secretValues: { api: "secret" }
      }
    };
    expect(sanitizeBrowserDraft(draft).configuration).not.toHaveProperty("secretValues");
  });
});
