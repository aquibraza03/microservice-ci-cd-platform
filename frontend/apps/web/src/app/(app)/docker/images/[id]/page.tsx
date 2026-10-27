import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Docker image" };
export default function DockerImagePage() {
  return <DevOpsModuleView module="dockerDetails" />;
}
