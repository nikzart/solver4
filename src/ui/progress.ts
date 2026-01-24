/**
 * Terminal Progress UI
 * Using chalk and cli-progress for beautiful terminal output
 */

import chalk from 'chalk';
import cliProgress from 'cli-progress';
import Table from 'cli-table3';
import type { ProgressUpdate } from '../agent/core';
import type { AgentResult } from '../agent/core';

export interface UIStats {
  total: number;
  completed: number;
  correct: number;
  incorrect: number;
  totalConfidence: number;
  totalIterations: number;
  totalSearches: number;
}

export class ProgressUI {
  private progressBar: cliProgress.SingleBar;
  private stats: UIStats;
  private results: AgentResult[] = [];
  private currentQuestion: { id: number; text: string } | null = null;
  private startTime: number = 0;

  constructor(totalQuestions: number) {
    this.stats = {
      total: totalQuestions,
      completed: 0,
      correct: 0,
      incorrect: 0,
      totalConfidence: 0,
      totalIterations: 0,
      totalSearches: 0,
    };

    this.progressBar = new cliProgress.SingleBar(
      {
        format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} questions | ETA: {eta_formatted}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );
  }

  start(): void {
    this.startTime = Date.now();
    console.clear();
    this.printHeader();
    this.progressBar.start(this.stats.total, 0);
  }

  private printHeader(): void {
    console.log(chalk.bold.blue('\n' + '='.repeat(70)));
    console.log(chalk.bold.blue('  UPSC Solver Agent - GPT OSS 120B Deep Reasoning'));
    console.log(chalk.bold.blue('='.repeat(70) + '\n'));
  }

  updateProgress(update: ProgressUpdate): void {
    switch (update.type) {
      case 'CLASSIFY':
        this.currentQuestion = { id: update.questionId, text: update.message || '' };
        this.printQuestionStart(update.questionId, update.message || '');
        break;

      case 'REASONING':
        this.printReasoning(update);
        break;

      case 'SEARCH':
        this.printSearch(update);
        break;

      case 'VALIDATE':
        this.printValidation(update);
        break;

      case 'COMPLETE':
        this.printComplete(update);
        break;

      case 'ERROR':
        this.printError(update);
        break;
    }
  }

  private printQuestionStart(id: number, typeInfo: string): void {
    process.stdout.write('\n');
    console.log(chalk.yellow(`\nQ${id}`) + chalk.dim(` | ${typeInfo}`));
  }

  private printReasoning(update: ProgressUpdate): void {
    const iteration = update.iteration || 1;
    const indicator = chalk.cyan(`  [Iteration ${iteration}]`);

    if (update.answer && update.confidence) {
      const confColor = update.confidence >= 0.85 ? chalk.green : update.confidence >= 0.6 ? chalk.yellow : chalk.red;
      process.stdout.write(`${indicator} Answer: ${chalk.bold(update.answer.toUpperCase())} ${confColor(`(${(update.confidence * 100).toFixed(0)}%)`)}\n`);
    } else {
      process.stdout.write(`${indicator} Analyzing...\r`);
    }
  }

  private printSearch(update: ProgressUpdate): void {
    process.stdout.write(chalk.magenta(`  [Search] ${update.message || 'Searching...'}\n`));
  }

  private printValidation(update: ProgressUpdate): void {
    process.stdout.write(chalk.blue(`  [Validate] ${update.message || 'Validating...'}\n`));
  }

  private printComplete(update: ProgressUpdate): void {
    const answer = update.answer || '?';
    const confidence = update.confidence || 0;
    const confColor = confidence >= 0.85 ? chalk.green : confidence >= 0.6 ? chalk.yellow : chalk.red;

    console.log(chalk.green(`  [Done] `) + chalk.bold(answer.toUpperCase()) + confColor(` (${(confidence * 100).toFixed(0)}% confidence)`));
  }

  private printError(update: ProgressUpdate): void {
    console.log(chalk.red(`  [Error] ${update.message}`));
  }

  addResult(result: AgentResult, isCorrect?: boolean): void {
    this.results.push(result);
    this.stats.completed++;
    this.stats.totalConfidence += result.confidence;
    this.stats.totalIterations += result.iterations;
    this.stats.totalSearches += result.searchCount;

    if (isCorrect !== undefined) {
      if (isCorrect) {
        this.stats.correct++;
      } else {
        this.stats.incorrect++;
      }
    }

    this.progressBar.update(this.stats.completed);
  }

