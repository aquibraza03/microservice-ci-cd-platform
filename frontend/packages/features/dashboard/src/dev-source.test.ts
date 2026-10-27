import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceContainer } from "@saas/services";
import { createDashboardDataSource } from "./data-source";
import { createDevDataSource } from "./dev-source";

const NOW = new Date("2026-08-13T12:00:00.000Z").getTime();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createDevDataSource", () => {
  it("produces a deterministic, well-shaped dataset", async () => {
    const source = createDevDataSource(NOW);
    expect(source.isSample).toBe(true);

    const metrics = await source.getMetrics("7d");
    expect(metrics.range).toBe("7d");
    expect(metrics.metrics.length).toBeGreaterThanOrEqual(4);
    for (const metric of metrics.metrics) {
      expect(metric.id.length).toBeGreaterThan(0);
      expect(typeof metric.value).toBe("number");
    }

    const runs = await source.getPipelineRuns({ limit: 20 });
    expect(runs.items.length).toBe(20);
    const allowed = new Set(["queued", "running", "succeeded", "failed", "cancelled", "skipped"]);
    for (const run of runs.items) {
      expect(allowed.has(run.status)).toBe(true);
      expect(run.id).toBeTruthy();
      expect(Number.isNaN(Date.parse(run.startedAt))).toBe(false);
    }

    const health = await source.getSystemHealth();
    expect(health.services.length).toBeGreaterThan(0);
    expect(["operational", "degraded", "partial", "outage", "unknown"]).toContain(health.status);

    const projects = await source.listProjects({ page: 1, pageSize: 10 });
    expect(projects.items.length).toBe(10);
    expect(projects.pagination.totalItems).toBeGreaterThanOrEqual(10);
  });

  it("filters projects by search and status", async () => {
    const source = createDevDataSource(NOW);
    const search = await source.listProjects({ search: "identity", pageSize: 50 });
    expect(search.items.every((p) => p.name.toLowerCase().includes("identity"))).toBe(true);

    const archived = await source.listProjects({ status: "archived", pageSize: 50 });
    expect(archived.items.every((p) => p.status === "archived")).toBe(true);
    expect(archived.items.length).toBeGreaterThan(0);
  });

  it("resolves project details and rejects unknown ids", async () => {
    const source = createDevDataSource(NOW);
    const detail = await source.getProject("prj-001");
    expect(detail.name).toBeTruthy();
    expect(detail.environments.length).toBeGreaterThan(0);
    await expect(source.getProject("prj-999")).rejects.toThrow();
  });

  it("is forbidden in production builds", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createDevDataSource(NOW)).toThrow(/production/);
  });
});

describe("createDashboardDataSource", () => {
  const httpStub = {} as unknown as Pick<ServiceContainer, "dashboard" | "projects">;

  it("selects the http source for the default configuration", () => {
    const source = createDashboardDataSource("http", httpStub);
    expect(source.isSample).toBe(false);
  });

  it("selects the dev source for the dev configuration", () => {
    const source = createDashboardDataSource("dev", httpStub);
    expect(source.isSample).toBe(true);
  });
});
