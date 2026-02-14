import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { ExplainRequestSchema } from '../schemas/request';
import { explainQuestion, type ExplainEvent } from '../services/explainer';

const explain = new Hono();

explain.post('/', zValidator('json', ExplainRequestSchema), async (c) => {
  const body = c.req.valid('json');

  if (!body.stream) {
    const result = await explainQuestion({
      question: body.question,
      config: body.config,
    });
    return c.json(result);
  }

  return streamSSE(c, async (stream) => {
    try {
      await explainQuestion(
        { question: body.question, config: body.config },
        async (event: ExplainEvent) => {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
          });
        }
      );
    } catch (error) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          code: 'EXPLAIN_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      });
    }
  });
});

export default explain;
