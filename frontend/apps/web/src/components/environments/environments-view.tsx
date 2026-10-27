"use client";

import { CloudCog } from "lucide-react";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useI18n } from "@saas/intl";
import type { EnvironmentReference } from "@saas/types";
import { useActiveOrganization, useEnvironmentReferences } from "@saas/features/platform";
import { DataTable, EmptyState, Input, PageHeader, StatusBadge } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";
import { WidgetError } from "@saas/features/dashboard";

/**
 * Environments list. Backed by the real `/organizations/{id}/environments`
 * control-plane contract (same pattern as Repositories) — this route
 * presents live environment references, not fabricated data. Deployment
 * status, release history, and infrastructure metrics per environment are a
 * separate, not-yet-implemented contract (see environment detail route).
 */
export function EnvironmentsView() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const { controlPlane, search: searchService, notifications } = getAppComposition();
  const organization = useActiveOrganization({
    controlPlane,
    search: searchService,
    notifications
  });
  const query = useEnvironmentReferences(
    organization.organizationId,
    { page: 1, pageSize: 25 },
    { controlPlane, search: searchService, notifications }
  );

  const columns: ColumnDef<EnvironmentReference>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: t("environments.columns.name"),
      cell: ({ row }) => <p className="font-medium">{row.original.name}</p>
    },
    { id: "type", accessorKey: "type", header: t("environments.columns.type") },
    {
      id: "status",
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.status === "active" ? "success" : "neutral"}>
          {row.original.status}
        </StatusBadge>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("environments.title")} description={t("environments.description")} />
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t("environments.search")}
        aria-label={t("environments.search")}
        className="max-w-xs"
      />
      {query.isError ? (
        <WidgetError section={t("environments.title")} onRetry={() => void query.refetch()} />
      ) : !organization.organizationId && !organization.isPending ? (
        <section className="rounded-lg border bg-card">
          <EmptyState
            icon={<CloudCog aria-hidden="true" />}
            title={t("environments.organizationRequired")}
            description={t("environments.organizationRequiredHint")}
          />
        </section>
      ) : (
        <DataTable
          data={(query.data?.items ?? []).filter((environment) =>
            `${environment.name} ${environment.type}`.toLowerCase().includes(search.toLowerCase())
          )}
          columns={columns}
          rowKey={(environment) => environment.id}
          loading={query.isPending || organization.isPending}
          empty={
            <EmptyState
              icon={<CloudCog aria-hidden="true" />}
              title={t("environments.empty.title")}
              description={t("environments.empty.description")}
            />
          }
          defaultSort={[{ id: "name", desc: false }]}
        />
      )}
      <section aria-label={t("environments.referenceNote")} className="rounded-lg border bg-card">
        <EmptyState
          title={t("environments.referenceNote")}
          description={t("environments.referenceNoteDescription")}
          className="py-5"
        />
      </section>
    </div>
  );
}
