/**
 * UPSC Solver Agent Core
 * Main orchestrator for the reasoning loop
 */

import { getProvider, type LLMMessage } from '../llm/provider';
import { SYSTEM_PROMPTS, buildInitialPrompt, buildRefinedPrompt } from '../llm/prompts';
import { classifyQuestion, type ClassifiedQuestion, SubjectArea } from './classifier';
import { webSearch, scrapeMultiple, formatSearchResultsForPrompt, formatScrapedContentForPrompt } from '../tools';
import { selfValidate, type ValidationResult } from '../validation/self-check';
import { calculateFinalConfidence, parseConfidenceFromResponse, shouldSearch } from '../validation/confidence';
import { performPolitySearch, detectPolitySubCategory } from '../tools/polity-search';

export interface AgentConfig {
  maxIterations: number;
  confidenceThreshold: number;
  enableWebSearch: boolean;
  enableValidation: boolean;
  enableScraping: boolean;
  verbose: boolean;
}

export interface AgentResult {
  questionId: number;
  answer: string;
  confidence: number;
  reasoning: string;
  iterations: number;
  searchCount: number;
  sources: string[];
  validated: boolean;
}

export interface ProgressCallback {
  (update: ProgressUpdate): void;
}

export interface ProgressUpdate {
  type: 'CLASSIFY' | 'REASONING' | 'SEARCH' | 'SCRAPE' | 'VALIDATE' | 'COMPLETE' | 'ERROR';
  questionId: number;
  iteration?: number;
  message?: string;
  answer?: string;
  confidence?: number;
  reasoning?: string;
}

const DEFAULT_CONFIG: AgentConfig = {
  maxIterations: 3,
  confidenceThreshold: 0.85,
  enableWebSearch: true,
  enableValidation: true,
  enableScraping: true,
  verbose: false,
};

export class UPSCSolverAgent {
  private config: AgentConfig;
  private onProgress: ProgressCallback;

