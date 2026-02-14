import type { Context, Next } from 'hono';

const API_KEYS = process.env.API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];

export async function authMiddleware(c: Context, next: Next) {
  // Skip auth for health endpoint
  if (c.req.path === '/api/v1/health') {
    return next();
  }

  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    return c.json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required. Include X-API-Key header.',
      },
    }, 401);
  }

  // Allow any key in development if no keys configured
  if (API_KEYS.length === 0 && process.env.NODE_ENV !== 'production') {
    return next();
  }

  if (!API_KEYS.includes(apiKey)) {
    return c.json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key.',
      },
    }, 401);
  }

  await next();
}
