export interface BenchmarkAggregate {
  avgQualityScore: number;
  avgStreamToFirstTokenMs: number;
  avgStreamToFirstProductCardMs?: number | null;
  avgTotalDurationMs?: number;
  avgTotalTokens?: number | null;
  validStreamCount: number;
  errorCount: number;
  errorRate?: number;
  perStageErrors?: { classify: number; discovery: number; stream: number; scorer: number };
  avgThroughputTokensPerSec?: number | null;
  avgLatencyMs?: number | null;
  intentAccuracy: number;
  domainAccuracy: number;
  followUpAnswerTypeAccuracy: number | null;
  followUpFixtureCount?: number;
}

export type ErrorStage = 'classify' | 'discovery' | 'stream' | 'scorer';

export interface ErrorRecord {
  stage: ErrorStage;
  message: string;
  stackSnippet?: string;
}

export interface MatchOutcome {
  predicted?: string;
  expected?: string;
  match: boolean | null;
}

export interface FixtureReport {
  id: string;
  prompt: string;
  expectedIntent: string;
  expectedDomain: string;
  expectedFollowUpAnswerType?: string;
  expectedCalculationMode?: string;
  error?: string;
  errorRecord?: ErrorRecord;
  streamValid: boolean;
  streamErrors: string[];
  stages: {
    classify: {
      durationMs: number;
      tokens: number | null;
      promptTokens?: number | null;
      completionTokens?: number | null;
      intent: string;
      domain: string;
      confidence: number;
      follow_up_answer_type?: string;
      calculation_mode?: string;
    } | null;
    manufacturerDiscovery: {
      durationMs: number;
      tokens: number | null;
      promptTokens?: number | null;
      completionTokens?: number | null;
      manufacturerCount: number;
    } | null;
    agent: {
      durationMs: number;
      tokens?: number | null;
      promptTokens?: number | null;
      completionTokens?: number | null;
      apiCalls?: number | null;
    } | null;
    streamToFirstToken: { durationMs: number } | null;
    streamToFirstStatus?: { durationMs: number } | null;
    streamToFirstProductCard?: { durationMs: number } | null;
  };
  totalDurationMs?: number;
  totalTokens?: number | null;
  throughputTokensPerSec?: number | null;
  latencyMs?: number | null;
  streamStats: {
    totalEvents: number;
    statusCount: number;
    tokenCount: number;
    productCardCount: number;
    hasResult: boolean;
    hasError: boolean;
    endedWith?: 'result' | 'error' | 'none';
  };
  outcomes?: {
    intent: MatchOutcome;
    domain: MatchOutcome;
    followUpAnswerType: MatchOutcome;
    calculationMode: MatchOutcome;
  };
  quality: {
    intentMatch: number;
    domainMatch: number;
    hasExpectedSections: number;
    noHallucination: number;
    calculationMode?: number;
    followUpAnswerTypeMatch?: number;
    total: number;
  };
}

export interface BenchmarkRun {
  id: number;
  runAt: string;
  fixtureCount: number;
  aggregate: BenchmarkAggregate;
  fixtures: FixtureReport[];
  createdAt: string;
}

export interface BenchmarkListResponse {
  runs: BenchmarkRun[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ChartPoint {
  period: string;
  avgQuality: number;
  avgIntent: number;
  avgDomain: number;
  avgFollowUp: number | null;
  avgFirstToken: number;
  avgTotalDuration?: number | null;
  avgTotalTokens?: number | null;
  errorRate?: number | null;
  avgThroughput?: number | null;
  avgLatency?: number | null;
  runCount: number;
  followUpFixtureCount: number | null;
}

export interface ChartResponse {
  points: ChartPoint[];
  groupBy: 'day' | 'week' | 'month';
}

export interface PromptFixture {
  id: string;
  prompt: string;
  expectedIntent: string;
  expectedDomain: string;
  expectsProductCards: boolean;
  expectsBOM: boolean;
  expectsCalculation: boolean;
  expectsBlock: boolean;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}
