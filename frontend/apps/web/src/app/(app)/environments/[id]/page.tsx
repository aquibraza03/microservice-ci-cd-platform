import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Environment" };
export default function EnvironmentDetailPage() {
  return <DevOpsModuleView module="environmentDetails" />;
}
