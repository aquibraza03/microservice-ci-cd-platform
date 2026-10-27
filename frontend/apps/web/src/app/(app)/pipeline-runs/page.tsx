import type { Metadata } from "next";
import { PipelineRunsView } from "@/components/pipeline-runs/pipeline-runs-view";

export const metadata: Metadata = {
  title: "Pipeline runs"
};

export default function PipelineRunsPage() {
  return <PipelineRunsView />;
}
