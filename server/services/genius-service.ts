import OpenAI from "openai";
import { z } from "zod";
import {
  geniusCalculationDocSchema,
  geniusCalculationDocSchemaStrict,
  geniusTaskProposalSchema,
  type GeniusCalculationDoc,
  type GeniusTaskProposal,
} from "../../shared/schema.js";
import {
  recomputeDoc,
  commentaryNumbersAreGrounded,
  extractNumericTokens,
} from "./genius-eval.js";
import { requestedGeniusDecimals } from "../../shared/genius-number-format.js";
import {
  classifySource,
  sourceTierWeight,
  confidencePenalty,
  type SourceTier,
} from "./genius-sources.js";
import {
  getGeniusSettings,
  isReasoningModel,
  EXPERT_MODEL,
  PHD_MODEL,
  qualityModesAreExclusive,
} from "./genius-settings.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** A provider call exceeded its explicit server-side budget. */
export class GeniusStageTimeoutError extends Error {
  constructor(public readonly stage: string, public readonly timeoutMs: number) {
    super(`${stage} exceeded its ${Math.round(timeoutMs / 60000)} minute time limit`);
    this.name = "GeniusStageTimeoutError";
  }
}

/**
 * Bound a provider operation while preserving caller cancellation. PhD work is
 * intentionally allowed a long budget, but never an unbounded proxy/provider
 * wait. The caller can present the stage name as a retryable error.
 */
export async function withGeniusDeadline<T>(
  stage: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abortParent = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", abortParent, { once: true });
  const timer = setTimeout(() => controller.abort(new GeniusStageTimeoutError(stage, timeoutMs)), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error: any) {
    if (controller.signal.reason instanceof GeniusStageTimeoutError) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abortParent);
  }
}

/**
 * A single turn of the Genius X1 chat session, sent from the client so the
 * server can include prior context in classification and generation calls.
 */
export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

/**
 * Trim a chat history to a safe size before sending to OpenAI.
 * Keeps the most-recent turns and caps each message at `maxChars`.
 */
function trimHistory(history: ChatHistoryItem[] | undefined, maxTurns = 8, maxChars = 800): ChatHistoryItem[] {
  if (!history?.length) return [];
  return history
    .slice(-maxTurns)
    .map((m) => ({ role: m.role, content: m.content.slice(0, maxChars) }));
}

/** Substantive expert reasoning used for Q&A and proposal work, never pipeline support. */
const EXPERT_HELPER_MODEL = "gpt-5.4-2026-03-05";

/**
 * Returns the model for substantive expert helper functions.
 * Intent routing, source discovery, and commentary deliberately bypass this.
 */
function expertHelperModel(expertMode: boolean | undefined, fallback: string): string {
  return expertMode ? EXPERT_HELPER_MODEL : fallback;
}

const SYSTEM_PROMPT = `You are Genius X1, an expert engineering calculation agent. Given an engineering problem in natural language, you produce a transparent, source-backed, step-by-step calculation as STRICT JSON.

Return ONLY a JSON object with this exact shape:
{
  "projectTitle": string,
  "problemStatement": string,
  "inputs": [{ "id": string, "symbol": string, "label": string, "value": number, "unit": string, "editable": true, "description": string }],
  "assumptions": [{ "id": string, "symbol": string, "label": string, "value": number, "unit": string, "rationale": string, "editable": true }],
  "steps": [{ "id": string, "symbol": string, "title": string, "description": string, "formula": string, "expr": string, "calculation": string, "result": string, "unit": string, "sources": number[], "warnings": string[] }],
  "results": [{ "id": string, "label": string, "symbol": string, "value": string, "unit": string, "sources": number[], "description": string }],
  "references": [{ "id": number, "title": string, "url": string }],
  "confidence": { "score": number, "explanation": string, "factors": string[] },
  "visualizations": [{ "id": string, "type": "table"|"chart", "title": string, "caption": string, "columns"?: string[], "rows"?: (string|number)[][], "chartType"?: "line"|"bar", "xKey"?: string, "xLabel"?: string, "xUnit"?: string, "yLabel"?: string, "yUnit"?: string, "series"?: [{"key": string, "label": string, "unit"?: string}], "data"?: object[] }],
  "expertSummary": string,
  "recommendations": [string]
}

CRITICAL RULES:
- Every "symbol" MUST be a valid identifier (letters, digits, underscore; start with a letter or underscore). Symbols must be UNIQUE across inputs, assumptions, and steps. Keep symbols SHORT — 10 characters maximum. Follow engineering convention:
  • Resultant forces / moments / powers / pressures → UPPERCASE base, short subscript: F, P, M, T, W, P_m, F_n, M_b
  • Geometry / lengths / speeds / frequencies → lowercase single letter or letter + short subscript: d, l, h, r, t, v, n, omega, l_s
  • Material properties, stress, efficiency → spelled Greek name (rendered as the glyph): sigma, tau, eta, nu, epsilon, rho, mu, omega. Use subscripts for variants: sigma_y, tau_max, eta_m
  • Dimensionless ratios / factors → 2–3 letter uppercase abbreviation: SF, CF, RE
  • Subscripts for disambiguation only; subscript ≤ 3 chars: P_m not P_mech, P_d not P_motor, sigma_y not sigma_yield
  • Use AT MOST ONE underscore and one subscript. Never stack subscripts: P_d, never P_motor_kw or P_{motor}_{kw}
  • NEVER put a unit in a symbol. Put kW, MPa, mm, rpm, etc. only in the "unit" field: symbol P_d with unit kW, never P_kw
  • NEVER use full English words as a symbol or subscript: lead→l, eff→eta, mech→m, motor→d (drive), req→r, net→n, yield→y, axial→a, radial→r, bend→b. Standard 3-letter engineering qualifiers max, min, rms, and avg are allowed
- "expr" is a machine-evaluable math expression using ONLY those symbols, numeric literals, and functions: sqrt, cbrt, abs, sin, cos, tan, asin, acos, atan, atan2, ln, log, log10, exp, pow, min, max, round, floor, ceil, sign, deg2rad, rad2deg. Constants: pi, e. Operators: + - * / % ^.
- expr may reference the symbols of EARLIER steps. Steps are evaluated top-to-bottom.
 - The server converts every supported input unit to canonical SI before evaluating "expr", then converts the computed result to the step's declared unit. Write expressions using physical quantities directly: never bake scale conversions such as "/1000" for mm→m, "/3.6" for km/h→m/s, or "/3600" for seconds→hours into expr. Use a supported, explicit unit for every dimensional input, step, and result. Angle functions receive radians internally.
- "formula" is LaTeX (symbolic only, no numbers), "calculation" is LaTeX WITH the substituted numbers, "result"/"value" are your best numeric estimates as strings (the server will overwrite them with the evaluated value). Both "formula" and "calculation" MUST be the bare right-hand-side expression ONLY — do NOT prefix either with "symbol =" and do NOT append "= <answer>" at the end of "calculation"; the UI already renders "symbol = formula = calculation ≈ result" and will show duplicated symbols/equals/results if you include them yourself.
- In "formula" and "calculation", EVERY division MUST use explicit LaTeX fraction markup \\frac{numerator}{denominator}. NEVER write a plain slash division like "A / B" or "(P_1 + P_2)/V" — write \\frac{A}{B} and \\frac{P_1 + P_2}{V}. Use \\cdot or \\times for multiplication, never "*". Subscripts always use braces, e.g. P_{d}, \sigma_{y}.
 - "unit" uses readable Unicode (e.g. "N·m", "rpm", "m/s", "kW"). Do not put units inside expr. For ratios, coefficients, efficiencies, and any other dimensionless quantity, use an empty string (or "1"), NEVER the word "dimensionless".
 - For ISO 281 rolling-bearing rating life, do NOT show the load-ratio result as unit "1". Create an explicit life-in-revolutions step whose expression evaluates to actual revolutions: use \`1000000*(C/P)^p\` with unit "Mrev". Then use that step directly for operating life (for example, \`L10*2*pi/n\` with unit "h"). "Mrev" is the standard million-revolutions display unit. Leave genuinely generic ratios, coefficients, and efficiencies dimensionless.
- Cite sources with numbered references (2-4 total). Every formula/method must cite at least one source in its "sources" array. Include only the "title" and "id" fields — set "url" to "" (empty string) on EVERY reference UNLESS the VERIFIED WEB REFERENCES block is present, in which case use those exact URLs verbatim. NEVER invent or guess a URL.
- confidence.score is 0-100 based on: source authority (standards bodies > handbooks > academic papers > manufacturer guides > general web), number of assumptions, completeness of inputs, formula relevance, and complexity. Prefer citing established standards (ISO, ASTM, ASME, NIST, IEEE) and recognised handbooks (Shigley's, Machinery's Handbook, Roark's) over generic web pages. When VERIFIED WEB REFERENCES are provided, name the source type (Standard / Handbook / Academic / Manufacturer / General) in your confidence factors. If NO VERIFIED WEB REFERENCES block is present, explicitly note "Citations unverified — no live sources provided" in confidence.factors. Give a short explanation and 3-5 factors.
- Add "visualizations" ONLY when genuinely useful: a results-summary table, and/or a chart sweeping one result across an input range (compute the "data" points yourself). Omit if not helpful. For every chart, populate all four axis fields: "xLabel" (human-readable X axis name, e.g. "Speed"), "xUnit" (SI or common symbol, e.g. "mm/s"), "yLabel" (human-readable Y axis name, e.g. "Motor power"), "yUnit" (SI or common symbol, e.g. "W"). Also set "unit" on each series entry to match yUnit.
- Each input's "description" must be 1–2 sentences in ENGLISH explaining what the parameter is and why it matters in this specific calculation (e.g. "Yield strength of the steel plate. Used as the failure threshold when computing the safety factor."). Max 300 characters. Never use non-Latin characters.
- Each result's "description" must be 1–2 sentences in ENGLISH explaining what the result represents and its engineering significance (e.g. "Factor of safety against yielding. A value above 2.0 is generally required for static structural members."). Max 300 characters. Never use non-Latin characters.
- If required values are missing, create reasonable editable assumptions rather than refusing, and note them.
- "expertSummary": 3–4 concise sentences that reason through the calculated results in plain language: (1) state the headline result with its current numeric value and unit, (2) explain what that result means in this engineering context, (3) explain why its magnitude is plausible by linking it to the most influential current input or assumption and the relevant formula relationship, and (4, when useful) identify a sensitivity or limiting assumption. Focus on the calculated evidence; do not merely restate the problem or give a general project description. Do not include a confidence score or confidence note here — those belong only in "confidence". No LaTeX or markdown.
- "recommendations": array of 3–5 short strings, each a prioritised improvement or check (e.g. missing safety factor, standard to verify, assumption to validate, sensitivity to run, alternative approach). Start each with an imperative verb. No LaTeX.
- Output MUST be valid JSON. No markdown, no commentary.`;

