import type { AppConfig } from "@saas/lib";
import {
  ApiErrorCode,
  NotificationPageSchema,
  SearchResponseSchema,
  type NotificationPage,
  type SearchResponse
} from "@saas/types";
import type { HttpClient } from "../http";
import { resolveUrl } from "../url";

export type SearchParams = { query: string; types?: string[]; limit?: number };
export type NotificationParams = { page?: number; pageSize?: number; unreadOnly?: boolean };

export interface SearchService {
  search(params: SearchParams): Promise<SearchResponse>;
}

export interface NotificationService {
  list(params?: NotificationParams): Promise<NotificationPage>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(): Promise<void>;
}

async function unavailable(capability: string): Promise<never> {
  const error = new Error(`${capability} is not configured.`) as Error & { code: ApiErrorCode };
  error.code = ApiErrorCode.UNAVAILABLE;
  throw error;
}

export function createSearchService(http: HttpClient, config: AppConfig): SearchService {
  return {
    search: (params) => {
      if (!config.search.endpoint) return unavailable("Global search");
      return http.get<SearchResponse>(resolveUrl(config.api.baseUrl, config.search.endpoint), {
        params: { q: params.query, types: params.types?.join(","), limit: params.limit },
        schema: SearchResponseSchema
      });
    }
  };
}

export function createNotificationService(
  http: HttpClient,
  config: AppConfig
): NotificationService {
  return {
    list: (params) => {
      if (!config.notifications.list) return unavailable("Notifications");
      return http.get<NotificationPage>(resolveUrl(config.api.baseUrl, config.notifications.list), {
        params,
        schema: NotificationPageSchema
      });
    },
    markAsRead: (id) => {
      if (!config.notifications.read) return unavailable("Mark notification as read");
      return http.post<void>(
        resolveUrl(config.api.baseUrl, config.notifications.read.replace("{id}", id))
      );
    },
    markAllAsRead: () => {
      if (!config.notifications.readAll) return unavailable("Mark all notifications as read");
      return http.post<void>(resolveUrl(config.api.baseUrl, config.notifications.readAll));
    }
  };
}
