/**
 * SDK-only type definitions.
 *
 * Types that exist only in the SDK layer (not shared with the server).
 * API types (BrowseRequest, Tool, etc.) live in api-types.ts.
 *
 * @module webuplink/types
 */

import type { BrowseRequest } from './api-types.js';

/** Parsed from X-Usage-* response headers. Attached to browse responses as `_usage`. */
export interface UsageInfo {
  /** Total actions consumed in the current billing period. */
  actionCount: number;
  /** Maximum actions allowed in the current billing period. */
  actionLimit: number;
  /** Start of the current billing period (ISO 8601). */
  periodStart: string;
}

/** Options for constructing a WebUplink client. */
export interface WebUplinkOptions {
  /**
   * WebUplink API key (e.g. "wup_...").
   *
   * Falls back to the `WEBUPLINK_API_KEY` environment variable if not provided.
   */
  apiKey?: string;
  /**
   * Base URL of the WebUplink API.
   *
   * @default "https://api.webuplink.ai"
   */
  baseUrl?: string;
  /** Maximum retry attempts for retryable errors. Set to 0 to disable. Default: 3. */
  maxRetries?: number;
  /** Set to false to disable all retries. Equivalent to maxRetries: 0. */
  retry?: boolean;
  /** Custom fetch implementation for logging, proxying, or testing. Defaults to global fetch. */
  fetch?: typeof fetch;
}

/**
 * Browse request options (object form).
 *
 * All fields are optional at the SDK layer — the server validates
 * constraints (e.g. url OR session_id must be provided).
 */
export type BrowseOptions = Partial<BrowseRequest>;
