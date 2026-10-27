import type { ServiceConfiguration } from "@saas/types";
export type BrowserDraft = {
  repositoryId: string;
  projectId: string;
  commitSha: string;
  candidateId: string;
  configuration: ServiceConfiguration;
  version: number;
};
export function sanitizeBrowserDraft(value: BrowserDraft): BrowserDraft {
  const copy = structuredClone(value) as BrowserDraft & {
    configuration: ServiceConfiguration & { secretValues?: unknown; secrets?: unknown };
  };
  delete copy.configuration.secretValues;
  delete copy.configuration.secrets;
  return copy;
}
export function draftKey(organizationId: string, projectId: string) {
  return `platform:service-draft:${organizationId}:${projectId}`;
}
