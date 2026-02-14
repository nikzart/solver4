/**
 * Bing Web Search API Tool
 * Alternative to Serper for web search
 */

export interface BingSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface BingSearchResponse {
  query: string;
  results: BingSearchResult[];
}

const BING_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';

export async function bingSearch(query: string): Promise<BingSearchResponse> {
  const apiKey = process.env.BING_API_KEY;

  if (!apiKey) {
    console.log('[BING] No API key, falling back to empty results');
    return { query, results: [] };
  }

  try {
    const url = new URL(BING_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('count', '5');
    url.searchParams.set('mkt', 'en-IN');
    url.searchParams.set('safeSearch', 'Off');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BING] API Error (${response.status}): ${errorText}`);
      return { query, results: [] };
    }

    const data = await response.json();

    const results: BingSearchResult[] = (data.webPages?.value || []).map((item: any) => ({
      title: item.name || '',
      url: item.url || '',
      snippet: item.snippet || '',
    }));

    console.log(`[BING] "${query.slice(0, 40)}..." → ${results.length} results`);
    return { query, results };
  } catch (error) {
    console.error(`[BING] Search error:`, error);
    return { query, results: [] };
  }
}

export async function bingSearchMultiple(queries: string[]): Promise<Map<string, BingSearchResponse>> {
  const results = new Map<string, BingSearchResponse>();

  // Run searches in parallel
  const promises = queries.map(async (query) => {
    const result = await bingSearch(query);
    results.set(query, result);
  });

  await Promise.all(promises);
  return results;
}
