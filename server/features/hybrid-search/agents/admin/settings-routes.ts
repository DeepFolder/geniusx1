import { Router, Request, Response } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { readdir, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
// Note: readdir, readFile, unlink, join are used by instruction-history endpoints below
import { getAgentSettings, saveAgentSettings, resetAgentSettings, getInstructionHistory, deleteInstructionHistoryEntry } from './settings-storage';
import { AVAILABLE_MODELS, REASONING_EFFORT_OPTIONS, REASONING_SUMMARY_OPTIONS, SEARCH_CONTEXT_OPTIONS, DEFAULT_SETTINGS } from './types';
import { fetchOpenAIPricing } from './pricing-fetcher';
import { reloadPriceCache } from '../../connections/usage-tracking';
import { ASTRA_MODEL, MISSING_PRICE_SOURCE, REQUIRED_MODEL_PRICE_SEEDS } from '../../connections/model-pricing-catalogue';
import { db } from '../../../../db';
import { modelPricing } from '@shared/schema';
import { eq, ne } from 'drizzle-orm';

const router = Router();

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const AVAILABLE_MODEL_LABELS: Record<string, string> = Object.fromEntries(
  AVAILABLE_MODELS.map((m) => [m.value, m.label])
);

const EXCLUDE_MODEL_PATTERNS = [
  /embedding/i,
  /whisper/i,
  /^tts/i,
  /\bdall-?e\b/i,
  /\bimage\b/i,
  /moderation/i,
  /audio/i,
  /realtime/i,
  /transcribe/i,
  /^omni-moderation/i,
  /^babbage/i,
  /^davinci/i,
];

const INCLUDE_MODEL_PATTERNS = [
  /^gpt-/i,
  /^chatgpt-/i,
  /^o[134](-|$)/i,
  /^codex-/i,
  /^computer-use/i,
];

function isChatCapableModel(id: string): boolean {
  if (EXCLUDE_MODEL_PATTERNS.some((re) => re.test(id))) return false;
  return INCLUDE_MODEL_PATTERNS.some((re) => re.test(id));
}

function modelSortKey(id: string): string {
  return id.toLowerCase();
}

function compareModels(a: string, b: string): number {
  const ka = modelSortKey(a);
  const kb = modelSortKey(b);
  if (ka < kb) return 1;
  if (ka > kb) return -1;
  return 0;
}

let cachedModels: { value: string; label: string }[] | null = null;
let cachedAt = 0;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchOpenAIModels(): Promise<{ value: string; label: string }[]> {
  const now = Date.now();
  if (cachedModels && now - cachedAt < MODEL_CACHE_TTL_MS) {
    return cachedModels;
  }
  if (!openaiClient) {
    console.warn('[admin/options] OPENAI_API_KEY not set — using hardcoded model list');
    return [...AVAILABLE_MODELS];
  }
  try {
    const response = await openaiClient.models.list();
    const ids = response.data
      .map((m) => m.id)
      .filter(isChatCapableModel)
      .sort(compareModels);
    if (ids.length === 0) {
      console.warn('[admin/options] OpenAI returned 0 chat-capable models — using hardcoded fallback');
      return [...AVAILABLE_MODELS];
    }
    const models = ids.map((id) => ({
      value: id,
      label: AVAILABLE_MODEL_LABELS[id] ?? id,
    }));
    cachedModels = models;
    cachedAt = now;
    console.log(`[admin/options] Fetched ${models.length} chat-capable models from OpenAI`);
    return models;
  } catch (err: any) {
    console.warn('[admin/options] Failed to fetch models from OpenAI — using hardcoded fallback:', err?.message);
    return [...AVAILABLE_MODELS];
  }
}

const agentSettingsSchema = z.object({
  name: z.string().min(1).max(100),
  instructions: z.string().min(1).max(1000000),
  model: z.string().min(1),
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']),
  reasoningSummary: z.enum(['auto', 'concise', 'detailed', 'none']),
  storeEnabled: z.boolean(),
  webSearchEnabled: z.boolean(),
  searchContextSize: z.enum(['low', 'medium', 'high']),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(256).max(16384),
  outputSchema: z.string().min(1).max(50000),
  guardrailsEnabled: z.boolean(),
  guardrailsConfig: z.string().min(1).max(100000),
  topicRestrictionEnabled: z.boolean().optional(),
  topicRestrictionMessage: z.string().max(5000).optional(),
  allowedTopics: z.array(z.string()).optional(),
  systemInstructionPct: z.number().int().min(1).max(99).optional(),
  fluidMemoryPct: z.number().int().min(0).max(99).optional(),
  conversationPct: z.number().int().min(1).max(99).optional(),
  compactionThresholdPct: z.number().int().min(0).max(100).optional(),
  compactionModel: z.string().min(1).max(100).optional(),
}).refine(
  (data) => {
    const sys = data.systemInstructionPct;
    const fluid = data.fluidMemoryPct;
    const conv = data.conversationPct;
    if (sys === undefined && fluid === undefined && conv === undefined) return true;
    const s = sys ?? 20;
    const f = fluid ?? 10;
    const c = conv ?? 70;
    return s + f + c === 100;
  },
  {
    message: 'systemInstructionPct + fluidMemoryPct + conversationPct must equal 100',
    path: ['conversationPct'],
  }
);

function isMissingTableError(err: any): boolean {
  return err?.code === '42P01' || /relation .* does not exist/i.test(err?.message || '');
}

router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await getAgentSettings();
    res.json(settings);
  } catch (error: any) {
    if (isMissingTableError(error)) {
      console.warn('[admin/settings] tables missing — returning defaults so UI can render an empty state');
      return res.json(DEFAULT_SETTINGS);
    }
    console.error('Error fetching agent settings:', error);
    res.status(500).json({ error: 'Failed to fetch agent settings', detail: error?.message });
  }
});

