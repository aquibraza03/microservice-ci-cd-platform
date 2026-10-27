"use client";
import { useCallback, useEffect, useState } from "react";
import type { DeploymentTarget, ProviderCatalogItem, ProviderConnection } from "@saas/types";
import { Button, PageHeader, StatusBadge } from "@saas/ui";
import { useActiveOrganization } from "@saas/features/platform";
import { getAppComposition } from "@/lib/composition";

export function CloudConnectionsView() {
  const composition = getAppComposition(),
    { controlPlane, search, notifications } = composition,
    active = useActiveOrganization({ controlPlane, search, notifications }),
    org = active.organizationId,
    [catalog, setCatalog] = useState<ProviderCatalogItem[]>([]),
    [connections, setConnections] = useState<ProviderConnection[]>([]),
    [targets, setTargets] = useState<DeploymentTarget[]>([]),
    [trustPolicy, setTrustPolicy] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [aws, setAws] = useState({
      displayName: "",
      roleArn: "",
      expectedAccountId: "",
      permittedRegions: "us-east-1"
    }),
    [kube, setKube] = useState({
      name: "",
      apiServerOrigin: "",
      allowedNamespaces: "",
      allowedEnvironments: "staging",
      authenticationMethod: "service_account_token" as const,
      serviceAccountToken: ""
    });
  const load = useCallback(async () => {
    if (!org) return;
    const [p, c, t] = await Promise.all([
      controlPlane.listProviderCatalog(org),
      controlPlane.listProviderConnections(org),
      controlPlane.listDeploymentTargets(org)
    ]);
    setCatalog(p.items);
    setConnections(c.items);
    setTargets(t.items);
  }, [controlPlane, org]);
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
  }, [load]);
  async function connectAws() {
    if (!org) return;
    setBusy(true);
    setError("");
    try {
      const result = await controlPlane.createAwsConnection(
        org,
        {
          ...aws,
          providerType: "aws",
          permittedRegions: aws.permittedRegions
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        },
        crypto.randomUUID()
      );
      setTrustPolicy(result.trustPolicy || null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function connectKube() {
    if (!org) return;
    setBusy(true);
    setError("");
    try {
      await controlPlane.createKubernetesTarget(
        org,
        {
          ...kube,
          allowedNamespaces: kube.allowedNamespaces
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          allowedEnvironments: kube.allowedEnvironments
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        },
        crypto.randomUUID()
      );
      setKube((x) => ({ ...x, serviceAccountToken: "" }));
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function validateConnection(item: ProviderConnection) {
    if (!org) return;
    setBusy(true);
    try {
      await controlPlane.validateProviderConnection(org, item.id, item.version);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function validateTarget(item: DeploymentTarget) {
    if (!org) return;
    setBusy(true);
    try {
      await controlPlane.validateDeploymentTarget(org, item.id, item.version);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bring Your Own Cloud"
        description="Cloud-account access and runtime deployment targets are separate, tenant-owned resources."
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Provider availability</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {catalog.map((p) => (
            <article key={`${p.resourceType}:${p.type}`} className="rounded border p-3">
              <div className="flex justify-between">
                <b>{p.type.toUpperCase()}</b>
                <StatusBadge tone={p.connectable ? "warning" : "neutral"}>
                  {p.supportLevel}
                </StatusBadge>
              </div>
              <p className="text-sm">
                {p.resourceType.replace("_", " ")} ·{" "}
                {p.connectable ? "connectable" : "not connectable"}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.capabilities.map((x) => x.id).join(", ") || "Planned only"}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded border bg-card p-4">
          <h2 className="font-semibold">Connect AWS account</h2>
          {Object.entries(aws).map(([key, value]) => (
            <label key={key} className="block text-sm">
              {key}
              <input
                className="mt-1 w-full rounded border bg-background p-2"
                value={value}
                onChange={(e) => setAws((x) => ({ ...x, [key]: e.target.value }))}
              />
            </label>
          ))}
          <Button disabled={busy} onClick={() => void connectAws()}>
            Generate trust policy
          </Button>
          {trustPolicy ? (
            <div>
              <div className="flex justify-between">
                <b>Trust policy</b>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard.writeText(JSON.stringify(trustPolicy, null, 2))
                  }
                >
                  Copy
                </Button>
              </div>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(trustPolicy, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
        <div className="space-y-3 rounded border bg-card p-4">
          <h2 className="font-semibold">Connect Kubernetes target</h2>
          {Object.entries(kube).map(([key, value]) => (
            <label key={key} className="block text-sm">
              {key}
              {key === "serviceAccountToken" ? (
                <input
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={value}
                  onChange={(e) => setKube((x) => ({ ...x, [key]: e.target.value }))}
                />
              ) : (
                <input
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={value}
                  onChange={(e) => setKube((x) => ({ ...x, [key]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            OIDC/workload identity is preferred. A service-account token is an encrypted,
            namespace-scoped fallback and is never returned.
          </p>
          <Button disabled={busy} onClick={() => void connectKube()}>
            Create target
          </Button>
        </div>
      </section>
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">AWS connections</h2>
        {connections.map((x) => (
          <div
            key={x.id}
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
          >
            <div>
              <b>{x.displayName}</b>
              <p className="text-sm">
                {x.roleArn} · regions {x.permittedRegions.join(", ")}
              </p>
              <p className="text-xs">
                Persisted state: {x.status}
                {x.validationErrorCategory ? ` · ${x.validationErrorCategory}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={busy || ["disabled", "revoked"].includes(x.status)}
                onClick={() => void validateConnection(x)}
              >
                Validate
              </Button>
              {!["disabled", "revoked"].includes(x.status) ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    org &&
                    void controlPlane
                      .providerConnectionLifecycle(org, x.id, "disable", x.version)
                      .then(load)
                  }
                >
                  Disable
                </Button>
              ) : null}
              {x.status !== "revoked" ? (
                <Button
                  variant="destructive"
                  onClick={() =>
                    org &&
                    void controlPlane
                      .providerConnectionLifecycle(org, x.id, "revoke", x.version)
                      .then(load)
                  }
                >
                  Revoke
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Kubernetes deployment targets</h2>
        {targets.map((x) => (
          <div
            key={x.id}
            className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
          >
            <div>
              <b>{x.name}</b>
              <p className="text-sm">
                {x.apiServerOrigin} · {x.allowedNamespaces.join(", ")}
              </p>
              <p className="text-xs">
                Persisted state: {x.status} · permissions {x.permissionValidation} · health{" "}
                {x.connectionHealth} · Kubernetes {x.kubernetesVersion || "unverified"}
              </p>
              <p className="text-xs">
                Kyverno: {String(x.capabilityResults.kyverno ?? "unverified")} · External Secrets:{" "}
                {String(x.capabilityResults.externalSecrets ?? "unverified")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || ["disabled", "revoked"].includes(x.status)}
                onClick={() => void validateTarget(x)}
              >
                Validate target
              </Button>
              {x.authenticationMethod === "service_account_token" && x.status !== "revoked" ? (
                <Button
                  variant="secondary"
                  disabled={!kube.serviceAccountToken}
                  onClick={() =>
                    org &&
                    void controlPlane
                      .rotateDeploymentTargetCredential(
                        org,
                        x.id,
                        kube.serviceAccountToken,
                        x.version
                      )
                      .then(() => {
                        setKube((old) => ({ ...old, serviceAccountToken: "" }));
                        return load();
                      })
                  }
                >
                  Rotate token
                </Button>
              ) : null}
              {!["disabled", "revoked"].includes(x.status) ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    org &&
                    void controlPlane
                      .deploymentTargetLifecycle(org, x.id, "disable", x.version)
                      .then(load)
                  }
                >
                  Disable
                </Button>
              ) : null}
              {x.status !== "revoked" ? (
                <Button
                  variant="destructive"
                  onClick={() =>
                    org &&
                    void controlPlane
                      .deploymentTargetLifecycle(org, x.id, "revoke", x.version)
                      .then(load)
                  }
                >
                  Revoke
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
