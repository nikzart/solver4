/**
 * Confidence Scoring System
 */

import { QuestionType, SubjectArea } from '../agent/classifier';

export interface ConfidenceFactors {
  modelConfidence: number; // From LLM's own assessment (0-1)
  searchVerification: number; // From web search verification (0-1)
  validationScore: number; // From self-validation (0-1)
  questionType: QuestionType;
  sourceCount: number; // Number of corroborating sources
  iterationCount: number; // Number of iterations taken
}

const QUESTION_TYPE_MODIFIERS: Record<QuestionType, number> = {
  [QuestionType.FACTUAL_RECALL]: 0.9, // Easier to verify
  [QuestionType.SELECT_CORRECT]: 0.85, // Straightforward
  [QuestionType.STATEMENT_ANALYSIS]: 0.75, // Needs careful analysis
  [QuestionType.STATEMENT_EXPLAIN]: 0.70, // Relationship analysis
  [QuestionType.HOW_MANY_CORRECT]: 0.65, // Multiple verifications
  [QuestionType.MATCH_PAIRS]: 0.60, // Complex matching
  [QuestionType.SEQUENCE_ORDER]: 0.55, // Order matters
  [QuestionType.LOGICAL_REASONING]: 0.50, // Requires deduction
};

export function calculateFinalConfidence(factors: ConfidenceFactors): number {
  const weights = {
    modelConfidence: 0.25,
    searchVerification: 0.30,
    validationScore: 0.25,
    questionTypeModifier: 0.10,
    sourceBonus: 0.10,
  };

  const questionTypeModifier = QUESTION_TYPE_MODIFIERS[factors.questionType] || 0.5;

  // Base calculation
  let confidence =
    factors.modelConfidence * weights.modelConfidence +
    factors.searchVerification * weights.searchVerification +
    factors.validationScore * weights.validationScore +
    questionTypeModifier * weights.questionTypeModifier;

  // Source bonus (diminishing returns)
  const sourceBonus = Math.min(0.1, factors.sourceCount * 0.025);
  confidence += sourceBonus;

  // Iteration penalty (each extra iteration reduces confidence slightly)
  const iterationPenalty = Math.max(0, (factors.iterationCount - 1) * 0.03);
  confidence -= iterationPenalty;

  // Clamp to valid range
  return Math.min(0.99, Math.max(0.1, confidence));
}

export function getQuestionTypeModifier(type: QuestionType): number {
  return QUESTION_TYPE_MODIFIERS[type] || 0.5;
}

export function shouldSearch(
  confidence: number,
  questionType: QuestionType,
  iteration: number,
  previousSearchCount: number,
  subjectArea?: SubjectArea
): boolean {
  // Don't search if already searched enough
  if (previousSearchCount >= 5) return false;

  // ALWAYS search for Polity questions (first iteration) - these need precise interpretations
  if (iteration === 1 && subjectArea === SubjectArea.POLITY) {
    return true;
  }

  // ALWAYS search for factual recall questions (first iteration)
  if (iteration === 1 && questionType === QuestionType.FACTUAL_RECALL) {
    return true;
  }

  // ALWAYS search for HOW_MANY_CORRECT questions - LLM often has knowledge gaps
  if (iteration === 1 && questionType === QuestionType.HOW_MANY_CORRECT) {
    return true;
  }

  // ALWAYS search for STATEMENT_ANALYSIS questions - nuanced explanations need verification
  if (iteration === 1 && questionType === QuestionType.STATEMENT_ANALYSIS) {
    return true;
  }

  // Question types that benefit most from search
  const highSearchBenefit = [QuestionType.FACTUAL_RECALL, QuestionType.MATCH_PAIRS, QuestionType.HOW_MANY_CORRECT, QuestionType.SEQUENCE_ORDER];

  // Search for high-benefit question types if not very confident
  if (highSearchBenefit.includes(questionType) && confidence < 0.98) {
    return true;
  }

  // Search if confidence is below 90%
  if (confidence < 0.90) {
    return true;
  }

  return false;
}

export function parseConfidenceFromResponse(content: string): number {
  // Try XML format
  const xmlMatch = content.match(/<confidence>\s*([\d.]+)\s*<\/confidence>/i);
  if (xmlMatch) {
    return parseFloat(xmlMatch[1]);
  }

  // Try plain format
  const plainMatch = content.match(/confidence[:\s]*([\d.]+)/i);
  if (plainMatch) {
    const value = parseFloat(plainMatch[1]);
    // Normalize if given as percentage
    return value > 1 ? value / 100 : value;
  }

  // Default to medium confidence
  return 0.5;
}
