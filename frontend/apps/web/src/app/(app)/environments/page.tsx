import type { Metadata } from "next";
import { EnvironmentsView } from "@/components/environments/environments-view";
export const metadata: Metadata = { title: "Environments" };
export default function EnvironmentsPage() {
  return <EnvironmentsView />;
}
