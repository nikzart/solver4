/**
 * Serper Web Search Tool (Google Search API)
 */

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
}

const SERPER_API_URL = 'https://google.serper.dev/search';

function getSerperApiKey(): string {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY environment variable is required');
  }
  return apiKey;
}

export async function webSearch(
  query: string,
  options?: {
    category?: 'general' | 'news' | 'science';
    numResults?: number;
  }
): Promise<SearchResponse> {
  const numResults = options?.numResults ?? 5;

  try {
    const response = await fetch(SERPER_API_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': getSerperApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
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
        score: 1 - i * 0.1, // Higher score for earlier results
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
