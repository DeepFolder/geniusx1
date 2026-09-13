export const ASTRA_MODEL = 'gpt-6-astra';
export const MISSING_PRICE_SOURCE = 'missing';

export const REQUIRED_MODEL_PRICE_SEEDS = [
  {
    model: ASTRA_MODEL,
    inputPerMtok: '0',
    outputPerMtok: '0',
    source: MISSING_PRICE_SOURCE,
  },
] as const;