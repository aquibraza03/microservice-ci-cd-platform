import {
  BellRing,
  Boxes,
  Bug,
  ChartNoAxesCombined,
  ClipboardCheck,
  Container,
  FileStack,
  FolderKanban,
  GitBranch,
  Globe,
  Layers,
  LayoutDashboard,
  ListChecks,
  Package,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  Users,
  UsersRound,
  Waypoints
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MessageKey } from "@saas/intl";

/** Feature flags recognised by the configuration surface. */
export type FeatureFlag =
  | "registry"
  | "observability"
  | "ciCd"
  | "pipelines"
  | "deployments"
  | "repositories"
  | "environments"
  | "containers"
  | "infrastructure"
  | "logs"
  | "traces"
  | "alerts"
  | "security"
  | "vulnerabilities"
  | "sbom"
  | "compliance"
  | "users"
  | "teams"
  | "settings";

export type NavItem = {
  /** i18n dictionary key rendered through `t()`. */
  labelKey: MessageKey;
  href: string;
  icon: LucideIcon;
  /** Feature flag that must be enabled to show the item (null = always). */
  flag?: FeatureFlag | null;
  /** Permission required to see the item (null = any authenticated user). */
  permission?: string | null;
};

export type NavGroup = {
  id: string;
  /** i18n dictionary key for the group header. */
  labelKey: MessageKey;
  items: NavItem[];
};

/**
 * Authenticated navigation model — the single source of truth for the
 * sidebar, header breadcrumbs, and command palette.
 *
 * Sections are grouped by concern (Platform / Observability / Security /
 * Management). Items whose feature flag is off (or whose permission is not
 * granted) are hidden rather than shown as fake links; enabling the flag
 * together with the module's backend contract (see
 * `frontend/docs/API_CONTRACT.md`) reveals the section.
 */
export const navGroups: NavGroup[] = [
  {
    id: "platform",
    labelKey: "nav.groups.platform",
    items: [
      {
        labelKey: "nav.dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        flag: null,
        permission: null
      },
      {
        labelKey: "nav.projects",
        href: "/projects",
        icon: FolderKanban,
        flag: null,
        permission: null
      },
      {
        labelKey: "nav.repositories",
        href: "/repositories",
        icon: Boxes,
        flag: "repositories",
        permission: "repositories:read"
      },
      {
        labelKey: "nav.pipelines",
        href: "/pipelines",
        icon: GitBranch,
        flag: "pipelines",
        permission: "pipelines:read"
      },
      {
        labelKey: "nav.pipelineRuns",
        href: "/pipeline-runs",
        icon: ListChecks,
        flag: "pipelines",
        permission: "pipelines:read"
      },
      {
        labelKey: "nav.deployments",
        href: "/deployments",
        icon: Rocket,
        flag: "deployments",
        permission: "deployments:read"
      },
      {
        labelKey: "nav.environments",
        href: "/environments",
        icon: Globe,
        flag: "environments",
        permission: "environments:read"
      },
      {
        labelKey: "nav.docker",
        href: "/docker",
        icon: Container,
        flag: "containers",
        permission: "containers:read"
      },
      {
        labelKey: "nav.kubernetes",
        href: "/kubernetes",
        icon: Layers,
        flag: "infrastructure",
        permission: "infrastructure:read"
      },
      {
        labelKey: "nav.terraform",
        href: "/terraform",
        icon: FileStack,
        flag: "infrastructure",
        permission: "infrastructure:read"
      }
    ]
  },
  {
    id: "observability",
    labelKey: "nav.groups.observability",
    items: [
      {
        labelKey: "nav.monitoring",
        href: "/observability",
        icon: ChartNoAxesCombined,
        flag: "observability",
        permission: "observability:read"
      },
      {
        labelKey: "nav.logs",
        href: "/logs",
        icon: ScrollText,
        flag: "logs",
        permission: "logs:read"
      },
      {
        labelKey: "nav.traces",
        href: "/traces",
        icon: Waypoints,
        flag: "traces",
        permission: "traces:read"
      },
      {
        labelKey: "nav.alerts",
        href: "/alerts",
        icon: BellRing,
        flag: "alerts",
        permission: "alerts:read"
      }
    ]
  },
  {
    id: "security",
    labelKey: "nav.groups.security",
    items: [
      {
        labelKey: "nav.securityOverview",
        href: "/security",
        icon: Shield,
        flag: "security",
        permission: "security:read"
      },
      {
        labelKey: "nav.vulnerabilities",
        href: "/security/vulnerabilities",
        icon: Bug,
        flag: "vulnerabilities",
        permission: "security:read"
      },
      {
        labelKey: "nav.sbom",
        href: "/security/sbom",
        icon: Package,
        flag: "sbom",
        permission: "security:read"
      },
      {
        labelKey: "nav.compliance",
        href: "/security/compliance",
        icon: ClipboardCheck,
        flag: "compliance",
        permission: "security:read"
      }
    ]
  },
  {
    id: "management",
    labelKey: "nav.groups.management",
    items: [
      {
        labelKey: "nav.users",
        href: "/admin/users",
        icon: Users,
        flag: "users",
        permission: "admin:users:read"
      },
      {
        labelKey: "nav.teams",
        href: "/admin/teams",
        icon: UsersRound,
        flag: "teams",
        permission: "admin:teams:read"
      },
      {
        labelKey: "nav.settings",
        href: "/settings",
        icon: Settings,
        flag: "settings",
        permission: null
      }
    ]
  }
];

/** Flat list of every item (breadcrumbs, command palette). */
export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

/** Lookup by exact href. */
export const navItemByHref = new Map(navItems.map((item) => [item.href, item]));

/** The single navigation model groups + items. */
export function getNavGroups(): NavGroup[] {
  return navGroups;
}
