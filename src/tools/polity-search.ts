/**
 * Domain-specific search strategies for Polity/Constitutional questions
 * Implements specialized query generation and source prioritization
 */

import { webSearch, type SearchResult } from './web-search';
import { scrapeUrl } from './scraper';

export enum PolitySubCategory {
  ARTICLE_SPECIFIC = 'article_specific',
  PARLIAMENTARY_PROCEDURE = 'parliamentary_procedure',
  FUNDAMENTAL_RIGHTS = 'fundamental_rights',
  EMERGENCY_PROVISIONS = 'emergency_provisions',
  FEDERAL_STRUCTURE = 'federal_structure',
  CONSTITUTIONAL_BODIES = 'constitutional_bodies',
  APPOINTMENTS = 'appointments',
  AMENDMENTS = 'amendments',
  SCHEDULES = 'schedules',
  ELECTIONS = 'elections',
  JUDICIARY = 'judiciary',
  EXECUTIVE = 'executive',
  GENERAL_POLITY = 'general_polity',
}

interface PolitySearchContext {
  subCategory: PolitySubCategory;
  articles: string[];
  keyTerms: string[];
  relatedConcepts: string[];
}

// Article number patterns
const ARTICLE_PATTERN = /Article\s*(\d+[A-Z]?)/gi;
const PART_PATTERN = /Part\s*(I{1,3}|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII)/gi;
const SCHEDULE_PATTERN = /(\d+)(st|nd|rd|th)\s*Schedule/gi;

// Key constitutional terms mapped to articles
const CONSTITUTIONAL_MAPPINGS: Record<string, string[]> = {
  'preamble': ['Preamble', 'Kesavananda Bharati case'],
  'fundamental rights': ['Article 12-35', 'Part III'],
  'right to equality': ['Article 14', 'Article 15', 'Article 16', 'Article 17', 'Article 18'],
  'right to freedom': ['Article 19', 'Article 20', 'Article 21', 'Article 22'],
  'freedom of speech': ['Article 19(1)(a)', 'Article 19'],
  'right to life': ['Article 21'],
  'right to education': ['Article 21A'],
  'right against exploitation': ['Article 23', 'Article 24'],
  'right to religion': ['Article 25', 'Article 26', 'Article 27', 'Article 28'],
  'cultural rights': ['Article 29', 'Article 30'],
  'right to property': ['Article 300A', '44th Amendment'],
  'directive principles': ['Article 36-51', 'Part IV', 'DPSP'],
  'fundamental duties': ['Article 51A', 'Part IVA', '42nd Amendment'],
  'president': ['Article 52-62', 'Article 53', 'Part V'],
  'vice president': ['Article 63-71', 'Article 64', 'Article 66'],
  'prime minister': ['Article 74', 'Article 75'],
  'council of ministers': ['Article 74', 'Article 75', 'Article 77', 'Article 78'],
  'attorney general': ['Article 76'],
  'parliament': ['Article 79-122', 'Part V Chapter II'],
  'lok sabha': ['Article 81', 'Article 83', 'Article 331'],
  'rajya sabha': ['Article 80', 'Article 83', 'Rajya Sabha composition'],
  'money bill': ['Article 109', 'Article 110'],
  'ordinary bill': ['Article 107', 'Article 108'],
  'constitutional amendment': ['Article 368'],
  'joint sitting': ['Article 108'],
  'governor': ['Article 153-162', 'Part VI'],
  'chief minister': ['Article 163', 'Article 164'],
  'state legislature': ['Article 168-212', 'Part VI Chapter III'],
  'supreme court': ['Article 124-147', 'Part V Chapter IV'],
  'high court': ['Article 214-231', 'Part VI Chapter V'],
  'cag': ['Article 148-151', 'Comptroller and Auditor General'],
  'upsc': ['Article 315-323', 'Union Public Service Commission'],
  'election commission': ['Article 324', 'Election Commission of India'],
  'finance commission': ['Article 280', 'Finance Commission'],
  'emergency': ['Article 352', 'Article 356', 'Article 360', 'Part XVIII'],
  'national emergency': ['Article 352', 'Article 358', 'Article 359'],
  'president rule': ['Article 356', 'State Emergency'],
  'financial emergency': ['Article 360'],
  'citizenship': ['Article 5-11', 'Part II', 'Citizenship Act 1955'],
  'union territories': ['Article 239-241', 'Part VIII'],
  'panchayats': ['Article 243', 'Part IX', '73rd Amendment'],
  'municipalities': ['Article 243P', 'Part IXA', '74th Amendment'],
  'schedules': ['Schedules of Constitution', 'First Schedule', 'Seventh Schedule'],
  'union list': ['Seventh Schedule', 'List I'],
  'state list': ['Seventh Schedule', 'List II'],
  'concurrent list': ['Seventh Schedule', 'List III'],
  'inter-state council': ['Article 263'],
  'grants-in-aid': ['Article 275', 'Article 282'],
  'consolidated fund': ['Article 266', 'Consolidated Fund of India'],
  'contingency fund': ['Article 267'],
  'public account': ['Article 266(2)'],
  'privileges': ['Article 105', 'Article 194', 'Parliamentary privileges'],
  'contempt': ['Article 129', 'Article 215', 'contempt of court'],
  'tribunals': ['Article 323A', 'Article 323B'],
  'nhrc': ['National Human Rights Commission', 'Protection of Human Rights Act 1993'],
  'defection': ['Tenth Schedule', 'Anti-defection law', '52nd Amendment'],
};

