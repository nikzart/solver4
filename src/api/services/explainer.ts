/**
 * Explainer Service — Handles descriptive/essay questions
 * Flow: Classify → Research → Draft → Refine → Return
 */

import { classifyQuestion } from '../../agent/classifier';
import { getProvider, type LLMMessage } from '../../llm/provider';
import { SYSTEM_PROMPTS, buildEssayPrompt, buildEssayRefinePrompt } from '../../llm/prompts';
import { geminiContextSearch, isGeminiConfigured, searchMultiple } from '../../tools/web-search';
import type { ExplainResponse, ClassificationResult } from '../schemas/response';

export interface ExplainInput {
  question: string;
  config?: {
    maxTokens?: number;
    enableSearch?: boolean;
  };
}

export type ExplainEventType = 'classification' | 'research' | 'drafting' | 'refining' | 'complete' | 'error';

export interface ExplainEvent {
  type: ExplainEventType;
  data: Record<string, unknown>;
}

export type ExplainEventCallback = (event: ExplainEvent) => void | Promise<void>;

export async function explainQuestion(
  input: ExplainInput,
  onEvent?: ExplainEventCallback
): Promise<ExplainResponse> {
  const startTime = Date.now();
  const maxTokens = input.config?.maxTokens ?? 4096;
  const enableSearch = input.config?.enableSearch ?? true;

  const emit = async (type: ExplainEventType, data: Record<string, unknown>) => {
    if (onEvent) await onEvent({ type, data });
  };

  // 1. Classify question
  const classified = classifyQuestion({
    id: 0,
    question: input.question,
    options: { a: '', b: '', c: '', d: '' },
  });

  const classification: ClassificationResult = {
    type: classified.type,
    subjectArea: classified.subjectArea,
    difficulty: classified.difficulty,
  };

  await emit('classification', classification);

  const provider = getProvider();
  const sources: string[] = [];
  let researchContext = '';
  let searchCount = 0;

  // 2. Research phase
  if (enableSearch) {
    await emit('research', { status: 'searching' });

    if (isGeminiConfigured()) {
      try {
        const result = await geminiContextSearch(input.question, {});
        searchCount++;
        if (result.sources.length > 0) sources.push(...result.sources);
        if (result.explanation) researchContext = result.explanation;
        await emit('research', { status: 'completed', sourcesFound: result.sources.length });
      } catch {
        await emit('research', { status: 'failed', error: 'Gemini search failed' });
      }
    } else {
      // Fallback: generate search queries from the question
      const queries = [input.question.slice(0, 100)];
      const results = await searchMultiple(queries);
      searchCount++;
      for (const [, result] of results.entries()) {
        if (result.results.length > 0) {
          sources.push(...result.results.slice(0, 3).map(r => r.url));
          researchContext += result.results.slice(0, 3).map(r =>
            `[${r.title}] ${r.snippet}`
          ).join('\n\n');
        }
      }
      await emit('research', { status: 'completed', sourcesFound: sources.length });
    }
  }

  // 3. Draft phase
  await emit('drafting', { status: 'generating' });

  const draftMessages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_PROMPTS.ESSAY_SYSTEM },
    { role: 'user', content: buildEssayPrompt(input.question) },
  ];

  const draftResponse = await provider.generate(draftMessages, { maxTokens });
  let essay = draftResponse.content || draftResponse.reasoning || '';

  await emit('drafting', { status: 'completed', length: essay.length });

  // 4. Refine phase (if we have research context)
  if (researchContext.length > 100) {
    await emit('refining', { status: 'incorporating_sources' });

    const refineMessages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.ESSAY_REFINE },
      { role: 'user', content: buildEssayRefinePrompt(input.question, essay, researchContext) },
    ];

    const refineResponse = await provider.generate(refineMessages, { maxTokens });
    const refined = refineResponse.content || refineResponse.reasoning || '';

    if (refined.length > essay.length * 0.5) {
      essay = refined;
    }

    await emit('refining', { status: 'completed', length: essay.length });
  }

  const result: ExplainResponse = {
    explanation: essay,
    sources: [...new Set(sources)].slice(0, 10),
    classification,
    metadata: {
      iterations: researchContext.length > 100 ? 2 : 1,
      searchCount,
      processingTimeMs: Date.now() - startTime,
    },
  };

  await emit('complete', result as unknown as Record<string, unknown>);

  return result;
}
