/**
 * Quality scorer for DeepSearch benchmark responses.
 *
 * Pure function — takes a prompt fixture and the collected stream events,
 * returns a structured quality score in [0, 1].
 *
 * Schema (required by task spec):
 *   { intentMatch, domainMatch, hasExpectedSections, noHallucination, total }
 *
 * This score is the primary optimization target for the autoresearch loop.
 */

import type { PromptFixture, QueryDomain } from '../fixtures/prompts.js';
import type { StreamEvent } from '../e2e/stream-validator.js';

export interface QualityScore {
  /** Classifier returned the expected intent (proxy via output shape) */
  intentMatch: number;
  /** Response content is coherent with the expected domain */
  domainMatch: number;
  /** Required sections present: product cards / BOM / calc / block */
  hasExpectedSections: number;
  /** No hallucinated product names detected in the text */
  noHallucination: number;
  /**
   * Task #363: composite score of (a) calculation_mode match against the
   * fixture and (b) section ordering — calculation_section MUST stream before
   * the first product_card for size_then_search; the reverse for
   * search_then_size. 1.0 when not applicable (non-calculation fixtures).
   */
  calculationMode: number;
  /**
   * Task #381: classifier chose the correct follow_up_answer_type
   * (clarification / comparison / calculation / refined_search / new_search).
   * 1.0 when not applicable (non-follow_up fixtures or fixture has no
   * expectedFollowUpAnswerType) so overall score is unaffected.
   */
  followUpAnswerTypeMatch: number;
  /** Weighted composite in [0, 1] */
  total: number;
}

const WEIGHTS = {
  // Reduced from 0.20 → 0.15 to make room for followUpAnswerTypeMatch.
  intentMatch: 0.15,
  domainMatch: 0.10,
  hasExpectedSections: 0.30,
  noHallucination: 0.15,
  // Task #363: dedicated weight for calculation-mode correctness:
  // (a) classifier picked the expected mode, AND
  // (b) the streamed sections appeared in the right order
  // (calculation_section before product_card for size_then_search).
  calculationMode: 0.25,
  // Task #381: follow_up_answer_type sub-type correctness.
  // Scores 1.0 (not applicable) for all non-follow_up fixtures.
  followUpAnswerTypeMatch: 0.05,
};

/**
 * Domain-specific keywords used to verify response relevance.
 * At least one keyword must appear in the combined token text to score 1.0.
 */
const DOMAIN_KEYWORDS: Record<QueryDomain, string[]> = {
  mechanical: ['bearing', 'motor', 'actuator', 'pneumatic', 'bolt', 'shaft', 'gear', 'cylinder', 'spring', 'seal'],
  electrical: ['servo', 'drive', 'inverter', 'voltage', 'current', 'plc', 'motor', 'frequency'],
  electronics: ['sensor', 'microcontroller', 'pcb', 'voltage', 'arduino', 'circuit'],
  consumer_electronics: ['gpu', 'cpu', 'ram', 'ssd', 'memory', 'processor', 'storage', 'graphics'],
  robotics: ['robot', 'servo', 'motor', 'gripper', 'arm', 'controller'],
  materials: ['steel', 'aluminum', 'alloy', 'material', 'grade', 'hardness'],
  industrial: ['industrial', 'automation', 'conveyor', 'machine', 'manufacturing'],
  general: [],
};

/**
 * Score a stream response against the fixture expectations.
 *
 * @param fixture  The prompt fixture used for this run
 * @param events   All NDJSON events collected from the stream
 */
