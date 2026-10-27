"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  CornerDownLeft,
  FolderKanban,
  GitBranch,
  ListChecks,
  Moon,
  Rocket,
  Search,
  Sun,
  SunMoon
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth, useLogoutMutation } from "@saas/features/auth";
import { useGlobalSearch } from "@saas/features/platform";
import { useAppTheme } from "@saas/features/theme";
import { useLocalStorage } from "@saas/hooks";
import { useOnlineStatus } from "@saas/hooks";
import { useI18n } from "@saas/intl";
import { getConfig } from "@saas/lib";
import { isApiError } from "@saas/services";
import { ApiErrorCode, type SearchResult } from "@saas/types";
import { Button, Dialog, DialogContent, DialogTitle, EmptyState } from "@saas/ui";
import { cn } from "@saas/utils";
import { getVisibleNavGroups } from "./nav-visibility";
import { getAppComposition } from "@/lib/composition";

const resultIcon = {
  project: FolderKanban,
  repository: Boxes,
  pipeline: GitBranch,
  "pipeline-run": ListChecks,
  deployment: Rocket,
  environment: Boxes
} as const;

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenShortcuts: () => void;
};

type Command =
  | {
      kind: "navigation";
      id: string;
      label: string;
      group: string;
      icon: LucideIcon;
      run: () => void;
    }
  | {
      kind: "action";
      id: string;
      label: string;
      group: string;
      icon: LucideIcon;
      run: () => void;
    }
  | {
      kind: "search";
      id: string;
      label: string;
      group: string;
      icon: LucideIcon;
      run: () => void;
    };

/**
 * Global search + command palette (⌘K / Ctrl+K).
 *
 * Navigation commands are derived from the single navigation model; actions
 * (theme toggle, keyboard shortcuts, sign out) are integration points for
 * future commands. Keyboard: ↑↓ to move, Enter to run, Esc to close.
 */
export function CommandPalette({ open, onOpenChange, onOpenShortcuts }: CommandPaletteProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useAppTheme();
  const logout = useLogoutMutation();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useLocalStorage<string[]>(
    "shell.recent-searches",
    []
  );
  const online = useOnlineStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const config = getConfig();
  const composition = getAppComposition();
  const searchQuery = useGlobalSearch(
    { query, limit: 12 },
    { search: composition.search, notifications: composition.notifications }
  );

  // Global ⌘K / Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // Focus the input whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const nav = getVisibleNavGroups(config, user)
      .flatMap((group) => group.items)
      .map<Command>((item) => ({
        kind: "navigation",
        id: item.href,
        label: t(item.labelKey),
        group: t("shell.commands.navigation"),
        icon: item.icon,
        run: () => {
          onOpenChange(false);
          router.push(item.href);
        }
      }));

    const actions: Command[] = [
      {
        kind: "action",
        id: "action:theme",
        label: t("shell.commands.theme"),
        group: t("shell.commands.actions"),
        icon: resolvedTheme === "dark" ? Sun : Moon,
        run: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
          onOpenChange(false);
        }
      },
      {
        kind: "action",
        id: "action:shortcuts",
        label: t("shell.help.shortcuts"),
        group: t("shell.commands.actions"),
        icon: SunMoon,
        run: () => {
          onOpenChange(false);
          onOpenShortcuts();
        }
      },
      {
        kind: "action",
        id: "action:signout",
        label: t("shell.signOut"),
        group: t("shell.commands.actions"),
        icon: CornerDownLeft,
        run: () => {
          onOpenChange(false);
          logout.mutate();
        }
      }
    ];

    const recent: Command[] = recentSearches.map((term) => ({
      kind: "action",
      id: `recent:${term}`,
      label: term,
      group: t("shell.search.recent"),
      icon: Search,
      run: () => setQuery(term)
    }));
    const results: Command[] = (searchQuery.data?.groups ?? []).flatMap((group) =>
      group.results.map((result: SearchResult) => ({
        kind: "search" as const,
        id: `result:${result.type}:${result.id}`,
        label: result.title,
        group: t("shell.search.results"),
        icon: resultIcon[result.type] ?? Search,
        run: () => {
          setRecentSearches((existing) =>
            [query, ...existing.filter((term) => term !== query)].slice(0, 5)
          );
          onOpenChange(false);
          router.push(result.href);
        }
      }))
    );

    return [...(query.trim() ? nav : recent), ...results, ...(query.trim() ? actions : [])];
  }, [
    config,
    user,
    t,
    router,
    onOpenChange,
    resolvedTheme,
    setTheme,
    logout,
    onOpenShortcuts,
    recentSearches,
    searchQuery.data,
    query,
    setRecentSearches
  ]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(needle));
  }, [commands, query]);

  const scrollActiveIntoView = useCallback(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const runActive = useCallback(() => {
    const command = filtered[activeIndex];
    if (command) command.run();
  }, [filtered, activeIndex]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)));
      scrollActiveIntoView();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      scrollActiveIntoView();
    } else if (event.key === "Enter") {
      event.preventDefault();
      runActive();
    }
  };

  const groups = useMemo(() => {
    const order: string[] = [];
    for (const command of filtered) {
      if (!order.includes(command.group)) order.push(command.group);
    }
    return order;
  }, [filtered]);

  let globalIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[18%] w-full max-w-xl translate-y-0 p-0"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{t("shell.commandPalette")}</DialogTitle>

        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("shell.searchPlaceholder")}
            aria-label={t("shell.search")}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={
              filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined
            }
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label={t("shell.commandPalette")}
          className="max-h-80 overflow-y-auto p-2"
        >
          {query.trim().length >= 2 && searchQuery.isPending ? (
            <div
              className="space-y-3 px-3 py-8 text-center"
              aria-live="polite"
              aria-busy="true"
              role="status"
            >
              <Search
                className="mx-auto size-5 animate-pulse text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">{t("shell.search.loading")}</p>
            </div>
          ) : query.trim().length >= 2 &&
            searchQuery.isError &&
            isApiError(searchQuery.error) &&
            searchQuery.error.code === ApiErrorCode.UNAVAILABLE ? (
            <EmptyState
              title={t("shell.search.unavailable")}
              description={t("shell.search.unavailableHint")}
            />
          ) : query.trim().length >= 2 && searchQuery.isError && !online ? (
            <EmptyState
              title={t("shell.search.offline")}
              description={t("shell.search.unavailableHint")}
            />
          ) : query.trim().length >= 2 && searchQuery.isError ? (
            <EmptyState
              title={t("shell.search.error")}
              action={
                <Button variant="outline" size="sm" onClick={() => void searchQuery.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={t("shell.commands.noResults", { query })}
              description={t("shell.commands.hint")}
            />
          ) : (
            groups.map((group) => (
              <div key={group} role="presentation">
                <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{group}</p>
                {filtered.map((command) => {
                  if (command.group !== group) return null;
                  globalIndex += 1;
                  const index = globalIndex;
                  const Icon = command.icon;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      id={`command-${command.id}`}
                      data-command-index={index}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={command.run}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "bg-accent text-accent-foreground" : "text-foreground/90"
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.kind === "navigation" ? (
                        <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                          ↵
                        </kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1">↑↓</kbd> {t("shell.commands.navigation")}
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1">↵</kbd> {t("common.results")}
          </span>
          <Button
            asChild
            variant="link"
            size="sm"
            className="ml-auto h-auto p-0 text-[11px]"
            onClick={onOpenShortcuts}
          >
            <span>{t("shell.help.shortcuts")}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
