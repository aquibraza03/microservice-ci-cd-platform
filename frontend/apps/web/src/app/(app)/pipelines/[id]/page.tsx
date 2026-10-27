import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Pipeline" };
export default function PipelineDetailPage() {
  return <DevOpsModuleView module="pipelineDetails" />;
}
