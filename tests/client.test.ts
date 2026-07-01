/**
 * Unit tests for WebUplink SDK client.
 *
 * Uses a mock fetch to verify request construction, response parsing,
 * error mapping, header extraction, and string overloads — without
 * requiring a running server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebUplink } from '../src/client.js';
import {
  WebUplinkError,
  AuthenticationError,
  RateLimitError,
} from '../src/errors.js';

// ── Helpers ─────────────────────────────────────────────────────

function mockFetch(body: unknown, options?: {
  status?: number;
  headers?: Record<string, string>;
}) {
  return vi.fn().mockResolvedValue({
    ok: (options?.status ?? 200) < 400,
    status: options?.status ?? 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    headers: new Map(Object.entries(options?.headers ?? {})),
  } as unknown as Response);
}

function createClient(fetchFn: ReturnType<typeof mockFetch>) {
  return new WebUplink({
    apiKey: 'test-key',
    baseUrl: 'https://api.test.dev',
    fetch: fetchFn as unknown as typeof fetch,
    maxRetries: 0,  // Disable retry for unit tests
  });
}

// ── Tests ───────────────────────────────────────────────────────

describe('WebUplink client', () => {
  describe('constructor', () => {
    it('throws WebUplinkError when no apiKey and no env var', () => {
      // Ensure env var is not set
      const prev = process.env['WEBUPLINK_API_KEY'];
      delete process.env['WEBUPLINK_API_KEY'];
      try {
        expect(() => new WebUplink({}))
          .toThrow(WebUplinkError);
      } finally {
        if (prev) process.env['WEBUPLINK_API_KEY'] = prev;
      }
    });

    it('reads apiKey from WEBUPLINK_API_KEY env var', () => {
      const prev = process.env['WEBUPLINK_API_KEY'];
      process.env['WEBUPLINK_API_KEY'] = 'env-key';
      try {
        const fetch = mockFetch({ session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] });
        const client = new WebUplink({
          fetch: fetch as unknown as typeof globalThis.fetch,
          maxRetries: 0,
        });
        client.browse('https://example.com');
        const headers = fetch.mock.calls[0]![1].headers;
        expect(headers['Authorization']).toBe('Bearer env-key');
      } finally {
        if (prev) process.env['WEBUPLINK_API_KEY'] = prev;
        else delete process.env['WEBUPLINK_API_KEY'];
      }
    });

    it('defaults baseUrl to https://api.webuplink.ai', () => {
      const fetch = mockFetch({ session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] });
      const client = new WebUplink({
        apiKey: 'key',
        fetch: fetch as unknown as typeof globalThis.fetch,
        maxRetries: 0,
      });
      client.browse('https://example.com');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.webuplink.ai/v1/browse',
        expect.any(Object),
      );
    });

    it('strips trailing slash from baseUrl', () => {
      const fetch = mockFetch({ session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] });
      const client = new WebUplink({
        apiKey: 'key',
        baseUrl: 'https://api.test.dev/',
        fetch: fetch as unknown as typeof globalThis.fetch,
        maxRetries: 0,
      });
      client.browse('https://example.com');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.dev/v1/browse',
        expect.any(Object),
      );
    });
  });

  describe('browse()', () => {
    it('sends string url as { url } in body', async () => {
      const fetch = mockFetch({ session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] });
      const client = createClient(fetch);

      await client.browse('https://example.com');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.dev/v1/browse',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: 'https://example.com' }),
        }),
      );
    });

    it('sends object form directly', async () => {
      const fetch = mockFetch({ session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] });
      const client = createClient(fetch);

      await client.browse({ session_id: 's1', tool: 'search', params: { q: 'test' } });

      const body = JSON.parse(fetch.mock.calls[0]![1].body as string);
      expect(body).toEqual({ session_id: 's1', tool: 'search', params: { q: 'test' } });
    });

    it('includes Authorization header', async () => {
      const fetch = mockFetch({ session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] });
      const client = createClient(fetch);

      await client.browse('https://example.com');

      const headers = fetch.mock.calls[0]![1].headers;
      expect(headers['Authorization']).toBe('Bearer test-key');
    });

    it('parses response body', async () => {
      const fetch = mockFetch({
        session_id: 'abc',
        url: 'https://example.com',
        title: 'Example',
        summary: 'A test page',
        tools: [{ name: 'click_button', description: 'Click it', params: {} }],
      });
      const client = createClient(fetch);

      const result = await client.browse('https://example.com');

      expect(result.session_id).toBe('abc');
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]!.name).toBe('click_button');
    });

    it('parses X-Usage-* headers into _usage', async () => {
      const fetch = mockFetch(
        { session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] },
        {
          headers: {
            'x-usage-action-count': '5',
            'x-usage-action-limit': '1000',
            'x-usage-period-start': '2026-06-01T00:00:00.000Z',
          },
        },
      );
      const client = createClient(fetch);

      const result = await client.browse('https://example.com');

      expect(result._usage).toEqual({
        actionCount: 5,
        actionLimit: 1000,
        periodStart: '2026-06-01T00:00:00.000Z',
      });
    });

    it('omits _usage when headers are absent', async () => {
      const fetch = mockFetch(
        { session_id: 's1', url: 'u', title: 't', summary: 's', tools: [] },
      );
      const client = createClient(fetch);

      const result = await client.browse('https://example.com');

      expect(result._usage).toBeUndefined();
    });
  });

  describe('closeSession()', () => {
    it('sends DELETE to correct path', async () => {
      const fetch = mockFetch({ status: 'closed' });
      const client = createClient(fetch);

      await client.closeSession('session-123');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.dev/v1/session/session-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('encodes special characters in session ID', async () => {
      const fetch = mockFetch({ status: 'closed' });
      const client = createClient(fetch);

      await client.closeSession('session/with/slashes');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.dev/v1/session/session%2Fwith%2Fslashes',
        expect.any(Object),
      );
    });
  });

  describe('health()', () => {
    it('sends GET to /health', async () => {
      const fetch = mockFetch({ status: 'ok', uptime_s: 100, active_sessions: 0 });
      const client = createClient(fetch);

      const result = await client.health();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.dev/health',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result.status).toBe('ok');
      expect(result.uptime_s).toBe(100);
    });
  });

  describe('error handling', () => {
    it('throws WebUplinkError on 4xx with error body', async () => {
      const fetch = mockFetch(
        { error: 'SESSION_NOT_FOUND', message: 'Session not found', request_id: 'req-1' },
        { status: 404, headers: { 'x-request-id': 'req-1' } },
      );
      const client = createClient(fetch);

      await expect(client.browse('https://example.com'))
        .rejects
        .toThrow(WebUplinkError);

      try {
        await client.browse('https://example.com');
      } catch (err) {
        const e = err as WebUplinkError;
        expect(e.code).toBe('SESSION_NOT_FOUND');
        expect(e.statusCode).toBe(404);
        expect(e.requestId).toBe('req-1');
        expect(e.retryable).toBe(false);
      }
    });

    it('throws AuthenticationError on 401', async () => {
      const fetch = mockFetch(
        { error: 'UNAUTHORIZED', message: 'Invalid API key', request_id: 'req-auth' },
        { status: 401, headers: { 'x-request-id': 'req-auth' } },
      );
      const client = createClient(fetch);

      try {
        await client.browse('https://example.com');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationError);
        expect(err).toBeInstanceOf(WebUplinkError);
        const e = err as AuthenticationError;
        expect(e.code).toBe('UNAUTHORIZED');
        expect(e.statusCode).toBe(401);
      }
    });

    it('throws RateLimitError on 429', async () => {
      const fetch = mockFetch(
        { error: 'RATE_LIMITED', message: 'Too many requests', request_id: 'req-rl', retry_after: 30 },
        { status: 429, headers: { 'x-request-id': 'req-rl' } },
      );
      const client = createClient(fetch);

      try {
        await client.browse('https://example.com');
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect(err).toBeInstanceOf(WebUplinkError);
        const e = err as RateLimitError;
        expect(e.code).toBe('RATE_LIMITED');
        expect(e.statusCode).toBe(429);
        expect(e.retryAfter).toBe(30);
        expect(e.retryable).toBe(false); // 429 is never auto-retried
      }
    });

    it('marks errors with retry_after as retryable', async () => {
      // Server collapses 5xx to 500 INTERNAL_ERROR but preserves retry_after
      const fetch = mockFetch(
        { error: 'INTERNAL_ERROR', message: 'An internal error occurred.', request_id: 'req-2', retry_after: 5 },
        { status: 500, headers: { 'x-request-id': 'req-2' } },
      );
      const client = createClient(fetch);

      try {
        await client.browse('https://example.com');
      } catch (err) {
        const e = err as WebUplinkError;
        expect(e.code).toBe('INTERNAL_ERROR');
        expect(e.retryable).toBe(true);
        expect(e.retryAfter).toBe(5);
      }
    });

    it('marks errors without retry_after as not retryable', async () => {
      const fetch = mockFetch(
        { error: 'INTERNAL_ERROR', message: 'An internal error occurred.', request_id: 'req-3' },
        { status: 500, headers: { 'x-request-id': 'req-3' } },
      );
      const client = createClient(fetch);

      try {
        await client.browse('https://example.com');
      } catch (err) {
        const e = err as WebUplinkError;
        expect(e.code).toBe('INTERNAL_ERROR');
        expect(e.retryable).toBe(false);
        expect(e.retryAfter).toBeUndefined();
      }
    });
  });

  describe('getUsage()', () => {
    it('sends GET /v1/usage with auth header', async () => {
      const usageBody = {
        plan: 'builder',
        actions: { used: 142, limit: 1000 },
        period: { start: '2026-06-01T00:00:00.000Z', end: '2026-07-01T00:00:00.000Z' },
        billing: { has_subscription: true, portal_url: '/v1/billing/portal' },
      };
      const fetch = mockFetch(usageBody);
      const client = createClient(fetch);

      const result = await client.getUsage();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.dev/v1/usage',
        expect.objectContaining({ method: 'GET' }),
      );
      // Verify auth header
      const headers = fetch.mock.calls[0]![1].headers;
      expect(headers['Authorization']).toBe('Bearer test-key');
    });

    it('returns parsed response with all fields', async () => {
      const usageBody = {
        plan: 'pro',
        actions: { used: 4500, limit: 5000 },
        period: { start: '2026-06-01T00:00:00.000Z', end: '2026-07-01T00:00:00.000Z' },
        billing: { has_subscription: true, portal_url: '/v1/billing/portal' },
      };
      const fetch = mockFetch(usageBody);
      const client = createClient(fetch);

      const result = await client.getUsage();

      expect(result.plan).toBe('pro');
      expect(result.actions.used).toBe(4500);
      expect(result.actions.limit).toBe(5000);
      expect(result.period.start).toBe('2026-06-01T00:00:00.000Z');
      expect(result.period.end).toBe('2026-07-01T00:00:00.000Z');
      expect(result.billing.has_subscription).toBe(true);
      expect(result.billing.portal_url).toBe('/v1/billing/portal');
    });

    it('throws AuthenticationError on 401', async () => {
      const fetch = mockFetch(
        { error: 'UNAUTHORIZED', message: 'Invalid API key', request_id: 'req-u' },
        { status: 401, headers: { 'x-request-id': 'req-u' } },
      );
      const client = createClient(fetch);

      await expect(client.getUsage()).rejects.toBeInstanceOf(AuthenticationError);
    });
  });
});
