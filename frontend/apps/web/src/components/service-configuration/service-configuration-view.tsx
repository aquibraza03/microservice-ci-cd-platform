"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  DetectionRun,
  RepositoryReference,
  ServiceCandidate,
  ServiceConfiguration
} from "@saas/types";
import { useActiveOrganization } from "@saas/features/platform";
import { Button, Input, PageHeader, StatusBadge } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";
import { draftKey, sanitizeBrowserDraft } from "./draft-persistence";
const defaults: ServiceConfiguration = {
  serviceName: "service",
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
  targetEnvironment: "development",
  kubernetesTarget: "kind-local",
  variables: {},
  secretReferences: [],
  deploymentPolicy: "standard"
};
const steps = [
  "Repository",
  "Branch & commit",
  "Detection",
  "Service",
  "Build",
  "Runtime",
  "Environment",
  "Review"
];
export function ServiceConfigurationView() {
  const { controlPlane, search, notifications } = getAppComposition(),
    active = useActiveOrganization({ controlPlane, search, notifications }),
    params = useSearchParams(),
    org = active.organizationId,
    projectId = params.get("projectId") || "";
  const [step, setStep] = useState(0),
    [repos, setRepos] = useState<RepositoryReference[]>([]),
    [repositoryId, setRepositoryId] = useState(""),
    [commitSha, setCommitSha] = useState(""),
    [run, setRun] = useState<DetectionRun | null>(null),
    [candidate, setCandidate] = useState<ServiceCandidate | null>(null),
    [config, setConfig] = useState(defaults),
    [version, setVersion] = useState(0),
    [validation, setValidation] = useState<{
      valid: boolean;
      errors: { field: string; message: string }[];
      warnings: { field: string; message: string }[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [savedYaml, setSavedYaml] = useState("");
  useEffect(() => {
    if (!org || !projectId) return;
    void Promise.all([
      controlPlane.listRepositoryReferences(org, { page: 1, pageSize: 100 }),
      controlPlane.getConfigurationDraft(org, projectId)
    ])
      .then(([r, d]) => {
        setRepos(r.items.filter((x) => x.projectId === projectId && x.status === "active"));
        if (d.draft) {
          setRepositoryId(d.draft.repositoryId);
          setCommitSha(d.draft.commitSha);
          setConfig(d.draft.configuration as unknown as ServiceConfiguration);
          setVersion(d.draft.version);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Draft recovery failed"));
    const cached = localStorage.getItem(draftKey(org, projectId));
    if (cached)
      try {
        const d = JSON.parse(cached);
        setConfig(d.configuration);
        setRepositoryId(d.repositoryId);
        setCommitSha(d.commitSha);
        setVersion(d.version || 0);
      } catch {
        localStorage.removeItem(draftKey(org, projectId));
      }
  }, [org, projectId, controlPlane]);
  useEffect(() => {
    if (!org || !projectId || !repositoryId) return;
    const timer = setTimeout(() => {
      const draft = sanitizeBrowserDraft({
        repositoryId,
        projectId,
        commitSha,
        candidateId: candidate?.id || "pending",
        configuration: config,
        version
      });
      localStorage.setItem(draftKey(org, projectId), JSON.stringify(draft));
      if (candidate && /^[a-f0-9]{40,64}$/i.test(commitSha))
        void controlPlane
          .saveConfigurationDraft(org, projectId, draft)
          .then((d) => setVersion(d.version))
          .catch((e) => {
            if ((e as Error).message.includes("409"))
              setError("Draft changed in another session. Reload before saving.");
          });
    }, 700);
    return () => clearTimeout(timer);
  }, [org, projectId, repositoryId, commitSha, candidate, config, version, controlPlane]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (repositoryId && !savedYaml) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [repositoryId, savedYaml]);
  const set = <K extends keyof ServiceConfiguration>(key: K, value: ServiceConfiguration[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));
  async function detect() {
    if (!org || !projectId) return;
    setBusy(true);
    setError("");
    try {
      const value = await controlPlane.detectServices(
        org,
        projectId,
        repositoryId,
        commitSha,
        crypto.randomUUID()
      );
      setRun(value);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setBusy(false);
    }
  }
  function choose(c: ServiceCandidate) {
    setCandidate(c);
    setConfig((current) => ({
      ...current,
      serviceName: String(c.serviceName.value || "service")
        .replace(/[^a-z0-9-]/g, "-")
        .slice(0, 63),
      serviceRoot: String(c.serviceRoot.value || "."),
      dockerfilePath: String(c.dockerfilePath.value || "Dockerfile"),
      buildContext: String(c.buildContext.value || "."),
      packageManager: String(c.packageManager.value || "npm"),
      buildCommand: String(c.proposedBuildCommand.value || ""),
      testCommand: String(c.proposedTestCommand.value || ""),
      startCommand: String(c.proposedStartCommand.value || ""),
      containerPort: Number(c.containerPort.value || 8080),
      healthPath: String(c.healthPath.value || "/health"),
      readinessPath: String(c.readinessPath.value || "/ready")
    }));
    setStep(4);
  }
  async function review() {
    if (!org || !projectId) return;
    const value = await controlPlane.validateServiceConfiguration(org, projectId, config);
    setValidation(value);
    setStep(7);
  }
  async function save() {
    if (!org || !projectId || !run || !candidate) return;
    setBusy(true);
    try {
      const result = await controlPlane.saveServiceConfiguration(org, projectId, {
        detectionId: run.id,
        repositoryId,
        commitSha,
        candidateId: candidate.id,
        configuration: config,
        confirmConflicts: candidate.conflicts.length > 0
      });
      setSavedYaml(result.generatedServiceYaml);
      localStorage.removeItem(draftKey(org, projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Configuration save failed");
    } finally {
      setBusy(false);
    }
  }
  const fields = useMemo(() => Object.entries(config), [config]);
  if (!projectId) return <p role="alert">Open this flow with a projectId query parameter.</p>;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configure service"
        description="Detection inspects one immutable commit without executing repository code."
      />
      <nav className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <StatusBadge key={s} tone={i === step ? "warning" : i < step ? "success" : "neutral"}>
            {i + 1}. {s}
          </StatusBadge>
        ))}
      </nav>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {step === 0 ? (
        <section className="space-y-3 rounded border p-5">
          <h2 className="font-semibold">Repository</h2>
          <select
            className="rounded border p-2"
            value={repositoryId}
            onChange={(e) => setRepositoryId(e.target.value)}
          >
            <option value="">Select connected repository</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button disabled={!repositoryId} onClick={() => setStep(1)}>
            Continue
          </Button>
        </section>
      ) : null}
      {step === 1 ? (
        <section className="space-y-3 rounded border p-5">
          <h2 className="font-semibold">Branch and immutable commit</h2>
          <p className="text-sm text-muted-foreground">
            Selected branch:{" "}
            <strong>
              {repos.find((r) => r.id === repositoryId)?.selectedBranch ||
                repos.find((r) => r.id === repositoryId)?.defaultBranch}
            </strong>
            . Detection is pinned to the full commit SHA.
          </p>
          <Input
            aria-label="Commit SHA"
            value={commitSha}
            onChange={(e) => setCommitSha(e.target.value.trim())}
            placeholder="40-character commit SHA"
          />
          <Button disabled={busy || !/^[a-f0-9]{40,64}$/i.test(commitSha)} onClick={detect}>
            Detect services
          </Button>
        </section>
      ) : null}
      {step === 2 ? (
        <section className="space-y-3 rounded border p-5">
          <h2 className="font-semibold">Detection result</h2>
          {run?.result.candidates.length ? (
            run.result.candidates.map((c) => (
              <button
                type="button"
                className="block w-full rounded border p-3 text-left"
                key={c.id}
                onClick={() => choose(c)}
              >
                <strong>{String(c.serviceName.value)}</strong>
                <p className="text-sm">
                  {String(c.serviceRoot.value)} · {String(c.runtime.value)} · confidence{" "}
                  {c.runtime.confidence}
                </p>
                <p className="text-xs text-muted-foreground">Evidence: {c.evidence.join(", ")}</p>
                {c.conflicts.length ? (
                  <p className="text-sm text-destructive">
                    Conflicting metadata requires confirmation.
                  </p>
                ) : null}
              </button>
            ))
          ) : (
            <p>
              No deployable Tier 1 candidate found. Configure a supported service.yml, Dockerfile or
              Node package.
            </p>
          )}
        </section>
      ) : null}
      {step >= 4 && step < 7 ? (
        <section className="space-y-3 rounded border p-5">
          <h2 className="font-semibold">{steps[step]}</h2>
          {fields
            .filter(([k]) =>
              step === 4
                ? [
                    "serviceName",
                    "serviceRoot",
                    "dockerfilePath",
                    "buildContext",
                    "buildCommand",
                    "testCommand",
                    "startCommand",
                    "packageManager",
                    "containerPort"
                  ].includes(k)
                : step === 5
                  ? [
                      "cpuRequest",
                      "cpuLimit",
                      "memoryRequest",
                      "memoryLimit",
                      "minReplicas",
                      "maxReplicas",
                      "startupPath",
                      "readinessPath",
                      "healthPath",
                      "timeoutSeconds",
                      "retryCount"
                    ].includes(k)
                  : ["targetEnvironment", "kubernetesTarget", "deploymentPolicy"].includes(k)
            )
            .map(([key, value]) => (
              <label className="block text-sm" key={key}>
                {key}
                <Input
                  value={String(value)}
                  onChange={(e) =>
                    set(
                      key as keyof ServiceConfiguration,
                      ([
                        "containerPort",
                        "minReplicas",
                        "maxReplicas",
                        "timeoutSeconds",
                        "retryCount"
                      ].includes(key)
                        ? Number(e.target.value)
                        : e.target.value) as never
                    )
                  }
                />
              </label>
            ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
            <Button onClick={() => (step === 6 ? void review() : setStep(step + 1))}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}
      {step === 7 ? (
        <section className="space-y-3 rounded border p-5">
          <h2 className="font-semibold">Review and save</h2>
          {validation?.errors.map((e) => (
            <p className="text-sm text-destructive" key={`${e.field}:${e.message}`}>
              {e.field}: {e.message}
            </p>
          ))}
          <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs">
            {JSON.stringify(config, null, 2)}
          </pre>
          <Button disabled={!validation?.valid || busy} onClick={save}>
            Save deployable configuration
          </Button>
          {savedYaml ? (
            <>
              <h3 className="font-semibold">Generated service.yml</h3>
              <pre className="overflow-auto rounded bg-muted p-3 text-xs">{savedYaml}</pre>
              <Button
                variant="outline"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([savedYaml], { type: "text/yaml" }));
                  a.download = "service.yml";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                Export service.yml
              </Button>
            </>
          ) : null}
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Draft version {version}. Secret values are never stored in browser persistence; only
        existing secret references are accepted.
      </p>
    </div>
  );
}
