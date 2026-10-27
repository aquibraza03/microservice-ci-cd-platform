"use client";

import {
  AlertTriangle,
  Boxes,
  CloudCog,
  Container,
  FileCode2,
  GitBranch,
  ListTree,
  Logs,
  Rocket,
  ServerCog
} from "lucide-react";
import { useI18n } from "@saas/intl";
import { Card, CardContent, EmptyState, PageHeader } from "@saas/ui";

type DevOpsModule =
  | "pipelines"
  | "pipelineDetails"
  | "runDetails"
  | "logs"
  | "deploymentDetails"
  | "environments"
  | "environmentDetails"
  | "docker"
  | "dockerDetails"
  | "kubernetes"
  | "kubernetesDetails"
  | "terraform";

const icons = {
  pipelines: GitBranch,
  pipelineDetails: GitBranch,
  runDetails: ListTree,
  logs: Logs,
  deploymentDetails: Rocket,
  environments: CloudCog,
  environmentDetails: CloudCog,
  docker: Container,
  dockerDetails: Boxes,
  kubernetes: ServerCog,
  kubernetesDetails: ServerCog,
  terraform: FileCode2
} as const;

export function DevOpsModuleView({ module }: { module: DevOpsModule }) {
  const { t } = useI18n();
  const Icon = icons[module];
  const title = t(`devops.${module}.title` as never);
  const description = t(`devops.${module}.description` as never);

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={<Icon aria-hidden="true" />}
            title={t("devops.unavailable.title")}
            description={t("devops.unavailable.description")}
          />
        </CardContent>
      </Card>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        {t("devops.unavailable.contract")}
      </p>
    </div>
  );
}
