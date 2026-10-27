import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Kubernetes" };
export default function KubernetesPage() {
  return <DevOpsModuleView module="kubernetes" />;
}
