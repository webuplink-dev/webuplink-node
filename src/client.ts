/**
 * WebUplink SDK client.
 *
 * Provides a type-safe interface to the WebUplink API with:
 * - String overload for quick browse calls
 * - Idempotency-aware retry (only retries safe operations)
 * - Usage tracking via response headers
 * - Custom fetch support for middleware/logging
 *
 * @module webuplink/client
 */

import type { BrowseResponse, HealthResponse, UsageResponse } from './api-types.js';
import { WebUplinkError, AuthenticationError, RateLimitError, APIConnectionError } from './errors.js';
import type { WebUplinkOptions, BrowseOptions, UsageInfo } from './types.js';

const DEFAULT_BASE_URL = 'https://api.webuplink.ai';
const ENV_API_KEY = 'WEBUPLINK_API_KEY';
const SDK_VERSION = '0.1.1';
const USER_AGENT = `webuplink-node/${SDK_VERSION}`;
const DEFAULT_RETRY_DELAY_S = 5;

// ── Response with Usage Metadata ────────────────────────────────

/** Browse response enriched with usage metadata from response headers. */
export type BrowseResult = BrowseResponse & {
  /** Usage info parsed from X-Usage-* response headers. */
  _usage?: UsageInfo;
};

// ── Client ──────────────────────────────────────────────────────

export class WebUplink {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly _fetch: typeof fetch;

  constructor(options: WebUplinkOptions = {}) {
    // Resolve API key: explicit > environment variable
    const resolvedKey = options.apiKey ?? (typeof process !== 'undefined' ? process.env?.[ENV_API_KEY] : undefined);
    if (!resolvedKey) {
      throw new WebUplinkError({
        code: 'MISSING_API_KEY',
        message: `No API key provided. Pass apiKey to the constructor or set the ${ENV_API_KEY} environment variable.`,
        statusCode: 0,
        requestId: 'local',
      });
    }

    this.apiKey = resolvedKey;
    // Normalize: strip trailing slash; default to production API
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');

    // Retry configuration
    if (options.retry === false) {
      this.maxRetries = 0;
    } else {
      this.maxRetries = options.maxRetries ?? 3;
    }

    this._fetch = options.fetch ?? globalThis.fetch;
  }

  // ── browse() ────────────────────────────────────────────────

  /**
   * Browse a page or execute tools on a page.
   *
   * @param urlOrOptions - URL string (opens new session) or options object.
   * @returns Browse response with tools, summary, and optional results.
   *
   * @example
   * ```typescript
   * // String shorthand — opens new session
   * const page = await client.browse('https://example.com');
   *
   * // Object form — execute a tool on existing session
   * const result = await client.browse({
   *   session_id: page.session_id,
   *   tool: 'search',
   *   params: { query: 'hello' },
   * });
   * ```
   */
  async browse(urlOrOptions: string | BrowseOptions): Promise<BrowseResult> {
    const body: BrowseOptions = typeof urlOrOptions === 'string'
      ? { url: urlOrOptions }
      : urlOrOptions;

    // Determine if this request involves tool execution (non-idempotent)
    const hasTools = !!(body.tool || body.tools);

    const response = await this.request('POST', '/v1/browse', body, {
      retryable: !hasTools,  // Only retry observe-only requests
    });

    const data = await response.json() as BrowseResponse;
    const result: BrowseResult = { ...data };
    const usage = this.parseUsageHeaders(response);
    if (usage) result._usage = usage;
    return result;
  }

  // ── closeSession() ──────────────────────────────────────────

