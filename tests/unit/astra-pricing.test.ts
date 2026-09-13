import { describe, expect, it } from 'vitest';
import { ASTRA_MODEL, MISSING_PRICE_SOURCE, REQUIRED_MODEL_PRICE_SEEDS } from '../../server/features/hybrid-search/connections/model-pricing-catalogue.js';
import { calculateTokenCost, getModelPrice, hasConfiguredModelPrice } from '../../server/features/hybrid-search/connections/usage-tracking.js';
import { parseOpenAIPricingHtml } from '../../server/features/hybrid-search/agents/admin/pricing-fetcher.js';

describe('Astra pricing', () => {
  it('registers Astra as an actionable missing-price entry instead of silently assigning a rate', () => {
    expect(REQUIRED_MODEL_PRICE_SEEDS).toContainEqual({
      model: ASTRA_MODEL,
      inputPerMtok: '0',
      outputPerMtok: '0',
      source: MISSING_PRICE_SOURCE,
    });
    expect(getModelPrice(ASTRA_MODEL)).toEqual({ in: 0, out: 0 });
    expect(hasConfiguredModelPrice(ASTRA_MODEL)).toBe(false);
  });

  it('calculates separate Astra input and output token costs from a configured rate', () => {
    expect(calculateTokenCost(
      { prompt_tokens: 2_000_000, completion_tokens: 500_000, total_tokens: 2_500_000 },
      { in: 3.5, out: 14 },
    )).toBe(14);
  });

  it('recognizes a valid Astra source rate during a pricing refresh', () => {
    const prices = parseOpenAIPricingHtml(`
      <table>
        <tr><td>gpt-6-astra</td><td>$3.50</td><td>$14.00</td></tr>
      </table>
    `);

    expect(prices.models).toContainEqual({ model: ASTRA_MODEL, in: 3.5, out: 14 });
  });

  it('keeps the refresh policy from overwriting a manually configured rate', async () => {
    const routeSource = await import('node:fs/promises')
      .then(({ readFile }) => readFile('server/features/hybrid-search/agents/admin/settings-routes.ts', 'utf8'));

    expect(routeSource).toContain("setWhere: ne(modelPricing.source, 'manual')");
    expect(routeSource).toContain('modelId === ASTRA_MODEL');
    expect(routeSource).toContain('source: MISSING_PRICE_SOURCE');
  });

  it('presents missing Astra prices as an administrator action in the pricing controls', async () => {
    const panelSource = await import('node:fs/promises')
      .then(({ readFile }) => readFile('client/src/features/hybrid-search/agent-admin.tsx', 'utf8'));

    expect(panelSource).toContain("'gpt-6-astra':                  'gpt-6-astra · PhD calculations'");
    expect(panelSource).toContain('Pricing needed:');
    expect(panelSource).toContain('Some usage is not included in cost totals.');
  });
});