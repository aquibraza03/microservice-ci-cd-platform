import type { Metadata } from "next";
import { LogViewer } from "@/components/devops";
export const metadata: Metadata = { title: "Logs" };
export default function LogsPage() {
  return <LogViewer />;
}
