import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Docker" };
export default function DockerCanonicalPage() {
  return <DevOpsModuleView module="docker" />;
}