export interface CallResult {
  doc: GeniusCalculationDoc;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Time spent waiting for live references before the model call. */
  sourceLookupMs: number;
  /** Core model time only; retained as durationMs for usage tracking compatibility. */
  durationMs: number;
  /** Deterministic schema parse + server recomputation time. */
  recomputationMs: number;
}

function extractJson(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

/**
 * Parses a planning proposal while tolerating bare LaTex backslashes. This is
 * intentionally limited to proposal responses from reasoning models; normal
 * JSON-mode answers must retain strict parsing.
 */
export function extractProposalJson(text: string): any {
  const parseCandidate = (candidate: string): any => {
    // A few LaTex commands begin with a character JSON treats as a valid escape
    // (`\frac` starts with `\f`, for example). Repair these before parsing so
    // they are not silently converted to control characters.
    const latexCommandStart = /(?<!\\)\\(?=(?:frac|cdot|times|left|right|mathrm|text|sqrt|sum|int|alpha|beta|gamma|delta|theta|sigma|tau|omega|mu|nu|eta|rho|pi|approx|leq|geq|pm|mp|overline|underline|mathbf|mathit|displaystyle|quad|qquad|ldots|dots|begin|end|boxed|hat|bar|vec|circ|infty|partial|nabla|log|ln|sin|cos|tan|exp|operatorname))/g;
    const latexSafe = candidate.replace(latexCommandStart, "\\\\");
    try {
      return JSON.parse(latexSafe);
    } catch (originalError) {
      // JSON permits only \" \\ \/ \b \f \n \r \t and \uXXXX escapes.
      // Preserve all valid escapes while escaping bare LaTex sequences.
      const repaired = latexSafe.replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, "\\\\");
      if (repaired === latexSafe) throw originalError;
      return JSON.parse(repaired);
    }
  };

  const trimmed = text.trim();
  try {
    return parseCandidate(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return parseCandidate(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

async function callModel(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  expertMode = false,
  phdMode = false,
  signal?: AbortSignal,
): Promise<CallResult> {
  // Quality-mode routing is fixed, so avoid a settings DB read on its critical path.
  const settings = expertMode || phdMode ? undefined : await getGeniusSettings();
  const model = phdMode ? PHD_MODEL : expertMode ? EXPERT_MODEL : (settings?.generationModel ?? "gpt-5.4-2026-03-05");
  const temp = parseFloat(String(settings?.temperature ?? "0.2"));
  // PhD reserves Astra for the final calculation build at a balanced high effort.
  const effort = phdMode ? "high" : expertMode ? "high" : (settings?.reasoningEffort ?? "none");
  const reasoning = isReasoningModel(model);

  const t0 = Date.now();

  let completion!: OpenAI.Chat.ChatCompletion;
  const providerCall = async (providerSignal: AbortSignal) => {
  if (reasoning) {
    // Reasoning models: omit temperature, use response_format "text" (not "json_object").
    // The system prompt already instructs the model to return valid JSON.
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      response_format: { type: "text" },
    };
    if (effort !== "none") {
      (params as any).reasoning_effort = effort;
    }
    completion = await openai.chat.completions.create(params, { signal: providerSignal });
  } else {
    completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: temp,
      response_format: { type: "json_object" },
    }, { signal: providerSignal });
  }
  };
  // Keep PhD calculation generation bounded while allowing deeper reasoning
  // than Standard. Proposal work uses Sol instead of Astra.
  await (phdMode
    ? withGeniusDeadline("calculation generation", 12 * 60 * 1000, providerCall, signal)
    : providerCall(signal ?? new AbortController().signal));

  const durationMs = Date.now() - t0;
  const recomputeStartedAt = Date.now();
  const content = completion.choices[0]?.message?.content || "";
  const raw = extractJson(content);
  // Use the strict schema here — AI output must conform to the 10-char/identifier
  // symbol contract. Existing stored documents are parsed leniently by routes.
  const parsed = geniusCalculationDocSchemaStrict.parse(raw);
  const doc = recomputeDoc(parsed);
  const recomputationMs = Date.now() - recomputeStartedAt;
  return {
    doc,
    model,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
    sourceLookupMs: 0,
    durationMs,
    recomputationMs,
  };
}

// ---------------------------------------------------------------------------
// Assistant commentary — a second, lightweight AI pass that interprets the
// recomputed calculation like a real engineer would: what the headline number
// means, whether it looks plausible, which assumptions drive it, and (when
// useful) a proactive next step. It only references numbers already present in
// the document — the grounding check rejects anything invented — and it always
// degrades to a plain factual summary, never blocking the calculation.
// ---------------------------------------------------------------------------

const COMMENTARY_MODEL = "gpt-4o-mini";

export type CommentaryKind = "new" | "update" | "recalc" | "build";

export interface CommentaryContext {
  kind: CommentaryKind;
  /** The user's follow-up request, for "update" commentary. */
  userMessage?: string;
  /** The document as it was BEFORE the change, so the reply can explain what moved. */
  previous?: GeniusCalculationDoc;
}

/** Deterministic factual summary — the graceful-degradation reply. */
export function fallbackCommentary(doc: GeniusCalculationDoc): string {
  const top = doc.results[0];
  const key = top ? ` Headline result: ${top.label} = ${top.value} ${top.unit}.` : "";
  const conf = doc.confidence?.score != null ? ` Confidence: ${doc.confidence.score}%.` : "";
  return `Calculation complete for "${doc.projectTitle}".${key}${conf} Edit any input and hit Recalculate to update all values.`;
}

const COMMENTARY_SYSTEM = `You are Genius X1, a senior engineer giving a colleague a quick verbal take on their calculation. Write 2–3 sentences of natural, direct prose — the kind of thing a sharp engineer would say out loud after glancing at the result. Lead with whatever is most notable or non-obvious about THIS specific problem: a surprising result, a tight margin, a hidden sensitivity, an assumption that carries more weight than it looks, or a practical next step. Vary your angle — don't follow a fixed formula. Sometimes the interesting thing is the headline number; sometimes it's a fragile assumption; sometimes it's what the result implies for the next design decision.

BANNED PHRASES — output is discarded if any appear: "seems reasonable", "looks reasonable", "appears reasonable", "seems appropriate", "seems correct", "looks correct", "typical for this type", "typical for this kind", "worth verifying", "worth checking", "it is worth", "the result is", "the value is", "the answer is", "the parameter that dominates", "dominates the result".

HARD RULES:
- Use ONLY numbers that literally appear in the provided calculation document(s). NEVER compute, derive, approximate, re-round, or invent any number.
- Plain conversational prose only. No headings, no bullet lists, no LaTeX, no markdown.
- Never open with a greeting, affirmation, or phrase like "Great question" or "Sure!".
- Be specific to THIS problem only. Generic engineering observations are useless.`;

function resultLines(doc: GeniusCalculationDoc): string {
  return doc.results.map((r) => `- ${r.label} (${r.symbol}): ${r.value} ${r.unit}`).join("\n");
}

/** Human-readable engineering summary for the commentary prompt — avoids raw JSON noise. */
function docSummary(doc: GeniusCalculationDoc): string {
  const inputs = [...doc.inputs, ...doc.assumptions]
    .map((v) => `  ${v.symbol} = ${v.value} ${v.unit}  [${v.label}]`)
    .join("\n");
  const steps = doc.steps
    .map((s) => `  ${s.symbol} = ${s.result} ${s.unit}  via: ${s.formula || s.expr}  [${s.title}]`)
    .join("\n");
  const results = doc.results.map((r) => `  ${r.label} (${r.symbol}): ${r.value} ${r.unit}`).join("\n");
  const refs = doc.references?.map((r) => `  [${r.id}] ${r.title}`).join("\n") || "  (none)";
  return [
    `PROBLEM: ${doc.projectTitle}`,
    doc.problemStatement ? `STATEMENT: ${doc.problemStatement}` : "",
    `INPUTS & ASSUMPTIONS:\n${inputs}`,
    `CALCULATION STEPS:\n${steps}`,
    `RESULTS:\n${results}`,
    `REFERENCES:\n${refs}`,
    `CONFIDENCE: ${doc.confidence?.score ?? "?"}%  — ${doc.confidence?.explanation ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Trusted details for a chat answer about a withheld (—) calculation result. */
function verificationDiagnostics(doc: GeniusCalculationDoc): string {
  const failedSteps = doc.steps.filter((step) => step.reviewNeeded || step.result === "—");
  const failedResults = doc.results.filter((result) => result.reviewNeeded || result.value === "—");
  if (!failedSteps.length && !failedResults.length) return "";

  const inputs = [...doc.inputs, ...doc.assumptions]
    .map((value) => `  ${value.label} (${value.symbol}) = ${value.value} ${value.unit || "(no unit)"}`)
    .join("\n");
  const steps = failedSteps
    .map((step) => `  ${step.title} (${step.symbol}): ${step.formula || step.expr || "(no expression)"} → ${step.result || "—"} ${step.unit || ""}${step.warnings?.length ? `; warnings: ${step.warnings.join(" | ")}` : ""}`)
    .join("\n");
  const results = failedResults
    .map((result) => `  ${result.label} (${result.symbol}): ${result.value} ${result.unit || ""}${result.warnings?.length ? `; warnings: ${result.warnings.join(" | ")}` : ""}`)
    .join("\n");

  return `\n\nVERIFICATION DIAGNOSTICS — trusted evaluator findings, not model guesses:
FAILED STEPS:
${steps || "  (none)"}
FAILED RESULTS:
${results || "  (none)"}
CURRENT INPUTS & ASSUMPTIONS:
${inputs || "  (none)"}`;
}

type SummaryParameter = GeniusCalculationDoc["inputs"][number] | GeniusCalculationDoc["assumptions"][number];

function changedSummaryParameter(
  doc: GeniusCalculationDoc,
  previous?: GeniusCalculationDoc,
): SummaryParameter | undefined {
  if (!previous) return undefined;
  const previousById = new Map(
    [...previous.inputs, ...previous.assumptions].map((value) => [value.id, value]),
  );
  return [...doc.inputs, ...doc.assumptions].find((value) => {
    const old = previousById.get(value.id);
    return old && (String(old.value) !== String(value.value) || old.unit !== value.unit);
  });
}

function textMentionsNumber(text: string, value: unknown): boolean {
  const expected = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(expected)) return false;
  return extractNumericTokens(text).some((actual) => {
    const scale = Math.max(Math.abs(actual), Math.abs(expected), 1e-12);
    return Math.abs(actual - expected) / scale <= 0.001;
  });
}

/**
 * Current-value-only fallback for the expert summary. Never preserve the old
 * prose after a recalculate: it may contain a numeric snapshot that is no
 * longer true.
 */
export function fallbackExpertSummary(
  doc: GeniusCalculationDoc,
  previous?: GeniusCalculationDoc,
): string {
  const headline = doc.results[0];
  const changed = changedSummaryParameter(doc, previous);
  const driver = changed ?? doc.inputs[0] ?? doc.assumptions[0];
  const supportingStep = headline
    ? [...doc.steps].reverse().find(
        (step) => step.symbol === headline.symbol && step.result && step.result !== "—",
      )
    : [...doc.steps].reverse().find((step) => step.result && step.result !== "—");
  const sentences: string[] = [];

  if (headline) {
    sentences.push(
      `${headline.label} is ${headline.value}${headline.unit ? ` ${headline.unit}` : ""}, the current headline result for ${doc.projectTitle}.`,
    );
  } else {
    sentences.push(`${doc.projectTitle} was recalculated using the current inputs and assumptions.`);
  }
  if (driver) {
    sentences.push(
      `Among the values shaping the calculation, ${driver.label} is currently ${driver.value}${driver.unit ? ` ${driver.unit}` : ""}.`,
    );
  } else {
    sentences.push("Its magnitude follows from the current listed inputs and assumptions.");
  }
  if (supportingStep) {
    sentences.push(
      `The calculation reaches that value through ${supportingStep.title}, whose recomputed result is ${supportingStep.result}${supportingStep.unit ? ` ${supportingStep.unit}` : ""}.`,
    );
  } else {
    sentences.push("The reported result reflects the current calculation path rather than a restatement of the original problem.");
  }
  if (changed) {
    sentences.push(
      `The edited ${changed.label} is now ${changed.value}${changed.unit ? ` ${changed.unit}` : ""}, and the headline result has been recomputed from that current value.`,
    );
  }
  return sentences.join(" ");
}

/**
 * Regenerate expertSummary with the current computed values so the prose
 * matches the numbers after a recalculate. Invalid/failed model output falls
 * back to a new deterministic summary, never the stale existing text.
 */
export async function refreshExpertSummary(
  doc: GeniusCalculationDoc,
  previous?: GeniusCalculationDoc,
  signal?: AbortSignal,
): Promise<string> {
  const changed = changedSummaryParameter(doc, previous);
  const fallback = fallbackExpertSummary(doc, previous);
  try {
    const completion = await openai.chat.completions.create(
      {
        model: COMMENTARY_MODEL,
        temperature: 0.4,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "You are a senior engineer. Write a concise 3–4 sentence plain-prose calculation summary that reasons through the engineering results provided. " +
              "Rules: (1) state the headline result with its current numeric value and unit; " +
              "(2) explain what that result means in this engineering context; " +
              "(3) explain why its magnitude is plausible by linking it to the most influential current input or assumption and the relevant direct, inverse, or other formula relationship; " +
              "(4) when useful, identify a sensitivity or limiting assumption; " +
              "(5) when a MOST RECENTLY EDITED PARAMETER is supplied, explicitly state its CURRENT value and do not mention its previous value. " +
              "Focus on calculated evidence. Do not merely restate the problem or give a general project description. " +
              "Do not include a confidence score or confidence note; confidence is presented separately. " +
              "Use ONLY numbers that appear in the document. No LaTeX, no markdown, no headings.",
          },
          {
            role: "user",
            content:
              "Rewrite the expert summary to reflect the current computed values.\n\n" +
               (changed
                 ? `MOST RECENTLY EDITED PARAMETER: ${changed.label} (${changed.symbol}) = ${changed.value} ${changed.unit}\n\n`
                 : "") +
               docSummary(doc),
          },
        ],
      },
      { signal },
    );
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text || !commentaryNumbersAreGrounded(text, [doc])) return fallback;
    if (changed && !textMentionsNumber(text, changed.value)) return fallback;
    return text;
  } catch (err: any) {
    if (signal?.aborted || err?.name === "AbortError") throw err;
    console.warn("[genius] expert summary refresh failed, using current factual summary:", err?.message);
    return fallback;
  }
}

export async function generateCommentary(
  doc: GeniusCalculationDoc,
  ctx: CommentaryContext,
  _expertMode?: boolean,
  signal?: AbortSignal,
): Promise<string> {
  try {
    let intro: string;
    switch (ctx.kind) {
      case "update":
        intro =
          `The engineer asked: "${(ctx.userMessage || "").slice(0, 800)}"\n` +
          (ctx.previous
            ? `Results BEFORE the change:\n${resultLines(ctx.previous)}\n\n`
            : "") +
          `The calculation was updated and all numbers were recomputed by the server (you cannot change them). React to what actually changed — be direct about what moved and whether the shift is what you'd expect. If something looks off or reveals a sensitivity, say so plainly.`;
        break;
      case "recalc":
        intro =
          (ctx.previous
            ? `Results BEFORE the engineer's edits:\n${resultLines(ctx.previous)}\n\n`
            : "") +
          `The engineer just tweaked inputs and recomputed. Pick the most telling thing the change reveals — a sensitivity, a margin shift, a new concern — and say it concisely. Don't narrate every number that moved; focus on what matters.`;
        break;
      case "build":
        intro = `The engineer just built this calculation from a proposed task. Give your immediate honest read of the result — one thing that stands out, whether the numbers look right for this kind of problem, or what the next practical question is.`;
        break;
      default:
        intro = `This calculation just came in fresh. Pick the single most interesting thing about the result — could be the headline number, a key assumption carrying the load, an implicit constraint, or what it means for the next step — and give a brief, direct take on it.`;
    }
    const commentaryParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: COMMENTARY_MODEL,
      temperature: 0.75,
      max_tokens: 300,
      messages: [
        { role: "system", content: COMMENTARY_SYSTEM },
        { role: "user", content: `${intro}\n\n--- CALCULATION ---\n${docSummary(doc)}` },
      ],
    };
    const completion = await openai.chat.completions.create(commentaryParams, { signal });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("empty commentary");
    const grounding = ctx.previous ? [doc, ctx.previous] : [doc];
    if (!commentaryNumbersAreGrounded(text, grounding)) {
      console.warn("[genius] commentary referenced numbers not in the document — using factual summary");
      return fallbackCommentary(doc);
    }
    return text;
  } catch (err: any) {
    // Re-throw aborts so the caller's cancellation check fires correctly
    // instead of silently returning fallback commentary.
    if (signal?.aborted || err?.name === "AbortError") throw err;
    console.warn("[genius] commentary generation failed, using factual summary:", err?.message);
    return fallbackCommentary(doc);
  }
}