  finish(): void {
    this.progressBar.stop();
    this.printSummary();
  }

  private printSummary(): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const avgConfidence = this.stats.completed > 0 ? this.stats.totalConfidence / this.stats.completed : 0;
    const avgIterations = this.stats.completed > 0 ? this.stats.totalIterations / this.stats.completed : 0;

    console.log('\n' + chalk.bold.blue('='.repeat(70)));
    console.log(chalk.bold.blue('  SUMMARY'));
    console.log(chalk.bold.blue('='.repeat(70)));

    const table = new Table({
      head: [chalk.cyan('Metric'), chalk.cyan('Value')],
      colWidths: [30, 25],
    });

    table.push(
      ['Total Questions', this.stats.total.toString()],
      ['Completed', this.stats.completed.toString()],
      ['Time Elapsed', `${elapsed}s`],
      ['Avg Confidence', `${(avgConfidence * 100).toFixed(1)}%`],
      ['Avg Iterations', avgIterations.toFixed(1)],
      ['Total Searches', this.stats.totalSearches.toString()]
    );

    if (this.stats.correct > 0 || this.stats.incorrect > 0) {
      const accuracy = ((this.stats.correct / (this.stats.correct + this.stats.incorrect)) * 100).toFixed(1);
      table.push(
        [chalk.green('Correct'), chalk.green(this.stats.correct.toString())],
        [chalk.red('Incorrect'), chalk.red(this.stats.incorrect.toString())],
        [chalk.bold('Accuracy'), chalk.bold(`${accuracy}%`)]
      );
    }

    console.log(table.toString());
  }

  printFinalResults(answers: Record<string, string>): void {
    console.log('\n' + chalk.bold.yellow('='.repeat(70)));
    console.log(chalk.bold.yellow('  DETAILED RESULTS'));
    console.log(chalk.bold.yellow('='.repeat(70)));

    let correct = 0;
    let total = 0;

    for (const result of this.results) {
      const expected = answers[result.questionId.toString()];
      if (!expected || expected === 'X') continue; // Skip dropped questions

      total++;
      const isCorrect = result.answer.toLowerCase() === expected.toLowerCase();
      if (isCorrect) correct++;

      const status = isCorrect ? chalk.green('✓') : chalk.red('✗');
      const expectedStr = isCorrect ? '' : chalk.dim(` (expected: ${expected})`);

      console.log(
        `${status} Q${result.questionId}: ${chalk.bold(result.answer.toUpperCase())}${expectedStr} ` + chalk.dim(`(${(result.confidence * 100).toFixed(0)}%, ${result.iterations} iter, ${result.searchCount} searches)`)
      );
    }

    const accuracy = ((correct / total) * 100).toFixed(1);
    const targetMet = (correct / total) * 100 >= 92;

    console.log('\n' + chalk.bold.blue('='.repeat(70)));
    console.log(chalk.bold(` FINAL ACCURACY: ${correct}/${total} = ${accuracy}%`));
    console.log(targetMet ? chalk.bold.green(' TARGET MET (>92%)!') : chalk.bold.red(' TARGET NOT MET (<92%)'));
    console.log(chalk.bold.blue('='.repeat(70)));
  }
}

export function createSimpleLogger(): (update: ProgressUpdate) => void {
  return (update: ProgressUpdate) => {
    const prefix = `[Q${update.questionId}]`;

    switch (update.type) {
      case 'CLASSIFY':
        console.log(`${prefix} ${update.message}`);
        break;
      case 'REASONING':
        if (update.answer) {
          console.log(`${prefix} Iteration ${update.iteration}: ${update.answer} (${((update.confidence || 0) * 100).toFixed(0)}%)`);
        }
        break;
      case 'SEARCH':
        console.log(`${prefix} Search: ${update.message}`);
        break;
      case 'VALIDATE':
        console.log(`${prefix} Validate: ${update.message}`);
        break;
      case 'COMPLETE':
        console.log(`${prefix} Complete: ${update.answer} (${((update.confidence || 0) * 100).toFixed(0)}%)`);
        break;
      case 'ERROR':
        console.error(`${prefix} Error: ${update.message}`);
        break;
    }
  };
}
