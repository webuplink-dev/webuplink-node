# Changelog

## 0.1.1 (2026-07-02)

### Changes

- `ErrorCode`: added `CONCURRENCY_EXCEEDED`, `CONCURRENCY_UNAVAILABLE`, `FREE_TIER_DEGRADED`, and `SITE_BLOCKED`; removed `PAGE_ANALYSIS_FAILED` (never emitted by the API)
- README: error-handling section covering `code` / `statusCode` / `requestId` and retry semantics (`SITE_BLOCKED` is unbilled and never auto-retried)
- README: tool definitions described as named and callable rather than typed

## 0.1.0 (2026-06-30)

Initial public release.

### Features

- `browse()` — browse pages and execute tools with string shorthand or object form
- `closeSession()` — explicit session cleanup
- `health()` — API health check with optional deep component checks
- `getUsage()` — usage and billing information for the authenticated tenant
- Idempotency-aware retry with configurable `maxRetries`
- Typed error hierarchy: `WebUplinkError`, `AuthenticationError`, `RateLimitError`, `APIConnectionError`
- `_usage` metadata from `X-Usage-*` response headers
- Zero external dependencies — uses native `fetch()` (Node 18+)
- Dual ESM/CJS distribution with full TypeScript declarations
