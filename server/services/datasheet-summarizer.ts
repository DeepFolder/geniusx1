import OpenAI from "openai";
import { createLazyOpenAI } from "./openai-client.js";
import fs from "fs";
import path from "path";
import { parsePdfBuffer } from "./pdf-parser.js";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = createLazyOpenAI();

export interface SpecificationSummary {
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  rawTextPreview: string;
}

/**
 * Extracts text content from a PDF Buffer (for in-memory / remotely-fetched PDFs).
 * Returns the raw text string; throws on parse failure or empty result.
 */
export async function extractPdfTextFromBuffer(buf: Buffer): Promise<string> {
  try {
    const pdfData = await parsePdfBuffer(buf);
    if (!pdfData.text || pdfData.text.trim().length === 0) {
      throw new Error('PDF contains no extractable text');
    }
    return pdfData.text;
  } catch (error) {
    console.error('PDF parsing error (buffer):', error);
    throw new Error(`pdf_parse_failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extracts text content from a PDF file
 */
export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    return await extractPdfTextFromBuffer(dataBuffer);
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error(`pdf_parse_failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Uses AI to extract and summarize technical specifications from PDF text
 */
export async function summarizeSpecifications(
  pdfText: string,
  productContext: { name: string; category: string; description?: string }
): Promise<SpecificationSummary> {
  try {
    // Limit text size to avoid token limits (approximately 15,000 characters ~ 4,000 tokens)
    const truncatedText = pdfText.slice(0, 15000);
    
    const prompt = `You are a technical specification extraction expert. Extract and summarize the key technical specifications from this product datasheet.

Product Context:
- Name: ${productContext.name}
- Category: ${productContext.category}
${productContext.description ? `- Description: ${productContext.description}` : ''}

Datasheet Content:
${truncatedText}

Instructions:
1. Extract the most important technical specifications, measurements, and performance metrics
2. Organize them clearly with labels and values
3. Focus on: dimensions, materials, performance metrics, operating conditions, certifications, and key features
4. Keep the output concise (approximately 120 words maximum)
5. Use bullet points or clear formatting
6. Only include specifications that are explicitly stated in the datasheet
7. If confidence is low due to insufficient information, indicate this

Please provide the technical specifications in a clear, readable format.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a technical specification extraction expert. Extract accurate, concise technical specifications from product datasheets. Be precise and only include information explicitly stated in the source material."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 500,
    });

    const summary = response.choices[0].message.content?.trim() || '';
    
    if (!summary || summary.length < 20) {
      throw new Error('AI returned insufficient specification data');
    }

    // Determine confidence based on content quality indicators
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    
    if (summary.toLowerCase().includes('insufficient') || 
        summary.toLowerCase().includes('unable to extract') ||
        summary.length < 50) {
      confidence = 'low';
    } else if (summary.length > 100 && 
               (summary.includes('•') || summary.includes('-') || summary.includes('\n'))) {
      confidence = 'high';
    }

    return {
      summary,
      confidence,
      rawTextPreview: truncatedText.slice(0, 500) + (truncatedText.length > 500 ? '...' : '')
    };

  } catch (error) {
    console.error('AI summarization error:', error);
    
    if (error instanceof Error && error.message.includes('API')) {
      throw new Error('ai_unavailable: OpenAI API error');
    }
    
    throw new Error(`ai_summarization_failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Main function to process a datasheet and generate specifications
 */
export async function generateSpecificationsFromDatasheet(
  datasteetPath: string,
  productContext: { name: string; category: string; description?: string }
): Promise<SpecificationSummary> {
  // Verify file exists
  const fullPath = path.resolve(datasteetPath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error('datasheet_not_found: File does not exist');
  }

  // Extract text from PDF
  const pdfText = await extractPdfText(fullPath);
  
  // Generate AI summary
  const result = await summarizeSpecifications(pdfText, productContext);
  
  return result;
}

/**
 * Uses AI to extract STRUCTURED key/value technical specifications from a
 * datasheet PDF. Returns a flat Record<string, string> where each value
 * keeps its unit (e.g. { "Dyn. load carrying capacity": "31 kN" }).
 *
 * This is what the search agent sees in the verified-catalog context block,
 * so a product with structured specs reads as a row of comparable numbers
 * instead of a wall of free-text PDF prose.
 */
export async function extractStructuredSpecs(
  pdfText: string,
  productContext: { name: string; category: string; description?: string }
): Promise<Record<string, string>> {
  const truncatedText = pdfText.slice(0, 15000);

  const prompt = `You are a technical specification extraction expert. Extract STRUCTURED technical specifications from this product datasheet as JSON key/value pairs.

Product Context:
- Name: ${productContext.name}
- Category: ${productContext.category}
${productContext.description ? `- Description: ${productContext.description}` : ''}

Datasheet Content:
${truncatedText}

Instructions:
1. Return ONLY a JSON object with the form { "specifications": { "Spec name": "value with unit", ... } }.
2. Each key is the spec name as written in the datasheet (e.g. "Dyn. load carrying capacity", "Stroke length", "Threaded spindle diameter").
3. Each value is a SHORT string that includes the numeric value AND its unit (e.g. "31 kN", "≤ 1500 mm", "32 mm", "IP67S", "Ball screw"). Do NOT split number and unit.
4. Include the most search-relevant specs first: load/force ratings, stroke/length, speed, voltage/power, dimensions, protection class, drive type, materials, certifications.
5. Aim for 6–15 entries. Skip narrative sentences, marketing copy, and anything not numerical or categorical.
6. Use the EXACT wording from the datasheet for keys whenever possible — do not paraphrase.
7. Only include specs explicitly stated in the datasheet text. Never invent values.
8. If the datasheet has no extractable structured specs, return { "specifications": {} }.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content: "You are a technical specification extraction expert. Return only the requested JSON. Be precise and only include information explicitly stated in the source material.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    // gpt-5 is a reasoning model — hidden reasoning tokens are deducted from
    // the same budget. Need a generous ceiling so the JSON output fits after
    // the model has done its analysis (typical: ~2k reasoning + ~1k output).
    max_completion_tokens: 6000,
  });

  const raw = response.choices[0]?.message?.content?.trim() || '';
  const finishReason = response.choices[0]?.finish_reason;
  if (!raw) {
    throw new Error(`AI returned empty structured-spec response (finish_reason: ${finishReason}, tokens: ${response.usage?.total_tokens})`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse structured-spec JSON: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  const specsObj = parsed?.specifications && typeof parsed.specifications === 'object'
    ? parsed.specifications
    : (parsed && typeof parsed === 'object' ? parsed : {});

  // Normalize: keep only string-valued, non-empty entries
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(specsObj)) {
    if (typeof k !== 'string' || !k.trim()) continue;
    if (v === null || v === undefined) continue;
    const sv = String(v).trim();
    if (!sv || sv.toLowerCase() === 'not specified' || sv.toLowerCase() === 'n/a') continue;
    cleaned[k.trim()] = sv;
  }

  return cleaned;
}

/**
 * Convenience: read a PDF from disk and return structured specs.
 * Returns an empty object on any non-fatal error so callers can fall back
 * silently (we do not want product create/update to fail just because the
 * background extraction couldn't read a PDF).
 */
export async function generateStructuredSpecsFromDatasheet(
  datasheetPath: string,
  productContext: { name: string; category: string; description?: string }
): Promise<Record<string, string>> {
  const fullPath = path.resolve(datasheetPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error('datasheet_not_found: File does not exist');
  }
  const pdfText = await extractPdfText(fullPath);
  return await extractStructuredSpecs(pdfText, productContext);
}
