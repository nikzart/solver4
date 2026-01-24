/**
 * Firecrawl Web Scraper Tool
 */

export interface ScrapeResult {
  url: string;
  title: string;
  markdown: string;
  success: boolean;
  error?: string;
}

const FIRECRAWL_BASE_URL = 'http://74.225.8.137:3002';

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    const response = await fetch(`${FIRECRAWL_BASE_URL}/v1/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Scrape API Error (${response.status})`);
    }

    const data = await response.json();

    if (!data.success) {
      return {
        url,
        title: '',
        markdown: '',
        success: false,
        error: 'Scraping failed',
      };
    }

    // Limit markdown size to prevent token overflow
    const markdown = data.data?.markdown || '';
    const truncatedMarkdown = markdown.slice(0, 8000);

    return {
      url,
      title: data.data?.metadata?.title || '',
      markdown: truncatedMarkdown,
      success: true,
    };
  } catch (error) {
    return {
      url,
      title: '',
      markdown: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function scrapeMultiple(urls: string[]): Promise<ScrapeResult[]> {
  // Scrape up to 3 URLs in parallel
  const urlsToScrape = urls.slice(0, 3);

  const results = await Promise.all(urlsToScrape.map((url) => scrapeUrl(url)));

  return results;
}

export function extractRelevantContent(markdown: string, keywords: string[]): string {
  const lines = markdown.split('\n');
  const relevantLines: string[] = [];
  let contextLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const isRelevant = keywords.some((kw) => line.includes(kw.toLowerCase()));

    if (isRelevant) {
      // Include 2 lines before and after for context
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 2);

      for (let j = start; j <= end; j++) {
        if (!relevantLines.includes(lines[j])) {
          relevantLines.push(lines[j]);
        }
      }
      contextLines = 2;
    } else if (contextLines > 0) {
      relevantLines.push(lines[i]);
      contextLines--;
    }
  }

  // Limit to 2000 characters
  return relevantLines.join('\n').slice(0, 2000);
}

export function formatScrapedContentForPrompt(results: ScrapeResult[], keywords: string[]): string {
  const successful = results.filter((r) => r.success);

  if (successful.length === 0) {
    return 'No content could be scraped from the sources.';
  }

  return successful
    .map((r) => {
      const relevantContent = extractRelevantContent(r.markdown, keywords);
      return `[${r.title}]
${relevantContent}
(Source: ${r.url})`;
    })
    .join('\n\n---\n\n');
}
