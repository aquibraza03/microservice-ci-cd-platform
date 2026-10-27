import type { Metadata } from "next";
import { DomainManagementView } from "@/components/domains/domain-management-view";
export const metadata: Metadata = { title: "Custom domains" };
export default function DomainsPage() {
  return <DomainManagementView />;
}
