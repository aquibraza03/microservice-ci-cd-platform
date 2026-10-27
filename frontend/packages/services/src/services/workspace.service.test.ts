import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorCode } from "@saas/types";
import { createNotificationService, createSearchService } from "./workspace.service";
import type { HttpClient } from "../http";
import type { AppConfig } from "@saas/lib";

const config = {
  api: { baseUrl: "https://api.example.test", timeoutMs: 1000, retries: 0 },
  search: { endpoint: "" },
  notifications: { list: "", read: "", readAll: "" }
} as unknown as AppConfig;

describe("workspace services", () => {
  const http = { get: vi.fn(), post: vi.fn() } as unknown as HttpClient;

  beforeEach(() => vi.clearAllMocks());

  it("reports search as unavailable without calling HTTP", async () => {
    await expect(createSearchService(http, config).search({ query: "api" })).rejects.toMatchObject({
      code: ApiErrorCode.UNAVAILABLE
    });
    expect(http.get).not.toHaveBeenCalled();
  });

  it("reports notification mutations as unavailable without calling HTTP", async () => {
    const service = createNotificationService(http, config);
    await expect(service.list()).rejects.toMatchObject({ code: ApiErrorCode.UNAVAILABLE });
    await expect(service.markAsRead("notification-1")).rejects.toMatchObject({
      code: ApiErrorCode.UNAVAILABLE
    });
    await expect(service.markAllAsRead()).rejects.toMatchObject({ code: ApiErrorCode.UNAVAILABLE });
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });
});
