import type { CalculationSection } from "@/components/chat/CalcCard";

export interface Company {
  id: number;
  name: string;
  industry: string;
  description: string;
  location: string;
  colorTheme: string;
  employeeCount?: string;
  logoPath?: string;
  website?: string;
}

export interface ProductAttribute {
  label: string;
  value: string;
  unit?: string;
  meets_requirement?: boolean | 'meets' | 'oversized' | 'undersized';
  note?: string;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  description: string;
  companyId: number;
  modelPath?: string;
  catalogPath?: string;
  imagePath?: string;
  documentPaths?: string[];
  productWebLink?: string;
  companyWebsite?: string;
  fitScore?: number;
  fitReason?: string;
  scoreReason?: string;
  isExternal?: boolean;
  attributes?: ProductAttribute[];
  companyName?: string;
  linkStatus?: 'verified' | 'recovered' | 'homepage_fallback' | 'unverified';
  partType?: string;
  datasheetVerified?: boolean;
  /** Numeric DB product ID for verified (non-external) DB products. */
  dbProductId?: number;
}

export interface HybridProduct {
  id: string;
  product_name: string;
  brand?: string;
  description?: string;
  ai_summary?: string;
  company?: {
    name: string;
    website?: string;
    location?: string | { country_code?: string; city?: string; street?: string };
  };
  reference_link?: string;
  datasheet_url?: string;
  image_url?: string;
  model_url?: string;
  document_urls?: string[];
  fit_score?: number;
  score_reason?: string;
  verification_status?: 'verified' | 'web' | 'database';
  attributes?: Array<{ label: string; value: string; unit?: string; meets_requirement?: boolean | 'meets' | 'oversized' | 'undersized'; note?: string }>;
  source?: 'web' | 'database';
  link_status?: 'verified' | 'recovered' | 'homepage_fallback' | 'unverified';
  part_type?: string;
  datasheet_verified?: boolean;
  product_profile_url?: string;
  company_profile_url?: string;
}

export interface SearchResult {
  companies: Company[];
  products: Product[];
}

export interface Requirement {
  parameter: string;
  requirement: string;
  type: 'hard' | 'soft';
}

export interface BomItem {
  part: string;
  spec: string;
  qty: number;
  reason: string;
}

export type ComparisonCellSourceKind = 'web' | 'datasheet' | 'database' | 'model_knowledge';

export interface ComparisonCellSource {
  kind: ComparisonCellSourceKind;
  label?: string;
  url?: string;
}

export interface ComparisonRow {
  parameter: string;
  values: string[];
  valueSources?: Array<ComparisonCellSource | null>;
}

export interface ComparisonTableData {
  products: string[];
  rows: ComparisonRow[];
}

export interface AISearchMessage {
  id: string;
  content: string;
  isUser: boolean;
  isStreaming?: boolean;
  timestamp: Date;
  suggestions?: string[];
  searchResults?: SearchResult;
  isFromHistory?: boolean;
  requirements?: Requirement[];
  requirementsMode?: 'build' | 'search';
  expertName?: string;
  recommendation?: string;
  bestFit?: string;
  alternativeSuggestion?: string;
  searchGuidance?: string;
  alternativeSearches?: { label: string; query: string }[];
  bomTable?: BomItem[];
  bomSummary?: string;
  engineeringNotes?: string;
  comparisonTable?: ComparisonTableData;
  calculationSection?: CalculationSection;
  calculationNote?: string;
  calculationMode?: 'size_then_search' | 'search_then_size';
  /**
   * Persisted lifecycle status for AI messages backed by a server-side row.
   * - `complete`  → normal finished message (default)
   * - `streaming` → server-side row was created but stream never finished cleanly (recoverable)
   * - `failed`    → stream errored or was aborted; the user can retry the originating user query
   */
  status?: 'complete' | 'streaming' | 'failed';
  /** Optional original user query used to retry a failed/streaming AI response. */
  retryQuery?: string;
  /**
   * Short display label shown in the user bubble instead of `content`.
   * When present, the bubble renders this string; `content` is the full prompt sent to the AI.
   */
  displayContent?: string;
  /** True while a calc-regenerate request is in flight for this message. */
  isRegeneratingCalc?: boolean;
  /** Last error from a failed calc-regenerate attempt (cleared on next attempt / success). */
  regenerateCalcError?: string | null;
  /**
   * True for a placeholder requirements message injected immediately after
   * classification (before the agent returns real requirements). Cleared once
   * real requirements arrive. Used to show the loading skeleton panel.
   */
  requirementsIsLoading?: boolean;
}

export type ENBlock =
  | { type: 'bullets'; title: string; bullets: string[] }
  | { type: 'table'; title: string; rawLines: string[] }
  | { type: 'prose'; lines: string[] };
