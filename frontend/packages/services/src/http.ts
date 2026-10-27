import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import type { z } from "zod";
import { validateResponse } from "./validate";

/** Request options with optional response validation. */
export type RequestOptions<T = unknown> = AxiosRequestConfig & {
  schema?: z.ZodType<T, any, any>;
};

async function unwrap<T>(
  promise: Promise<AxiosResponse<unknown>>,
  schema?: z.ZodType<T, any, any>
): Promise<T> {
  const response = await promise;
  return schema ? validateResponse<T>(schema, response.data) : (response.data as T);
}

/**
 * Typed HTTP client on top of the configured Axios instance.
 * Components and features never call Axios or fetch directly; they use the
 * typed services built on this client.
 */
export class HttpClient {
  constructor(private readonly client: AxiosInstance) {}

  get<T>(url: string, options?: RequestOptions<T>): Promise<T> {
    return unwrap<T>(this.client.get(url, options), options?.schema);
  }

  post<T>(url: string, data?: unknown, options?: RequestOptions<T>): Promise<T> {
    return unwrap<T>(this.client.post(url, data, options), options?.schema);
  }

  put<T>(url: string, data?: unknown, options?: RequestOptions<T>): Promise<T> {
    return unwrap<T>(this.client.put(url, data, options), options?.schema);
  }

  patch<T>(url: string, data?: unknown, options?: RequestOptions<T>): Promise<T> {
    return unwrap<T>(this.client.patch(url, data, options), options?.schema);
  }

  delete<T>(url: string, options?: RequestOptions<T>): Promise<T> {
    return unwrap<T>(this.client.delete(url, options), options?.schema);
  }

  head(url: string, options?: RequestOptions<void>): Promise<void> {
    return this.client.head(url, options).then(() => undefined);
  }

  /** Access the underlying instance (rarely needed; for escape hatches only). */
  raw(): AxiosInstance {
    return this.client;
  }
}