router.put('/settings', async (req: Request, res: Response) => {
  try {
    const validation = agentSettingsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid settings', 
        details: validation.error.errors 
      });
    }
    const updated = await saveAgentSettings(validation.data);
    res.json(updated);
  } catch (error) {
    console.error('Error saving agent settings:', error);
    res.status(500).json({ error: 'Failed to save agent settings' });
  }
});

router.post('/settings/reset', async (req: Request, res: Response) => {
  try {
    const defaults = await resetAgentSettings();
    res.json(defaults);
  } catch (error) {
    console.error('Error resetting agent settings:', error);
    res.status(500).json({ error: 'Failed to reset agent settings' });
  }
});

router.get('/instruction-history', async (req: Request, res: Response) => {
  try {
    const history = await getInstructionHistory();
    res.json(history);
  } catch (error: any) {
    if (isMissingTableError(error)) {
      console.warn('[admin/instruction-history] table missing — returning empty list');
      return res.json([]);
    }
    console.error('Error fetching instruction history:', error);
    res.status(500).json({ error: 'Failed to fetch instruction history', detail: error?.message });
  }
});

router.delete('/instruction-history/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    await deleteInstructionHistoryEntry(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting instruction history:', error);
    res.status(500).json({ error: 'Failed to delete instruction history' });
  }
});

router.get('/options', async (req: Request, res: Response) => {
  const models = await fetchOpenAIModels();
  res.json({
    models,
    reasoningEffort: REASONING_EFFORT_OPTIONS,
    reasoningSummary: REASONING_SUMMARY_OPTIONS,
    searchContextSize: SEARCH_CONTEXT_OPTIONS,
    defaults: DEFAULT_SETTINGS,
  });
});

// ── Model Pricing routes ──────────────────────────────────────────────────────

