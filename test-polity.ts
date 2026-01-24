/**
 * Quick test for Polity questions (55-100)
 */

import { UPSCSolverAgent, type AgentConfig, type AgentResult } from './src/agent/core';

interface Question {
  id: number;
  question: string;
  options: Record<string, string>;
}

interface QuestionsData {
  questions: Question[];
}

interface AnswersData {
  answers: Record<string, string>;
  dropped_questions?: number[];
}

// Questions where we've confirmed the answer key is wrong
const CONFIRMED_KEY_ERRORS: Record<number, string> = {
  51: 'c', // SMRs are nuclear reactors
  69: 'b', // VP IS ex-officio Chairman of RS
  71: 'b', // Preamble IS part of Constitution but NOT enforceable
  92: 'c', // ECI is Constitutional, State EC does Panchayat elections
  93: 'd', // All three features (parliamentary, federal, single citizenship)
  94: 'd', // All three appointed by President
  99: 'c', // CAG is guardian AND audits both
  42: 'd', // Hydrogen buses exist
};

async function main() {
  const questionsFile = Bun.file('./answer.json');
  const questionsData: QuestionsData = await questionsFile.json();

  const answersFile = Bun.file('./question.json');
  const answersData: AnswersData = await answersFile.json();

  // Test Polity questions (55-100)
  const polityQuestions = questionsData.questions.filter(
    q => q.id >= 55 && q.id <= 100 && !answersData.dropped_questions?.includes(q.id)
  );

  console.log(`\nTesting ${polityQuestions.length} Polity questions (Q55-Q100)...\n`);

  const config: Partial<AgentConfig> = {
    maxIterations: 3,
    confidenceThreshold: 0.85,
    enableWebSearch: true,
    enableValidation: true,
    enableScraping: true,
    verbose: false,
  };

  const agent = new UPSCSolverAgent(config, (update) => {
    if (update.type === 'COMPLETE') {
      process.stdout.write(`Q${update.questionId}: ${update.answer?.toUpperCase()} `);
    }
  });

  const results: AgentResult[] = [];
  let correctPerKey = 0;
  let correctCorrected = 0;

  for (const question of polityQuestions) {
    const result = await agent.solveQuestion(question);
    results.push(result);

    const keyAnswer = answersData.answers[question.id.toString()];
    const agentAnswer = result.answer.toLowerCase();

    // Check against original key
    const isCorrectPerKey = agentAnswer === keyAnswer?.toLowerCase();
    if (isCorrectPerKey) correctPerKey++;

    // Check against corrected key
    const correctedKey = CONFIRMED_KEY_ERRORS[question.id] || keyAnswer;
    const isCorrectCorrected = agentAnswer === correctedKey?.toLowerCase();
    if (isCorrectCorrected) correctCorrected++;

    const mark = isCorrectCorrected ? '✓' : (isCorrectPerKey ? '~' : '✗');
    process.stdout.write(`${mark}\n`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`POLITY SECTION RESULTS (Q55-Q100)`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Accuracy (per original key):  ${correctPerKey}/${polityQuestions.length} = ${((correctPerKey/polityQuestions.length)*100).toFixed(1)}%`);
  console.log(`Accuracy (with corrections):  ${correctCorrected}/${polityQuestions.length} = ${((correctCorrected/polityQuestions.length)*100).toFixed(1)}%`);
  console.log(`${'='.repeat(60)}`);

  // Show detailed results
  console.log(`\nDetailed Results:`);
  for (const result of results) {
    const keyAnswer = answersData.answers[result.questionId.toString()];
    const correctedKey = CONFIRMED_KEY_ERRORS[result.questionId] || keyAnswer;
    const agentAnswer = result.answer.toLowerCase();
    const status = agentAnswer === correctedKey?.toLowerCase() ? '✓' :
                   (agentAnswer === keyAnswer?.toLowerCase() ? '~' : '✗');
    const keyNote = CONFIRMED_KEY_ERRORS[result.questionId] ? ' (KEY ERROR)' : '';
    console.log(`Q${result.questionId}: Agent=${agentAnswer.toUpperCase()}, Key=${keyAnswer?.toUpperCase()}${keyNote} ${status}`);
  }
}

main().catch(console.error);
