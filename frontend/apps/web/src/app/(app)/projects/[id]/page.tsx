import type { Metadata } from "next";
import { ProjectDetailRoute } from "@/components/projects/project-detail-route";

export const metadata: Metadata = {
  title: "Project"
};

export default function ProjectDetailPage() {
  return <ProjectDetailRoute />;
}
