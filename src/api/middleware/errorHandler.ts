import type { Context, ErrorHandler } from 'hono';
import { ZodError } from 'zod';

export const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_QUESTION: 'INVALID_QUESTION',
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  RATE_LIMITED: 'RATE_LIMITED',
  LLM_ERROR: 'LLM_ERROR',
  SEARCH_ERROR: 'SEARCH_ERROR',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export const errorHandler: ErrorHandler = (err, c: Context) => {
  console.error('API Error:', err);

  // Zod validation errors
  if (err instanceof ZodError) {
    return c.json({
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Validation failed',
        details: {
          issues: err.issues.map(i => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
      },
    }, 400);
  }

  // LLM errors (Azure rate limiting, etc.)
  if (err.message?.includes('429') || err.message?.includes('rate limit')) {
    return c.json({
      error: {
        code: ErrorCodes.RATE_LIMITED,
        message: 'LLM rate limit exceeded. Please try again later.',
      },
    }, 429);
  }

  // LLM API errors
  if (err.message?.includes('LLM') || err.message?.includes('Azure')) {
    return c.json({
      error: {
        code: ErrorCodes.LLM_ERROR,
        message: 'LLM service error. Please try again.',
        details: { originalMessage: err.message },
      },
    }, 503);
  }

  // Search errors
  if (err.message?.includes('search') || err.message?.includes('Gemini')) {
    return c.json({
      error: {
        code: ErrorCodes.SEARCH_ERROR,
        message: 'Search service error. Solving without verification.',
        details: { originalMessage: err.message },
      },
    }, 503);
  }

  // Generic internal error
  return c.json({
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
      details: process.env.NODE_ENV !== 'production'
        ? { originalMessage: err.message }
        : undefined,
    },
  }, 500);
};
