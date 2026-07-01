/**
 * Typed error classes for WebUplink API errors.
 *
 * All non-2xx responses from the API are thrown as WebUplinkError instances
 * (or a subclass), preserving the machine-readable error code, HTTP status,
 * and request ID for support correlation.
 *
 * Subclasses provide convenient catch targets for the most common patterns:
 *   - AuthenticationError (401)
 *   - RateLimitError (429)
 *   - APIConnectionError (network/transport failures)
 *
 * @module webuplink/errors
 */

import type { ErrorCode } from './api-types.js';

/** Error thrown by the WebUplink SDK for all API errors. */
export class WebUplinkError extends Error {
  /** Machine-readable error code (e.g. "QUOTA_EXCEEDED", "SESSION_NOT_FOUND"). */
  readonly code: ErrorCode | string;
  /** HTTP status code from the API response. */
  readonly statusCode: number;
  /** Unique request ID from x-request-id header — use for support tickets. */
  readonly requestId: string;
  /** Whether this error is safe to retry automatically. */
  readonly retryable: boolean;
  /** Seconds to wait before retrying (from retry_after in response body). */
  readonly retryAfter?: number;
  /** Additional error details from the API response. */
  readonly details?: unknown;

  constructor(options: {
    code: string;
    message: string;
    statusCode: number;
    requestId: string;
    retryable?: boolean;
    retryAfter?: number;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'WebUplinkError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
  }
}

/** Constructor options type for WebUplinkError (used by subclasses). */
type WebUplinkErrorOptions = ConstructorParameters<typeof WebUplinkError>[0];

/** Thrown on 401 Unauthorized — invalid or missing API key. */
export class AuthenticationError extends WebUplinkError {
  constructor(options: WebUplinkErrorOptions) {
    super(options);
    this.name = 'AuthenticationError';
  }
}

/** Thrown on 429 Too Many Requests — rate limited or quota exceeded. */
export class RateLimitError extends WebUplinkError {
  constructor(options: WebUplinkErrorOptions) {
    super(options);
    this.name = 'RateLimitError';
  }
}

/** Thrown when the SDK cannot reach the API (network/transport failure). */
export class APIConnectionError extends WebUplinkError {
  constructor(message: string, options?: { cause?: Error }) {
    super({
      code: 'CONNECTION_ERROR',
      message,
      statusCode: 0,
      requestId: 'unknown',
      retryable: true,
    });
    this.name = 'APIConnectionError';
    this.cause = options?.cause;
  }
}
