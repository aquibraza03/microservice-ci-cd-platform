"use client";
import Link from "next/link";
import { Rocket } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PlatformDeployment } from "@saas/types";
import { useActiveOrganization } from "@saas/features/platform";
import { useQuery } from "@tanstack/react-query";
import { DataTable, EmptyState, PageHeader, StatusBadge } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";
export function DeploymentsView() {
  const { controlPlane, search, notifications } = getAppComposition(),
    organization = useActiveOrganization({ controlPlane, search, notifications }),
    org = organization.organizationId;
  const query = useQuery({
    queryKey: ["platform-deployments", org],
    queryFn: () => controlPlane.listPlatformDeployments(org!, { page: 1, pageSize: 100 }),
    enabled: Boolean(org),
    refetchInterval: 3000
  });
  const columns: ColumnDef<PlatformDeployment>[] = [
    {
      id: "id",
      header: "Deployment",
      cell: ({ row }) => (
        <div>
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={`/deployments/${row.original.id}`}
          >
            {row.original.id.slice(0, 8)}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">
            {row.original.commitSha.slice(0, 12)}
          </p>
        </div>
      )
    },
    { id: "branch", accessorKey: "branch", header: "Branch" },
    { id: "environment", accessorKey: "environment", header: "Environment" },
    {
      id: "state",
      accessorKey: "currentState",
      header: "State",
      cell: ({ row }) => (
        <StatusBadge
          tone={
            row.original.currentState === "build_complete"
              ? "success"
              : row.original.currentState === "failed"
                ? "destructive"
                : ["cancelled", "cancel_requested"].includes(row.original.currentState)
                  ? "warning"
                  : "neutral"
          }
        >
          {row.original.currentState.replaceAll("_", " ")}
        </StatusBadge>
      )
    },
    { id: "attempt", accessorKey: "attemptCount", header: "Attempt" }
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Deployments"
        description="Durable pre-deployment pipelines. Build complete does not mean published or deployed."
      />
      {!org && !organization.isPending ? (
        <EmptyState icon={<Rocket aria-hidden="true" />} title="No organization selected" />
      ) : (
        <DataTable
          data={query.data?.items || []}
          columns={columns}
          rowKey={(d) => d.id}
          loading={query.isPending}
          empty={<EmptyState icon={<Rocket aria-hidden="true" />} title="No deployments" />}
        />
      )}
    </div>
  );
}
