/**
 * Gemini Search - Returns explanatory context for UPSC questions
 *
 * Focuses on AI-generated summary (the valuable part), not raw URLs/snippets
 * which are typically empty from the grounding API.
 */

import { GoogleAuth } from 'google-auth-library';

const GEMINI_MODEL = 'gemini-2.5-flash';
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface GeminiSearchResult {
  explanation: string;      // AI-generated context (the valuable part)
  sources: string[];        // Just domain names for attribution
  searchPerformed: boolean;
}

let authClient: any = null;

async function getAuthClient() {
  if (!authClient) {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/generative-language'],
    });
    authClient = await auth.getClient();
  }
  return authClient;
}

/**
 * Search using Gemini with Google Search grounding
 * Returns a comprehensive explanation for the question, not raw search results
 */
export async function geminiSearch(
  question: string,
  options: Record<string, string>
): Promise<GeminiSearchResult> {
  const client = await getAuthClient();
  const accessToken = await client.getAccessToken();

  // Build a human-like search prompt
  const optionsText = Object.entries(options)
    .map(([k, v]) => `${k.toUpperCase()}) ${v}`)
    .join('\n');

  const prompt = `You are a research assistant helping answer a UPSC Civil Services exam question.
Search the web and provide verified factual information to answer this question correctly.

QUESTION:
${question}

OPTIONS:
${optionsText}

INSTRUCTIONS:
1. Search for information about each statement/option mentioned
2. Verify if each statement is factually correct or incorrect
3. Provide specific facts, dates, constitutional articles, or official sources that confirm or deny each point
4. If there are multiple valid interpretations, explain both
5. Focus on Indian context (constitutional provisions, government schemes, geography, etc.)
6. Be concise but comprehensive - include the key facts needed to answer correctly

Provide your research findings:`;

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }],
      tools: [{
        googleSearch: {}
      }],
      generationConfig: {
        temperature: 0.1,        // Very factual, low creativity
        maxOutputTokens: 4096    // Increased from 2048 for comprehensive answers
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini Search error: ${response.status} - ${errorText}`);
    throw new Error(`Gemini Search failed: ${response.status}`);
  }

  const data = await response.json();

  // Extract the AI-generated explanation (this is the valuable part)
  const explanation = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Get source domains for attribution (not full redirect URLs)
  const sources: string[] = [];
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      try {
        // Extract domain from the redirect URL if possible
        const uri = chunk.web.uri;
        // Try to get the title as source since URLs are redirects
        const title = chunk.web.title;
        if (title && !sources.includes(title)) {
          sources.push(title);
        }
      } catch {}
    }
  }

  return {
    explanation,
    sources: sources.slice(0, 5),
    searchPerformed: true
  };
}

// Legacy export for backward compatibility during transition
export async function vertexSearch(
  query: string,
  options: { numResults?: number } = {}
): Promise<{ query: string; results: any[]; summary?: string }> {
  // Parse options from query if it contains them (for single-query mode)
  const result = await geminiSearch(query, {});
  return {
    query,
    results: result.sources.map(s => ({ title: s, url: '', snippet: '' })),
    summary: result.explanation
  };
}

export async function vertexSearchMultiple(
  queries: string[]
): Promise<Map<string, { query: string; results: any[]; summary?: string }>> {
  const resultsMap = new Map();
  // For legacy compatibility, just use the first query
  if (queries.length > 0) {
    const result = await vertexSearch(queries[0]);
    resultsMap.set(queries[0], result);
  }
  return resultsMap;
}
