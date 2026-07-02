/**
 * Unit tests for WebUplink SDK error hierarchy.
 *
 * Verifies inheritance, default values, and cause chaining for all
 * error subclasses.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  WebUplinkError,
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
} from '../src/errors.js';
import type { ErrorCode } from '../src/api-types.js';

describe('Error hierarchy', () => {
  const baseOptions = {
    code: 'TEST_ERROR',
    message: 'test message',
    statusCode: 500,
    requestId: 'req-123',
  };

  describe('AuthenticationError', () => {
    it('extends WebUplinkError', () => {
      const err = new AuthenticationError({
        ...baseOptions,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      });
      expect(err).toBeInstanceOf(WebUplinkError);
      expect(err).toBeInstanceOf(AuthenticationError);
      expect(err).toBeInstanceOf(Error);
    });

    it('sets name to AuthenticationError', () => {
      const err = new AuthenticationError({ ...baseOptions, statusCode: 401 });
      expect(err.name).toBe('AuthenticationError');
    });

    it('preserves all fields', () => {
      const err = new AuthenticationError({
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
        statusCode: 401,
        requestId: 'req-abc',
        retryable: false,
      });
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.statusCode).toBe(401);
      expect(err.requestId).toBe('req-abc');
      expect(err.retryable).toBe(false);
      expect(err.message).toBe('Invalid API key');
    });
  });

  describe('RateLimitError', () => {
    it('extends WebUplinkError', () => {
      const err = new RateLimitError({
        ...baseOptions,
        code: 'RATE_LIMITED',
        statusCode: 429,
      });
      expect(err).toBeInstanceOf(WebUplinkError);
      expect(err).toBeInstanceOf(RateLimitError);
    });

    it('sets name to RateLimitError', () => {
      const err = new RateLimitError({ ...baseOptions, statusCode: 429 });
      expect(err.name).toBe('RateLimitError');
    });

    it('preserves retryAfter', () => {
      const err = new RateLimitError({
        ...baseOptions,
        statusCode: 429,
        retryAfter: 30,
      });
      expect(err.retryAfter).toBe(30);
    });
  });

  describe('APIConnectionError', () => {
    it('extends WebUplinkError', () => {
      const err = new APIConnectionError('ECONNREFUSED');
      expect(err).toBeInstanceOf(WebUplinkError);
      expect(err).toBeInstanceOf(APIConnectionError);
    });

    it('sets name to APIConnectionError', () => {
      const err = new APIConnectionError('timeout');
      expect(err.name).toBe('APIConnectionError');
    });

    it('has retryable: true by default', () => {
      const err = new APIConnectionError('timeout');
      expect(err.retryable).toBe(true);
    });

    it('has statusCode: 0 and code: CONNECTION_ERROR', () => {
      const err = new APIConnectionError('failed');
      expect(err.statusCode).toBe(0);
      expect(err.code).toBe('CONNECTION_ERROR');
      expect(err.requestId).toBe('unknown');
    });

    it('preserves cause', () => {
      const original = new Error('ECONNREFUSED');
      const err = new APIConnectionError('Connection failed', { cause: original });
      expect(err.cause).toBe(original);
    });
  });

  describe('ErrorCode union', () => {
    it('covers every code the API emits (lockstep with the server taxonomy)', () => {
      // Type-level pin: adding a wire code without updating the union
      // makes this array fail to compile.
      const codes: ErrorCode[] = [
        'UNAUTHORIZED',
        'INVALID_REQUEST',
        'VALIDATION_ERROR',
        'DOMAIN_BLOCKED',
        'SESSION_NOT_FOUND',
        'SESSION_BUSY',
        'SESSION_EXPIRED',
        'PLAN_RESTRICTED',
        'QUOTA_EXCEEDED',
        'RATE_LIMITED',
        'CONCURRENCY_EXCEEDED',
        'CONCURRENCY_UNAVAILABLE',
        'FREE_TIER_DEGRADED',
        'BROWSER_ERROR',
        'AI_PROCESSING_ERROR',
        'SITE_BLOCKED',
        'INTERNAL_ERROR',
      ];

      // Runtime pin against the SOURCE (like the Python twin): parse the
      // union out of api-types.ts so a re-added dead code (or a member this
      // list forgot) actually fails — a literal-vs-literal assertion cannot.
      const source = readFileSync(new URL('../src/api-types.ts', import.meta.url), 'utf8');
      const union = /export type ErrorCode =([\s\S]*?);/.exec(source);
      expect(union).not.toBeNull();
      const publishedCodes = [...union![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);

      expect([...publishedCodes].sort()).toEqual([...codes].sort());
      // PAGE_ANALYSIS_FAILED was removed — never emitted by the API.
      expect(publishedCodes).not.toContain('PAGE_ANALYSIS_FAILED');
      expect(publishedCodes).toContain('SITE_BLOCKED');
    });

    it('preserves the code on WebUplinkError for engine errors', () => {
      const err = new WebUplinkError({
        code: 'SITE_BLOCKED',
        message: 'The site presented a bot-verification challenge instead of the page.',
        statusCode: 502,
        requestId: 'req-sb',
        retryable: false,
      });
      expect(err.code).toBe('SITE_BLOCKED');
      expect(err.retryable).toBe(false);
      expect(err.retryAfter).toBeUndefined();
    });
  });
});
