/**
 * Unit tests for idempotency-aware retry logic.
 *
 * Verifies that the SDK:
 * - Retries on connection errors (fetch throws)
 * - Retries when server sends retry_after for observe-only requests
 * - Does NOT retry when tools are involved (non-idempotent)
 * - Does NOT retry on 4xx errors
 * - Respects maxRetries and retry: false configuration
 *
 * Note: The server sends retry_after on transient 5xx errors
 * (BROWSER_ERROR, AI_PROCESSING_ERROR, capacity 503s, retryable
 * INTERNAL_ERRORs) and omits it on terminal ones (SITE_BLOCKED).
 * The SDK keys on retry_after presence — except 429 (RATE_LIMITED /
 * QUOTA_EXCEEDED), which is never auto-retried even with retry_after.
 */

import { describe, it, expect, vi } from 'vitest';
import { WebUplink } from '../src/client.js';
import { WebUplinkError, APIConnectionError } from '../src/errors.js';

// ── Helpers ─────────────────────────────────────────────────────

function createResponseMock(body: unknown, status: number, headers: Record<string, string> = {}) {
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    headers: new Map(Object.entries(headers)),
  } as unknown as Response;
}

// ── Tests ───────────────────────────────────────────────────────

describe('Retry logic', () => {
  it('retries on connection error (fetch throws)', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      if (callCount < 3) throw new Error('ECONNREFUSED');
      return createResponseMock(
        { session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] },
        200,
      );
    });

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 3,
    });

    const result = await client.browse('https://example.com');
    expect(result.session_id).toBe('s1');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('retries on 500 INTERNAL_ERROR with retry_after for observe-only requests', async () => {
    // This matches actual server behavior: a transient browser error
    // is collapsed by the error handler to 500 INTERNAL_ERROR with retry_after: 5
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      if (callCount < 2) {
        return createResponseMock(
          { error: 'INTERNAL_ERROR', message: 'An internal error occurred.', request_id: 'r1', retry_after: 0.01 },
          500,
          { 'x-request-id': 'r1' },
        );
      }
      return createResponseMock(
        { session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] },
        200,
      );
    });

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 2,
    });

    const result = await client.browse('https://example.com');
    expect(result.session_id).toBe('s1');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 BROWSER_ERROR with retry_after for observe-only requests', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      if (callCount < 2) {
        return createResponseMock(
          { error: 'BROWSER_ERROR', message: 'Browser infrastructure is temporarily unavailable. Please retry.', request_id: 'be1', retry_after: 0.01 },
          503,
          { 'x-request-id': 'be1' },
        );
      }
      return createResponseMock(
        { session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] },
        200,
      );
    });

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 2,
    });

    const result = await client.browse('https://example.com');
    expect(result.session_id).toBe('s1');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry 502 SITE_BLOCKED (no retry_after — a retry hits the same wall)', async () => {
    const fetchFn = vi.fn(async () =>
      createResponseMock(
        { error: 'SITE_BLOCKED', message: 'The site presented a bot-verification challenge instead of the page.', request_id: 'sb1' },
        502,
        { 'x-request-id': 'sb1' },
      ),
    );

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 3,
    });

    const err = await client.browse('https://example.com').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WebUplinkError);
    expect((err as WebUplinkError).code).toBe('SITE_BLOCKED');
    expect((err as WebUplinkError).statusCode).toBe(502);
    expect((err as WebUplinkError).retryable).toBe(false);
    expect((err as WebUplinkError).retryAfter).toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry when tools are involved (non-idempotent)', async () => {
    const fetchFn = vi.fn(async () => {
      return createResponseMock(
        { error: 'INTERNAL_ERROR', message: 'An internal error occurred.', request_id: 'r2', retry_after: 5 },
        500,
        { 'x-request-id': 'r2' },
      );
    });

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 3,
    });

    // tool execution — should NOT retry even with retry_after
    await expect(client.browse({
      session_id: 's1',
      tool: 'place_order',
      params: { item: 'laptop' },
    })).rejects.toThrow(WebUplinkError);

    // Only 1 call — no retries
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 4xx errors', async () => {
    const fetchFn = vi.fn(async () => {
      return createResponseMock(
        { error: 'QUOTA_EXCEEDED', message: 'Over limit', request_id: 'r3' },
        429,
        { 'x-request-id': 'r3' },
      );
    });

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 3,
    });

    await expect(client.browse('https://example.com'))
      .rejects.toThrow(WebUplinkError);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry 429 RATE_LIMITED even with retry_after', async () => {
    const fetchFn = vi.fn(async () =>
      createResponseMock(
        { error: 'RATE_LIMITED', message: 'Rate limit exceeded. Try again in 5 seconds.', retry_after: 5 },
        429,
        { 'x-request-id': 'rl1' },
      ),
    );

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 3,
    });

    // Observe-only is idempotent (retryable), but a 429 throttle must NOT be
    // auto-retried even though retry_after is present.
    await expect(client.browse('https://example.com')).rejects.toThrow(WebUplinkError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 500 without retry_after', async () => {
    const fetchFn = vi.fn(async () => {
      return createResponseMock(
        { error: 'INTERNAL_ERROR', message: 'An internal error occurred.', request_id: 'r4' },
        500,
        { 'x-request-id': 'r4' },
      );
    });

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 3,
    });

    await expect(client.browse('https://example.com'))
      .rejects.toThrow(WebUplinkError);

    // No retry_after → not retryable → only 1 call
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('respects retry: false', async () => {
    let callCount = 0;
    const fetchFn = vi.fn(async () => {
      callCount++;
      if (callCount < 3) throw new Error('ECONNREFUSED');
      return createResponseMock({}, 200);
    });

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      retry: false,
    });

    await expect(client.browse('https://example.com')).rejects.toBeInstanceOf(APIConnectionError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('respects maxRetries: 0', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    const client = new WebUplink({
      apiKey: 'key',
      baseUrl: 'https://api.test.dev',
      fetch: fetchFn as unknown as typeof fetch,
      maxRetries: 0,
    });

    await expect(client.browse('https://example.com')).rejects.toBeInstanceOf(APIConnectionError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
