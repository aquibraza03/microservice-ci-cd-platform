import type { Metadata } from "next";
import { DevOpsModuleView } from "@/components/devops";
export const metadata: Metadata = { title: "Terraform" };
export default function TerraformPage() {
  return <DevOpsModuleView module="terraform" />;
}
