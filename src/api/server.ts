/**
 * UPSC Solver API Server
 *
 * Endpoints:
 * - POST /api/v1/solve - Solve a single question (supports SSE streaming)
 * - POST /api/v1/solve/batch - Solve multiple questions with optional evaluation
 * - GET /api/v1/health - Health check
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import solveRoutes from './routes/solve';
import batchRoutes from './routes/batch';
import healthRoutes from './routes/health';
import explainRoutes from './routes/explain';

const app = new Hono();

// Global middleware
app.use('*', secureHeaders());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use('*', logger());

// Auth middleware for API routes
app.use('/api/*', authMiddleware);

// API routes
app.route('/api/v1/solve', solveRoutes);
app.route('/api/v1/solve/batch', batchRoutes);
app.route('/api/v1/explain', explainRoutes);
app.route('/api/v1/health', healthRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'UPSC Solver API',
    version: '1.0.0',
    endpoints: {
      solve: 'POST /api/v1/solve',
      batch: 'POST /api/v1/solve/batch',
      explain: 'POST /api/v1/explain',
      health: 'GET /api/v1/health',
    },
    documentation: {
      solve: {
        description: 'Solve a single MCQ question',
        body: {
          question: 'string (required)',
          options: '{ a, b, c, d } (required)',
          config: '{ maxIterations?, enableSearch?, confidenceThreshold? } (optional)',
          stream: 'boolean (optional, enables SSE streaming)',
        },
      },
      explain: {
        description: 'Detailed essay answer for descriptive questions',
        body: {
          question: 'string (required)',
          config: '{ maxTokens?, enableSearch? } (optional)',
          stream: 'boolean (optional, enables SSE streaming)',
        },
      },
      batch: {
        description: 'Solve multiple MCQ questions with optional evaluation',
        body: {
          questions: 'Array<{ id, question, options }>',
          answerKey: 'Record<id, answer> (optional, for evaluation)',
          config: '{ concurrency?, maxIterations? } (optional)',
        },
      },
    },
  });
});

// Global error handler
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
  }, 404);
});

const PORT = parseInt(process.env.PORT || '5005', 10);

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    UPSC SOLVER API                           ║
╠══════════════════════════════════════════════════════════════╣
║  Server starting on http://localhost:${PORT}                   ║
║                                                              ║
║  Endpoints:                                                  ║
║    POST /api/v1/solve       - Solve MCQ question             ║
║    POST /api/v1/solve/batch - Batch solve with evaluation    ║
║    POST /api/v1/explain     - Essay/descriptive answers      ║
║    GET  /api/v1/health      - Health check                   ║
╚══════════════════════════════════════════════════════════════╝
`);

export default {
  port: PORT,
  fetch: app.fetch,
};
