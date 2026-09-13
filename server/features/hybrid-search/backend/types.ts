export interface ProductAttribute {
  label: string;
  value: string;
  /** Canonical Unicode display form (e.g. "N·m", "m/s²"). */
  unit: string;
  /**
   * Original unit string as emitted by the agent or imported from the
   * datasheet. Kept for the product-matching layer which compares against
   * raw datasheet text. Display code reads `unit`.
   */
  unit_raw?: string;
  meets_requirement?: boolean | 'meets' | 'oversized' | 'undersized';
  /**
   * Optional one-line agent-written reasoning shown as the spec icon's
   * hover tooltip (e.g. "Exceeds your 30 kN target by 27%",
   * "Included as a key sizing reference"). Falls back to the existing
   * generic tooltip copy when absent.
   */
  note?: string;
}

export interface CompanyAddress {
  country_code: string;
  city: string;
  street?: string;
}

export interface CompanyInfo {
  name: string;
  website: string;
  address: CompanyAddress;
}

export interface StructuredData {
  company: CompanyInfo;
  files: {
    datasheet_url: string;
    reference_link?: string;
  };
}

export interface FluidData {
  product_name: string;
  brand?: string;
  description: string;
  ai_summary?: string;
  attributes: ProductAttribute[];
  fit_score?: number;
  /**
   * Agent-written ≤120-char sentence explaining why this fit_score was
   * assigned. Shown in the Match % badge tooltip.
   * E.g. "3 of 4 specs meet requirements; force oversized 35% → partial credit"
   */
  score_reason?: string;
  /**
   * Optional grouping label assigned by the agent for multi-part product
   * searches (e.g. "Drive motor", "Bearing", "Coupling"). When present and
   * shared across multiple cards, the UI groups results under per-type
   * section headers in both the chat bubble and the side panel.
   */
  part_type?: string;
}

export interface UnifiedProduct {
  structured_data: StructuredData;
  fluid_data: FluidData;
  source: 'web' | 'database';
  relevance_score?: number;
  link_status?: 'verified' | 'recovered' | 'homepage_fallback' | 'unverified';
  /**
   * True when the product's fit score and key specs were verified against
   * the actual datasheet PDF (either a DeepFolder-stored datasheet for DB
   * products, or a server-side fetched manufacturer PDF for web products).
   * Web products that didn't have a parseable PDF, or whose PDF fetch failed,
   * remain undefined/false and keep the agent's first-pass score.
   */
  datasheet_verified?: boolean;
  _dbDatasheetPath?: string;
  _dbDatasheetText?: string;
  _dbProductId?: number;
  _dbCompanyId?: number;
  _dbImagePath?: string;
  _dbReferenceLink?: string;
  _dbModelPath?: string;
  _dbDocumentPaths?: string[];
}

export interface ProductCard {
  id: string;
  product_name: string;
  brand?: string;
  description?: string;
  ai_summary?: string;
  company: {
    name: string;
    website?: string;
    location: string | CompanyAddress;
  };
  reference_link?: string;
  datasheet_url?: string;
  image_url?: string;
  model_url?: string;
  document_urls?: string[];
  fit_score?: number;
  /** See FluidData.score_reason. */
  score_reason?: string;
  verification_status: 'verified' | 'web';
  verification_basis?: string;
  attributes: ProductAttribute[];
  source: 'web' | 'database';
  link_status?: 'verified' | 'recovered' | 'homepage_fallback' | 'unverified';
  company_profile_url?: string;
  product_profile_url?: string;
  /** See FluidData.part_type. */
  part_type?: string;
  /** See UnifiedProduct.datasheet_verified. */
  datasheet_verified?: boolean;
}

export interface SearchResult {
  chat_summary: string;
  logic_explanation: string;
  data: UnifiedProduct[];
  product_cards: ProductCard[];
  calculation_section?: CalculationSection;
}

export interface InterpretedRequirement {
  parameter: string;
  requirement: string;
  type: 'hard' | 'soft';
}

export interface HybridSearchConfig {
  webWeight: number;
  databaseWeight: number;
  maxWebResults: number;
  maxDatabaseResults: number;
  timeoutMs: number;
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

export interface CalculationStep {
  label: string;
  content?: string;
  formula?: string;
  result?: string;
}

export interface CalculationSymbol {
  symbol: string;
  description: string;
  unit?: string;
}

export type CalculationGivenSourceKind = 'user' | 'db' | 'datasheet_pdf' | 'web' | 'ai';

export interface CalculationGivenSource {
  kind: CalculationGivenSourceKind;
  label: string;
  url?: string;
}

export type FormulaSourceKind = 'standard' | 'manufacturer' | 'textbook' | 'ai';

export interface FormulaSource {
  label: string;
  url?: string;
  kind: FormulaSourceKind;
}

export interface CalculationGiven {
  name: string;
  value: string;
  unit: string;
  source?: CalculationGivenSource;
}

export interface CalculationSection {
  title: string;
  given: CalculationGiven[];
  formula: string;
  legend?: CalculationSymbol[];
  steps: CalculationStep[];
  result: { name: string; value: string; unit: string };
  derived_specs: Array<{ label: string; value: string; unit?: string }>;
  summary: string;
  formula_sources?: FormulaSource[];
}

export interface StreamEvent {
  type: 'status' | 'token' | 'chat_summary' | 'product_card' | 'requirements' | 'decision_summary' | 'bom_table' | 'comparison_table' | 'calculation_section' | 'result' | 'error' | 'preliminary_response' | 'message_placeholder';
  requestId: string;
  message?: string;
  data?: any;
  index?: number;
  delta?: string;
  error?: string;
  bomSummary?: string;
  engineeringNotes?: string;
  payload?: any;
}

export interface AgentContext {
  workflowInputAsText: string;
}