// ---------------------------------------------------------------------------
// Web search — find real engineering references before generating, so the
// calculation cites live sources instead of placeholders.
// ---------------------------------------------------------------------------

export interface WebReference {
  title: string;
  url: string;
}

export async function searchEngineeringReferences(
  topic: string,
  signal?: AbortSignal,
): Promise<WebReference[]> {
  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input:
        `Find 3-5 authoritative engineering references (standards, textbooks, manufacturer design guides, engineering handbooks or reputable engineering websites) relevant to this calculation topic:\n"${topic}"\n\n` +
        `Return each reference on its own line in EXACTLY this format:\nTITLE :: URL\n\nOnly include real, working URLs you found. No commentary.`,
    }, { signal });
    const text = (response as any).output_text || "";
    const refs: WebReference[] = [];
    const seen = new Set<string>();
    // Primary: our requested "TITLE :: URL" lines.
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*(?:[-*\d.\s]*)(.+?)\s*::\s*(https?:\/\/\S+)\s*$/);
      if (m) {
        const url = m[2].replace(/[).,\]]+$/, "");
        if (!seen.has(url)) {
          seen.add(url);
          refs.push({ title: m[1].trim().slice(0, 200), url });
        }
      }
    }
    // Fallback: url_citation annotations from the web-search tool output.
    if (refs.length === 0) {
      for (const item of (response as any).output ?? []) {
        for (const part of item?.content ?? []) {
          for (const ann of part?.annotations ?? []) {
            if (ann?.type === "url_citation" && ann.url && !seen.has(ann.url)) {
              seen.add(ann.url);
              refs.push({ title: String(ann.title || ann.url).slice(0, 200), url: ann.url });
            }
          }
        }
      }
    }
    return refs.slice(0, 6);
  } catch (err: any) {
    if (signal?.aborted || err?.name === "AbortError") throw err;
    console.warn("[genius] web search failed, continuing without:", err?.message);
    return [];
  }
}

