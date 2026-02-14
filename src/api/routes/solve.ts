import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { SolveRequestSchema } from '../schemas/request';
import { solveQuestion, type SolverEvent } from '../services/solver';

const solve = new Hono();

solve.post('/', zValidator('json', SolveRequestSchema), async (c) => {
  const body = c.req.valid('json');

  // Non-streaming mode
  if (!body.stream) {
    const result = await solveQuestion({
      question: body.question,
      options: body.options,
      config: body.config,
    });

    return c.json(result);
  }

  // SSE streaming mode
  return streamSSE(c, async (stream) => {
    try {
      const result = await solveQuestion(
        {
          question: body.question,
          options: body.options,
          config: body.config,
        },
        async (event: SolverEvent) => {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
          });
        }
      );

      // Final complete event is already sent by solveQuestion
    } catch (error) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          code: 'SOLVE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      });
    }
  });
});

export default solve;
