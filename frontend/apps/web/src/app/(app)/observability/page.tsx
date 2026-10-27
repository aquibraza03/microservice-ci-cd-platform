import type { Metadata } from "next";
import { ObservabilityView } from "@/components/observability/observability-view";

export const metadata: Metadata = {
  title: "Monitoring"
};

export default function ObservabilityPage() {
  return <ObservabilityView />;
}