/**
 * Post-process reference URLs after model generation.
 * - webSearch=false: strip every URL (model cannot verify them).
 * - webSearch=true: keep only valid HTTPS URLs; drop clearly bad ones.
 * In both cases, classify the sourceType for each reference.
 */
function sanitizeReferenceUrls(doc: GeniusCalculationDoc, webSearch: boolean): GeniusCalculationDoc {
  const refs = doc.references.map((r) => {
    let url = (r.url || "").trim();
    if (!webSearch) {
      url = "";
    } else {
      const valid =
        url.startsWith("https://") &&
        url.length > 12 &&
        !/^https:\/\/example[./]/i.test(url);
      if (!valid) url = "";
    }
    const sourceType = classifySource(url, r.title) as SourceTier;
    return { ...r, url, sourceType };
  });
  return { ...doc, references: refs };
}

/**
 * Apply a deterministic confidence penalty based on the quality of cited sources.
 * Mutates confidence.score (clamped to [0, 100]) and sets confidence.sourceQualityNote.
 */
function applyConfidencePenalty(doc: GeniusCalculationDoc, webSearch: boolean): GeniusCalculationDoc {
  const { penalty, note } = confidencePenalty(doc.references, webSearch);
  if (penalty === 0 || !note) return doc;
  const rawScore = doc.confidence?.score ?? 70;
  const newScore = Math.max(0, Math.min(100, rawScore - penalty));
  return {
    ...doc,
    confidence: {
      ...doc.confidence,
      score: newScore,
      sourceQualityNote: note,
    },
  };
}

interface ClassifiedWebRef extends WebReference {
  tier: SourceTier;
}

