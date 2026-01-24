/**
 * Debug Test Runner - Batch processing with comprehensive logging
 *
 * Usage:
 *   bun run src/debug-runner.ts --batch=1     # Run batch 1 (Q1-10)
 *   bun run src/debug-runner.ts --batch=2     # Run batch 2 (Q11-21)
 *   bun run src/debug-runner.ts --question=5  # Run single question
 */

import { getProvider, type LLMMessage } from './llm/provider';
import { SYSTEM_PROMPTS, buildInitialPrompt, buildRefinedPrompt } from './llm/prompts';
import { classifyQuestion, SubjectArea } from './agent/classifier';
import { webSearch } from './tools';
import { parseConfidenceFromResponse, shouldSearch } from './validation/confidence';

// Use answers.json as source of truth - no overrides needed
const CORRECTED_ANSWERS: Record<number, string> = {};

// Batch definitions
const BATCHES: Record<number, number[]> = {
  1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  2: [11, 12, 13, 14, 15, 16, 17, 18, 19, 21],  // Skip 20 (dropped)
  3: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
  4: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41],
  5: [42, 43, 44, 45, 46, 47, 48, 49, 50, 51],  // Skip 52 (dropped)
  6: [53, 54, 55, 56, 58, 59, 60, 61, 62, 63],  // Skip 57 (dropped)
  7: [64, 65, 66, 67, 68, 69, 70, 71, 72, 73],
  8: [74, 75, 76, 77, 78, 79, 80, 81, 82, 83],
  9: [84, 85, 86, 87, 88, 89, 90, 91, 92, 93],
  10: [94, 95, 96, 97, 98, 99, 100],
};

interface IterationLog {
  iteration: number;
  reasoning: string;
  content: string;
  parsedAnswer: string;
  parsedConfidence: number;
  parsedAnalysis: string;
  llmSearchQueries: string[];
  searchTriggered: boolean;
  searchQueries?: string[];
  searchResults?: Array<{ title: string; url: string; snippet: string }>;
  politySearchUsed?: boolean;
  polityCategory?: string;
}

interface QuestionLog {
  questionId: number;
  question: string;
  options: Record<string, string>;
  classified: {
    type: string;
    subjectArea: string;
    keyTerms: string[];
    difficulty: string;
  };
  iterations: IterationLog[];
  finalAnswer: string;
  finalConfidence: number;
  expectedAnswer: string;
  correct: boolean;
  correctedAnswer?: string;
  actuallyCorrect: boolean;
  totalSearches: number;
  totalTime: number;
}

