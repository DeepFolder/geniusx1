import OpenAI from "openai";
import { createLazyOpenAI } from "../../services/openai-client.js";

export interface AiData {
  format: string;
  document_type: string;
  title: string;
  summary: string;
  language: string;
  entities: string[];
  specifications: Record<string, string>;
  tables: Array<{ name: string; rows: string[][] }>;
  technical_terms: string[];
  semantic_tags: string[];
  source_pages: number;
}

const client = createLazyOpenAI();

export async function generateAiLayer(text: string, filename: string): Promise<AiData> {
  const truncated = text.slice(0, 12000);

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a document intelligence extractor. Given document text, return a JSON object with these exact keys:
- format: always "DPF-1.0"
- document_type: e.g. "Technical Datasheet", "Report", "Presentation", "Manual", "Article", "Specification", "Other"
- title: inferred document title (string)
- summary: concise 2-3 sentence summary (string)
- language: ISO 639-1 code e.g. "en"
- entities: array of key named entities (companies, products, standards, people) — max 15
- specifications: object of key technical specs found (name → value) — max 20 entries
- tables: array of {name, rows} for any tabular data found — max 5 tables, each max 10 rows of 5 cols
- technical_terms: array of domain-specific terms — max 20
- semantic_tags: array of topic tags for search/retrieval — max 10
- source_pages: estimated page count as integer`,
      },
      {
        role: "user",
        content: `Filename: ${filename}\n\nDocument text:\n${truncated}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as AiData;

  return {
    format: "DPF-1.0",
    document_type: parsed.document_type ?? "Document",
    title: parsed.title ?? filename,
    summary: parsed.summary ?? "",
    language: parsed.language ?? "en",
    entities: parsed.entities ?? [],
    specifications: parsed.specifications ?? {},
    tables: parsed.tables ?? [],
    technical_terms: parsed.technical_terms ?? [],
    semantic_tags: parsed.semantic_tags ?? [],
    source_pages: parsed.source_pages ?? 1,
  };
}
