import { z } from "zod";
import { PageSchema, type Page } from "./api";

export const SearchResourceType = {
  PROJECT: "project",
  REPOSITORY: "repository",
  PIPELINE: "pipeline",
  PIPELINE_RUN: "pipeline-run",
  DEPLOYMENT: "deployment",
  ENVIRONMENT: "environment"
} as const;
export type SearchResourceType = (typeof SearchResourceType)[keyof typeof SearchResourceType];

export const SearchResultSchema = z.object({
  id: z.string().min(1),
  type: z.enum(Object.values(SearchResourceType) as [SearchResourceType, ...SearchResourceType[]]),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  href: z.string().min(1)
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  groups: z.array(
    z.object({
      type: SearchResultSchema.shape.type,
      results: z.array(SearchResultSchema)
    })
  )
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const NotificationSeverity = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFO: "info"
} as const;
export type NotificationSeverity = (typeof NotificationSeverity)[keyof typeof NotificationSeverity];

export const NotificationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  severity: z.enum(
    Object.values(NotificationSeverity) as [NotificationSeverity, ...NotificationSeverity[]]
  ),
  type: z.string().min(1),
  resourceHref: z.string().optional().nullable(),
  createdAt: z.string(),
  readAt: z.string().optional().nullable()
});
export type Notification = z.infer<typeof NotificationSchema>;
export const NotificationPageSchema = PageSchema(NotificationSchema);
export type NotificationPage = Page<Notification>;
