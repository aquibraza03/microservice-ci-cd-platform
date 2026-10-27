import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Pipelines" };
export default function PipelinesPage() {
  return <DevOpsModuleView module="pipelines" />;
}
