/**
 * Solver Service - Wraps core solving logic for API use
 * Supports event emission for SSE streaming
 */

import { classifyQuestion } from '../../agent/classifier';
import { getProvider, type LLMMessage } from '../../llm/provider';
import { SYSTEM_PROMPTS, buildInitialPrompt, buildRefinedPrompt } from '../../llm/prompts';
import { shouldSearch } from '../../validation/confidence';
import { geminiContextSearch, isGeminiConfigured, searchMultiple } from '../../tools/web-search';
import { Semaphore } from '../../utils/semaphore';
import type { SolveResponse, BatchResult, ClassificationResult } from '../schemas/response';

export interface SolverConfig {
  maxIterations?: number;
  enableSearch?: boolean;
  confidenceThreshold?: number;
}

export interface SolverInput {
  question: string;
  options: Record<string, string>;
  config?: SolverConfig;
}

export type SolverEventType = 'classification' | 'iteration' | 'search' | 'complete' | 'error';

export interface SolverEvent {
  type: SolverEventType;
  data: Record<string, unknown>;
}

export type EventCallback = (event: SolverEvent) => void | Promise<void>;

// JSON Schema for structured LLM output
const responseSchema = {
  type: 'object',
  properties: {
    analysis: { type: 'string', description: 'Step-by-step analysis of the question' },
    answer: { type: 'string', enum: ['a', 'b', 'c', 'd'], description: 'The correct answer option' },
    confidence: { type: 'number', description: 'Confidence level from 0.0 to 1.0' },
    search_queries: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific search queries to verify uncertain facts (empty if confident)',
    },
  },
  required: ['analysis', 'answer', 'confidence', 'search_queries'],
  additionalProperties: false,
};

/**
 * Solve a single question with optional event streaming
 */
export async function solveQuestion(
  input: SolverInput,
  onEvent?: EventCallback
): Promise<SolveResponse> {
  const startTime = Date.now();
  const config = {
    maxIterations: input.config?.maxIterations ?? 3,
    enableSearch: input.config?.enableSearch ?? true,
    confidenceThreshold: input.config?.confidenceThreshold ?? 0.93,
  };

  const emit = async (type: SolverEventType, data: Record<string, unknown>) => {
    if (onEvent) {
      await onEvent({ type, data });
    }
  };

  // Classify question
  const classified = classifyQuestion({
    id: 0,
    question: input.question,
    options: input.options,
  });

  const classification: ClassificationResult = {
    type: classified.type,
    subjectArea: classified.subjectArea,
    difficulty: classified.difficulty,
  };

  await emit('classification', classification);

  const provider = getProvider();
  let currentAnswer = '';
  let currentConfidence = 0;
  let currentReasoning = '';
  let accumulatedContext = '';
  let searchCount = 0;
  const sources: string[] = [];

  // Determine if we must search first based on question type
  const questionLower = classified.question.toLowerCase();
  const isEconomyRegulation = classified.subjectArea === 'ECONOMY' &&
    (questionLower.includes('rbi') || questionLower.includes('sebi') || questionLower.includes('nbfc'));
  const isPolityAct = classified.subjectArea === 'POLITY' &&
    (questionLower.includes('act') || questionLower.includes('constitution') || questionLower.includes('article'));

  const mustSearchFirst = config.enableSearch && (
    classified.type === 'STATEMENT_ANALYSIS' ||
    classified.type === 'HOW_MANY_CORRECT' ||
    classified.type === 'SEQUENCE_ORDER' ||
    classified.type === 'MATCH_PAIRS' ||
    classified.type === 'FACTUAL_RECALL' ||
    classified.type === 'SELECT_CORRECT' ||
    isEconomyRegulation ||
    isPolityAct
  );

  for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
    await emit('iteration', {
      iteration,
      status: 'reasoning',
      previousAnswer: currentAnswer || null,
      previousConfidence: currentConfidence || null,
    });

    // Build messages
    const systemPrompt = iteration === 1 ? SYSTEM_PROMPTS.INITIAL_REASONING : SYSTEM_PROMPTS.REFINED_REASONING;
    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    if (iteration === 1) {
      messages.push({
        role: 'user',
        content: buildInitialPrompt(classified.question, classified.options),
      });
    } else {
      messages.push({
        role: 'user',
        content: buildRefinedPrompt(classified.question, classified.options, currentReasoning, accumulatedContext),
      });
    }

    // Call LLM
    const response = await provider.generate(messages, {
      maxTokens: 8000,
      jsonSchema: responseSchema,
    });

    // Parse response
    let parsed: { answer: string; analysis: string; confidence: number; searchQueries: string[] };
    try {
      const jsonResponse = JSON.parse(response.content);
      parsed = {
        answer: jsonResponse.answer?.toLowerCase() || 'a',
        analysis: jsonResponse.analysis || '',
        confidence: jsonResponse.confidence || 0.5,
        searchQueries: jsonResponse.search_queries || [],
      };
    } catch {
      // Fallback parsing
      const answerMatch = response.content.match(/"answer"\s*:\s*"([abcd])"/i);
      const confidenceMatch = response.content.match(/"confidence"\s*:\s*([\d.]+)/);
      parsed = {
        answer: answerMatch?.[1]?.toLowerCase() || 'a',
        analysis: response.reasoning || response.content || '',
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
        searchQueries: [],
      };
    }

    currentAnswer = parsed.answer;
    currentConfidence = parsed.confidence;
    currentReasoning = parsed.analysis;

    await emit('iteration', {
      iteration,
      status: 'completed',
      answer: currentAnswer,
      confidence: currentConfidence,
    });

    // Check if we should stop
    const shouldStop = currentConfidence >= config.confidenceThreshold &&
      !(iteration === 1 && searchCount === 0 && mustSearchFirst);

    if (shouldStop) {
      break;
    }

    // Determine if search needed
    const frameworkNeedsSearch = config.enableSearch &&
      shouldSearch(currentConfidence, classified.type, iteration, searchCount, classified.subjectArea);
    const needsSearch = (frameworkNeedsSearch || (iteration === 1 && mustSearchFirst)) && searchCount < 5;

    if (needsSearch) {
      await emit('search', {
        iteration,
        status: 'starting',
        queries: parsed.searchQueries.slice(0, 4),
      });

      // Use Gemini search if configured
      if (isGeminiConfigured()) {
        try {
          const searchResult = await geminiContextSearch(classified.question, classified.options);
          searchCount += 1;

          if (searchResult.sources.length > 0) {
            sources.push(...searchResult.sources);
          }

          if (searchResult.explanation) {
            accumulatedContext += '\n\n=== VERIFIED RESEARCH ===\n' + searchResult.explanation;
          }

          await emit('search', {
            iteration,
            status: 'completed',
            sourcesFound: searchResult.sources.length,
          });
        } catch (error) {
          await emit('search', {
            iteration,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Search failed',
          });
        }
      } else {
        // Fallback to Serper search
        const searchTerms = parsed.searchQueries.length > 0
          ? parsed.searchQueries.slice(0, 4)
          : [classified.question.slice(0, 100)];

        const searchResultsMap = await searchMultiple(searchTerms);
        searchCount += searchTerms.length;

        for (const [query, searchResult] of searchResultsMap.entries()) {
          if (searchResult.results.length > 0) {
            sources.push(...searchResult.results.slice(0, 3).map(r => r.url));
            const formatted = searchResult.results.slice(0, 3).map(r =>
              `[${r.title}] ${r.snippet}`
            ).join('\n\n');
            accumulatedContext += '\n\nSearch Results for "' + query + '":\n' + formatted;
          }
        }

        await emit('search', {
          iteration,
          status: 'completed',
          sourcesFound: sources.length,
        });
      }

      // Limit context
      if (accumulatedContext.length > 15000) {
        accumulatedContext = accumulatedContext.slice(-15000);
      }
    }
  }

  const result: SolveResponse = {
    answer: currentAnswer as 'a' | 'b' | 'c' | 'd',
    confidence: currentConfidence,
    analysis: currentReasoning,
    classification,
    sources: [...new Set(sources)].slice(0, 10),
    metadata: {
      iterations: Math.min(searchCount + 1, config.maxIterations),
      searchCount,
      processingTimeMs: Date.now() - startTime,
    },
  };

  await emit('complete', result);

  return result;
}

