/**
 * webuplink — Official TypeScript SDK for WebUplink.
 *
 * @example
 * ```typescript
 * import { WebUplink } from 'webuplink';
 *
 * const client = new WebUplink({
 *   apiKey: 'wup_your_api_key',
 *   baseUrl: 'https://api.webuplink.ai',
 * });
 *
 * const page = await client.browse('https://example.com');
 * console.log(page.tools);
 * ```
 *
 * @module webuplink
 */

// ── Client ──────────────────────────────────────────────────────

export { WebUplink } from './client.js';
export type { BrowseResult } from './client.js';

// ── Errors ──────────────────────────────────────────────────────

export {
  WebUplinkError,
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
} from './errors.js';

// ── SDK-only Types ──────────────────────────────────────────────

export type { UsageInfo, WebUplinkOptions, BrowseOptions } from './types.js';

// ── API Types ───────────────────────────────────────────────────
// Standalone type definitions for the WebUplink REST API.

export type {
  Tool,
  ToolParam,
  ToolResult,
  ToolResultCode,
  BrowseEvent,
  BrowseRequest,
  BrowseResponse,
  HealthChecks,
  HealthResponse,
  QuotaUpgradeCta,
  ErrorResponse,
  ErrorCode,
  UsageResponse,
} from './api-types.js';
