import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { BatchSolveRequestSchema } from '../schemas/request';
import { solveBatch } from '../services/solver';

const batch = new Hono();

batch.post('/', zValidator('json', BatchSolveRequestSchema), async (c) => {
  const body = c.req.valid('json');

  const result = await solveBatch(
    body.questions,
    body.answerKey,
    body.config
  );

  return c.json(result);
});

export default batch;
