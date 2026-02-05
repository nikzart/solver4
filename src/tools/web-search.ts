/**
 * Web Search Tool - Simplified for Gemini-first approach
 *
 * Primary: geminiContextSearch() - Pass question + options, get explanation
 * Fallback: webSearch() - Legacy Serper-based search for raw results
 */

import { geminiSearch, vertexSearch, vertexSearchMultiple as vertexMultiple } from './vertex-search';

// New simplified interface for Gemini search
export interface GeminiContextResponse {
  explanation: string;      // AI-generated research context
  sources: string[];        // Source attributions
}

// Legacy interface for backward compatibility
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  summary?: string;  // AI-generated summary
}

const SERPER_API_URL = 'https://google.serper.dev/search';

function getSerperApiKey(): string {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY environment variable is required');
  }
  return apiKey;
}

/**
 * Check if Gemini Search is properly configured (check at runtime)
 */
export function isGeminiConfigured(): boolean {
  return process.env.USE_VERTEX_AI === 'true' && !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

/**
 * PRIMARY: Search using Gemini with question + options context
 * Returns a comprehensive explanation, not raw URLs/snippets
 */
export async function geminiContextSearch(
  question: string,
  options: Record<string, string>
): Promise<GeminiContextResponse> {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini search not configured. Set USE_VERTEX_AI=true and GOOGLE_APPLICATION_CREDENTIALS');
  }

  const result = await geminiSearch(question, options);
  return {
    explanation: result.explanation,
    sources: result.sources
  };
}

/**
 * LEGACY: Original webSearch function for backward compatibility
 * Use geminiContextSearch() for new code
 */
export async function webSearch(
  query: string,
  options?: {
    category?: 'general' | 'news' | 'science';
    numResults?: number;
  }
): Promise<SearchResponse> {
  const numResults = options?.numResults ?? 5;

  // Use Vertex AI Search if configured
  if (isGeminiConfigured()) {
    try {
      const vertexResult = await vertexSearch(query, { numResults });
      return {
        query,
        results: vertexResult.results.map((r: any, i: number) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.snippet || '',
          source: 'gemini',
          score: 1 - i * 0.1,
        })),
        totalResults: vertexResult.results.length,
        summary: vertexResult.summary,
      };
    } catch (error) {
      console.error('Gemini Search failed, falling back to Serper:', error);
      // Fall through to Serper
    }
  }

  // Serper (default or fallback)
  try {
    const response = await fetch(SERPER_API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': getSerperApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query.slice(0, 200), // Limit query length for Serper
        num: numResults,
      }),
    });

    if (!response.ok) {
      throw new Error(`Serper API Error (${response.status})`);
    }

    const data = await response.json();

    const results: SearchResult[] = (data.organic || [])
      .slice(0, numResults)
      .map((r: Record<string, unknown>, i: number) => ({
        title: (r.title as string) || '',
        url: (r.link as string) || '',
        snippet: (r.snippet as string) || '',
        source: 'google',
        score: 1 - i * 0.1,
      }));

    // Also include knowledge graph if available
    if (data.knowledgeGraph) {
      const kg = data.knowledgeGraph;
      results.unshift({
        title: kg.title || 'Knowledge Graph',
        url: kg.website || '',
        snippet: kg.description || '',
        source: 'knowledge_graph',
        score: 1.5,
      });
    }

    // Include answer box if available
    if (data.answerBox) {
      const ab = data.answerBox;
      results.unshift({
        title: ab.title || 'Answer',
        url: ab.link || '',
        snippet: ab.answer || ab.snippet || '',
        source: 'answer_box',
        score: 2.0,
      });
    }

    return {
      query,
      results,
      totalResults: results.length,
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      query,
      results: [],
      totalResults: 0,
    };
  }
}

export async function searchMultiple(queries: string[]): Promise<Map<string, SearchResponse>> {
  // Use Vertex AI Search if configured
  if (isGeminiConfigured()) {
    try {
      const vertexResults = await vertexMultiple(queries);
      const results = new Map<string, SearchResponse>();

      for (const [query, vertexResult] of vertexResults) {
        results.set(query, {
          query,
          results: vertexResult.results.map((r: any, i: number) => ({
            title: r.title || '',
            url: r.url || '',
            snippet: r.snippet || '',
            source: 'gemini',
            score: 1 - i * 0.1,
          })),
          totalResults: vertexResult.results.length,
          summary: vertexResult.summary,
        });
      }

      return results;
    } catch (error) {
      console.error('Gemini Search multiple failed, falling back to Serper:', error);
      // Fall through to Serper
    }
  }

  // Serper (default or fallback)
  const results = new Map<string, SearchResponse>();

  // Execute searches in parallel
  const searchPromises = queries.map(async (query) => {
    const result = await webSearch(query);
    return { query, result };
  });

  const searchResults = await Promise.all(searchPromises);

  for (const { query, result } of searchResults) {
    results.set(query, result);
  }

  return results;
}

export function formatSearchResultsForPrompt(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No search results found.';
  }

  return results
    .map(
      (r, i) => `[Source ${i + 1}] ${r.title}
${r.snippet}
(URL: ${r.url})`
    )
    .join('\n\n');
}