/**
 * Solve multiple questions in parallel with optional answer key for evaluation
 */
export async function solveBatch(
  questions: Array<{ id: string | number; question: string; options: Record<string, string> }>,
  answerKey?: Record<string, string>,
  config?: { concurrency?: number; maxIterations?: number }
): Promise<{
  results: BatchResult[];
  summary?: { total: number; correct: number; accuracy: number };
  metadata: { totalProcessingTimeMs: number; averageConfidence: number };
}> {
  const startTime = Date.now();
  const concurrency = config?.concurrency ?? 20;
  const semaphore = new Semaphore(concurrency);

  const results: BatchResult[] = [];

  const tasks = questions.map(async (q) => {
    await semaphore.acquire();
    try {
      const result = await solveQuestion({
        question: q.question,
        options: q.options,
        config: { maxIterations: config?.maxIterations ?? 3 },
      });

      const batchResult: BatchResult = {
        id: q.id,
        answer: result.answer,
        confidence: result.confidence,
        analysis: result.analysis,
      };

      if (answerKey && answerKey[q.id.toString()]) {
        batchResult.expectedAnswer = answerKey[q.id.toString()];
        batchResult.correct = result.answer.toLowerCase() === answerKey[q.id.toString()].toLowerCase();
      }

      return batchResult;
    } finally {
      semaphore.release();
    }
  });

  const settled = await Promise.allSettled(tasks);

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    }
  }

  // Calculate summary if answer key provided
  let summary: { total: number; correct: number; accuracy: number } | undefined;
  if (answerKey) {
    const correct = results.filter(r => r.correct).length;
    summary = {
      total: results.length,
      correct,
      accuracy: (correct / results.length) * 100,
    };
  }

  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

  return {
    results,
    summary,
    metadata: {
      totalProcessingTimeMs: Date.now() - startTime,
      averageConfidence: avgConfidence,
    },
  };
}