/** Classify, sort (best first), and trim web references to at most 5. */
function classifyAndSortWebRefs(refs: WebReference[]): ClassifiedWebRef[] {
  const classified: ClassifiedWebRef[] = refs.map((r) => ({
    ...r,
    tier: classifySource(r.url, r.title),
  }));
  classified.sort((a, b) => sourceTierWeight(b.tier) - sourceTierWeight(a.tier));
  return classified.slice(0, 5);
}

const TIER_LABELS: Record<SourceTier, string> = {
  standard: "Standard",
  handbook: "Handbook",
  academic: "Academic",
  manufacturer: "Manufacturer",
  general: "General",
  unknown: "General",
};

function webRefsBlock(refs: ClassifiedWebRef[]): string {
  const list = refs.map((r, i) => `${i + 1}. [${TIER_LABELS[r.tier]}] ${r.title} — ${r.url}`).join("\n");
  return (
    `\n\nVERIFIED WEB REFERENCES (found via live web search — use THESE as the "references" array, keeping these exact titles and URLs, numbered 1..${refs.length}; cite them by number in each step's "sources"; do NOT invent placeholder references):\n` +
    list
  );
}

// ---------------------------------------------------------------------------
// Intent classifier — fast pre-pass that decides whether the user's message
// is a pure question or a calculation request.
// ---------------------------------------------------------------------------

export type MessageIntent = "question" | "calculation";

export interface IntentResult {
  intent: MessageIntent;
  reasoning?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

const INTENT_SYSTEM = `You are an intent classifier for an engineering calculation tool. Classify the user message as either:
- "calculation": the user explicitly wants a new calculation, numerical analysis, sizing, design check, simulation, or a specific change/update to an existing calculation (e.g. "calculate X", "size a Y", "change the load to Z")
- "question": everything else — conceptual questions, explanations, definitions, general engineering knowledge, greetings, small talk, off-topic messages, or anything where no numbers need to be computed

Only classify as "calculation" when the user is clearly asking for a numerical result or a change to a worksheet. Greetings ("hello", "hi", "thanks"), questions about concepts, and vague or off-topic messages are always "question".

Respond with ONLY a JSON object: { "intent": "question" | "calculation", "reasoning": string }`;

export async function classifyIntent(
  message: string,
  hasExistingCalc: boolean,
  _expertMode?: boolean,
  signal?: AbortSignal,
  chatHistory?: ChatHistoryItem[],
): Promise<IntentResult> {
  const startedAt = Date.now();
  try {
    const history = trimHistory(chatHistory, 6, 400);
    const historyBlock = history.length
      ? "\n\nRecent conversation:\n" +
        history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")
      : "";
    const context = hasExistingCalc
      ? `The user already has an active calculation open.${historyBlock}\n\nLatest message: "${message.slice(0, 600)}"`
      : `No active calculation.${historyBlock}\n\nLatest message: "${message.slice(0, 600)}"`;
    const intentParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INTENT_SYSTEM },
        { role: "user", content: context },
      ],
    };
    const completion = await openai.chat.completions.create(intentParams, { signal });
    const raw = extractJson(completion.choices[0]?.message?.content || "{}");
    const intent: MessageIntent = raw.intent === "question" ? "question" : "calculation";
    return {
      intent,
      reasoning: raw.reasoning,
      model: "gpt-4o-mini",
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
      durationMs: Date.now() - startedAt,
    };
  } catch (err: any) {
    // Re-throw aborts so the caller's cancellation check fires correctly
    // instead of silently defaulting to "calculation".
    if (signal?.aborted || err?.name === "AbortError") throw err;
    console.warn("[genius] intent classification failed, defaulting to calculation:", err?.message);
    return {
      intent: "calculation",
      model: "gpt-4o-mini",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      durationMs: Date.now() - startedAt,
    };
  }
}

// ---------------------------------------------------------------------------
// Q&A answer generator — expert conversational reply, no calculation produced.
// ---------------------------------------------------------------------------

const QA_SYSTEM = `You are Genius X1, a senior engineering expert and assistant. You answer engineering questions precisely and concisely. You also handle greetings and off-topic messages naturally.

For engineering questions: answer in 2–6 short paragraphs, be precise and grounded in first principles. Use markdown: bold key terms, bullet lists for multiple items, LaTeX for formulas — inline with \\(...\\) and display blocks with \\[...\\]. For any division inside a formula, always use \\frac{numerator}{denominator} instead of a plain slash. No filler phrases — go straight into the answer.

For greetings ("hello", "hi", "thanks", etc.) or off-topic messages: respond briefly and conversationally (1–2 sentences). Remind the user they can describe an engineering problem or ask a question. Do not start a technical explanation unprompted.`;

export interface AnswerResult {
  answer: string;
  calculationExample?: {
    request: string;
    method: string;
  };
}

/**
 * Builds a trusted, step-specific explanation request from the persisted
 * worksheet data. The client only selects an id; it cannot supply a different
 * formula, result, warning, or note to be explained.
 */
export function buildStepExplanationPrompt(
  doc: GeniusCalculationDoc,
  step: GeniusCalculationDoc["steps"][number],
): string {
  const optional = (label: string, value: string | undefined) => value?.trim()
    ? `\n${label}: ${value}`
    : "";
  const warnings = step.warnings?.length ? `\nWarnings: ${step.warnings.join(" | ")}` : "";
  return [
    "Explain the selected calculation step for the engineer.",
    "",
    `Project: ${doc.projectTitle}`,
    `Step label: ${step.title}`,
    `Symbol: ${step.symbol}`,
    `Formula: ${step.formula || "(not provided)"}`,
    `Substituted calculation: ${step.calculation || "(not provided)"}`,
    `Verified result: ${step.result || "—"}${step.unit ? ` ${step.unit}` : ""}`,
    optional("Note", step.description),
    warnings,
    "",
    "Write a short, natural explanation in two compact, unlabeled paragraphs (usually no more than about 140 words). In the first paragraph, explain conversationally what is being calculated. When a formula is provided, place the selected formula on its own visible display-math line between the paragraphs, using exactly \\[ and \\] delimiters so it renders like the worksheet equations; include the selected symbol on the left if the provided formula does not already include it. Never put explanatory words inside the math delimiters. In the second paragraph, explain naturally how the substituted values lead to the verified result and why this formula is needed in the overall engineering workflow. Use only the facts above. Do not use headings, labels, numbered sections, or bullet lists. Do not suggest changes or recalculate anything.",
  ].filter(Boolean).join("\n");
}

