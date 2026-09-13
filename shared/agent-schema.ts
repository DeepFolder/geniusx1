import { z } from "zod";

// Source types for UnifiedResource
export const ResourceSourceEnum = z.enum([
  'local_rag',      // From documentChunks table (RAG retrieval)
  'file_system',    // From disk search (CAD/PDF files)
  'web_search',     // From DuckDuckGo external search
  'database'        // Direct from companies/products tables
]);

// Resource types that map to existing database entities
export const ResourceTypeEnum = z.enum([
  'product',        // Maps to products table
  'company',        // Maps to companies table
  'document',       // Maps to companyDocuments/catalogues
  'cad_file',       // STEP, STL, DGN, DWG files
  'specification',  // From productSpecificationsIndex
  'external_data'   // Web search results
]);

// Flexible metadata schema that accommodates all source types
export const ResourceMetadataSchema = z.object({
  // Entity references (for database sources)
  companyId: z.number().optional(),
  productId: z.number().optional(),
  documentId: z.number().optional(),
  documentIndexId: z.number().optional(),
  
  // File info (for file_system source)
  path: z.string().optional(),
  filename: z.string().optional(),
  ext: z.string().optional(),
  sizeBytes: z.number().optional(),
  mtime: z.string().optional(),
  
  // Web info (for web_search source)
  url: z.string().optional(),
  domain: z.string().optional(),
  
  // Document/RAG info (from documentChunks)
  chunkIndex: z.number().optional(),
  pageNumber: z.number().optional(),
  sectionHeading: z.string().optional(),
  tokenCount: z.number().optional(),
  sourceType: z.string().optional(),
  
  // Product specs (from productSpecificationsIndex)
  dimensions: z.string().optional(),
  material: z.string().optional(),
  specifications: z.record(z.string(), z.any()).optional(),
  
  // Company info
  industry: z.string().optional(),
  location: z.string().optional(),
  
  // Extraction metadata
  extractedSpecs: z.record(z.string(), z.any()).optional(),
  confidence: z.number().optional(),
  extractionMethod: z.string().optional(),
}).passthrough(); // Allow additional fields for flexibility

// Main UnifiedResource schema - all tools must output this format
export const UnifiedResourceSchema = z.object({
  // Core identification
  id: z.string(),
  source: ResourceSourceEnum,
  type: ResourceTypeEnum,
  
  // Content
  title: z.string(),
  summary: z.string(),
  rawContent: z.string().optional(),
  
  // Scoring (normalized 0.0 to 1.0)
  relevanceScore: z.number().min(0).max(1),
  
  // Flexible metadata
  metadata: ResourceMetadataSchema,
  
  // Timestamp (ISO 8601)
  timestamp: z.string().optional(),
});

// Array of unified resources
export const UnifiedResourceArraySchema = z.array(UnifiedResourceSchema);

// Orchestrator response schema
export const OrchestratorResponseSchema = z.object({
  text: z.string(),
  sources: UnifiedResourceArraySchema,
  metadata: z.object({
    requestId: z.string(),
    totalResults: z.number(),
    executionTimeMs: z.number(),
    toolsExecuted: z.array(z.string()),
    provider: z.string(),
    model: z.string(),
  }).optional(),
});

// Agent execution request schema
export const AgentExecuteRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  webContent: z.string().optional(),
  options: z.object({
    enableFileScan: z.boolean().optional(),
    enableWeb: z.boolean().optional(),
    enableRag: z.boolean().optional(),
    maxResults: z.number().optional(),
    companyIds: z.array(z.number()).optional(),
  }).optional(),
});

// Type exports for TypeScript
export type ResourceSource = z.infer<typeof ResourceSourceEnum>;
export type ResourceType = z.infer<typeof ResourceTypeEnum>;
export type ResourceMetadata = z.infer<typeof ResourceMetadataSchema>;
export type UnifiedResource = z.infer<typeof UnifiedResourceSchema>;
export type OrchestratorResponse = z.infer<typeof OrchestratorResponseSchema>;
export type AgentExecuteRequest = z.infer<typeof AgentExecuteRequestSchema>;

// Helper function to create a UnifiedResource with defaults
export function createUnifiedResource(
  partial: Partial<UnifiedResource> & Pick<UnifiedResource, 'id' | 'source' | 'type' | 'title' | 'summary'>
): UnifiedResource {
  return {
    relevanceScore: 0.5,
    metadata: {},
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

// Helper to validate and parse UnifiedResource
export function parseUnifiedResource(data: unknown): UnifiedResource {
  return UnifiedResourceSchema.parse(data);
}

// Helper to safely validate UnifiedResource (returns null on failure)
export function safeParseUnifiedResource(data: unknown): UnifiedResource | null {
  const result = UnifiedResourceSchema.safeParse(data);
  return result.success ? result.data : null;
}
