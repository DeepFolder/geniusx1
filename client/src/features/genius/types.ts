import type {
  GeniusCalculationDoc,
  GeniusInput,
  GeniusAssumption,
  GeniusStep,
  GeniusResult,
  GeniusReference,
  GeniusConfidence,
  GeniusVisualization,
  GeniusAttachment,
  GeniusTaskProposal,
} from "@shared/schema";

export type {
  GeniusCalculationDoc,
  GeniusInput,
  GeniusAssumption,
  GeniusStep,
  GeniusResult,
  GeniusReference,
  GeniusConfidence,
  GeniusVisualization,
  GeniusAttachment,
  GeniusTaskProposal,
};

export interface GeniusChatHistoryItem {
  role: ChatRole;
  content: string;
}

export interface GeniusCalculationRow {
  id: number;
  title: string;
  document: GeniusCalculationDoc;
  /** Server-generated reasoned assistant reply about this calculation. */
  commentary?: string;
  /** Request-correlated server stage timings for performance diagnostics. */
  timings?: {
    requestId: string;
    expertMode: boolean;
    phdMode: boolean;
    webSearch: boolean;
    routingMs: number;
    sourceLookupMs: number;
    expertGenerationMs: number;
    recomputationMs: number;
    persistenceMs: number;
    firstVerifiedMs: number;
    commentaryMs: number;
    totalMs: number;
  };
  /** Correlation id of the request that last updated this row (echoed for drop-recovery). */
  clientRequestId?: string | null;
  /**
   * The full original chat transcript that produced/updated this calculation,
   * only present on GET /api/genius/:id. Empty for calculations saved before
   * chat history was tracked.
   */
  chatHistory?: GeniusChatHistoryItem[];
  /** User-authored notes returned for the current live worksheet only. */
  comments?: GeniusStepComment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GeniusStepComment {
  id: number;
  stepId: string;
  content: string;
  createdAt: string;
}

export interface GeniusListItem {
  id: number;
  title: string;
  pinned?: boolean;
  /** Correlation id echoed back from generate/build requests (connection-drop recovery). */
  clientRequestId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GeniusCalculationVersion {
  version: number;
  summary: string;
  createdAt: string;
}

export interface GeniusCalculationVersionSnapshot extends GeniusCalculationVersion {
  document: GeniusCalculationDoc;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  /** Stable identifier used to track discard state per message. */
  id: string;
  role: ChatRole;
  content: string;
  /** File the user attached with this message (image or PDF). */
  attachment?: GeniusAttachment;
  /** A proposed calculation task rendered as a reviewable card. */
  proposal?: GeniusTaskProposal;
  /** Server-provided context for turning a calculable answer into a reviewable example. */
  calculationExample?: GeniusCalculationExampleContext;
}

/** What the assistant is currently doing — drives the progress indicator. */
export type BusyPhase = "generate" | "upload" | "refine" | "build" | "question" | null;

/** Returned by the server when the user's message was classified as a question. */
export interface GeniusAnswerResponse {
  type: "answer";
  reply: string;
  calculationExample?: GeniusCalculationExampleContext;
}

/** Trusted answer metadata; never inferred from the reply text in the client. */
export interface GeniusCalculationExampleContext {
  request: string;
  method: string;
}
