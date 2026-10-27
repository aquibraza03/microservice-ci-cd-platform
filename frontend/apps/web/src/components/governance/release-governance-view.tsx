"use client";
import { useCallback, useEffect, useState } from "react";
import type { ApprovalRequest, PolicyException, SecurityPolicy } from "@saas/types";
import { Button, PageHeader, StatusBadge } from "@saas/ui";
import { useActiveOrganization } from "@saas/features/platform";
import { getAppComposition } from "@/lib/composition";

export function ReleaseGovernanceView() {
  const { controlPlane, search, notifications } = getAppComposition();
  const organizationId = useActiveOrganization({
    controlPlane,
    search,
    notifications
  }).organizationId;
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]),
    [policies, setPolicies] = useState<SecurityPolicy[]>([]),
    [exceptions, setExceptions] = useState<PolicyException[]>([]),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!organizationId) return;
    const [a, p, e] = await Promise.all([
      controlPlane.listApprovals(organizationId),
      controlPlane.listSecurityPolicies(organizationId),
      controlPlane.listPolicyExceptions(organizationId)
    ]);
    setApprovals(a.items);
    setPolicies(p.items);
    setExceptions(e.items);
  }, [controlPlane, organizationId]);
  useEffect(() => {
    void load().catch((e) => setError(String(e)));
  }, [load]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Release governance"
        description="Protected actions, immutable approval snapshots, Kubernetes policy posture, exceptions and drift."
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Approval inbox</h2>
        {approvals.map((a) => (
          <article key={a.id} className="mt-3 border-t pt-3">
            <div className="flex justify-between">
              <b>{a.action}</b>
              <StatusBadge
                tone={
                  a.state === "approved" || a.state === "consumed"
                    ? "success"
                    : a.state === "pending"
                      ? "warning"
                      : "neutral"
                }
              >
                {a.state}
              </StatusBadge>
            </div>
            <p className="text-xs">
              Snapshot {a.snapshotDigest} · expires {new Date(a.expiresAt).toLocaleString()}
            </p>
            <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(a.snapshot, null, 2)}
            </pre>
            {a.state === "pending" ? (
              <div className="mt-2 flex gap-2">
                <Button
                  onClick={() =>
                    organizationId &&
                    void controlPlane
                      .decideApproval(organizationId, a.id, "approve")
                      .then(load)
                      .catch((e) => setError(String(e)))
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    organizationId &&
                    void controlPlane
                      .decideApproval(
                        organizationId,
                        a.id,
                        "reject",
                        "Rejected after security review"
                      )
                      .then(load)
                      .catch((e) => setError(String(e)))
                  }
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Kubernetes policy catalogue</h2>
        <p className="text-xs text-muted-foreground">
          Preflight feedback is not admission enforcement. Enforce is shown only when the target
          reports an active Kyverno admission capability.
        </p>
        {policies.map((p) => (
          <div key={p.id} className="mt-2 flex justify-between border-t pt-2">
            <span>{p.id}</span>
            <span>
              {p.status.state} · {p.status.enforcementSource}
            </span>
          </div>
        ))}
      </section>
      <section className="rounded border bg-card p-4">
        <h2 className="font-semibold">Time-limited exceptions</h2>
        {exceptions.map((x) => (
          <div key={x.id} className="mt-2 border-t pt-2">
            <b>{x.policyId}</b>{" "}
            <StatusBadge tone={x.status === "active" ? "warning" : "neutral"}>
              {x.status}
            </StatusBadge>
            <p className="text-xs">
              {x.environment} · expires {new Date(x.expiresAt).toLocaleString()} ·{" "}
              {x.compensatingControl}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
