"use client";
import { useEffect, useState } from "react";
import type { ControlPlaneService } from "@saas/services";
import type { PlatformDeployment, RollbackComparison } from "@saas/types";
import { Button, StatusBadge } from "@saas/ui";

export function RollbackPanel({
  organizationId,
  deployment,
  controlPlane
}: {
  organizationId: string;
  deployment: PlatformDeployment;
  controlPlane: ControlPlaneService;
}) {
  const [targets, setTargets] = useState<PlatformDeployment[]>([]),
    [targetId, setTargetId] = useState(""),
    [comparison, setComparison] = useState<RollbackComparison | null>(null),
    [reason, setReason] = useState(""),
    [approvalId, setApprovalId] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState<PlatformDeployment | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (deployment.currentState !== "ready") return;
    void controlPlane
      .listRollbackTargets(organizationId, deployment.id)
      .then((x) => setTargets(x.items))
      .catch((e) => setError(String(e)));
  }, [controlPlane, deployment.currentState, deployment.id, organizationId]);
  async function compare(id: string) {
    setTargetId(id);
    setComparison(null);
    setApprovalId("");
    if (id)
      try {
        setComparison(await controlPlane.getRollbackComparison(organizationId, deployment.id, id));
      } catch (e) {
        setError(String(e));
      }
  }
  async function approve() {
    if (!targetId) return;
    setBusy(true);
    setError("");
    try {
      const value = await controlPlane.approveRollback(
        organizationId,
        deployment.id,
        targetId,
        reason
      );
      setApprovalId(value.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function rollback() {
    if (!targetId || reason.trim().length < 8) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await controlPlane.rollbackDeployment(
          organizationId,
          deployment.id,
          {
            targetDeploymentId: targetId,
            reason,
            approvalId: approvalId || undefined,
            expectedStateVersion: deployment.stateVersion
          },
          crypto.randomUUID()
        )
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (deployment.currentState !== "ready") return null;
  return (
    <section className="space-y-4 rounded border bg-card p-4" aria-labelledby="rollback-heading">
      <div>
        <h2 id="rollback-heading" className="font-semibold">
          Safe rollback
        </h2>
        <p className="text-sm text-muted-foreground">
          Creates a new deployment. Historical releases and database migrations remain unchanged.
        </p>
      </div>
      <label className="block text-sm">
        Eligible verified target
        <select
          className="mt-1 w-full rounded border bg-background p-2"
          value={targetId}
          onChange={(e) => void compare(e.target.value)}
        >
          <option value="">Select a deployment</option>
          {targets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.commitSha.slice(0, 12)} · {x.imageDigest?.slice(0, 22)}
            </option>
          ))}
        </select>
      </label>
      {comparison ? (
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <b>Current</b>
              <p>{comparison.current.commitSha}</p>
              <p className="break-all">{comparison.current.imageDigest}</p>
            </div>
            <div>
              <b>Target</b>
              <p>{comparison.target.commitSha}</p>
              <p className="break-all">{comparison.target.imageDigest}</p>
            </div>
          </div>
          <p>
            <b>Configuration changes:</b> {comparison.configurationChanges.length};{" "}
            <b>resource changes:</b> {comparison.resourceChanges.length}
          </p>
          <p>
            <b>Environment variable names:</b>{" "}
            {comparison.environmentVariableNames.current.join(", ") || "none"} →{" "}
            {comparison.environmentVariableNames.target.join(", ") || "none"}
          </p>
          <p>
            <b>Database migrations:</b>{" "}
            {comparison.compatibility.currentMigrations.join(", ") || "unknown"} →{" "}
            {comparison.compatibility.targetMigrations.join(", ") || "unknown"}
          </p>
          {comparison.compatibility.warning ? (
            <p role="alert" className="rounded border border-amber-500 p-2 text-amber-700">
              {comparison.compatibility.warning} No database migration will be reversed.
            </p>
          ) : (
            <StatusBadge tone="success">Database compatibility proven</StatusBadge>
          )}
          <p>
            Approval:{" "}
            {comparison.approvalRequired ? (approvalId ? "approved" : "required") : "not required"}
          </p>
        </div>
      ) : null}
      <label className="block text-sm">
        Mandatory reason
        <textarea
          className="mt-1 min-h-20 w-full rounded border bg-background p-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <p aria-live="polite">
          Rollback deployment{" "}
          <a className="underline" href={`/deployments/${result.id}`}>
            {result.id}
          </a>{" "}
          is {result.currentState}.
        </p>
      ) : null}
      <div className="flex gap-2">
        {comparison?.approvalRequired && !approvalId ? (
          <Button
            variant="secondary"
            disabled={busy || reason.trim().length < 8}
            onClick={() => void approve()}
          >
            Request approval
          </Button>
        ) : null}
        <Button
          variant="destructive"
          disabled={
            busy ||
            !comparison ||
            reason.trim().length < 8 ||
            Boolean(comparison?.compatibility.blocked) ||
            Boolean(comparison?.approvalRequired && !approvalId)
          }
          onClick={() => void rollback()}
        >
          Confirm rollback
        </Button>
      </div>
    </section>
  );
}
