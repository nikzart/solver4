import { z } from 'zod';

export const OptionsSchema = z.object({
  a: z.string().min(1, 'Option A is required'),
  b: z.string().min(1, 'Option B is required'),
  c: z.string().min(1, 'Option C is required'),
  d: z.string().min(1, 'Option D is required'),
});

export const SolveRequestSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  options: OptionsSchema,
  config: z.object({
    maxIterations: z.number().int().min(1).max(5).optional(),
    enableSearch: z.boolean().optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
  }).optional(),
  stream: z.boolean().optional(),
});

export const BatchQuestionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  question: z.string().min(10),
  options: OptionsSchema,
});

export const BatchSolveRequestSchema = z.object({
  questions: z.array(BatchQuestionSchema).min(1).max(100),
  answerKey: z.record(z.string(), z.string()).optional(),
  config: z.object({
    concurrency: z.number().int().min(1).max(50).optional(),
    maxIterations: z.number().int().min(1).max(5).optional(),
  }).optional(),
});

export const ExplainRequestSchema = z.object({
  question: z.string().min(10, 'Question must be at least 10 characters'),
  config: z.object({
    maxTokens: z.number().int().min(500).max(8000).optional(),
    enableSearch: z.boolean().optional(),
  }).optional(),
  stream: z.boolean().optional(),
});

export type SolveRequest = z.infer<typeof SolveRequestSchema>;
export type BatchSolveRequest = z.infer<typeof BatchSolveRequestSchema>;
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;