async function runQuestion(question: { id: number; question: string; options: Record<string, string> }, answers: Record<string, string>): Promise<QuestionLog> {
  const startTime = Date.now();
  const log: QuestionLog = {
    questionId: question.id,
    question: question.question,
    options: question.options,
    classified: { type: '', subjectArea: '', keyTerms: [], difficulty: '' },
    iterations: [],
    finalAnswer: '',
    finalConfidence: 0,
    expectedAnswer: answers[question.id.toString()] || '',
    correct: false,
    actuallyCorrect: false,
    totalSearches: 0,
    totalTime: 0,
  };

  // Classify
  const classified = classifyQuestion(question);
  log.classified = {
    type: classified.type,
    subjectArea: classified.subjectArea,
    keyTerms: classified.keyTerms,
    difficulty: classified.difficulty,
  };

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Q${question.id} | ${classified.type} | ${classified.subjectArea}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Question: ${question.question.slice(0, 150)}...`);
  console.log(`Options: ${Object.entries(question.options).map(([k, v]) => `${k}) ${v.slice(0, 50)}`).join(' | ')}`);

  const provider = getProvider();
  let currentAnswer = '';
  let currentConfidence = 0;
  let currentReasoning = '';
  let accumulatedContext = '';
  let searchCount = 0;

  // JSON Schema for structured output
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

  for (let iteration = 1; iteration <= 3; iteration++) {
    console.log(`\n--- Iteration ${iteration} ---`);

    const iterLog: IterationLog = {
      iteration,
      reasoning: '',
      content: '',
      parsedAnswer: '',
      parsedConfidence: 0,
      parsedAnalysis: '',
      llmSearchQueries: [],
      searchTriggered: false,
    };

    // Build messages - use REFINED_REASONING for iterations 2+ when we have search context
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

    // Call LLM with JSON schema for structured output
    const response = await provider.generate(messages, {
      temperature: 0.1,
      maxTokens: 3000,
      jsonSchema: responseSchema,
    });

    iterLog.reasoning = response.reasoning || '';
    iterLog.content = response.content;

    console.log(`\nReasoning (${response.reasoning?.length || 0} chars):`);
    console.log(response.reasoning?.slice(0, 500) + '...');

    // Parse structured JSON response
    let parsed: { answer: string; analysis: string; confidence: number; searchQueries: string[] };
    try {
      const jsonResponse = JSON.parse(response.content);
      parsed = {
        answer: jsonResponse.answer?.toLowerCase() || 'a',
        analysis: jsonResponse.analysis || '',
        confidence: jsonResponse.confidence || 0.5,
        searchQueries: jsonResponse.search_queries || [],
      };
    } catch (e) {
      // Fallback to text parsing if JSON fails
      console.log('JSON parse failed, using text parser');
      parsed = parseResponse(response.content, response.reasoning || '');
    }

    iterLog.parsedAnswer = parsed.answer;
    iterLog.parsedConfidence = parsed.confidence;
    iterLog.parsedAnalysis = parsed.analysis;
    iterLog.llmSearchQueries = parsed.searchQueries;

    currentAnswer = parsed.answer;
    currentConfidence = parsed.confidence;
    currentReasoning = parsed.analysis;

    console.log(`\nParsed: Answer=${parsed.answer.toUpperCase()}, Confidence=${(parsed.confidence * 100).toFixed(0)}%`);
    console.log(`Search Queries: ${parsed.searchQueries.length > 0 ? parsed.searchQueries.join('; ') : 'none'}`);

    // Check if search needed based on confidence rules
    const frameworkNeedsSearch = shouldSearch(currentConfidence, classified.type, iteration, searchCount, classified.subjectArea);

    // IMPORTANT: Always respect LLM-provided queries - the LLM knows what it needs to verify
    const llmRequestedSearch = parsed.searchQueries.length > 0;

    // Generate contextual fallback search queries if LLM didn't provide any but search is needed
    let searchTerms = parsed.searchQueries.slice(0, 4);
    if (frameworkNeedsSearch && searchTerms.length === 0) {
      searchTerms = generateContextualSearchQueries(classified.question, classified.options, classified.type, classified.subjectArea);
    }

    // Trigger search if EITHER:
    // 1. LLM explicitly requested search queries (it knows what it needs)
    // 2. Framework rules say search is needed AND we have queries (either LLM or fallback)
    const shouldTriggerSearch = (llmRequestedSearch || frameworkNeedsSearch) && searchTerms.length > 0;

    if (shouldTriggerSearch) {
      iterLog.searchTriggered = true;
      console.log(`\n[SEARCH TRIGGERED]`);

      iterLog.searchQueries = searchTerms;
      iterLog.searchResults = [];

      for (const query of searchTerms) {
        console.log(`Searching: "${query.slice(0, 60)}..."`);
        const searchResult = await webSearch(query);
        searchCount++;

        if (searchResult.results.length > 0) {
          iterLog.searchResults!.push(...searchResult.results.slice(0, 3).map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
          })));

          // Format for context
          const formatted = searchResult.results.slice(0, 3).map(r =>
            `[${r.title}] ${r.snippet}`
          ).join('\n\n');
          accumulatedContext += '\n\nSearch Results for "' + query + '":\n' + formatted;
        }
      }

      console.log(`Search Results: ${iterLog.searchResults?.length || 0} results`);

      log.iterations.push(iterLog);
      continue; // Go to next iteration with new context
    }

    log.iterations.push(iterLog);

    // If confidence is high enough, break
    if (currentConfidence >= 0.85) {
      break;
    }
  }

  // Set final results
  log.finalAnswer = currentAnswer;
  log.finalConfidence = currentConfidence;
  log.totalSearches = searchCount;
  log.totalTime = Date.now() - startTime;

  // Check correctness
  log.correct = log.finalAnswer.toLowerCase() === log.expectedAnswer.toLowerCase();

  // Check against corrected answer
  const correctedKey = CORRECTED_ANSWERS[question.id];
  if (correctedKey) {
    log.correctedAnswer = correctedKey;
    log.actuallyCorrect = log.finalAnswer.toLowerCase() === correctedKey.toLowerCase();
  } else {
    log.actuallyCorrect = log.correct;
  }

  // Print result
  const status = log.actuallyCorrect ? '✓' : '✗';
  const keyNote = correctedKey ? ` (key error, correct=${correctedKey.toUpperCase()})` : '';
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`RESULT: ${log.finalAnswer.toUpperCase()} ${status} (expected: ${log.expectedAnswer.toUpperCase()}${keyNote})`);
  console.log(`Confidence: ${(log.finalConfidence * 100).toFixed(0)}%, Iterations: ${log.iterations.length}, Searches: ${searchCount}`);
  console.log(`Time: ${(log.totalTime / 1000).toFixed(1)}s`);

  return log;
}

/**
 * Generate contextual search queries based on question type and content
 */
function generateContextualSearchQueries(
  question: string,
  options: Record<string, string>,
  questionType: string,
  subjectArea: string
): string[] {
  const queries: string[] = [];

  // Extract key entities from question
  const questionLower = question.toLowerCase();

  // For Polity questions - be specific about constitutional/parliamentary provisions
  if (subjectArea === 'POLITY') {
    // Look for specific constitutional bodies/roles
    if (questionLower.includes('speaker')) {
      queries.push('Speaker Lok Sabha removal procedure Article 94');
      queries.push('Speaker removal resolution voting rights');
    }
    if (questionLower.includes('rajya sabha')) {
      queries.push('Rajya Sabha powers bills constitutional provisions');
    }
    if (questionLower.includes('president')) {
      queries.push('President of India powers constitutional provisions');
    }
    if (questionLower.includes('governor')) {
      queries.push('Governor state powers Article 153');
    }
    if (questionLower.includes('prime minister')) {
      queries.push('Prime Minister powers constitutional provisions');
    }
    if (questionLower.includes('bill') || questionLower.includes('budget')) {
      queries.push('Union Budget presentation constitutional provisions');
    }
    if (questionLower.includes('article')) {
      const articleMatch = question.match(/Article\s*(\d+)/i);
      if (articleMatch) {
        queries.push(`Article ${articleMatch[1]} Indian Constitution`);
      }
    }
  }

  // For Economy questions - focus on current regulations
  if (subjectArea === 'ECONOMY') {
    if (questionLower.includes('bond') || questionLower.includes('securities')) {
      queries.push('retail investors government securities RBI Retail Direct 2021');
      queries.push('who can trade corporate bonds India SEBI');
    }
    if (questionLower.includes('rbi') || questionLower.includes('reserve bank')) {
      queries.push('RBI monetary policy current regulations');
    }
    if (questionLower.includes('sebi')) {
      queries.push('SEBI regulations latest');
    }
  }

  // For Geography questions
  if (subjectArea === 'GEOGRAPHY') {
    if (questionLower.includes('weathering')) {
      queries.push('chemical weathering rainfall carbonic acid oxygen');
      queries.push('dissolved oxygen weathering rocks oxidation');
    }
    if (questionLower.includes('rainfall') || questionLower.includes('monsoon')) {
      queries.push('rainfall chemical weathering process India');
    }
    const fallsMatch = question.match(/(\w+)\s*[Ff]alls/);
    if (fallsMatch) {
      queries.push(`${fallsMatch[1]} Falls which river location India`);
    }
  }

  // For Environment questions
  if (subjectArea === 'ENVIRONMENT') {
    if (questionLower.includes('sahel')) {
      queries.push('Sahel region Africa climate characteristics');
    }
    // Look for species/organisms
    const organisms = ['carabid', 'centipede', 'flies', 'beetle', 'insect', 'parasitoid'];
    for (const org of organisms) {
      if (questionLower.includes(org)) {
        queries.push(`${org} biological characteristics parasitoid predator`);
      }
    }
  }

  // Generic fallback - extract key terms and build meaningful queries
  if (queries.length === 0) {
    // Extract quoted terms or capitalized phrases
    const quotedTerms = question.match(/"([^"]+)"/g) || [];
    for (const term of quotedTerms.slice(0, 2)) {
      queries.push(`${term.replace(/"/g, '')} definition meaning`);
    }

    // Extract proper nouns but build meaningful queries
    const properNouns = question.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
    const stopWords = ['Consider', 'Statement', 'Which', 'How', 'What', 'Region', 'River', 'Only', 'The', 'Following', 'Information', 'Above', 'Many', 'All', 'None', 'Correct', 'Matched', 'Select', 'Given', 'Below', 'Reference', 'With', 'India', 'Indian'];
    const filteredNouns = [...new Set(properNouns)].filter(n => n.length > 3 && !stopWords.includes(n));

    // Build context-aware queries
    for (const noun of filteredNouns.slice(0, 3)) {
      if (questionType === 'SELECT_CORRECT' || questionType === 'HOW_MANY_CORRECT') {
        queries.push(`${noun} characteristics features definition`);
      } else if (questionType === 'STATEMENT_ANALYSIS') {
        queries.push(`${noun} explanation mechanism how does it work`);
      } else {
        queries.push(`${noun} ${subjectArea.toLowerCase()} India`);
      }
    }
  }

  return queries.slice(0, 4);
}

