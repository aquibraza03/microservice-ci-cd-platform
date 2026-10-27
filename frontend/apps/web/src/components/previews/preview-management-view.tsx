"use client";
import { useEffect, useState } from "react";
import type { Preview } from "@saas/types";
import { useActiveOrganization } from "@saas/features/platform";
import { Button, PageHeader, StatusBadge } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";
export function PreviewManagementView() {
  const { controlPlane, search, notifications } = getAppComposition(),
    active = useActiveOrganization({ controlPlane, search, notifications }),
    org = active.organizationId,
    [items, setItems] = useState<Preview[]>([]),
    [error, setError] = useState("");
  const load = () =>
    org
      ? controlPlane
          .listPreviews(org)
          .then((x) => setItems(x.items))
          .catch((e) => setError(String(e)))
      : Promise.resolve();
  useEffect(() => {
    void load();
  }, [org]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Preview deployments"
        description="Immutable PR revisions with isolated routing, expiry and cleanup status."
      />
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4">
        {items.map((item) => (
          <article className="rounded border bg-card p-4" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                {item.pullRequestNumber
                  ? `Pull request #${item.pullRequestNumber}`
                  : "Manual preview"}
              </h2>
              <StatusBadge
                tone={
                  item.lifecycleStatus === "ready"
                    ? "success"
                    : item.lifecycleStatus === "failed"
                      ? "destructive"
                      : "warning"
                }
              >
                {item.lifecycleStatus}
              </StatusBadge>
            </div>
            <p className="mt-2 font-mono text-xs">
              {item.revision?.commitSha || "Awaiting immutable revision"}
            </p>
            <p className="text-sm">
              URL:{" "}
              {item.route?.verificationScope ? `${item.route.verificationScope}: ` : "unverified: "}
              {item.generatedHostname}
            </p>
            <p className="text-sm">
              Route {item.route?.status || "not created"} · TLS{" "}
              {item.route?.certificateStatus || "not requested"} · cleanup {item.cleanupStatus}
            </p>
            <p className="text-xs text-muted-foreground">
              Expires {new Date(item.expiresAt).toLocaleString()}
            </p>
            <div className="mt-3 flex gap-2">
              {!item.route ? (
                <Button
                  onClick={() =>
                    void controlPlane.createPreviewRoute(org!, item.id, 3000).then(load)
                  }
                >
                  Create route
                </Button>
              ) : null}
              {item.route && item.lifecycleStatus !== "ready" ? (
                <Button onClick={() => void controlPlane.verifyPreview(org!, item.id).then(load)}>
                  Verify URL
                </Button>
              ) : null}
              {item.lifecycleStatus === "ready" && item.route?.verificationScope ? (
                <Button asChild>
                  <a href={`https://${item.generatedHostname}`} target="_blank" rel="noreferrer">
                    Open preview
                  </a>
                </Button>
              ) : null}
              <Button
                variant="destructive"
                onClick={() => void controlPlane.removePreview(org!, item.id).then(load)}
              >
                Remove
              </Button>
            </div>
          </article>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">No preview deployments exist for this organization.</p>
      ) : null}
    </div>
  );
}
