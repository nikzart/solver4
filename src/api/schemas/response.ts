export interface ClassificationResult {
  type: string;
  subjectArea: string;
  difficulty: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SolveMetadata {
  iterations: number;
  searchCount: number;
  processingTimeMs: number;
}

export interface SolveResponse {
  answer: 'a' | 'b' | 'c' | 'd';
  confidence: number;
  analysis: string;
  classification: ClassificationResult;
  sources: string[];
  metadata: SolveMetadata;
}

export interface BatchResult {
  id: string | number;
  answer: 'a' | 'b' | 'c' | 'd';
  confidence: number;
  analysis: string;
  correct?: boolean;
  expectedAnswer?: string;
}

export interface BatchSummary {
  total: number;
  correct: number;
  accuracy: number;
}

export interface BatchSolveResponse {
  results: BatchResult[];
  summary?: BatchSummary;
  metadata: {
    totalProcessingTimeMs: number;
    averageConfidence: number;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  services: {
    llm: { status: string; provider: string };
    search: { status: string; provider: string };
  };
  timestamp: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ExplainResponse {
  explanation: string;
  sources: string[];
  classification: ClassificationResult;
  metadata: SolveMetadata;
}

// SSE Event types
export type SSEEventType = 'classification' | 'iteration' | 'search' | 'complete' | 'error';

export interface SSEEvent {
  event: SSEEventType;
  data: Record<string, unknown>;
}