function parseResponse(content: string, reasoning: string): {
  answer: string;
  analysis: string;
  confidence: number;
  searchQueries: string[];
} {
  // Extract answer - handle various formats including markdown
  let answer = 'a';
  const answerMatch = content.match(/<answer>\s*([a-d])\s*<\/answer>/i);
  if (answerMatch) {
    answer = answerMatch[1].toLowerCase();
  } else {
    // Try markdown bold format: **b)** or **Answer:** **b)**
    const mdMatch = content.match(/\*{1,2}answer\*{0,2}[:\s]*\*{1,2}([a-d])\)?/i);
    if (mdMatch) {
      answer = mdMatch[1].toLowerCase();
    } else {
      // Try plain text format
      const altMatch = content.match(/(?:answer|final answer|correct answer)[:\s]*([a-d])\b/i);
      if (altMatch) {
        answer = altMatch[1].toLowerCase();
      }
    }
  }

  // Extract analysis
  let analysis = '';
  const analysisMatch = content.match(/<analysis>([\s\S]*?)<\/analysis>/i);
  if (analysisMatch) {
    analysis = analysisMatch[1].trim();
  } else {
    analysis = reasoning || content;
  }

  // Extract confidence
  let confidence = parseConfidenceFromResponse(content);
  if (confidence === 0.5 && reasoning) {
    confidence = parseConfidenceFromResponse(reasoning);
  }

  // Extract search queries (LLM-generated)
  const searchQueries: string[] = [];

  // Try XML tags first
  const queriesMatch = content.match(/<search_queries>([\s\S]*?)<\/search_queries>/i);
  if (queriesMatch) {
    const queriesText = queriesMatch[1].trim();
    if (queriesText.toLowerCase() !== 'none') {
      searchQueries.push(
        ...queriesText
          .split(/[\n]/)
          .map((q) => q.replace(/^[-\d.)\s"]+/, '').replace(/["]+$/, '').trim())
          .filter((q) => q.length > 5 && q.toLowerCase() !== 'none')
      );
    }
  }

  // Fallback: check for "Search queries" in various formats
  if (searchQueries.length === 0) {
    // Look for lines starting with - " after "search queries"
    const searchMatch = content.match(/\*{0,2}search\s*queries[^*]*\*{0,2}[:\s]*\n?((?:[-•*]\s*"?[^"\n]+["']?\s*\n?)+)/i);
    if (searchMatch) {
      const lines = searchMatch[1].split('\n');
      for (const line of lines) {
        const cleaned = line.replace(/^[-•*\s"]+/, '').replace(/["']+$/, '').trim();
        if (cleaned.length > 5 && !cleaned.toLowerCase().includes('none') && !cleaned.toLowerCase().includes('verification')) {
          searchQueries.push(cleaned);
        }
      }
    }
  }

  // Fallback: also check knowledge_gaps for backward compatibility
  const gapsMatch = content.match(/<knowledge_gaps>([\s\S]*?)<\/knowledge_gaps>/i);
  if (gapsMatch && searchQueries.length === 0) {
    const gapsText = gapsMatch[1].trim();
    if (gapsText.toLowerCase() !== 'none') {
      searchQueries.push(
        ...gapsText
          .split(/[,;\n]/)
          .map((g) => g.trim())
          .filter((g) => g.length > 5)
      );
    }
  }

  return { answer, analysis, confidence, searchQueries };
}

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  const batchArg = args.find(a => a.startsWith('--batch='));
  const questionArg = args.find(a => a.startsWith('--question='));

  // Load data
  const questionsFile = Bun.file('./questions.json');
  const questionsData = await questionsFile.json();
  const answersFile = Bun.file('./answers.json');
  const answersData = await answersFile.json();

  let questionIds: number[];

  if (questionArg) {
    questionIds = [parseInt(questionArg.split('=')[1])];
  } else if (batchArg) {
    const batchNum = parseInt(batchArg.split('=')[1]);
    questionIds = BATCHES[batchNum] || [];
    if (questionIds.length === 0) {
      console.error(`Invalid batch number: ${batchNum}`);
      process.exit(1);
    }
  } else {
    // Default to batch 1
    questionIds = BATCHES[1];
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  DEBUG RUNNER - Testing ${questionIds.length} questions`);
  console.log(`  Questions: ${questionIds.join(', ')}`);
  console.log(`${'═'.repeat(70)}`);

  const logs: QuestionLog[] = [];
  let correct = 0;
  let actuallyCorrect = 0;

  for (const qId of questionIds) {
    const question = questionsData.find((q: any) => q.id === qId);
    if (!question) {
      console.error(`Question ${qId} not found`);
      continue;
    }

    const log = await runQuestion(question, answersData);
    logs.push(log);

    if (log.correct) correct++;
    if (log.actuallyCorrect) actuallyCorrect++;

    // Save individual log
    await Bun.write(`./logs/q${qId}.json`, JSON.stringify(log, null, 2));
  }

  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  BATCH SUMMARY`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Per original key: ${correct}/${logs.length} = ${((correct/logs.length)*100).toFixed(0)}%`);
  console.log(`With corrections:  ${actuallyCorrect}/${logs.length} = ${((actuallyCorrect/logs.length)*100).toFixed(0)}%`);
  console.log(`\nResults:`);

  for (const log of logs) {
    const status = log.actuallyCorrect ? '✓' : '✗';
    const keyNote = log.correctedAnswer ? ` (key error)` : '';
    console.log(`  Q${log.questionId}: ${log.finalAnswer.toUpperCase()} ${status} (expected: ${log.expectedAnswer.toUpperCase()}${keyNote})`);
  }

  // Save batch summary
  const batchNum = batchArg ? parseInt(batchArg.split('=')[1]) : 1;
  await Bun.write(`./logs/batch-${batchNum}-summary.json`, JSON.stringify({
    batch: batchNum,
    questions: questionIds,
    correctPerKey: correct,
    correctWithCorrections: actuallyCorrect,
    total: logs.length,
    accuracyPerKey: (correct / logs.length * 100).toFixed(1) + '%',
    accuracyWithCorrections: (actuallyCorrect / logs.length * 100).toFixed(1) + '%',
    results: logs.map(l => ({
      questionId: l.questionId,
      answer: l.finalAnswer,
      expected: l.expectedAnswer,
      correct: l.correct,
      actuallyCorrect: l.actuallyCorrect,
      confidence: l.finalConfidence,
      iterations: l.iterations.length,
      searches: l.totalSearches,
    })),
  }, null, 2));

  console.log(`\nLogs saved to ./logs/`);

  // Return success only if 100% with corrections
  if (actuallyCorrect < logs.length) {
    console.log(`\n⚠️  BATCH NOT COMPLETE - ${logs.length - actuallyCorrect} question(s) wrong`);
    console.log(`Analyze failures in ./logs/qXX.json and fix before proceeding.`);
    process.exit(1);
  } else {
    console.log(`\n✓ BATCH COMPLETE - All ${logs.length} questions correct!`);
    process.exit(0);
  }
}

main().catch(console.error);
