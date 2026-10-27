import { Skeleton } from "@saas/ui";
import { t } from "@saas/intl";

/**
 * Route-level loading UI (App Router streaming boundary).
 * Rendered inside Suspense while the page segment resolves; provides a stable,
 * reduced-clutter fallback so users never see a blank flash.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <div role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
