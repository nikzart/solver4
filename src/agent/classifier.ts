/**
 * Question Type Classifier
 */

export enum QuestionType {
  STATEMENT_ANALYSIS = 'STATEMENT_ANALYSIS', // Statement I/II correct?
  STATEMENT_EXPLAIN = 'STATEMENT_EXPLAIN', // Does II explain I?
  MATCH_PAIRS = 'MATCH_PAIRS', // Match column A with B
  HOW_MANY_CORRECT = 'HOW_MANY_CORRECT', // How many are correct?
  SELECT_CORRECT = 'SELECT_CORRECT', // Which is/are correct?
  FACTUAL_RECALL = 'FACTUAL_RECALL', // Direct fact question
  LOGICAL_REASONING = 'LOGICAL_REASONING', // Requires deduction
  SEQUENCE_ORDER = 'SEQUENCE_ORDER', // Correct sequence/order
}

export enum SubjectArea {
  POLITY = 'POLITY',
  GEOGRAPHY = 'GEOGRAPHY',
  ENVIRONMENT = 'ENVIRONMENT',
  SCIENCE_TECH = 'SCIENCE_TECH',
  ECONOMY = 'ECONOMY',
  HISTORY = 'HISTORY',
  CURRENT_AFFAIRS = 'CURRENT_AFFAIRS',
  GENERAL = 'GENERAL',
}

export interface ClassifiedQuestion {
  id: number;
  question: string;
  options: Record<string, string>;
  type: QuestionType;
  subjectArea: SubjectArea;
  statements: string[];
  keyTerms: string[];
  difficulty: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresSearch: boolean;
}

export function classifyQuestion(question: { id: number; question: string; options: Record<string, string> }): ClassifiedQuestion {
  const text = question.question.toLowerCase();
  const upperText = question.question;

  // Extract statements
  const statements = extractStatements(upperText);

  // Determine question type
  const type = determineQuestionType(text, statements.length);

  // Determine subject area
  const subjectArea = determineSubjectArea(text);

  // Extract key terms for searching
  const keyTerms = extractKeyTerms(question.question);

  // Determine difficulty
  const difficulty = determineDifficulty(type, statements.length, keyTerms.length);

  // Determine if search is likely needed
  const requiresSearch = shouldSearch(type, text);

  return {
    id: question.id,
    question: question.question,
    options: question.options,
    type,
    subjectArea,
    statements,
    keyTerms,
    difficulty,
    requiresSearch,
  };
}

function extractStatements(text: string): string[] {
  const statements: string[] = [];

  // Match Statement-I, Statement-II, Statement-III patterns
  const statementPattern = /Statement[- ]?([IVX]+):?\s*([\s\S]*?)(?=Statement[- ]?[IVX]+:|Which|Select|How many|$)/gi;
  let match;

  while ((match = statementPattern.exec(text)) !== null) {
    const statement = match[2].trim();
    if (statement.length > 10) {
      statements.push(`Statement-${match[1]}: ${statement}`);
    }
  }

  // Also match numbered items (1. 2. 3.)
  if (statements.length === 0) {
    const numberedPattern = /(?:^|\n)\s*(\d+)[.)]\s*([^\n]+)/g;
    while ((match = numberedPattern.exec(text)) !== null) {
      statements.push(`${match[1]}. ${match[2].trim()}`);
    }
  }

  return statements;
}

function determineQuestionType(text: string, statementCount: number): QuestionType {
  // Statement with explanation check
  if (text.includes('statement-ii') && (text.includes('explains') || text.includes('explain'))) {
    return QuestionType.STATEMENT_EXPLAIN;
  }

  // Statement analysis
  if (text.includes('statement-i') || text.includes('statement-ii') || text.includes('statement-iii')) {
    return QuestionType.STATEMENT_ANALYSIS;
  }

  // How many correct
  if (text.includes('how many') && (text.includes('correct') || text.includes('above'))) {
    return QuestionType.HOW_MANY_CORRECT;
  }

  // Match pairs
  if (text.includes('correctly matched') || text.includes('match the') || text.includes('pairs given')) {
    return QuestionType.MATCH_PAIRS;
  }

  // Sequence/order
  if (text.includes('sequence') || text.includes('order') || text.includes('from west to east') || text.includes('downstream')) {
    return QuestionType.SEQUENCE_ORDER;
  }

  // Select correct statements
  if ((text.includes('which of the') || text.includes('which one of')) && (text.includes('correct') || text.includes('true'))) {
    return QuestionType.SELECT_CORRECT;
  }

  // Default to factual recall for simple questions
  if (statementCount === 0 && !text.includes('consider the following')) {
    return QuestionType.FACTUAL_RECALL;
  }

  return QuestionType.LOGICAL_REASONING;
}