router.get('/pricing', async (_req: Request, res: Response) => {
  try {
    for (const seed of REQUIRED_MODEL_PRICE_SEEDS) {
      await db.insert(modelPricing).values({
        ...seed,
        fetchedAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    const rows = await db.select().from(modelPricing);
    res.json(rows);
  } catch (err: any) {
    if (isMissingTableError(err)) return res.json([]);
    res.status(500).json({ error: 'Failed to fetch pricing', detail: err?.message });
  }
});

router.post('/pricing/refresh', async (_req: Request, res: Response) => {
  try {
    const { models, tools } = await fetchOpenAIPricing();
    const now = new Date();
    for (const seed of REQUIRED_MODEL_PRICE_SEEDS) {
      await db.insert(modelPricing).values({ ...seed, fetchedAt: now, updatedAt: now }).onConflictDoNothing();
    }

    // Upsert model token prices — skip rows the user has manually set
    for (const p of models) {
      await db.insert(modelPricing).values({
        model: p.model,
        inputPerMtok: String(p.in),
        outputPerMtok: String(p.out),
        source: 'auto',
        fetchedAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: modelPricing.model,
        set: { inputPerMtok: String(p.in), outputPerMtok: String(p.out), source: 'auto', fetchedAt: now, updatedAt: now },
        setWhere: ne(modelPricing.source, 'manual'),
      });
    }

    // Upsert web search tool prices — skip rows the user has manually set
    for (const t of tools) {
      await db.insert(modelPricing).values({
        model: t.key,
        inputPerMtok: String(t.costPerCall),
        outputPerMtok: '0',
        source: 'auto',
        fetchedAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: modelPricing.model,
        set: { inputPerMtok: String(t.costPerCall), outputPerMtok: '0', source: 'auto', fetchedAt: now, updatedAt: now },
        setWhere: ne(modelPricing.source, 'manual'),
      });
    }

    await reloadPriceCache();
    const allRows = await db.select().from(modelPricing);
    const astraRow = allRows.find((row) => row.model === ASTRA_MODEL);
    const astraNote = astraRow?.source === MISSING_PRICE_SOURCE
      ? ' Astra pricing was not available from the source; set input and output rates manually.'
      : '';
    const toolsNote = tools.length > 0
      ? ` + ${tools.length} tool price(s): ${tools.map((t) => `${t.label} = $${t.costPerCall}/call`).join(', ')}`
      : ' (web search tool prices not found on page — existing values kept)';
    res.json({ success: true, prices: allRows, fetched_at: now.toISOString(), tools_note: `${toolsNote}${astraNote}` });
  } catch (err: any) {
    console.warn('[admin/pricing/refresh] scrape failed:', err?.message);
    const allRows = await db.select().from(modelPricing).catch(() => []);
    res.status(200).json({
      success: false,
      error: err?.message || 'Failed to fetch OpenAI pricing page',
      prices: allRows,
    });
  }
});

const pricingBodySchema = z.object({
  input_per_mtok: z.number().min(0),
  output_per_mtok: z.number().min(0),
});

router.post('/pricing', async (req: Request, res: Response) => {
  const body = z.object({
    model: z.string().min(1),
    input_per_mtok: z.number().min(0),
    output_per_mtok: z.number().min(0),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Invalid body', details: body.error.errors });
  const now = new Date();
  try {
    await db.insert(modelPricing).values({
      model: body.data.model,
      inputPerMtok: String(body.data.input_per_mtok),
      outputPerMtok: String(body.data.output_per_mtok),
      source: 'manual',
      fetchedAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: modelPricing.model,
      set: {
        inputPerMtok: String(body.data.input_per_mtok),
        outputPerMtok: String(body.data.output_per_mtok),
        source: 'manual',
        updatedAt: now,
      },
    });
    await reloadPriceCache();
    const row = await db.select().from(modelPricing).where(eq(modelPricing.model, body.data.model));
    res.json(row[0] ?? { model: body.data.model });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to add model', detail: err?.message });
  }
});

router.put('/pricing/:model', async (req: Request, res: Response) => {
  const modelId = decodeURIComponent(req.params.model);
  const validation = pricingBodySchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ error: 'Invalid body', details: validation.error.errors });
  const now = new Date();
  try {
    await db.insert(modelPricing).values({
      model: modelId,
      inputPerMtok: String(validation.data.input_per_mtok),
      outputPerMtok: String(validation.data.output_per_mtok),
      source: 'manual',
      fetchedAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: modelPricing.model,
      set: {
        inputPerMtok: String(validation.data.input_per_mtok),
        outputPerMtok: String(validation.data.output_per_mtok),
        source: 'manual',
        updatedAt: now,
      },
    });
    await reloadPriceCache();
    const row = await db.select().from(modelPricing).where(eq(modelPricing.model, modelId));
    res.json(row[0] ?? { model: modelId });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update pricing', detail: err?.message });
  }
});

router.post('/pricing/:model/reset', async (req: Request, res: Response) => {
  const modelId = decodeURIComponent(req.params.model);
  try {
    await db.update(modelPricing)
      .set(
        modelId === ASTRA_MODEL
          ? {
              inputPerMtok: '0',
              outputPerMtok: '0',
              source: MISSING_PRICE_SOURCE,
              updatedAt: new Date(),
            }
          : { source: 'hardcoded', updatedAt: new Date() },
      )
      .where(eq(modelPricing.model, modelId));
    await reloadPriceCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset model pricing source', detail: err?.message });
  }
});

router.delete('/pricing/:model', async (req: Request, res: Response) => {
  const modelId = decodeURIComponent(req.params.model);
  try {
    await db.delete(modelPricing).where(eq(modelPricing.model, modelId));
    await reloadPriceCache();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete model pricing', detail: err?.message });
  }
});

export default router;
