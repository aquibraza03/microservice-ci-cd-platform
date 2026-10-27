import type { Metadata } from "next";
import { DeploymentLiveView } from "@/components/deployments/deployment-live-view";
export const metadata: Metadata = { title: "Deployment pipeline" };
export default function DeploymentDetailPage() {
  return <DeploymentLiveView />;
}