/*
async function explainCalculationStepSuperseded(
  doc: GeniusCalculationDoc,
  step: GeniusCalculationDoc["steps"][number],
  expertMode?: boolean,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const model = expertHelperModel(expertMode, "gpt-4o");
  const reasoning = isReasoningModel(model);
  const completion = await openai.chat.completions.create(
    reasoning
      ? {
          model,
          response_format: { type: "text" },
          messages: [
            { role: "system", content: "You are Genius X1, a senior engineering mentor. Give a concise, clear explanation of the selected verified calculation step, teaching the engineering reasoning and formula choice faithfully." },
            { role: "user", content: buildStepExplanationPrompt(doc, step) },
          ],
        }
      : {
          model,
          temperature: 0.35,
          max_tokens: 400,
          messages: [
            { role: "system", content: "You are Genius X1, a senior engineering mentor. Give a concise, clear explanation of the selected verified calculation step, teaching the engineering reasoning and formula choice faithfully." },
            { role: "user", content: buildStepExplanationPrompt(doc, step) },
          ],
        },
    { signal },
  );
  return {
    answer: completion.choices[0]?.message?.content?.trim() || "I couldn't generate an explanation. Please try again.",
  };
}
*/
if (false) {
/**
 * Builds a trusted, step-specific explanation request from the persisted
 * worksheet data. The client only selects an id; it cannot supply a different
 * formula, result, warning, or note to be explained.
 */
function buildStepExplanationPromptSuperseded(
  doc: GeniusCalculationDoc,
  step: GeniusCalculationDoc["steps"][number],
): string {
  const optional = (label: string, value: string | undefined) => value?.trim()
    ? `\n${label}: ${value}`
    : "";
  const warnings = step.warnings?.length ? `\nWarnings: ${step.warnings.join(" | ")}` : "";
  return [
    "Explain the selected calculation step for the engineer.",
    "",
    `Project: ${doc.projectTitle}`,
    `Step label: ${step.title}`,
    `Symbol: ${step.symbol}`,
    `Formula: ${step.formula || "(not provided)"}`,
    `Substituted calculation: ${step.calculation || "(not provided)"}`,
    `Verified result: ${step.result || "—"}${step.unit ? ` ${step.unit}` : ""}`,
    optional("Note", step.description),
    warnings,
    "",
    "Write a short, natural explanation in two compact, unlabeled paragraphs (usually no more than about 140 words). In the first paragraph, explain conversationally what is being calculated. When a formula is provided, place the selected formula on its own visible display-math line between the paragraphs, using exactly \\[ and \\] delimiters so it renders like the worksheet equations; include the selected symbol on the left if the provided formula does not already include it. Never put explanatory words inside the math delimiters. In the second paragraph, explain naturally how the substituted values lead to the verified result and why this formula is needed in the overall engineering workflow. Use only the facts above. Do not use headings, labels, numbered sections, or bullet lists. Do not suggest changes or recalculate anything.",
  ].filter(Boolean).join("\n");
}

async function explainCalculationStepSuperseded(
  doc: GeniusCalculationDoc,
  step: GeniusCalculationDoc["steps"][number],
  expertMode?: boolean,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const model = expertHelperModel(expertMode, "gpt-4o");
  const reasoning = isReasoningModel(model);
  const completion = await openai.chat.completions.create(
    reasoning
      ? {
          model,
          response_format: { type: "text" },
          messages: [
            { role: "system", content: "You are Genius X1, a senior engineering mentor. Give a concise, clear, human explanation of the selected verified calculation step. Use natural prose and the requested display-math formula so the reasoning is easy to scan." },
            { role: "user", content: buildStepExplanationPrompt(doc, step) },
          ],
        }
      : {
          model,
          temperature: 0.35,
          max_tokens: 400,
          messages: [
            { role: "system", content: "You are Genius X1, a senior engineering mentor. Give a concise, clear, human explanation of the selected verified calculation step. Use natural prose and the requested display-math formula so the reasoning is easy to scan." },
            { role: "user", content: buildStepExplanationPrompt(doc, step) },
          ],
        },
    { signal },
  );
  return {
    answer: completion.choices[0]?.message?.content?.trim() || "I couldn't generate an explanation. Please try again.",
  };
}
}

export async function explainCalculationStep(
  doc: GeniusCalculationDoc,
  step: GeniusCalculationDoc["steps"][number],
  expertMode?: boolean,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const model = expertHelperModel(expertMode, "gpt-4o");
  const reasoning = isReasoningModel(model);
  const completion = await openai.chat.completions.create(
    reasoning
      ? {
          model,
          response_format: { type: "text" },
          messages: [
            { role: "system", content: "You are Genius X1, a senior engineering mentor. Give a concise, clear, human explanation of the selected verified calculation step. Use natural prose and the requested display-math formula so the reasoning is easy to scan." },
            { role: "user", content: buildStepExplanationPrompt(doc, step) },
          ],
        }
      : {
          model,
          temperature: 0.35,
          max_tokens: 400,
          messages: [
            { role: "system", content: "You are Genius X1, a senior engineering mentor. Give a concise, clear, human explanation of the selected verified calculation step. Use natural prose and the requested display-math formula so the reasoning is easy to scan." },
            { role: "user", content: buildStepExplanationPrompt(doc, step) },
          ],
        },
    { signal },
  );
  return {
    answer: completion.choices[0]?.message?.content?.trim() || "I couldn't generate an explanation. Please try again.",
  };
}
/*
export async function explainCalculationStep(
  doc: GeniusCalculationDoc,
  step: GeniusCalculationDoc["steps"][number],
  expertMode?: boolean,
  signal?: AbortSignal,
): Promise<AnswerResult> {
  const model = expertHelperModel(expertMode, "gpt-4o");
  const reasoning = isReasoningModel(model);
  const completion = await openai.chat.completions.create(
    reasoning
      ? {
          model,
          response_format: { type: "text" },
          messages: [
            { role: "system", content: "You are Genius X1, a senior engineering mentor. Explain the selected verified calculation step faithfully and clearly." },
            { role: "user", content: buildStepExplanationPrompt(doc, step) },
          ],
        }
      : {
          model,
          temperature: 0.35,
          max_tokens: 650,
          messages: [
            { role: "system", content: "You are Genius X1, a senior engineering mentor. Explain the selected verified calculation step faithfully and clearly." },
            { role: "user", content: buildStepExplanationPrompt(doc, step) },
          ],
        },
    { signal },
  );
  return {
    answer: completion.choices[0]?.message?.content?.trim() || "I couldn't generate an explanation. Please try again.",
  };
}
*/

export async function answerQuestion(
  message: string,
  existingDoc?: GeniusCalculationDoc,
  webSearch?: boolean,
  expertMode?: boolean,
  signal?: AbortSignal,
  chatHistory?: ChatHistoryItem[],
  webReferences?: WebReference[],
): Promise<AnswerResult> {
  let extraContext = "";
  if (existingDoc) {
    extraContext =
      `\n\nThe user has this calculation open for context:\nProject: ${existingDoc.projectTitle}\n` +
      `Results: ${existingDoc.results.map((r) => `${r.label} = ${r.value} ${r.unit}`).join(", ")}` +
      verificationDiagnostics(existingDoc);
  }
  let webContext = "";
  if (webSearch) {
    const refs = webReferences ?? await searchEngineeringReferences(message, signal);
    if (refs.length > 0) {
      webContext =
        "\n\nLIVE REFERENCES FOUND (cite these at the end of your answer as a numbered list):\n" +
        refs.map((r, i) => `${i + 1}. ${r.title} — ${r.url}`).join("\n");
    }
  }
  // Build a proper multi-turn message list so the AI has full conversation context.
  const history = trimHistory(chatHistory, 8, 800);
  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  // The current user turn appends any doc summary and web results.
  const currentUserContent = message + extraContext + webContext;

  const model = expertHelperModel(expertMode, "gpt-4o");
  const reasoning = isReasoningModel(model);
  const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: QA_SYSTEM },
    ...historyMessages,
    { role: "user", content: currentUserContent },
  ];
  const answerShape = z.object({
    answer: z.string().min(1).max(8000),
    calculationExample: z.object({
      request: z.string().min(1).max(4000),
      method: z.string().min(1).max(6000),
    }).nullable().optional(),
  });
  const answerSystem = `${QA_SYSTEM}

Return ONLY JSON in this exact shape:
{"answer": string, "calculationExample": null | {"request": string, "method": string}}

Set calculationExample only when your answer explains a calculable engineering method. Its request must state the example problem, and method must preserve the engineering method, important givens, and limitations needed to create a reviewable calculation example. Do not infer an example for greetings, general information, or non-calculable answers.`;
  const diagnosticInstruction = existingDoc && verificationDiagnostics(existingDoc)
    ? `\n\nWhen VERIFICATION DIAGNOSTICS are supplied, a displayed dash (—) is intentionally unverified, not a numeric result. Identify the exact failed step, input, or unit from those diagnostics. Explain the concrete supported correction and tell the user to recalculate; never invent a replacement numeric value.`
    : "";
  allMessages[0] = { role: "system", content: answerSystem + diagnosticInstruction };
  const qaParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = reasoning
    ? { model, messages: allMessages, response_format: { type: "json_object" } }
    : { model, temperature: 0.5, max_tokens: 1200, messages: allMessages, response_format: { type: "json_object" } };
  const completion = await openai.chat.completions.create(qaParams, { signal });
  const content = completion.choices[0]?.message?.content?.trim();
  try {
    const parsed = answerShape.parse(extractJson(content || ""));
    return {
      answer: parsed.answer,
      calculationExample: parsed.calculationExample ?? undefined,
    };
  } catch {
    if ((content || "").trimStart().startsWith("{")) {
      console.warn("[genius] Q&A model returned an invalid structured reply");
      return { answer: "I couldn't safely format that answer. Please try again." };
    }
    // Preserve ordinary answers if an older model returns prose rather than the
    // action contract; only the optional example action is unavailable.
    return { answer: content || "I couldn't generate an answer. Please try again." };
  }
}