/**
 * Detect Polity sub-category from question text
 */
export function detectPolitySubCategory(question: string): PolitySearchContext {
  const lowerQuestion = question.toLowerCase();
  const articles: string[] = [];
  const keyTerms: string[] = [];
  const relatedConcepts: string[] = [];

  // Extract article numbers
  let match;
  while ((match = ARTICLE_PATTERN.exec(question)) !== null) {
    articles.push(`Article ${match[1]}`);
  }

  // Extract schedule references
  while ((match = SCHEDULE_PATTERN.exec(question)) !== null) {
    keyTerms.push(`${match[1]}${match[2]} Schedule`);
  }

  // Extract part references
  while ((match = PART_PATTERN.exec(question)) !== null) {
    keyTerms.push(`Part ${match[1]}`);
  }

  // Map key terms to related concepts
  for (const [term, mappings] of Object.entries(CONSTITUTIONAL_MAPPINGS)) {
    if (lowerQuestion.includes(term)) {
      keyTerms.push(term);
      relatedConcepts.push(...mappings);
    }
  }

  // Determine sub-category
  let subCategory = PolitySubCategory.GENERAL_POLITY;

  if (articles.length > 0 || relatedConcepts.some(c => c.includes('Article'))) {
    subCategory = PolitySubCategory.ARTICLE_SPECIFIC;
  }
  if (lowerQuestion.includes('parliament') || lowerQuestion.includes('lok sabha') ||
      lowerQuestion.includes('rajya sabha') || lowerQuestion.includes('bill') ||
      lowerQuestion.includes('joint sitting')) {
    subCategory = PolitySubCategory.PARLIAMENTARY_PROCEDURE;
  }
  if (lowerQuestion.includes('fundamental right') || lowerQuestion.includes('article 19') ||
      lowerQuestion.includes('article 21') || lowerQuestion.includes('right to')) {
    subCategory = PolitySubCategory.FUNDAMENTAL_RIGHTS;
  }
  if (lowerQuestion.includes('emergency') || lowerQuestion.includes('article 352') ||
      lowerQuestion.includes('article 356') || lowerQuestion.includes('article 358') ||
      lowerQuestion.includes('article 359') || lowerQuestion.includes('article 360')) {
    subCategory = PolitySubCategory.EMERGENCY_PROVISIONS;
  }
  if (lowerQuestion.includes('election commission') || lowerQuestion.includes('voting') ||
      lowerQuestion.includes('electoral')) {
    subCategory = PolitySubCategory.ELECTIONS;
  }
  if (lowerQuestion.includes('supreme court') || lowerQuestion.includes('high court') ||
      lowerQuestion.includes('judiciary') || lowerQuestion.includes('writ')) {
    subCategory = PolitySubCategory.JUDICIARY;
  }
  if (lowerQuestion.includes('president') || lowerQuestion.includes('governor') ||
      lowerQuestion.includes('prime minister') || lowerQuestion.includes('chief minister')) {
    subCategory = PolitySubCategory.EXECUTIVE;
  }
  if (lowerQuestion.includes('appoint') || lowerQuestion.includes('appointed by')) {
    subCategory = PolitySubCategory.APPOINTMENTS;
  }
  if (lowerQuestion.includes('amendment') || lowerQuestion.includes('article 368')) {
    subCategory = PolitySubCategory.AMENDMENTS;
  }
  if (lowerQuestion.includes('schedule') || lowerQuestion.includes('union list') ||
      lowerQuestion.includes('state list') || lowerQuestion.includes('concurrent list')) {
    subCategory = PolitySubCategory.SCHEDULES;
  }
  if (lowerQuestion.includes('cag') || lowerQuestion.includes('upsc') ||
      lowerQuestion.includes('finance commission') || lowerQuestion.includes('election commission') ||
      lowerQuestion.includes('nhrc')) {
    subCategory = PolitySubCategory.CONSTITUTIONAL_BODIES;
  }

  return {
    subCategory,
    articles: [...new Set(articles)],
    keyTerms: [...new Set(keyTerms)],
    relatedConcepts: [...new Set(relatedConcepts)],
  };
}

