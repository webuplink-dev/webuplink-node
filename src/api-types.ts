/**
 * API types for the WebUplink REST API.
 *
 * These types define the shape of all API requests and responses.
 * They are maintained as standalone TypeScript interfaces so the
 * published npm package has zero external dependencies.
 *
 * @module webuplink/api-types
 */

// ── Tool Types ──────────────────────────────────────────────────

/** A single parameter accepted by a tool. */
export interface ToolParam {
  /** Machine-readable parameter name, e.g. "section", "query". */
  name: string;
  /** What values this parameter accepts. */
  description: string;
  /** Data type hint. Defaults to "string" if omitted. */
  type?: 'string' | 'number' | 'boolean';
  /** If present, the ONLY valid values for this param (from constrained controls). */
  enum?: string[];
  /** If true, this param is not required. Omitted means required. */
  optional?: boolean;
}

/** A callable tool discovered on a web page. */
export interface Tool {
  /** Machine-readable name, e.g. "search_hotels", "filter_by_price". */
  name: string;
  /** Human-readable description of what this tool does. */
  description: string;
  /** Parameter definitions for this tool. */
  params: ToolParam[];
}

/** Stable machine-readable outcome code for a tool execution. */
export type ToolResultCode =
  | 'TOOL_NOT_EXECUTABLE'
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_NOT_INTERACTABLE'
  | 'INVALID_SELECTOR'
  | 'WRONG_ELEMENT_TYPE'
  | 'ACTION_TIMEOUT'
  | 'NO_EFFECT'
  | 'EXECUTION_ERROR'
  | 'UNKNOWN_TOOL'
  | 'INVALID_PARAMS';

/** Result of a single tool execution. */
export interface ToolResult {
  /** Which tool was executed. */
  tool: string;
  /** Whether the tool completed successfully. */
  success: boolean;
  /** Error message if success is false. */
  error?: string;
  /** Stable machine-readable outcome code. */
  code?: ToolResultCode;
  /** Whether retrying the same call may succeed. */
  retryable?: boolean;
  /** Whether the declared outcome was confirmed; false is not proof that a remote effect was absent. */
  verified?: boolean;
  /** Text read from the page by a read/extract action. */
  value?: string;
}

/** An observed side effect of tool execution. */
export interface BrowseEvent {
  type: 'dialog' | 'navigation' | 'new_elements';
  detail: string;
}

// ── Browse Request ──────────────────────────────────────────────

/** Body of a POST /v1/browse request. */
export interface BrowseRequest {
  /** URL to browse. Creates a new session. Mutually exclusive with session_id. */
  url?: string;
  /** Existing session ID. Mutually exclusive with url. */
  session_id?: string;
  /** Single tool to execute. */
  tool?: string;
  /** Parameters for the tool. */
  params?: Record<string, unknown>;
  /** Batch of tools to execute sequentially. */
  tools?: Array<{ tool: string; params: Record<string, unknown> }>;
  /** If true, includes raw page content in the response. */
  include_page_content?: boolean;
}

// ── Browse Response ─────────────────────────────────────────────

/** Response from POST /v1/browse. */
export interface BrowseResponse {
  session_id: string;
  /** Exact idle/hard-cap deadline for the current session (ISO 8601). */
  expires_at: string;
  url: string;
  title: string;
  summary: string;
  page_content?: string;
  tools: Tool[];
  results?: ToolResult[];
  stopped_reason?: 'navigation' | 'timeout';
  /** Observed dialogs, navigations, and newly appeared elements. */
  events?: BrowseEvent[];
  /** Number of actions metered for this request. */
  actions_charged?: number;
}

// ── Health ──────────────────────────────────────────────────────

/** Component health returned by a deep health check. */
export interface HealthChecks {
  browser: 'ok' | 'error';
  browser_overflow?: 'ok' | 'error';
  model: 'ok' | 'error';
  datastore: 'ok' | 'error';
}

/** Response from GET /health. */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime_s: number;
  active_sessions: number;
  checks?: HealthChecks;
}

// ── Error ───────────────────────────────────────────────────────

/** Machine-readable upgrade call-to-action on quota/degradation errors. */
export interface QuotaUpgradeCta {
  trial: boolean;
  plans: Array<'builder' | 'pro'>;
  url: string;
}

/** Standard error response from the API. */
export interface ErrorResponse {
  error: string;
  message: string;
  request_id: string;
  retry_after?: number;
  details?: unknown;
  usage?: unknown;
  upgrade?: QuotaUpgradeCta;
}

/** All possible machine-readable error codes in API error responses. */
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_REQUEST'
  | 'VALIDATION_ERROR'
  | 'DOMAIN_BLOCKED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_BUSY'
  | 'SESSION_EXPIRED'
  | 'PLAN_RESTRICTED'
  | 'SPEND_CAP_EXCEEDED'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  /** Concurrent-session limit reached (503 + retry_after). */
  | 'CONCURRENCY_EXCEEDED'
  /** Free-tier session admission temporarily unverifiable (503 + retry_after). */
  | 'CONCURRENCY_UNAVAILABLE'
  /** Free-tier tool execution degraded to observe-only until UTC midnight (503 + retry_after). */
  | 'FREE_TIER_DEGRADED'
  /** Browser infrastructure unavailable (503 + retry_after). */
  | 'BROWSER_ERROR'
  /** AI processing failed (502 + retry_after). */
  | 'AI_PROCESSING_ERROR'
  /** Bot-challenge/access-denied interstitial (502, no retry_after, unbilled). */
  | 'SITE_BLOCKED'
  | 'NAVIGATION_TIMEOUT'
  | 'INTERNAL_ERROR';

// ── Usage ───────────────────────────────────────────────────────

/** Response from GET /v1/usage. */
export interface UsageResponse {
  /** Active pricing plan. */
  plan: 'free' | 'trial' | 'builder' | 'pro';
  /** Action consumption for the current billing period. */
  actions: { used: number; limit: number };
  /** Current billing period boundaries (ISO 8601). */
  period: {
    start: string;
    end: string;
    basis: 'calendar_month' | 'billing_anniversary' | 'trial_window';
  };
  /** Billing & subscription status. */
  billing: { has_subscription: boolean; portal_url: string | null };
}
