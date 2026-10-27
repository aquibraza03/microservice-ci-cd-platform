import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Pipeline run" };
export default function PipelineRunDetailPage() {
  return <DevOpsModuleView module="runDetails" />;
}