export interface GenerateOptions {
  webSearch?: boolean;
  expertMode?: boolean;
  phdMode?: boolean;
  /** Request-scoped references already found while intent routing was in flight. */
  webReferences?: WebReference[];
}

function applyRequestedDisplayPrecision(
  doc: GeniusCalculationDoc,
  request: string,
  currentDecimals?: number,
): GeniusCalculationDoc {
  const requested = requestedGeniusDecimals(request, currentDecimals);
  return recomputeDoc({
    ...doc,
    displayDecimals: requested ?? currentDecimals,
  });
}

export async function generateCalculation(
  prompt: string,
  opts: GenerateOptions = {},
  signal?: AbortSignal,
  chatHistory?: ChatHistoryItem[],
): Promise<CallResult> {
  let userContent = prompt;
  let sourceLookupMs = 0;
  if (opts.webSearch) {
    const sourceStartedAt = Date.now();
    // Start lookup before preparing history so independent prompt work overlaps it.
    const sourcePromise = opts.webReferences !== undefined
      ? Promise.resolve(opts.webReferences)
      : searchEngineeringReferences(prompt, signal);
    const history = trimHistory(chatHistory, 6, 600);
    const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const raw = await sourcePromise;
    sourceLookupMs = opts.webReferences !== undefined ? 0 : Date.now() - sourceStartedAt;
    if (raw.length > 0) {
      const classifiedRefs = classifyAndSortWebRefs(raw);
      userContent += webRefsBlock(classifiedRefs);
    }
    const result = await callModel(
      [
        { role: "system", content: SYSTEM_PROMPT },
        ...historyMessages,
        { role: "user", content: userContent },
      ],
      opts.expertMode ?? false,
      opts.phdMode ?? false,
      signal,
    );
    const sanitized = sanitizeReferenceUrls(result.doc, true);
    const final = applyRequestedDisplayPrecision(
      applyConfidencePenalty(sanitized, true),
      prompt,
    );
    return { ...result, doc: final, sourceLookupMs };
  }
  // Prepend recent conversation context so the model understands references
  // like "now make it metric" or "use the same beam from before".
  const history = trimHistory(chatHistory, 6, 600);
  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const result = await callModel(
    [
      { role: "system", content: SYSTEM_PROMPT },
      ...historyMessages,
      { role: "user", content: userContent },
    ],
    opts.expertMode ?? false,
    opts.phdMode ?? false,
    signal,
  );
  const sanitized = sanitizeReferenceUrls(result.doc, false);
  const final = applyRequestedDisplayPrecision(
    applyConfidencePenalty(sanitized, false),
    prompt,
  );
  return { ...result, doc: final, sourceLookupMs };
}

export async function followUpCalculation(
  message: string,
  current: GeniusCalculationDoc,
  opts: GenerateOptions = {},
  signal?: AbortSignal,
  chatHistory?: ChatHistoryItem[],
): Promise<CallResult> {
  let extra = "";
  let sourceLookupMs = 0;
  if (opts.webSearch) {
    const sourceStartedAt = Date.now();
    const sourcePromise = opts.webReferences !== undefined
      ? Promise.resolve(opts.webReferences)
      : searchEngineeringReferences(`${current.projectTitle}: ${message}`.slice(0, 500), signal);
    const raw = await sourcePromise;
    sourceLookupMs = opts.webReferences !== undefined ? 0 : Date.now() - sourceStartedAt;
    if (raw.length > 0) {
      const classifiedRefs = classifyAndSortWebRefs(raw);
      extra = webRefsBlock(classifiedRefs);
    }
  }
  // Include recent conversation so the model can resolve references like
  // "use the value from before" or "keep my earlier assumption".
  const history = trimHistory(chatHistory, 6, 600);
  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const result = await callModel(
    [
      { role: "system", content: SYSTEM_PROMPT },
      ...historyMessages,
      {
        role: "user",
        content:
          "Here is the current calculation as JSON:\n" +
          JSON.stringify(current) +
          "\n\nApply the following change and return the COMPLETE updated calculation JSON (same schema, keep unchanged parts intact, preserve ids where possible):\n" +
          message +
          extra,
      },
    ],
    opts.expertMode ?? false,
    opts.phdMode ?? false,
    signal,
  );
  const sanitized = sanitizeReferenceUrls(result.doc, opts.webSearch ?? false);
  const final = applyRequestedDisplayPrecision(
    applyConfidencePenalty(sanitized, opts.webSearch ?? false),
    message,
    current.displayDecimals,
  );
  return { ...result, doc: final, sourceLookupMs };
}

// ---------------------------------------------------------------------------
// Document understanding → reviewable "calculation task" proposal.
// Uploaded images/PDFs never go straight to a calculation: the assistant first
// proposes a task (understanding, problem, inputs, assumptions, approach) that
// the user reviews, edits conversationally, and approves.
// ---------------------------------------------------------------------------

const PROPOSAL_SHAPE = `Return ONLY a JSON object with this exact shape:
{
  "title": string,                     // short name for the calculation
  "understanding": string,             // 1-3 sentences: what you understood from the document
  "problem": string,                   // the engineering problem to solve, precisely stated
  "inputs": [{ "label": string, "value": string, "unit": string }],   // key numeric inputs found or needed (value may be "" if unknown)
  "assumptions": [string],             // assumptions you intend to make
  "approach": string,                  // 2-4 sentences: the calculation method/standards you intend to apply
  "reply": string                      // 1-2 sentences MAX: confirm what you understood (or what changed) and state the next action (Build or clarify). No filler.
}`;

const PROPOSAL_MATH_RULES = `When an approach needs a mathematical relation, use compact KaTeX inline notation such as \\(L_{10} = \\left(\\frac{C}{P}\\right)^p\\). Keep formulas symbolic: use short conventional letters with braced subscripts/superscripts, \\frac{C}{P} for divisions, and no explanatory English inside a formula. Put the explanatory words in the surrounding sentence instead.`;

const PROPOSAL_SYSTEM = `You are Genius X1, an expert engineering calculation agent. The user uploaded a document. Read it carefully and propose a concise "calculation task" for their review — do NOT produce the calculation itself yet.

${PROPOSAL_SHAPE}

Rules:
- Extract concrete numbers with units from the document into "inputs" whenever present.
- If the document is ambiguous, state your interpretation in "understanding" and add clarifying assumptions.
- ${PROPOSAL_MATH_RULES}
- Keep everything concise and reviewable. Output MUST be valid JSON, no markdown.`;

export interface ProposalSource {
  kind: "image" | "pdf";
  name: string;
  /** data: URL for a single image */
  imageDataUrl?: string;
  /** data: URLs for multiple pages (scanned PDFs rendered to images) */
  imageDataUrls?: string[];
  /** extracted text for text-based PDFs */
  pdfText?: string;
  /**
   * Base64 data-URL of the raw PDF bytes — used for scanned/image-only PDFs
   * that have no extractable text. Passed directly to gpt-4o as a file part.
   * Format: "data:application/pdf;base64,<b64>"
   */
  pdfDataUrl?: string;
}

