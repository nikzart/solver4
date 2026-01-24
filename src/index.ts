/**
 * UPSC Solver Agent - Main Entry Point
 * Deep reasoning agent for UPSC exam questions
 */

import { UPSCSolverAgent, type AgentConfig, type AgentResult } from './agent/core';
import { ProgressUI } from './ui/progress';

interface Question {
  id: number;
  question: string;
  options: Record<string, string>;
}

interface QuestionsData {
  year: number;
  paper: string;
  series: string;
  total_questions: number;
  questions: Question[];
}

interface AnswersData {
  answers: Record<string, string>;
  dropped_questions?: number[];
}

async function loadQuestions(): Promise<{ questions: Question[]; answers: Record<string, string>; droppedQuestions: number[] }> {
  // Load questions
  const questionsFile = Bun.file('./answer.json');
  const questionsData: QuestionsData = await questionsFile.json();

  // Load answer key
  const answersFile = Bun.file('./question.json');
  const answersData: AnswersData = await answersFile.json();

  return {
    questions: questionsData.questions,
    answers: answersData.answers,
    droppedQuestions: answersData.dropped_questions || [],
  };
}

async function main() {
  console.log('Loading questions...');

  const { questions, answers, droppedQuestions } = await loadQuestions();

  // Filter out dropped questions
  const validQuestions = questions.filter((q) => !droppedQuestions.includes(q.id));

  console.log(`Loaded ${validQuestions.length} questions (${droppedQuestions.length} dropped)\n`);

  // Parse command line arguments
  const args = process.argv.slice(2);
  const startIndex = parseInt(args.find((a) => a.startsWith('--start='))?.split('=')[1] || '0');
  const endIndex = parseInt(args.find((a) => a.startsWith('--end='))?.split('=')[1] || validQuestions.length.toString());
  const singleQuestion = parseInt(args.find((a) => a.startsWith('--question='))?.split('=')[1] || '-1');
  const noSearch = args.includes('--no-search');
  const noValidation = args.includes('--no-validation');
  const verbose = args.includes('--verbose');

  // Determine which questions to process
  let questionsToProcess: Question[];

  if (singleQuestion > 0) {
    const q = validQuestions.find((q) => q.id === singleQuestion);
    if (!q) {
      console.error(`Question ${singleQuestion} not found`);
      process.exit(1);
    }
    questionsToProcess = [q];
  } else {
    questionsToProcess = validQuestions.slice(startIndex, endIndex);
  }

  console.log(`Processing ${questionsToProcess.length} questions...\n`);

  // Create progress UI
  const ui = new ProgressUI(questionsToProcess.length);

  // Create agent
  const config: Partial<AgentConfig> = {
    maxIterations: 3,
    confidenceThreshold: 0.85,
    enableWebSearch: !noSearch,
    enableValidation: !noValidation,
    enableScraping: !noSearch,
    verbose,
  };

  const agent = new UPSCSolverAgent(config, (update) => ui.updateProgress(update));

  // Start processing
  ui.start();
  const results: AgentResult[] = [];

  for (const question of questionsToProcess) {
    try {
      const result = await agent.solveQuestion(question);
      results.push(result);

      // Check correctness
      const expected = answers[question.id.toString()];
      const isCorrect = expected && expected !== 'X' ? result.answer.toLowerCase() === expected.toLowerCase() : undefined;

      ui.addResult(result, isCorrect);
    } catch (error) {
      console.error(`Error processing question ${question.id}:`, error);
      // Add a default result for failed questions
      results.push({
        questionId: question.id,
        answer: 'a',
        confidence: 0,
        reasoning: 'Error during processing',
        iterations: 0,
        searchCount: 0,
        sources: [],
        validated: false,
      });
      ui.addResult(
        {
          questionId: question.id,
          answer: 'a',
          confidence: 0,
          reasoning: 'Error',
          iterations: 0,
          searchCount: 0,
          sources: [],
          validated: false,
        },
        false
      );
    }
  }

  // Finish and show summary
  ui.finish();
  ui.printFinalResults(answers);

  // Save results
  const outputFile = Bun.file('./output/results.json');
  await Bun.write(
    outputFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        config,
        totalQuestions: questionsToProcess.length,
        results: results.map((r) => ({
          questionId: r.questionId,
          answer: r.answer,
          confidence: r.confidence,
          iterations: r.iterations,
          searchCount: r.searchCount,
          validated: r.validated,
          correct: answers[r.questionId.toString()] === r.answer.toLowerCase(),
        })),
      },
      null,
      2
    )
  );

  console.log('\nResults saved to ./output/results.json');
}

// Help message
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
UPSC Solver Agent - Deep Reasoning for UPSC Questions

Usage:
  bun run src/index.ts [options]

Options:
  --start=N       Start from question index N (default: 0)
  --end=N         End at question index N (default: all)
  --question=N    Process only question with ID N
  --no-search     Disable web search
  --no-validation Disable self-validation
  --verbose       Enable verbose output
  --help, -h      Show this help message

Examples:
  bun run src/index.ts                    # Process all questions
  bun run src/index.ts --question=1       # Process only question 1
  bun run src/index.ts --start=0 --end=10 # Process first 10 questions
  bun run src/index.ts --no-search        # Disable web search
`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
