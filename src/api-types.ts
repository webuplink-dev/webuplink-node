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

/** Result of a single tool execution. */
export interface ToolResult {
  /** Which tool was executed. */
  tool: string;
  /** Whether the tool completed successfully. */
  success: boolean;
  /** Error message if success is false. */
  error?: string;
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
  url: string;
  title: string;
  summary: string;
  page_content?: string;
  tools: Tool[];
  results?: ToolResult[];
  stopped_reason?: 'navigation' | 'timeout';
  /** Number of actions metered for this request. */
  actions_charged?: number;
}

// ── Health ──────────────────────────────────────────────────────

/** Response from GET /health. */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime_s: number;
  active_sessions: number;
}

// ── Error ───────────────────────────────────────────────────────

/** Standard error response from the API. */
export interface ErrorResponse {
  error: string;
  message: string;
  request_id: string;
  retry_after?: number;
  details?: unknown;
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
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'BROWSER_ERROR'
  | 'PAGE_ANALYSIS_FAILED'
  | 'AI_PROCESSING_ERROR'
  | 'INTERNAL_ERROR';

// ── Usage ───────────────────────────────────────────────────────

/** Response from GET /v1/usage. */
export interface UsageResponse {
  /** Active pricing plan. */
  plan: 'free' | 'builder' | 'pro';
  /** Action consumption for the current billing period. */
  actions: { used: number; limit: number };
  /** Current billing period boundaries (ISO 8601). */
  period: { start: string; end: string };
  /** Billing & subscription status. */
  billing: { has_subscription: boolean; portal_url: string | null };
}
