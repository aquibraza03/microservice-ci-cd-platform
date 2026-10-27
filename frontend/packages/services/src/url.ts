/**
 * Resolve a configured endpoint that may be a full URL or a path relative to
 * the API base URL. Authentication endpoints come from configuration; nothing
 * is hardcoded.
 */
export function resolveUrl(baseUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = baseUrl.replace(/\/+$/, "");
  if (pathOrUrl.startsWith("/")) return `${base}${pathOrUrl}`;
  return `${base}/${pathOrUrl}`;
}
