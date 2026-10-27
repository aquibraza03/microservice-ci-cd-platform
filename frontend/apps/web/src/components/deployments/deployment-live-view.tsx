"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { DeploymentEvent, DeploymentStage, PlatformDeployment } from "@saas/types";
import { DeploymentEventSchema } from "@saas/types";
import { useActiveOrganization } from "@saas/features/platform";
import { Button, PageHeader, StatusBadge } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";
import { RollbackPanel } from "./rollback-panel";
const TERMINAL = new Set(["build_complete", "ready", "failed", "cancelled", "rolled_back"]);
export function DeploymentLiveView() {
  const { id } = useParams<{ id: string }>(),
    composition = getAppComposition(),
    { controlPlane, search, notifications } = composition,
    organization = useActiveOrganization({ controlPlane, search, notifications }),
    org = organization.organizationId;
  const [deployment, setDeployment] = useState<PlatformDeployment | null>(null),
    [events, setEvents] = useState<DeploymentEvent[]>([]),
    [stages, setStages] = useState<DeploymentStage[]>([]),
    [connection, setConnection] = useState<"connecting" | "live" | "delayed" | "complete">(
      "connecting"
    ),
    [error, setError] = useState("");
  const cursor = useRef(0),
    version = useRef(0);
  const reconcile = useCallback(async () => {
    if (!org) return;
    const [d, s, e] = await Promise.all([
      controlPlane.getPlatformDeployment(org, id),
      controlPlane.listDeploymentStages(org, id),
      controlPlane.listDeploymentEvents(org, id, cursor.current)
    ]);
    if (d.stateVersion >= version.current) {
      version.current = d.stateVersion;
      setDeployment(d);
    }
    setStages(s.items);
    for (const item of e.items)
      if (item.sequence > cursor.current) {
        cursor.current = item.sequence;
        setEvents((old) =>
          old.some((x) => x.sequence === item.sequence)
            ? old
            : [...old, item].sort((a, b) => a.sequence - b.sequence)
        );
      }
  }, [org, id, controlPlane]);
  useEffect(() => {
    if (!org) return;
    const abort = new AbortController();
    let stopped = false;
    async function run() {
      while (!stopped) {
        try {
          setConnection(cursor.current ? "delayed" : "connecting");
          await reconcile();
          const authoritative = await controlPlane.getPlatformDeployment(org!, id);
          if (TERMINAL.has(authoritative.currentState)) {
            setConnection("complete");
            return;
          }
          const token = composition.tokenManager.getAccessToken(),
            base = composition.config.api.baseUrl.replace(/\/$/, ""),
            response = await fetch(
              `${base}/api/v1/organizations/${encodeURIComponent(org!)}/deployments/${encodeURIComponent(id)}/stream`,
              {
                headers: {
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  ...(cursor.current ? { "Last-Event-ID": String(cursor.current) } : {})
                },
                signal: abort.signal
              }
            );
          if (!response.ok || !response.body) throw new Error("Authorized live stream unavailable");
          setConnection("live");
          const reader = response.body.getReader(),
            decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() || "";
            for (const frame of frames) {
              if (frame.startsWith("event: gap")) {
                await reconcile();
                continue;
              }
              const data = frame
                .split("\n")
                .find((line) => line.startsWith("data: "))
                ?.slice(6);
              if (!data) continue;
              const parsed = JSON.parse(data);
              if (!parsed.schemaVersion) continue;
              const event = DeploymentEventSchema.parse(parsed);
              if (event.sequence <= cursor.current) continue;
              if (event.sequence !== cursor.current + 1) {
                await reconcile();
                continue;
              }
              cursor.current = event.sequence;
              setEvents((old) => [...old, event]);
              if (event.stateVersion != null && event.stateVersion >= version.current)
                await reconcile();
            }
          }
        } catch (reason) {
          if (!stopped) {
            setError(reason instanceof Error ? reason.message : "Live status unavailable");
            setConnection("delayed");
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    }
    void run();
    return () => {
      stopped = true;
      abort.abort();
    };
  }, [org, id, composition, reconcile, controlPlane]);
  if (!deployment)
    return (
      <div>
        <PageHeader title="Deployment" description="Loading authorized deployment state…" />
        {error ? <p role="alert">{error}</p> : null}
      </div>
    );
  const cancel = () =>
      void controlPlane
        .cancelPlatformDeployment(org!, id, "Cancelled from dashboard")
        .then(setDeployment)
        .catch((e) => setError(String(e))),
    retry = () =>
      void controlPlane
        .retryPlatformDeployment(org!, id, crypto.randomUUID())
        .then(setDeployment)
        .catch((e) => setError(String(e)));
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Deployment ${deployment.id.slice(0, 8)}`}
        description={`${deployment.branch} · ${deployment.commitSha.slice(0, 12)} · ${deployment.environment}`}
      />
      <div aria-live="polite" className="text-sm">
        Stream:{" "}
        <StatusBadge
          tone={
            connection === "live" ? "success" : connection === "delayed" ? "warning" : "neutral"
          }
        >
          {connection}
        </StatusBadge>
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <section className="grid gap-2 rounded border bg-card p-4 text-sm md:grid-cols-2">
        <p>
          <b>State:</b> {deployment.currentState} (v{deployment.stateVersion})
        </p>
        <p>
          <b>Attempt:</b> {deployment.attemptCount}
        </p>
        <p>
          <b>Provider:</b> {deployment.provider}
        </p>
        <p>
          <b>Trigger:</b> {deployment.triggerSource}
        </p>
        <p>
          <b>Repository:</b> {deployment.repositoryId}
        </p>
        <p>
          <b>Commit:</b> {deployment.commitSha}
        </p>
        <p>
          <b>Image:</b> {deployment.imageDigest || "Not produced"}
        </p>
        <p>
          <b>Duration:</b>{" "}
          {deployment.startedAt
            ? `${Math.max(0, Math.round(((deployment.completedAt ? Date.parse(deployment.completedAt) : Date.now()) - Date.parse(deployment.startedAt)) / 1000))}s`
            : "Not started"}
        </p>
        {deployment.failureMessage ? (
          <p className="text-destructive md:col-span-2">
            <b>Failure ({deployment.failureCode}):</b> {deployment.failureMessage} · Deployment{" "}
            {deployment.id}
          </p>
        ) : null}
      </section>
      <RollbackPanel organizationId={org!} deployment={deployment} controlPlane={controlPlane} />
      <section className="rounded border bg-card p-4">
        <h2 className="mb-3 font-semibold">Timeline</h2>
        <ol className="space-y-2">
          {stages.map((stage) => (
            <li
              key={`${stage.name}:${stage.attempt}`}
              className="flex justify-between border-b py-2"
            >
              <span>
                {stage.name} · attempt {stage.attempt}
              </span>
              <span>
                {stage.state}
                {stage.durationMs != null ? ` · ${stage.durationMs}ms` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className="rounded border bg-card p-4">
        <h2 className="mb-3 font-semibold">Deployment logs and events</h2>
        <ol className="max-h-96 space-y-1 overflow-auto font-mono text-xs">
          {events.map((event) => (
            <li id={`event-${event.sequence}`} key={event.id}>
              <span className="text-muted-foreground">
                #{event.sequence} [{event.level}] [{event.stage || event.source}]
              </span>{" "}
              {event.safeMessage}
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-wrap gap-2">
        {!TERMINAL.has(deployment.currentState) ? (
          <Button variant="destructive" onClick={cancel}>
            Cancel
          </Button>
        ) : null}
        {deployment.currentState === "failed" ? <Button onClick={retry}>Retry</Button> : null}
        {deployment.endpoint && deployment.currentState === "ready" ? (
          <Button asChild>
            <a href={deployment.endpoint} target="_blank" rel="noreferrer">
              Open endpoint
            </a>
          </Button>
        ) : null}
        <Button variant="secondary" asChild>
          <a
            href={`https://github.com/${deployment.repositoryId}/commit/${deployment.commitSha}`}
            target="_blank"
            rel="noreferrer"
          >
            View commit
          </a>
        </Button>
        <Button variant="secondary" asChild>
          <a
            href={`${composition.config.api.baseUrl.replace(/\/$/, "")}/api/v1/organizations/${encodeURIComponent(org!)}/deployments/${encodeURIComponent(id)}/logs`}
          >
            Download logs
          </a>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Health, route, controller and observed-digest failures can never display rolled_back.
      </p>
    </div>
  );
}