/**
 * Generate optimized search queries for Polity questions
 */
export function generatePolitySearchQueries(
  question: string,
  options: Record<string, string>,
  context: PolitySearchContext
): string[] {
  const queries: string[] = [];
  const optionTexts = Object.values(options).join(' ');

  // Base query with Indian Constitution context
  const baseTerms = 'Indian Constitution';

  // Article-specific queries
  if (context.articles.length > 0) {
    for (const article of context.articles.slice(0, 2)) {
      queries.push(`${article} ${baseTerms} provisions explained`);
      queries.push(`${article} ${baseTerms} exact text meaning`);
    }
  }

  // Sub-category specific queries
  switch (context.subCategory) {
    case PolitySubCategory.PARLIAMENTARY_PROCEDURE:
      if (question.toLowerCase().includes('money bill')) {
        queries.push('Money Bill Article 110 Indian Constitution procedure Lok Sabha Rajya Sabha');
        queries.push('Money Bill amendment Rajya Sabha powers limitations');
      }
      if (question.toLowerCase().includes('joint sitting')) {
        queries.push('Joint sitting Parliament Article 108 deadlock bill');
      }
      if (question.toLowerCase().includes('lapse') || question.toLowerCase().includes('prorogue')) {
        queries.push('Bills lapse prorogation dissolution Parliament India');
        queries.push('Pending bills Rajya Sabha dissolution Lok Sabha');
      }
      queries.push('Parliamentary procedure India Lok Sabha Rajya Sabha');
      break;

    case PolitySubCategory.FUNDAMENTAL_RIGHTS:
      queries.push('Fundamental Rights Part III Indian Constitution');
      if (question.toLowerCase().includes('citizen')) {
        queries.push('Fundamental Rights available citizens non-citizens India');
        queries.push('Article 14 equality citizens foreigners India');
        queries.push('Article 19 freedom speech citizens only India');
      }
      break;

    case PolitySubCategory.EMERGENCY_PROVISIONS:
      queries.push('Emergency provisions Part XVIII Indian Constitution');
      queries.push('Article 352 358 359 National Emergency Fundamental Rights suspension');
      if (question.toLowerCase().includes('suspend')) {
        queries.push('Which fundamental rights suspended during emergency Article 358 359');
        queries.push('Article 20 21 cannot be suspended emergency');
      }
      break;

    case PolitySubCategory.APPOINTMENTS:
      // Extract what's being appointed
      const appointmentTerms = ['AG', 'Attorney General', 'CAG', 'Comptroller', 'UPSC', 'Chairman',
        'Governor', 'Judge', 'Election Commissioner'];
      for (const term of appointmentTerms) {
        if (question.toLowerCase().includes(term.toLowerCase())) {
          queries.push(`${term} appointment President India Constitution Article`);
        }
      }
      queries.push('Constitutional appointments President India');
      break;

    case PolitySubCategory.EXECUTIVE:
      if (question.toLowerCase().includes('vice president')) {
        queries.push('Vice President India election electoral college Article 66');
        queries.push('Vice President ex-officio Chairman Rajya Sabha Article 64');
        queries.push('Vice President President election method difference');
      }
      if (question.toLowerCase().includes('president')) {
        queries.push('President India powers Article 53 72 74');
      }
      break;

    case PolitySubCategory.CONSTITUTIONAL_BODIES:
      if (question.toLowerCase().includes('election commission')) {
        queries.push('Election Commission India Article 324 Constitutional body');
        queries.push('State Election Commission Panchayat elections Article 243K');
      }
      if (question.toLowerCase().includes('cag')) {
        queries.push('CAG Comptroller Auditor General Article 148 149 150 151');
        queries.push('CAG guardian public purse audit Union State');
      }
      if (question.toLowerCase().includes('finance commission')) {
        queries.push('Finance Commission Article 280 appointment tenure');
      }
      break;

    case PolitySubCategory.SCHEDULES:
      queries.push('Schedules Indian Constitution list');
      if (question.toLowerCase().includes('8th schedule') || question.toLowerCase().includes('eighth schedule')) {
        queries.push('8th Schedule Indian Constitution languages list');
      }
      if (question.toLowerCase().includes('7th schedule') || question.toLowerCase().includes('seventh schedule')) {
        queries.push('7th Schedule Union State Concurrent List');
      }
      if (question.toLowerCase().includes('state list')) {
        queries.push('State List subjects Seventh Schedule Constitution');
      }
      break;

    case PolitySubCategory.JUDICIARY:
      queries.push('Supreme Court High Court Indian Constitution powers');
      if (question.toLowerCase().includes('writ')) {
        queries.push('Writs Article 32 226 habeas corpus mandamus');
      }
      if (question.toLowerCase().includes('court of record')) {
        queries.push('Supreme Court Court of Record Article 129 meaning');
      }
      break;

    default:
      // General Polity query
      queries.push(`${context.keyTerms.slice(0, 3).join(' ')} Indian Constitution`);
  }

  // Add queries from related concepts
  for (const concept of context.relatedConcepts.slice(0, 2)) {
    queries.push(`${concept} Indian Constitution`);
  }

  // Add query based on options if they contain specific terms
  const optionKeywords = extractKeywordsFromOptions(options);
  if (optionKeywords.length > 0) {
    queries.push(`${optionKeywords.slice(0, 3).join(' ')} Indian Constitution`);
  }

  // Deduplicate and limit
  return [...new Set(queries)].slice(0, 5);
}

