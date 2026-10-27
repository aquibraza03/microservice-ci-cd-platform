import type { Metadata } from "next";
import { PreviewManagementView } from "@/components/previews/preview-management-view";
export const metadata: Metadata = { title: "Preview deployments" };
export default function PreviewPage() {
  return <PreviewManagementView />;
}
