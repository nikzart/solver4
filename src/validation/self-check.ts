/**
 * Self-Validation System
 * Devil's advocate approach to validate answers
 */

import { getProvider } from '../llm/provider';
import { SYSTEM_PROMPTS, buildValidationPrompt } from '../llm/prompts';

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  recommendation: 'ACCEPT' | 'REVISE' | 'SEARCH_MORE';
  optionScores: Map<string, number>;
  challenges: string[];
  revisedAnswer?: string;
}

export async function selfValidate(
  question: string,
  options: Record<string, string>,
  proposedAnswer: string,
  reasoning: string
): Promise<ValidationResult> {
  const provider = getProvider();

  const prompt = buildValidationPrompt(question, options, proposedAnswer, reasoning);

  const response = await provider.generate(
    [
      { role: 'system', content: SYSTEM_PROMPTS.SELF_VALIDATION },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2, maxTokens: 2000 }
  );

  return parseValidationResponse(response.content, proposedAnswer);
}

function parseValidationResponse(content: string, proposedAnswer: string): ValidationResult {
  const optionScores = new Map<string, number>();
  const challenges: string[] = [];

  // Extract option scores
  for (const opt of ['a', 'b', 'c', 'd']) {
    const scorePattern = new RegExp(`<option_${opt}_score>\\s*(\\d+)\\s*</option_${opt}_score>`, 'i');
    const match = content.match(scorePattern);
    if (match) {
      optionScores.set(opt, parseInt(match[1], 10));
    } else {
      // Try alternative format
      const altPattern = new RegExp(`option[_ ]?${opt}[_ ]?score[:\\s]*(\\d+)`, 'i');
      const altMatch = content.match(altPattern);
      if (altMatch) {
        optionScores.set(opt, parseInt(altMatch[1], 10));
      }
    }
  }

  // Extract challenges
  const challengesMatch = content.match(/<challenges>([\s\S]*?)<\/challenges>/i);
  if (challengesMatch) {
    const challengeText = challengesMatch[1].trim();
    if (challengeText && challengeText.toLowerCase() !== 'none') {
      challenges.push(...challengeText.split(/[;\n]/).filter((c) => c.trim().length > 0));
    }
  }

  // Extract recommendation
  let recommendation: 'ACCEPT' | 'REVISE' | 'SEARCH_MORE' = 'ACCEPT';
  const recMatch = content.match(/<recommendation>\s*(ACCEPT|REVISE|SEARCH_MORE)\s*<\/recommendation>/i);
  if (recMatch) {
    recommendation = recMatch[1].toUpperCase() as 'ACCEPT' | 'REVISE' | 'SEARCH_MORE';
  } else if (content.toLowerCase().includes('revise')) {
    recommendation = 'REVISE';
  } else if (content.toLowerCase().includes('search more') || content.toLowerCase().includes('search_more')) {
    recommendation = 'SEARCH_MORE';
  }

  // Extract revised answer if provided
  let revisedAnswer: string | undefined;
  const revisedMatch = content.match(/<revised_answer>\s*([a-d])\s*<\/revised_answer>/i);
  if (revisedMatch) {
    revisedAnswer = revisedMatch[1].toLowerCase();
  }

  // Calculate confidence based on score difference
  const proposedScore = optionScores.get(proposedAnswer.toLowerCase()) || 5;
  const otherScores = Array.from(optionScores.entries())
    .filter(([k]) => k !== proposedAnswer.toLowerCase())
    .map(([, v]) => v);
  const maxOtherScore = Math.max(...otherScores, 0);

  const scoreDiff = proposedScore - maxOtherScore;
  let confidence: number;

  if (scoreDiff >= 4) {
    confidence = 0.95;
  } else if (scoreDiff >= 2) {
    confidence = 0.85;
  } else if (scoreDiff >= 0) {
    confidence = 0.70;
  } else {
    confidence = 0.50;
  }

  // Determine if valid
  const isValid = recommendation === 'ACCEPT' && scoreDiff >= 0;

  return {
    isValid,
    confidence,
    recommendation,
    optionScores,
    challenges,
    revisedAnswer: recommendation === 'REVISE' ? revisedAnswer : undefined,
  };
}