/**
 * Extract important keywords from options
 */
function extractKeywordsFromOptions(options: Record<string, string>): string[] {
  const keywords: string[] = [];
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
    'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'both', 'either', 'neither',
    'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also']);

  for (const optionText of Object.values(options)) {
    const words = optionText.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
    keywords.push(...words);
  }

  // Count frequency and return most common
  const freq: Record<string, number> = {};
  for (const word of keywords) {
    freq[word] = (freq[word] || 0) + 1;
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * Priority sources for Polity information
 */
const PRIORITY_DOMAINS = [
  'india.gov.in',
  'legislative.gov.in',
  'indiacode.nic.in',
  'constitutionofindia.net',
  'legalserviceindia.com',
  'indiankanoon.org',
  'clearias.com',
  'drishtiias.com',
  'vajiramandravi.com',
];

/**
 * Score and rank search results for Polity relevance
 */
export function rankPolityResults(results: SearchResult[], context: PolitySearchContext): SearchResult[] {
  return results
    .map(result => {
      let score = 0;

      // Domain priority
      for (let i = 0; i < PRIORITY_DOMAINS.length; i++) {
        if (result.url.includes(PRIORITY_DOMAINS[i])) {
          score += (PRIORITY_DOMAINS.length - i) * 10;
          break;
        }
      }

      // Article mention in snippet
      for (const article of context.articles) {
        if (result.snippet.toLowerCase().includes(article.toLowerCase())) {
          score += 20;
        }
      }

      // Key term mention
      for (const term of context.keyTerms) {
        if (result.snippet.toLowerCase().includes(term.toLowerCase())) {
          score += 10;
        }
      }

      // Related concept mention
      for (const concept of context.relatedConcepts) {
        if (result.snippet.toLowerCase().includes(concept.toLowerCase())) {
          score += 5;
        }
      }

      // Penalize very old or unreliable sources
      if (result.url.includes('quora.com') || result.url.includes('reddit.com')) {
        score -= 20;
      }

      return { ...result, score };
    })
    .sort((a, b) => (b as any).score - (a as any).score);
}

/**
 * Extract constitutional facts from scraped content
 */
export function extractConstitutionalFacts(content: string, context: PolitySearchContext): string[] {
  const facts: string[] = [];
  const lines = content.split(/[.\n]/).map(l => l.trim()).filter(l => l.length > 20);

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Extract lines mentioning articles
    for (const article of context.articles) {
      if (lowerLine.includes(article.toLowerCase())) {
        facts.push(line);
        break;
      }
    }

    // Extract lines with key constitutional terms
    const constitutionalTerms = [
      'constitution', 'article', 'amendment', 'parliament', 'president',
      'supreme court', 'high court', 'fundamental', 'directive', 'schedule',
      'election', 'appointed', 'elected', 'power', 'jurisdiction'
    ];

    if (constitutionalTerms.some(term => lowerLine.includes(term))) {
      // Check if it's a factual statement (contains "is", "are", "shall", "may", etc.)
      if (/\b(is|are|was|were|shall|may|can|cannot|must|provides|states|according)\b/.test(lowerLine)) {
        facts.push(line);
      }
    }
  }

  // Deduplicate and limit
  const uniqueFacts = [...new Set(facts)];
  return uniqueFacts.slice(0, 15);
}