  constructor(config: Partial<AgentConfig> = {}, onProgress?: ProgressCallback) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onProgress = onProgress || (() => {});
  }

  async solveQuestion(question: { id: number; question: string; options: Record<string, string> }): Promise<AgentResult> {
    // Step 1: Classify the question
    const classified = classifyQuestion(question);
    this.onProgress({
      type: 'CLASSIFY',
      questionId: question.id,
      message: `Type: ${classified.type}, Subject: ${classified.subjectArea}`,
    });

    let currentAnswer: string | null = null;
    let currentReasoning = '';
    let currentConfidence = 0;
    let iteration = 0;
    let searchCount = 0;
    let sources: string[] = [];
    let accumulatedContext = '';
    let validated = false;

    const provider = getProvider();

    while (iteration < this.config.maxIterations) {
      iteration++;
      this.onProgress({
        type: 'REASONING',
        questionId: question.id,
        iteration,
        message: `Iteration ${iteration}/${this.config.maxIterations}`,
      });

      // Step 2: Generate reasoning
      const messages: LLMMessage[] = [{ role: 'system', content: SYSTEM_PROMPTS.INITIAL_REASONING }];

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

      try {
        const response = await provider.generate(messages, {
          temperature: 0.1,
          maxTokens: 3000,
        });

        // Parse the response
        const parsed = this.parseReasoningResponse(response.content, response.reasoning);
        currentAnswer = parsed.answer;
        currentReasoning = parsed.analysis;
        currentConfidence = parsed.confidence;

        this.onProgress({
          type: 'REASONING',
          questionId: question.id,
          iteration,
          answer: currentAnswer,
          confidence: currentConfidence,
          reasoning: currentReasoning.slice(0, 200) + '...',
        });

        // Step 3: Check if we need web search
        const needsSearch = shouldSearch(currentConfidence, classified.type, iteration, searchCount, classified.subjectArea);
        const hasSearchTerms = parsed.knowledgeGaps.length > 0 || classified.keyTerms.length > 0;

        if (this.config.enableWebSearch && needsSearch && hasSearchTerms) {
          // Use specialized Polity search for constitutional questions
          if (classified.subjectArea === SubjectArea.POLITY) {
            this.onProgress({
              type: 'SEARCH',
              questionId: question.id,
              iteration,
              message: `[POLITY] Specialized constitutional search...`,
            });

            const polityResult = await performPolitySearch(
              classified.question,
              classified.options,
              accumulatedContext
            );

            if (polityResult.context.length > 50) {
              accumulatedContext += '\n\n[CONSTITUTIONAL RESEARCH]\n' + polityResult.context;
              sources.push(...polityResult.sources);
              searchCount += polityResult.searchCount;

              // Add extracted facts summary
              if (polityResult.facts.length > 0) {
                accumulatedContext += '\n\nVERIFIED CONSTITUTIONAL FACTS:\n';
                accumulatedContext += polityResult.facts.slice(0, 8).map(f => `• ${f}`).join('\n');
              }
            }

            // Continue to next iteration with new context
            continue;
          }

          // Standard search for non-Polity questions
          const searchTerms = parsed.knowledgeGaps.length > 0
            ? parsed.knowledgeGaps
            : [classified.question.slice(0, 100)]; // Use question itself if no gaps identified

          this.onProgress({
            type: 'SEARCH',
            questionId: question.id,
            iteration,
            message: `Searching for: ${searchTerms.slice(0, 2).join(', ').slice(0, 80)}...`,
          });

          const searchContext = await this.performSearch(searchTerms, classified.keyTerms);
          accumulatedContext += '\n' + searchContext.context;
          sources.push(...searchContext.sources);
          searchCount += searchContext.searchCount;

          // Continue to next iteration with new context
          continue;
        }

        // Step 4: Self-validation (if enabled and confidence is not very high)
        if (this.config.enableValidation && currentConfidence < 0.95 && currentAnswer) {
          this.onProgress({
            type: 'VALIDATE',
            questionId: question.id,
            iteration,
            message: 'Validating answer...',
          });

          const validation = await selfValidate(classified.question, classified.options, currentAnswer, currentReasoning);
          validated = true;

          if (validation.recommendation === 'ACCEPT') {
            // Calculate final confidence
            currentConfidence = calculateFinalConfidence({
              modelConfidence: currentConfidence,
              searchVerification: sources.length > 0 ? 0.8 : 0.5,
              validationScore: validation.confidence,
              questionType: classified.type,
              sourceCount: sources.length,
              iterationCount: iteration,
            });
            break;
          } else if (validation.recommendation === 'REVISE' && validation.revisedAnswer) {
            // Use the revised answer
            currentAnswer = validation.revisedAnswer;
            currentReasoning += '\n\n[REVISED based on validation]';
            continue;
          } else if (validation.recommendation === 'SEARCH_MORE' && searchCount < 5) {
            // Do additional targeted search
            const additionalSearch = await this.performTargetedSearch(validation.challenges, classified.keyTerms);
            accumulatedContext += '\n' + additionalSearch.context;
            sources.push(...additionalSearch.sources);
            searchCount += additionalSearch.searchCount;
            continue;
          }
        }

        // If confidence is high enough without validation, break
        if (currentConfidence >= this.config.confidenceThreshold) {
          break;
        }
      } catch (error) {
        this.onProgress({
          type: 'ERROR',
          questionId: question.id,
          iteration,
          message: error instanceof Error ? error.message : 'Unknown error',
        });

        // Try to continue with next iteration
        continue;
      }
    }

    // Ensure we have an answer
    if (!currentAnswer) {
      // Last resort: pick the most common pattern
      currentAnswer = 'a';
      currentConfidence = 0.25;
    }

    this.onProgress({
      type: 'COMPLETE',
      questionId: question.id,
      answer: currentAnswer,
      confidence: currentConfidence,
    });

    return {
      questionId: question.id,
      answer: currentAnswer,
      confidence: currentConfidence,
      reasoning: currentReasoning,
      iterations: iteration,
      searchCount,
      sources,
      validated,
    };
  }

  private parseReasoningResponse(
    content: string,
    reasoning: string
  ): {
    answer: string;
    analysis: string;
    confidence: number;
    knowledgeGaps: string[];
  } {
    // Combine content and reasoning for full analysis
    const fullContent = reasoning + '\n' + content;

    // Extract answer
    let answer = 'a';
    const answerMatch = content.match(/<answer>\s*([a-d])\s*<\/answer>/i);
    if (answerMatch) {
      answer = answerMatch[1].toLowerCase();
    } else {
      // Try alternative patterns
      const altMatch = content.match(/(?:answer|final answer|correct answer)[:\s]*([a-d])\b/i);
      if (altMatch) {
        answer = altMatch[1].toLowerCase();
      } else {
        // Look for the last standalone letter
        const letterMatch = content.match(/\b([a-d])\)?\s*$/i);
        if (letterMatch) {
          answer = letterMatch[1].toLowerCase();
        }
      }
    }

    // Extract analysis
    let analysis = '';
    const analysisMatch = content.match(/<analysis>([\s\S]*?)<\/analysis>/i);
    if (analysisMatch) {
      analysis = analysisMatch[1].trim();
    } else {
      // Use reasoning content if no analysis tag
      analysis = reasoning || content;
    }

    // Extract confidence
    let confidence = parseConfidenceFromResponse(content);
    if (confidence === 0.5 && reasoning) {
      // Try to extract from reasoning
      confidence = parseConfidenceFromResponse(reasoning);
    }

    // Extract knowledge gaps
    const knowledgeGaps: string[] = [];
    const gapsMatch = content.match(/<knowledge_gaps>([\s\S]*?)<\/knowledge_gaps>/i);
    if (gapsMatch) {
      const gapsText = gapsMatch[1].trim();
      if (gapsText.toLowerCase() !== 'none') {
        knowledgeGaps.push(
          ...gapsText
            .split(/[,;\n]/)
            .map((g) => g.trim())
            .filter((g) => g.length > 5)
        );
      }
    }

    return { answer, analysis, confidence, knowledgeGaps };
  }

  private async performSearch(
    knowledgeGaps: string[],
    keyTerms: string[]
  ): Promise<{
    context: string;
    sources: string[];
    searchCount: number;
  }> {
    const queries = this.generateSearchQueries(knowledgeGaps, keyTerms);
    const results: string[] = [];
    const sources: string[] = [];

    for (const query of queries.slice(0, 3)) {
      const searchResult = await webSearch(query);

      if (searchResult.results.length > 0) {
        results.push(formatSearchResultsForPrompt(searchResult.results));
        sources.push(...searchResult.results.map((r) => r.url));

        // Optionally scrape top results
        if (this.config.enableScraping && searchResult.results.length > 0) {
          const topUrls = searchResult.results.slice(0, 2).map((r) => r.url);
          const scraped = await scrapeMultiple(topUrls);
          const scrapedContent = formatScrapedContentForPrompt(scraped, keyTerms);
          if (scrapedContent.length > 50) {
            results.push('\nDetailed content:\n' + scrapedContent);
          }
        }
      }
    }

    return {
      context: results.join('\n\n'),
      sources: [...new Set(sources)],
      searchCount: queries.length,
    };
  }

  private async performTargetedSearch(
    challenges: string[],
    keyTerms: string[]
  ): Promise<{
    context: string;
    sources: string[];
    searchCount: number;
  }> {
    // Generate queries from challenges
    const queries = challenges
      .slice(0, 2)
      .map((c) => {
        // Extract key terms from challenge
        const words = c.split(' ').filter((w) => w.length > 4);
        return words.slice(0, 5).join(' ');
      })
      .filter((q) => q.length > 10);

    if (queries.length === 0) {
      return { context: '', sources: [], searchCount: 0 };
    }

    return this.performSearch(queries, keyTerms);
  }

  private generateSearchQueries(knowledgeGaps: string[], keyTerms: string[]): string[] {
    const queries: string[] = [];

    // Convert knowledge gaps to search queries
    for (const gap of knowledgeGaps.slice(0, 3)) {
      // Remove question words and make it a factual query
      let query = gap
        .replace(/^(what is|what are|who is|when did|where is|how many|is it true that)/i, '')
        .replace(/\?/g, '')
        .trim();

      // Add key terms if query is too short
      if (query.length < 20 && keyTerms.length > 0) {
        query += ' ' + keyTerms.slice(0, 2).join(' ');
      }

      if (query.length > 10) {
        queries.push(query);
      }
    }

    // If no gaps, use key terms
    if (queries.length === 0 && keyTerms.length > 0) {
      queries.push(keyTerms.slice(0, 4).join(' '));
    }

    return queries;
  }
}