  /**
   * Close a browser session.
   *
   * Sessions auto-expire after 2 minutes of inactivity, but explicit
   * cleanup is recommended to free resources immediately.
   *
   * @param sessionId - Session ID to close.
   */
  async closeSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/v1/session/${encodeURIComponent(sessionId)}`);
  }

  // ── health() ────────────────────────────────────────────────

  /**
   * Check API server health.
   *
   * @returns Health status including uptime and active session count.
   */
  async health(): Promise<HealthResponse> {
    const response = await this.request('GET', '/health');
    return response.json() as Promise<HealthResponse>;
  }

  // ── getUsage() ──────────────────────────────────────────────

  /**
   * Get current usage and billing information.
   *
   * Returns exact cross-instance usage for the authenticated tenant.
   * Requires a full API key (playground tokens cannot access this endpoint).
   *
   * @returns Usage data including plan, action counts, billing period, and subscription status.
   */
  async getUsage(): Promise<UsageResponse> {
    const response = await this.request('GET', '/v1/usage');
    return response.json() as Promise<UsageResponse>;
  }

  // ── Internal: HTTP request with retry ─────────────────────

  private async request(
    method: string,
    path: string,
    body?: unknown,
    options?: { retryable?: boolean },
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'User-Agent': USER_AGENT,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const init: RequestInit = {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    };

    let lastError: WebUplinkError | undefined;
    const maxAttempts = 1 + this.maxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this._fetch(url, init);

        if (response.ok) {
          return response;
        }

        // Parse error response
        const errorData = await this.parseErrorResponse(response);

        // Determine if retryable
        const isRetryableError = errorData.retryable &&
          (options?.retryable !== false) &&  // Caller says it's safe
          attempt < maxAttempts;

        if (isRetryableError) {
          lastError = errorData;
          const waitMs = (errorData.retryAfter ?? DEFAULT_RETRY_DELAY_S) * 1000;
          await this.sleep(waitMs);
          continue;
        }

        throw errorData;
      } catch (error) {
        // Re-throw SDK errors from parseErrorResponse (already handled above)
        if (error instanceof WebUplinkError) {
          throw error;
        }

        // Wrap raw network/transport errors in APIConnectionError so that
        // every error thrown by the SDK is a WebUplinkError subclass.
        const connError = new APIConnectionError(
          (error as Error).message,
          { cause: error as Error },
        );

        // Network errors are safe to retry regardless of idempotency
        // (the request never reached the server)
        if (attempt < maxAttempts) {
          lastError = connError;
          await this.sleep(1000 * attempt);  // Linear backoff
          continue;
        }

        throw connError;
      }
    }

    // Exhausted all retries on connection errors
    throw lastError!;
  }

  // ── Internal: Error parsing ───────────────────────────────

  private async parseErrorResponse(response: Response): Promise<WebUplinkError> {
    const requestId = response.headers.get('x-request-id') ?? 'unknown';

    try {
      const data = await response.json() as {
        error?: string;
        message?: string;
        retry_after?: number;
        details?: unknown;
      };

      // Determine retryability from the server's retry_after field.
      // Transient failures (BROWSER_ERROR, AI_PROCESSING_ERROR, capacity
      // 503s, retryable INTERNAL_ERRORs) carry retry_after; terminal ones
      // (SITE_BLOCKED) don't — so retry_after presence IS the signal.
      // 429s (RATE_LIMITED / QUOTA_EXCEEDED) also carry retry_after,
      // but auto-retrying a throttle just amplifies load — never retry them.
      const retryable =
        response.status !== 429 && data.retry_after != null && data.retry_after > 0;

      const errorOptions = {
        code: data.error ?? 'INTERNAL_ERROR',
        message: data.message ?? response.statusText,
        statusCode: response.status,
        requestId,
        retryable,
        retryAfter: data.retry_after,
        details: data.details,
      };

      return this.createErrorFromStatus(response.status, errorOptions);
    } catch {
      // Non-JSON error response (e.g. 502 from load balancer)
      return this.createErrorFromStatus(response.status, {
        code: 'INTERNAL_ERROR',
        message: response.statusText || `HTTP ${response.status}`,
        statusCode: response.status,
        requestId,
      });
    }
  }

  /** Map HTTP status to the most specific error subclass. */
  private createErrorFromStatus(
    status: number,
    options: ConstructorParameters<typeof WebUplinkError>[0],
  ): WebUplinkError {
    if (status === 401) return new AuthenticationError(options);
    if (status === 429) return new RateLimitError(options);
    return new WebUplinkError(options);
  }

  // ── Internal: Usage header parsing ────────────────────────

  private parseUsageHeaders(response: Response): UsageInfo | undefined {
    const count = response.headers.get('x-usage-action-count');
    const limit = response.headers.get('x-usage-action-limit');
    const period = response.headers.get('x-usage-period-start');

    if (!count || !limit || !period) return undefined;

    return {
      actionCount: parseInt(count, 10),
      actionLimit: parseInt(limit, 10),
      periodStart: period,
    };
  }

  // ── Internal: Sleep ───────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
