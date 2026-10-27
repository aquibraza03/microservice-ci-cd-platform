import { AxiosError, type AxiosResponse } from "axios";
import { ApiErrorCode, type ApiError } from "@saas/types";
import { isRecord } from "@saas/utils";

/** User-friendly default message per error code. */
const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  [ApiErrorCode.NETWORK]: "Unable to reach the server. Check your connection and try again.",
  [ApiErrorCode.TIMEOUT]: "The request timed out. Please try again.",
  [ApiErrorCode.ABORTED]: "The request was aborted.",
  [ApiErrorCode.UNAUTHORIZED]: "Your session has expired. Please sign in again.",
  [ApiErrorCode.FORBIDDEN]: "You do not have permission to perform this action.",
  [ApiErrorCode.NOT_FOUND]: "The requested resource was not found.",
  [ApiErrorCode.VALIDATION]: "The submitted data is invalid.",
  [ApiErrorCode.CONFLICT]: "The request conflicts with the current state of the resource.",
  [ApiErrorCode.SERVER]: "Something went wrong on the server. Please try again later.",
  [ApiErrorCode.TOKEN_EXPIRED]: "Your session has expired. Please sign in again.",
  [ApiErrorCode.TOKEN_REFRESH_FAILED]: "Unable to refresh your session. Please sign in again.",
  [ApiErrorCode.UNAVAILABLE]: "This capability is not available in the current environment.",
  [ApiErrorCode.UNKNOWN]: "An unexpected error occurred."
};

function statusToCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return ApiErrorCode.VALIDATION;
    case 401:
      return ApiErrorCode.UNAUTHORIZED;
    case 403:
      return ApiErrorCode.FORBIDDEN;
    case 404:
      return ApiErrorCode.NOT_FOUND;
    case 405:
    case 501:
    case 503:
      return ApiErrorCode.UNAVAILABLE;
    case 409:
      return ApiErrorCode.CONFLICT;
    default:
      return status >= 500 ? ApiErrorCode.SERVER : ApiErrorCode.UNKNOWN;
  }
}

/** Extract a human message from a response body without trusting its shape. */
function messageFromBody(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const message = data.message ?? data.error;
  if (typeof message === "string" && message.length > 0) return message;
  return null;
}

/**
 * Normalize ANY thrown value into the unified `ApiError` contract.
 * All request failures surface as `ApiError` — never raw Axios errors.
 */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;

  if (error instanceof AxiosError) {
    if (error.code === "ERR_CANCELED" || error.code === "ECONNABORTED") {
      return {
        code: ApiErrorCode.ABORTED,
        message: DEFAULT_MESSAGES[ApiErrorCode.ABORTED],
        status: null,
        cause: error
      };
    }

    const response: AxiosResponse | undefined = error.response;
    if (response) {
      const status = response.status;
      const code = statusToCode(status);
      return {
        code,
        message: messageFromBody(response.data) ?? DEFAULT_MESSAGES[code],
        status,
        details: isRecord(response.data) ? (response.data as Record<string, unknown>) : undefined,
        cause: error
      };
    }

    if (error.code === "ECONNABORTED") {
      return {
        code: ApiErrorCode.TIMEOUT,
        message: DEFAULT_MESSAGES[ApiErrorCode.TIMEOUT],
        status: null,
        cause: error
      };
    }

    return {
      code: ApiErrorCode.NETWORK,
      message: DEFAULT_MESSAGES[ApiErrorCode.NETWORK],
      status: null,
      cause: error
    };
  }

  if (error instanceof Error) {
    return {
      code: ApiErrorCode.UNKNOWN,
      message: error.message || DEFAULT_MESSAGES[ApiErrorCode.UNKNOWN],
      status: null,
      cause: error
    };
  }

  return {
    code: ApiErrorCode.UNKNOWN,
    message: DEFAULT_MESSAGES[ApiErrorCode.UNKNOWN],
    status: null,
    cause: error
  };
}

export function isApiError(error: unknown): error is ApiError {
  return isRecord(error) && typeof error.code === "string" && typeof error.message === "string";
}