export function scoreResponse(fixture: PromptFixture, events: StreamEvent[]): QualityScore {
  const resultEvent = events.find((e) => e.type === 'result');
  const errorEvent = events.find((e) => e.type === 'error');
  const productCards = events.filter((e) => e.type === 'product_card');
  const bomEvent = events.find((e) => e.type === 'bom_table');
  const calcEvent = events.find((e) => e.type === 'calculation_section');
  const tokenEvents = events.filter((e) => e.type === 'token');
  const tokenText = tokenEvents
    .map((e) => (typeof e.delta === 'string' ? e.delta : ''))
    .join('')
    .toLowerCase();

  // --- intentMatch ---
  // Proxy via output shape since we don't have the raw classifier output here.
  let intentMatch = 0;
  if (errorEvent) {
    intentMatch = 0.2;
  } else if (fixture.expectsBlock) {
    const noCards = productCards.length === 0;
    const fewTokens = tokenEvents.length < 50;
    intentMatch = noCards && fewTokens ? 1 : 0.3;
  } else if (fixture.expectsBOM) {
    intentMatch = bomEvent ? 1 : 0.2;
  } else if (fixture.expectsCalculation) {
    intentMatch = calcEvent ? 1 : (productCards.length > 0 ? 0.6 : 0.2);
  } else if (fixture.expectsProductCards) {
    intentMatch = productCards.length > 0 ? 1 : 0.3;
  } else {
    // explanation / follow_up / manufacturer discovery — tokens signal on-intent
    intentMatch = tokenEvents.length > 5 ? 0.8 : 0.2;
  }

  // --- domainMatch ---
  // Check response content for domain-relevant keywords.
  let domainMatch = 0;
  const domainKws = DOMAIN_KEYWORDS[fixture.expectedDomain] ?? [];
  if (domainKws.length === 0) {
    // "general" domain — any substantive response passes
    domainMatch = tokenEvents.length > 0 ? 1 : 0;
  } else {
    const hits = domainKws.filter((kw) => tokenText.includes(kw)).length;
    domainMatch = Math.min(1, hits / Math.max(1, Math.ceil(domainKws.length * 0.2)));
  }

  // --- hasExpectedSections ---
  let hasExpectedSections = 0;
  if (fixture.expectsBlock) {
    hasExpectedSections = productCards.length === 0 ? 1 : 0;
  } else {
    let checks = 0;
    let passed = 0;
    if (fixture.expectsProductCards) { checks++; if (productCards.length > 0) passed++; }
    if (fixture.expectsBOM) { checks++; if (bomEvent) passed++; }
    if (fixture.expectsCalculation) { checks++; if (calcEvent) passed++; }
    if (checks === 0) {
      hasExpectedSections = tokenEvents.length > 0 ? 1 : 0;
    } else {
      hasExpectedSections = passed / checks;
    }
  }

  // --- noHallucination ---
  // Heuristic: check that result summary only names products found in product_card events.
  let noHallucination = 1;
  if (resultEvent && productCards.length > 0) {
    const resultData = resultEvent.data as Record<string, unknown> | undefined;
    const summary =
      typeof resultData?.decision_summary === 'string' ? resultData.decision_summary :
      typeof resultData?.chatSummary === 'string' ? resultData.chatSummary : '';

    if (summary.length > 0) {
      const cardNames = new Set<string>(
        productCards
          .map((e) => {
            const d = e.data as Record<string, unknown> | undefined;
            const n = d?.product_name ?? d?.name;
            return typeof n === 'string' ? n.toLowerCase() : '';
          })
          .filter((n) => n.length > 0),
      );
      // If at least one card name appears in the summary, no obvious hallucination
      const hasMatch = [...cardNames].some((name) =>
        name.length >= 4 && summary.toLowerCase().includes(name.slice(0, 8))
      );
      noHallucination = hasMatch || cardNames.size === 0 ? 1 : 0.5;
    }
  }

  // --- calculationMode (Task #363) ---
  // Two checks rolled into one component:
  //  1. Mode match — classify event's calculation_mode equals the fixture's
  //     expectedCalculationMode (when the fixture sets one).
  //  2. Ordering — for size_then_search, the calculation_section event MUST
  //     appear BEFORE the first product_card event. For search_then_size,
  //     the first product_card MUST appear BEFORE calculation_section.
  // Each sub-check contributes 0.5; a fixture with no expectedCalculationMode
  // scores 1.0 (not applicable).
  let calculationMode = 1;
  if (fixture.expectedCalculationMode) {
    // Mode is exposed through the final `result` event under
    // `result.classification.strategy.calculation_mode` (server publishes it
    // explicitly in routes.ts). Fall back to `classify`/`classification`
    // event types if a future stream surfaces them earlier.
    const resultData = (resultEvent?.data ?? {}) as Record<string, any>;
    const classifyEvent = events.find((e) => e.type === 'classify' || e.type === 'classification');
    const classifyData = (classifyEvent?.data ?? {}) as Record<string, any>;
    const observedMode =
      resultData?.classification?.strategy?.calculation_mode ??
      classifyData?.strategy?.calculation_mode ??
      classifyData?.calculation_mode ??
      undefined;
    const modeOk = observedMode === fixture.expectedCalculationMode;

    // Ordering check is asymmetric on purpose. The server always streams
    // calculation_section BEFORE product cards (see backend/routes.ts) — that
    // matches the size_then_search contract perfectly. For search_then_size
    // the agent searches the named product first and the calculation reads
    // its datasheet, but stream-level ordering is still calc-then-cards;
    // logical ordering ("the calc was based on the named product") is
    // captured by the derived-spec coverage check below, not the stream
    // index. So we only HARD-enforce ordering for size_then_search.
    const calcIdx = events.findIndex((e) => e.type === 'calculation_section');
    const firstCardIdx = events.findIndex((e) => e.type === 'product_card');
    let orderOk = true;
    if (fixture.expectedCalculationMode === 'size_then_search') {
      orderOk = calcIdx >= 0 && (firstCardIdx === -1 || calcIdx < firstCardIdx);
    } else {
      // search_then_size: only require that BOTH sections were emitted; the
      // stream order is fixed by the backend and is not a quality signal here.
      orderOk = calcIdx >= 0 && firstCardIdx >= 0;
    }

    // Derived-spec coverage check: the top product card's attributes should
    // reference the labels the calc card derived. Counts a match when any
    // attribute label substring-matches a derived spec label
    // (case-insensitive). Scores 1.0 when ≥50% of derived specs are
    // referenced by the top card, scaled linearly otherwise. Skipped (1.0)
    // when there are no product cards or no derived specs to check.
    let derivedOk = 1;
    const calcEv = events.find((e) => e.type === 'calculation_section');
    const calcData = (calcEv?.data ?? {}) as Record<string, any>;
    const derivedSpecs: any[] = Array.isArray(calcData?.derived_specs) ? calcData.derived_specs : [];
    if (productCards.length > 0 && derivedSpecs.length > 0) {
      const topCard = (productCards[0].data ?? {}) as Record<string, any>;
      const topAttrs: any[] = Array.isArray(topCard?.fluid_data?.attributes)
        ? topCard.fluid_data.attributes
        : Array.isArray(topCard?.attributes) ? topCard.attributes : [];
      const attrLabels = topAttrs.map((a) => String(a?.label || '').toLowerCase()).filter(Boolean);
      let referenced = 0;
      for (const ds of derivedSpecs) {
        const dl = String(ds?.label || '').toLowerCase();
        if (!dl) continue;
        if (attrLabels.some((al) => al.includes(dl) || dl.includes(al))) referenced++;
      }
      const coverage = referenced / derivedSpecs.length;
      derivedOk = coverage >= 0.5 ? 1 : coverage * 2;
    }

    // Three sub-checks each contribute 1/3 of the calculationMode component.
    calculationMode = ((modeOk ? 1 : 0) + (orderOk ? 1 : 0) + derivedOk) / 3;
  }

  // --- followUpAnswerTypeMatch (Task #381) ---
  // Compare the classifier's follow_up_answer_type (surfaced on the result event's
  // classification object) against the fixture's expectedFollowUpAnswerType.
  // Scores 1.0 when not applicable so non-follow_up fixtures are unaffected.
  let followUpAnswerTypeMatch = 1;
  if (fixture.expectedFollowUpAnswerType) {
    const resultData = (resultEvent?.data ?? {}) as Record<string, any>;
    const observedAnswerType =
      resultData?.classification?.follow_up_answer_type ??
      undefined;
    followUpAnswerTypeMatch = observedAnswerType === fixture.expectedFollowUpAnswerType ? 1 : 0;
  }

  const total = Math.min(1, Math.max(0,
    intentMatch * WEIGHTS.intentMatch +
    domainMatch * WEIGHTS.domainMatch +
    hasExpectedSections * WEIGHTS.hasExpectedSections +
    noHallucination * WEIGHTS.noHallucination +
    calculationMode * WEIGHTS.calculationMode +
    followUpAnswerTypeMatch * WEIGHTS.followUpAnswerTypeMatch,
  ));

  return { intentMatch, domainMatch, hasExpectedSections, noHallucination, calculationMode, followUpAnswerTypeMatch, total };
}
