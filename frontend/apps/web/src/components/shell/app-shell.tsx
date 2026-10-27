"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Command,
  HelpCircle,
  Keyboard,
  LogOut,
  Menu,
  Palette,
  Rocket,
  Search,
  Settings2,
  UserRound,
  X
} from "lucide-react";
import { useAuth, useLogoutMutation } from "@saas/features/auth";
import { useActiveOrganization } from "@saas/features/platform";
import { ThemeToggle } from "@saas/features/theme";
import { useI18n } from "@saas/intl";
import { getConfig } from "@saas/lib";
import { getAppComposition } from "@/lib/composition";
import {
  Avatar,
  AvatarFallback,
  Breadcrumbs,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Separator,
  TooltipProvider
} from "@saas/ui";
import { cn } from "@saas/utils";
import { navGroups, type NavItem } from "./nav-items";
import { canViewItem } from "./nav-visibility";
import { useAppBreadcrumbs } from "./use-app-breadcrumbs";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts";
import { NotificationCenter } from "./notification-center";

function AppBrand() {
  const config = getConfig();
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Command className="size-4" aria-hidden="true" />
      </span>
      <span className="truncate">{config.name}</span>
    </Link>
  );
}

function SidebarNavItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80"
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

function SidebarContent({
  onNavigate,
  showBrand = true
}: {
  onNavigate?: () => void;
  showBrand?: boolean;
}) {
  const { user } = useAuth();
  const config = getConfig();
  const { t } = useI18n();
  const logout = useLogoutMutation();

  return (
    <div className="flex h-full flex-col">
      {showBrand ? (
        <div className="flex h-16 items-center px-4">
          <AppBrand />
        </div>
      ) : null}
      <Separator />
      <nav aria-label={t("shell.sidebar")} className="flex-1 space-y-5 overflow-y-auto p-3">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => canViewItem(item, config, user));
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.id}>
              <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {t(group.labelKey)}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <SidebarNavItem key={item.href} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <Separator />
      <div className="p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <Avatar className="size-9">
            <AvatarFallback>{initials(user?.name ?? user?.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name ?? t("common.user")}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{user?.email}</p>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between px-2">
          <span className="text-xs text-sidebar-foreground/60">{t("shell.workspace")}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => logout.mutate()}
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            {t("shell.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HeaderActions() {
  const { t } = useI18n();
  const { user } = useAuth();
  const logout = useLogoutMutation();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="hidden w-56 justify-start gap-2 text-muted-foreground md:flex"
        onClick={() => setPaletteOpen(true)}
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="flex-1 truncate text-left">{t("shell.search")}</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setPaletteOpen(true)}
        aria-label={t("shell.search")}
      >
        <Search aria-hidden="true" />
      </Button>

      <NotificationCenter />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("shell.help")}>
            <HelpCircle aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>{t("shell.help")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
            <Keyboard aria-hidden="true" />
            {t("shell.help.shortcuts")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/observability">
              <Rocket aria-hidden="true" />
              {t("shell.help.systemStatus")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setPaletteOpen(true)}>
            <Command aria-hidden="true" />
            {t("shell.commandPalette")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={t("shell.profile")}
          >
            <Avatar className="size-8">
              <AvatarFallback>{initials(user?.name ?? user?.email)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="font-semibold text-foreground">{user?.name ?? t("common.user")}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user?.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <UserRound aria-hidden="true" />
              {t("shell.profile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings2 aria-hidden="true" />
              {t("shell.account")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Palette aria-hidden="true" />
              {t("theme.toggle.default")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShortcutsOpen(true)}>
            <Keyboard aria-hidden="true" />
            {t("shell.help.shortcuts")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/observability">
              <HelpCircle aria-hidden="true" />
              {t("shell.help")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout.mutate()}>
            <LogOut aria-hidden="true" />
            {t("shell.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

/** Org/workspace placeholder menu. */
function WorkspaceMenu() {
  const config = getConfig();
  const { t } = useI18n();
  const composition = getAppComposition();
  const organization = useActiveOrganization({
    controlPlane: config.dashboard.source === "http" ? composition.controlPlane : undefined,
    search: composition.search,
    notifications: composition.notifications
  });
  const label =
    organization.organization?.displayName ?? organization.organization?.name ?? config.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-56">
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("shell.workspace")}</DropdownMenuLabel>
        {organization.data?.items.map((item) => (
          <DropdownMenuItem key={item.id} onClick={() => organization.selectOrganization(item.id)}>
            <span className="truncate">{item.displayName}</span>
          </DropdownMenuItem>
        ))}
        {organization.data?.items.length === 0 || organization.isError ? (
          <DropdownMenuItem disabled>
            <span className="truncate">{config.name}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <div className="px-2 py-2">
          <EmptyState title={t("shell.workspaceEmpty")} className="py-4" />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type AppShellProps = {
  children: ReactNode;
};

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.split(/[.\s_]/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const second = parts[1]?.charAt(0) ?? "";
  return (first + second).toUpperCase() || "?";
}

/**
 * Authenticated application shell: grouped sidebar, header with breadcrumbs,
 * global search, notifications/help/profile menus, org placeholder, theme
 * switcher, and the command palette. Chrome only — no business logic.
 */
export function AppShell({ children }: AppShellProps) {
  const { t } = useI18n();
  const breadcrumbs = useAppBreadcrumbs();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
        >
          {t("shell.skipToContent")}
        </a>

        <aside className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
          <SidebarContent />
        </aside>

        {mobileNavOpen ? (
          <div
            className="fixed inset-0 z-40 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t("shell.menu")}
          >
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 left-0 w-72 border-r bg-sidebar text-sidebar-foreground shadow-xl">
              <div className="flex h-16 items-center justify-end px-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label={t("shell.closeSidebar")}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} showBrand={false} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileNavOpen(true)}
                aria-label={t("shell.openSidebar")}
              >
                <Menu aria-hidden="true" />
              </Button>
              <div className="hidden lg:block">
                <WorkspaceMenu />
              </div>
              <Breadcrumbs
                items={breadcrumbs}
                label={t("shell.breadcrumbs")}
                className="min-w-0 overflow-hidden"
              />
            </div>
            <HeaderActions />
          </header>
          <main className="flex-1 p-4 sm:p-6" id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
