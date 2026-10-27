"use client";
import { useEffect, useState } from "react";
import { useActiveOrganization } from "@saas/features/platform";
import { PageHeader } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";

type Overview = {
  plan: null | {
    planId: string;
    planVersion: number;
    effectiveAt: string;
    entitlements: Record<string, number>;
  };
  meters: Array<{
    id: string;
    version: number;
    unit: string;
    inclusion: string;
    exclusion: string;
  }>;
  currentUsage: Record<string, number>;
  dataState: string;
  paymentCollection: string;
};
export function BillingView() {
  const { controlPlane, search, notifications } = getAppComposition();
  const active = useActiveOrganization({ controlPlane, search, notifications });
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (active.organizationId)
      void controlPlane
        .getBillingOverview(active.organizationId)
        .then(setData)
        .catch((e) => setError(String(e)));
  }, [active.organizationId, controlPlane]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage and limits"
        description="Processed usage, effective entitlements, and meter definitions. Payment collection is not supported."
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {!data ? (
        <p className="text-muted-foreground">Loading persisted billing state…</p>
      ) : (
        <>
          <section className="rounded border bg-card p-4">
            <h2 className="font-semibold">Current plan</h2>
            <p>
              {data.plan ? `${data.plan.planId} v${data.plan.planVersion}` : "No plan assigned"}
            </p>
            <p className="text-sm text-muted-foreground">
              State: {data.dataState}; payment collection: {data.paymentCollection}
            </p>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            {data.meters.map((m) => (
              <article className="rounded border bg-card p-4" key={`${m.id}:${m.version}`}>
                <h2 className="font-semibold">
                  {m.id} v{m.version}
                </h2>
                <p>Unit: {m.unit}</p>
                <p className="text-sm">Includes: {m.inclusion}</p>
                <p className="text-sm">Excludes: {m.exclusion}</p>
                <p className="text-sm font-medium">
                  Current processed usage: {data.currentUsage[`${m.id}:v${m.version}`] ?? 0}
                </p>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