export interface ProposalResult {
  proposal: GeniusTaskProposal;
  model: string;
  /** Conversational assistant reply explaining the proposal (AI-generated). */
  reply?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

/** Contextual fallback reply when the model omitted "reply". */
export function proposalFallbackReply(
  proposal: GeniusTaskProposal,
  kind: "upload" | "refine",
): string {
  if (kind === "refine") {
    return "Updated. Review the proposal below and either refine further or hit Build.";
  }
  return `I've read "${proposal.title || "the document"}" and drafted a calculation task. Review it below, ask for changes, or hit Build to proceed.`;
}

async function callProposalModel(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  expertMode = false,
  phdMode = false,
  standardModel?: string,
  signal?: AbortSignal,
): Promise<ProposalResult> {
  if (!qualityModesAreExclusive(expertMode, phdMode)) {
    throw new Error("Expert and PhD modes cannot be enabled together");
  }
  // Text-only Standard planning remains on the fast JSON-capable model. File
  // understanding uses the configured Standard calculation model for stronger
  // technical interpretation before the calculation is built.
  // Proposal review benefits from Sol's technical interpretation without
  // spending Astra's deep-calculation capacity before the user approves Build.
  const model = phdMode ? EXPERT_MODEL : expertMode ? EXPERT_MODEL : (standardModel ?? "gpt-4o");
  const reasoning = isReasoningModel(model);
  const t0 = Date.now();
  const proposalParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = reasoning
    ? { model, messages, response_format: { type: "text" } }
    : { model, messages, temperature: 0.2, response_format: { type: "json_object" } };
  if (reasoning && (expertMode || phdMode)) {
    (proposalParams as any).reasoning_effort = "high";
  }
  const completion = await (phdMode
    ? withGeniusDeadline(
      "attachment planning",
      6 * 60 * 1000,
      (providerSignal) => openai.chat.completions.create(proposalParams, { signal: providerSignal }),
      signal,
    )
    : openai.chat.completions.create(proposalParams, { signal }));
  const durationMs = Date.now() - t0;
  const content = completion.choices[0]?.message?.content || "";
  const parsed = geniusTaskProposalSchema
    .extend({ reply: z.string().max(4000).optional() })
    .parse(extractProposalJson(content));
  const { reply, ...proposal } = parsed;
  return {
    proposal,
    model,
    reply: reply?.trim() || undefined,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
    durationMs,
  };
}

/** Generate a reviewable calculation task proposal from plain text (no file). */
export async function proposeTaskFromText(
  text: string,
  expertMode = false,
  phdMode = false,
  signal?: AbortSignal,
): Promise<ProposalResult> {
  const userMessage: OpenAI.Chat.ChatCompletionMessageParam = {
    role: "user",
    content: `The user described this engineering problem:\n\n"${text.slice(0, 8000)}"\n\nPropose a calculation task for their review. Do NOT produce the calculation yet.`,
  };
  return callProposalModel([{ role: "system", content: PROPOSAL_SYSTEM }, userMessage], expertMode, phdMode, undefined, signal);
}

/** Turn explicit Q&A metadata into the same reviewable proposal used elsewhere. */
export async function proposeTaskFromExplanation(
  example: { request: string; method: string },
  expertMode = false,
  phdMode = false,
): Promise<ProposalResult> {
  return callProposalModel(
    [
      {
        role: "system",
        content: `You are Genius X1, an expert engineering calculation agent. An answer has explicitly identified a calculable method. Create a concise, reviewable calculation example—not the calculation itself.

${PROPOSAL_SHAPE}

Use the stated example problem and method as authoritative context. Put every value you introduce because it was not supplied by the user in "assumptions", so the engineer can review or edit it before approval. ${PROPOSAL_MATH_RULES} Output valid JSON only.`,
      },
      {
        role: "user",
        content: `EXAMPLE PROBLEM:\n${example.request}\n\nEXPLANATION METHOD:\n${example.method}\n\nCreate the reviewable calculation task.`,
      },
    ],
    expertMode,
    phdMode,
  );
}

export async function proposeTaskFromDocument(
  source: ProposalSource,
  userNote?: string,
  expertMode = false,
  phdMode = false,
  signal?: AbortSignal,
): Promise<ProposalResult> {
  const note = userNote?.trim()
    ? `\n\nThe user added this note with the upload: "${userNote.trim()}"`
    : "";
  let userMessage: OpenAI.Chat.ChatCompletionMessageParam;
  if (source.pdfDataUrl) {
    // Scanned / image-only PDF — pass the raw PDF bytes directly as a file part.
    // gpt-4o can read PDF content natively via the file content part type.
    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `I uploaded a scanned PDF ("${source.name}"). Read it and propose the calculation task.${note}`,
      },
      {
        type: "file",
        file: { filename: source.name, file_data: source.pdfDataUrl },
      } as OpenAI.Chat.ChatCompletionContentPart,
    ];
    userMessage = { role: "user", content };
  } else if (source.imageDataUrls && source.imageDataUrls.length > 0) {
    // Fallback: scanned PDF rendered to page images (kept for future use).
    const pageCount = source.imageDataUrls.length;
    const pageWord = pageCount === 1 ? "page" : `first ${pageCount} pages`;
    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: "text",
        text: `I uploaded a scanned PDF ("${source.name}"). Here are the ${pageWord} rendered as images. Read them and propose the calculation task.${note}`,
      },
      ...source.imageDataUrls.map(
        (url): OpenAI.Chat.ChatCompletionContentPart => ({
          type: "image_url",
          image_url: { url, detail: "high" },
        }),
      ),
    ];
    userMessage = { role: "user", content };
  } else if (source.kind === "image" && source.imageDataUrl) {
    userMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: `I uploaded this picture ("${source.name}"). Read it and propose the calculation task.${note}`,
        },
        { type: "image_url", image_url: { url: source.imageDataUrl, detail: "high" } },
      ],
    };
  } else {
    const text = (source.pdfText || "").slice(0, 24000);
    userMessage = {
      role: "user",
      content: `I uploaded a PDF document ("${source.name}"). Here is its extracted text:\n\n${text}\n\nRead it and propose the calculation task.${note}`,
    };
  }
  // Keep attachment interpretation aligned with the Standard calculation model
  // (gpt-5.4-2026-03-05 by default). Expert and PhD stay on their fixed modes.
  const standardAttachmentModel = expertMode || phdMode
    ? undefined
    : (await getGeniusSettings()).generationModel;
  return callProposalModel(
    [{ role: "system", content: PROPOSAL_SYSTEM }, userMessage],
    expertMode,
    phdMode,
    standardAttachmentModel,
    signal,
  );
}

export async function refineTaskProposal(
  proposal: GeniusTaskProposal,
  message: string,
  expertMode = false,
  phdMode = false,
  signal?: AbortSignal,
): Promise<ProposalResult> {
  return callProposalModel(
    [
      {
        role: "system",
        content: `You are Genius X1. The user is reviewing a proposed calculation task before it is built. Apply their requested change and return the COMPLETE updated proposal.\n\n${PROPOSAL_SHAPE}\n\n${PROPOSAL_MATH_RULES}\n\nKeep unchanged parts intact. Output MUST be valid JSON, no markdown.`,
      },
      {
        role: "user",
        content:
          "Current proposed calculation task as JSON:\n" +
          JSON.stringify(proposal) +
          "\n\nRequested change:\n" +
          message,
      },
    ],
    expertMode,
    phdMode,
    undefined,
    signal,
  );
}

/** Build the full deterministic calculation from an approved task proposal. */
export async function generateFromProposal(
  proposal: GeniusTaskProposal,
  opts: GenerateOptions = {},
  signal?: AbortSignal,
): Promise<CallResult> {
  const inputs = proposal.inputs
    .map((i) => `- ${i.label}: ${i.value || "(to assume)"} ${i.unit}`.trim())
    .join("\n");
  const assumptions = proposal.assumptions.map((a) => `- ${a}`).join("\n");
  const prompt =
    `Build the full calculation for this APPROVED calculation task. Honor the agreed inputs, assumptions and approach exactly.\n\n` +
    `Title: ${proposal.title}\n` +
    `Problem: ${proposal.problem}\n` +
    (proposal.understanding ? `Context: ${proposal.understanding}\n` : "") +
    (inputs ? `Agreed inputs:\n${inputs}\n` : "") +
    (assumptions ? `Agreed assumptions:\n${assumptions}\n` : "") +
    (proposal.approach ? `Agreed approach: ${proposal.approach}\n` : "");
  return generateCalculation(prompt, opts, signal);
}