function determineSubjectArea(text: string): SubjectArea {
  // Polity keywords
  const polityKeywords = [
    'constitution',
    'parliament',
    'president',
    'governor',
    'article',
    'amendment',
    'lok sabha',
    'rajya sabha',
    'fundamental',
    'directive',
    'election',
    'commission',
    'tribunal',
    'judiciary',
    'supreme court',
    'high court',
    'citizenship',
    'emergency',
    'finance bill',
    'money bill',
    'panchayat',
    'municipality',
    'federal',
    'schedule',
  ];

  // Geography keywords
  const geographyKeywords = [
    'river',
    'mountain',
    'climate',
    'rainfall',
    'ocean',
    'sea',
    'latitude',
    'longitude',
    'equator',
    'tropic',
    'glacier',
    'volcano',
    'earthquake',
    'isotherm',
    'monsoon',
    'cyclone',
    'waterfall',
    'plateau',
    'delta',
    'basin',
    'altitude',
    'atmosphere',
    'troposphere',
  ];

  // Environment keywords
  const environmentKeywords = [
    'biodiversity',
    'species',
    'ecosystem',
    'wildlife',
    'forest',
    'conservation',
    'pollution',
    'climate change',
    'global warming',
    'carbon',
    'emission',
    'renewable',
    'sustainable',
    'endangered',
    'habitat',
    'peatland',
  ];

  // Science & Tech keywords
  const scienceKeywords = [
    'nuclear',
    'radiation',
    'vaccine',
    'virus',
    'bacteria',
    'dna',
    'gene',
    'crispr',
    'satellite',
    'spacecraft',
    'reactor',
    'hydrogen',
    'chemical',
    'compound',
    'element',
    'photosynthesis',
    'cell',
    'lidar',
    'radar',
    'technology',
    'sterilization',
    'graphite',
    'diamond',
  ];

  // Economy keywords
  const economyKeywords = ['gdp', 'inflation', 'fiscal', 'monetary', 'tax', 'budget', 'trade', 'export', 'import', 'industry', 'agriculture', 'bank', 'reserve', 'finance'];

  // Count matches
  const counts = {
    [SubjectArea.POLITY]: polityKeywords.filter((kw) => text.includes(kw)).length,
    [SubjectArea.GEOGRAPHY]: geographyKeywords.filter((kw) => text.includes(kw)).length,
    [SubjectArea.ENVIRONMENT]: environmentKeywords.filter((kw) => text.includes(kw)).length,
    [SubjectArea.SCIENCE_TECH]: scienceKeywords.filter((kw) => text.includes(kw)).length,
    [SubjectArea.ECONOMY]: economyKeywords.filter((kw) => text.includes(kw)).length,
  };

  // Find max
  let maxArea = SubjectArea.GENERAL;
  let maxCount = 0;

  for (const [area, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxArea = area as SubjectArea;
    }
  }

  return maxCount > 0 ? maxArea : SubjectArea.GENERAL;
}

function extractKeyTerms(text: string): string[] {
  const terms: string[] = [];

  // Extract capitalized terms (likely proper nouns)
  const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g;
  let match;

  while ((match = capitalizedPattern.exec(text)) !== null) {
    const term = match[0];
    // Filter out common words and options
    if (term.length > 3 && !['Statement', 'Which', 'Select', 'Consider', 'The', 'Only', 'Both', 'Neither', 'Answer', 'Code', 'Given', 'Above', 'Below', 'Following'].includes(term)) {
      terms.push(term);
    }
  }

  // Extract quoted terms
  const quotedPattern = /"([^"]+)"/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    terms.push(match[1]);
  }

  // Extract Article numbers
  const articlePattern = /Article\s*(\d+[A-Z]?)/gi;
  while ((match = articlePattern.exec(text)) !== null) {
    terms.push(`Article ${match[1]}`);
  }

  // Remove duplicates
  return [...new Set(terms)];
}

function determineDifficulty(type: QuestionType, statementCount: number, keyTermCount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  // Base difficulty by type
  const typeDifficulty: Record<QuestionType, number> = {
    [QuestionType.FACTUAL_RECALL]: 1,
    [QuestionType.SELECT_CORRECT]: 2,
    [QuestionType.STATEMENT_ANALYSIS]: 3,
    [QuestionType.STATEMENT_EXPLAIN]: 3,
    [QuestionType.HOW_MANY_CORRECT]: 4,
    [QuestionType.MATCH_PAIRS]: 4,
    [QuestionType.SEQUENCE_ORDER]: 4,
    [QuestionType.LOGICAL_REASONING]: 3,
  };

  let score = typeDifficulty[type];

  // Adjust for statement count
  score += Math.min(2, statementCount);

  // Adjust for complexity
  if (keyTermCount > 5) score += 1;

  if (score <= 2) return 'LOW';
  if (score <= 4) return 'MEDIUM';
  return 'HIGH';
}

function shouldSearch(type: QuestionType, text: string): boolean {
  // Types that benefit most from search
  const searchBenefitTypes = [QuestionType.FACTUAL_RECALL, QuestionType.MATCH_PAIRS, QuestionType.HOW_MANY_CORRECT, QuestionType.SEQUENCE_ORDER];

  if (searchBenefitTypes.includes(type)) return true;

  // Questions about specific facts
  if (text.includes('which country') || text.includes('which state') || text.includes('which river') || text.includes('which year')) {
    return true;
  }

  // Questions requiring verification
  if (text.includes('100 million farmers') || text.includes('world toilet') || text.includes('greenfield')) {
    return true;
  }

  return false;
}