/**
 * Main function: Perform specialized Polity search
 */
export async function performPolitySearch(
  question: string,
  options: Record<string, string>,
  previousContext: string = ''
): Promise<{
  context: string;
  sources: string[];
  searchCount: number;
  facts: string[];
}> {
  // Detect sub-category and extract context
  const polityContext = detectPolitySubCategory(question);

  console.log(`  [Polity Search] Category: ${polityContext.subCategory}`);
  console.log(`  [Polity Search] Articles: ${polityContext.articles.join(', ') || 'none'}`);
  console.log(`  [Polity Search] Key terms: ${polityContext.keyTerms.slice(0, 3).join(', ') || 'none'}`);

  // Generate optimized queries
  const queries = generatePolitySearchQueries(question, options, polityContext);
  console.log(`  [Polity Search] Queries: ${queries.length}`);

  const allResults: SearchResult[] = [];
  const sources: string[] = [];
  const allFacts: string[] = [];
  let searchCount = 0;

  // Execute searches
  for (const query of queries.slice(0, 3)) {
    try {
      const searchResult = await webSearch(query);
      searchCount++;

      if (searchResult.results.length > 0) {
        // Rank results by Polity relevance
        const rankedResults = rankPolityResults(searchResult.results, polityContext);
        allResults.push(...rankedResults.slice(0, 3));
      }
    } catch (error) {
      console.error(`  [Polity Search] Search error: ${error}`);
    }
  }

  // Deduplicate results by URL
  const uniqueResults = allResults.filter((result, index, self) =>
    index === self.findIndex(r => r.url === result.url)
  ).slice(0, 5);

  // Scrape top results
  for (const result of uniqueResults.slice(0, 2)) {
    try {
      const scraped = await scrapeUrl(result.url);
      if (scraped.content) {
        const facts = extractConstitutionalFacts(scraped.content, polityContext);
        allFacts.push(...facts);
        sources.push(result.url);
      }
    } catch (error) {
      // Skip failed scrapes
    }
  }

  // Format context for LLM
  let contextText = '';

  // Add search result snippets
  if (uniqueResults.length > 0) {
    contextText += 'SEARCH RESULTS:\n';
    for (const result of uniqueResults) {
      contextText += `- ${result.title}: ${result.snippet}\n`;
    }
    contextText += '\n';
  }

  // Add extracted facts
  if (allFacts.length > 0) {
    contextText += 'CONSTITUTIONAL FACTS:\n';
    for (const fact of [...new Set(allFacts)].slice(0, 10)) {
      contextText += `- ${fact}\n`;
    }
  }

  // Add key mappings if relevant
  if (polityContext.relatedConcepts.length > 0) {
    contextText += '\nRELATED CONSTITUTIONAL PROVISIONS:\n';
    contextText += polityContext.relatedConcepts.slice(0, 5).join(', ') + '\n';
  }

  return {
    context: contextText,
    sources: [...new Set(sources)],
    searchCount,
    facts: [...new Set(allFacts)],
  };
}
