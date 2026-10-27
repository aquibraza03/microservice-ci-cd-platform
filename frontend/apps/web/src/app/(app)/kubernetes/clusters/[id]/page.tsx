import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Kubernetes cluster" };
export default function KubernetesClusterPage() {
  return <DevOpsModuleView module="kubernetesDetails" />;
}
