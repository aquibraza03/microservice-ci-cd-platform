"use client";

import { Copy, Download, Pause, Play, Search } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@saas/intl";
import { Button, Card, CardContent, EmptyState, Input, PageHeader } from "@saas/ui";

/** Static-log viewer boundary. Live streaming is enabled only by a future log service contract. */
export function LogViewer() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title={t("devops.logs.title")} description={t("devops.logs.description")} />
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search
                className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("devops.logs.searchPlaceholder")}
                aria-label={t("devops.logs.search")}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaused((value) => !value)}
              disabled
            >
              <>
                {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                {t("devops.logs.pauseUnavailable")}
              </>
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("devops.logs.copyUnavailable")}
              disabled
            >
              <Copy aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("devops.logs.downloadUnavailable")}
              disabled
            >
              <Download aria-hidden="true" />
            </Button>
          </div>
          <div
            className="min-h-64 rounded-md bg-zinc-950 px-4 py-5 font-mono text-xs text-zinc-300"
            role="log"
            aria-live="polite"
          >
            <EmptyState
              title={t("devops.logs.unavailable.title")}
              description={t("devops.logs.unavailable.description")}
              className="min-h-52 text-zinc-400 [&_div]:bg-zinc-900"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
