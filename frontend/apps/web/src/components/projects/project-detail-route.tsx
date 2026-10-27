"use client";

import { useParams } from "next/navigation";
import { ProjectDetailView } from "./project-detail-view";

/** Resolves the route param and renders the project detail foundation. */
export function ProjectDetailRoute() {
  const params = useParams<{ id: string }>();
  return <ProjectDetailView id={params.id ?? ""} />;
}
