"use client";
import { Boxes, Github } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  GitBranch,
  GitInstallation,
  GitRepository,
  ProjectSummary,
  RepositoryReference
} from "@saas/types";
import { useActiveOrganization } from "@saas/features/platform";
import { Button, EmptyState, Input, PageHeader, StatusBadge } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";

/** Real GitHub App onboarding. No repository fixtures or production mock fallback. */
export function RepositoriesView() {
  const { controlPlane, search, notifications } = getAppComposition();
  const organization = useActiveOrganization({ controlPlane, search, notifications });
  const callback = useSearchParams();
  const [installations, setInstallations] = useState<GitInstallation[]>([]),
    [repositories, setRepositories] = useState<GitRepository[]>([]),
    [branches, setBranches] = useState<GitBranch[]>([]),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [connected, setConnected] = useState<RepositoryReference[]>([]);
  const [installation, setInstallation] = useState(""),
    [repository, setRepository] = useState(""),
    [branch, setBranch] = useState(""),
    [project, setProject] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const org = organization.organizationId;
  async function load() {
    if (!org) return;
    setError("");
    try {
      const [i, p, c] = await Promise.all([
        controlPlane.listGitInstallations(org),
        controlPlane.listProjects(org, { page: 1, pageSize: 100 }),
        controlPlane.listRepositoryReferences(org, { page: 1, pageSize: 100 })
      ]);
      setInstallations(i.items);
      setProjects(p.items);
      setConnected(c.items);
      const active = i.items.find((item) => item.connectionState === "active");
      if (active) setInstallation(active.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "GitHub connection could not be loaded");
    }
  }
  useEffect(() => {
    void load();
  }, [org]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const state = callback.get("state"),
      installationId = callback.get("installation_id");
    if (!org || !state || !installationId) return;
    setBusy(true);
    void controlPlane
      .completeGitHubInstallation(org, {
        state,
        installationId,
        setupAction: callback.get("setup_action") || undefined
      })
      .then(() => {
        window.history.replaceState({}, "", window.location.pathname);
        return load();
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "GitHub callback was rejected")
      )
      .finally(() => setBusy(false));
  }, [org, callback, controlPlane]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!org || !installation) return;
    void controlPlane
      .listGitRepositories(org, installation, { page: 1, pageSize: 100, search: query })
      .then((value) => setRepositories(value.items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Repository access denied"));
  }, [org, installation, query, controlPlane]);
  useEffect(() => {
    if (!org || !installation || !repository) return;
    void controlPlane
      .listGitBranches(org, installation, repository)
      .then((value) => {
        setBranches(value.items);
        setBranch(value.items[0]?.name || "");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Branches unavailable"));
  }, [org, installation, repository, controlPlane]);
  async function connect() {
    if (!org || !project || !repository || !branch) return;
    setBusy(true);
    setError("");
    try {
      await controlPlane.connectGitRepository(org, project, {
        installationId: installation,
        repositoryId: repository,
        selectedBranch: branch
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Repository connection failed");
    } finally {
      setBusy(false);
    }
  }
  async function install() {
    if (!org) return;
    setBusy(true);
    try {
      const result = await controlPlane.beginGitHubInstallation(org);
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "GitHub installation could not start");
      setBusy(false);
    }
  }
  async function disconnect() {
    if (!org || !installation) return;
    setBusy(true);
    try {
      await controlPlane.disconnectGitInstallation(org, installation);
      setInstallation("");
      setRepositories([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }
  const current = installations.find((item) => item.id === installation);
  const revoked = current && current.connectionState !== "active";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Repositories"
        description="Connect an organization-owned GitHub App installation and select a repository branch."
      />
      {!org && !organization.isPending ? (
        <EmptyState
          icon={<Boxes aria-hidden="true" />}
          title="No organization selected"
          description="Select an organization before connecting GitHub."
        />
      ) : (
        <>
          <section className="space-y-3 rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">GitHub App</h2>
                <p className="text-sm text-muted-foreground">
                  Installation tokens stay server-side and expire automatically.
                </p>
              </div>
              <Button onClick={install} disabled={busy}>
                <Github className="mr-2 size-4" />
                {installations.length ? "Reconnect GitHub" : "Connect GitHub"}
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error.includes("403")
                  ? "Permission denied or installation revoked. Reconnect GitHub or ask an organization administrator."
                  : error}
              </p>
            ) : null}
            {installations.length ? (
              <div className="flex gap-3">
                <select
                  aria-label="GitHub installation"
                  value={installation}
                  onChange={(e) => setInstallation(e.target.value)}
                  className="rounded border p-2"
                >
                  {installations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.accountLogin || i.providerInstallationId} ({i.connectionState})
                    </option>
                  ))}
                </select>
                <Button variant="outline" onClick={disconnect} disabled={busy || !installation}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <p className="text-sm">No GitHub installation connected.</p>
            )}
            {revoked ? (
              <p className="text-sm text-destructive">
                This installation is revoked or suspended. Reconnect to continue.
              </p>
            ) : null}
          </section>
          {current && !revoked ? (
            <section className="space-y-4 rounded-lg border bg-card p-5">
              <h2 className="font-semibold">Choose repository</h2>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories"
                aria-label="Search repositories"
              />
              {!repositories.length ? (
                <EmptyState
                  title="No repositories available"
                  description="Grant this GitHub App access to at least one repository."
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {repositories.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setRepository(r.id)}
                      className={`rounded border p-3 text-left ${repository === r.id ? "border-primary" : ""}`}
                    >
                      <span className="font-medium">{r.fullName}</span>
                      <span className="ml-2">
                        <StatusBadge tone="neutral">{r.visibility}</StatusBadge>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {repository ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <select
                    aria-label="Branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="rounded border p-2"
                  >
                    <option value="">Select branch</option>
                    {branches.map((b) => (
                      <option key={b.name}>{b.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Project"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                    className="rounded border p-2"
                  >
                    <option value="">Select project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Button onClick={connect} disabled={busy || !branch || !project}>
                    Confirm connection
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
          <section className="space-y-3 rounded-lg border bg-card p-5">
            <h2 className="font-semibold">Connected repositories</h2>
            {connected.length ? (
              connected.map((r) => (
                <div key={r.id} className="flex items-center justify-between border-b py-2">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.defaultBranch} · immutable provider ID {r.externalId}
                    </p>
                  </div>
                  <StatusBadge tone={r.status === "active" ? "success" : "neutral"}>
                    {r.status}
                  </StatusBadge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No repository is connected to this organization.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
