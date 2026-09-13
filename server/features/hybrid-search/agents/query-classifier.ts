/**
 * ============================================================================
 * QUERY CLASSIFIER
 * ============================================================================
 *
 * A lightweight pre-processing module that analyzes user queries BEFORE
 * they reach the main agent search. It determines what the user actually
 * wants and provides structured metadata so the search agent can respond
 * more intelligently.
 *
 * WHY THIS EXISTS:
 * Users ask for everything — industrial gearboxes, gaming PCs, comparisons,
 * explanations, or just general chat. Without classification, the agent
 * treats every query the same way: search the web and return product cards.
 * This classifier tells the agent HOW to respond, not just WHAT to search.
 *
 * HOW IT WORKS:
 * 1. Takes the user's raw query + conversation history
 * 2. Sends it to a fast, cheap model (gpt-4o-mini) for classification
 * 3. Returns structured metadata: intent, domain, constraints, strategy
 * 4. The main search engine uses this metadata to adapt its behavior
 *
 * PERFORMANCE:
 * - Uses gpt-4o-mini (fast, ~200ms, very low cost)
 * - Runs in parallel with database search (no added latency)
 * - Results are simple JSON, no heavy processing
 *
 * FOLDER LOCATION: server/features/hybrid-search/agents/query-classifier.ts
 * ============================================================================
 */

import OpenAI from 'openai';
import { getExpertPersona } from './expert-personas';

// ============================================================================
// TYPES — What the classifier returns
// ============================================================================

/**
 * The user's primary goal with this query.
 *
 * - product_search:   "Find me gearboxes for a robot arm"
 * - comparison:       "Compare the Pololu motor with the ServoCity one"
 * - explanation:      "What's the difference between planetary and spur gears?"
 * - recommendation:   "Which one should I buy?" / "Build me a complete PC"
 * - follow_up:        "Show me more like the first one" / "What about the price?"
 * - general_chat:     "Hello" / "Thanks" / "What can you do?"
 * - off_topic:        "How to bake a cake" / "Where to find medication" / non-product questions
 */
export type QueryIntent =
  | 'product_search'
  | 'build'
  | 'calculation_search'
  | 'comparison'
  | 'explanation'
  | 'recommendation'
  | 'follow_up'
  | 'general_chat'
  | 'off_topic';

/**
 * Sub-type for follow_up intent — what kind of answer the user needs.
 * - clarification:   a short answer or direct fact from previously shown products/datasheets
 * - comparison:      a side-by-side comparison of previously shown products
 * - calculation:     a calculation using specs from previously shown products
 * - refined_search:  a new search that narrows/adjusts the PREVIOUS result set
 * - new_search:      an entirely new product search unrelated to previous results
 */
export type FollowUpAnswerType =
  | 'clarification'
  | 'comparison'
  | 'calculation'
  | 'refined_search'
  | 'new_search';

/**
 * The product domain/category the user is asking about.
 * Helps the agent focus its web searches on the right type of sources
 * and activates the appropriate expert persona for domain-specific reasoning.
 */
export type QueryDomain =
  | 'mechanical'
  | 'electrical'
  | 'electronics'
  | 'software'
  | 'materials'
  | 'energy'
  | 'medical'
  | 'construction'
  | 'consumer_electronics'
  | 'automotive'
  | 'robotics'
  | 'chemical'
  | 'aerospace'
  | 'industrial'
  | 'patents'
  | 'general';

/**
 * Budget constraint extracted from the query.
 * Example: "up to 4000€" → { max: 4000, currency: "EUR" }
 */
export interface BudgetConstraint {
  max: number;
  currency: string;
}

/**
 * All constraints the user mentioned in their query.
 */
export interface QueryConstraints {
  budget: BudgetConstraint | null;
  preferred_brands: string[];
  must_be_compatible: string[];
  quantity: string;
  use_case: string;
}

/**
 * Tells the search engine HOW to handle this query.
 */
export interface ResponseStrategy {
  needs_web_search: boolean;
  needs_product_cards: boolean;
  expects_detailed_analysis: boolean;
  is_multi_product_set: boolean;
  suggested_product_count: number;
  response_tone: 'technical' | 'conversational' | 'advisory';
  needs_clarification: boolean;
  clarification_reason?: string;
  /**
   * True when the query targets a standardized catalog designation that
   * multiple manufacturers produce identically (e.g., bearing 6306,
   * IRFZ44N, M8 DIN 912, DN50 PN16 valve). Triggers mandatory
   * multi-manufacturer result mode and lowered tier thresholds.
   */
  is_standard_part_query: boolean;
  /**
   * When the user asks for SEVERAL DIFFERENT part TYPES in the same query
   * (e.g., "find me a screw and a nut", "shafts, bearings and couplings",
   * "linear actuator + servo motor"), the classifier returns the list of
   * distinct part types here. The agent uses this to (a) search each type
   * separately and (b) tag every resulting product card with its part_type
   * so the UI can group results under per-type section headers.
   *
   * Empty array (length 0 or 1) means single-part-type behavior — render
   * results as one flat list, no grouping.
   */
  requested_part_types: string[];
  /**
   * True when the user explicitly asks to LIST products from a SINGLE
   * named company / brand (e.g., "list all linear actuators from
   * Schaeffler", "show me all servo drives from Siemens", "what
   * gearboxes does Nord make"). In this mode:
   * - The "ONE PRODUCT PER MANUFACTURER" brand-diversity rule is
   *   suspended so the agent can return many models from the same brand.
   * - Spec phrases in the query (force, stroke, voltage, ...) are
   *   demoted to SOFT preferences so they sort but do not filter.
   * - The product-count cap is raised (target 8–15, hard cap ~20).
   */
  is_brand_enumeration: boolean;
  /**
   * For intent="calculation_search" only. Tells the agent which order to run
   * the calculation and product search:
   * - "size_then_search" — user supplies physical inputs (mass, speed, flow,
   *   etc.) and asks the system to SIZE a component, then find products that
   *   meet the derived specs. Calculation card MUST render before product
   *   cards. Triggers: "size a motor for 2000 kg vehicle, 0–50 km/h in 5 s",
   *   "what pump do I need for 50 L/min at 6 bar", "size an actuator for
   *   300 kg over 0.5 m in 2 s".
   * - "search_then_size" — user names a SPECIFIC product (model number /
   *   brand+model) and asks for a derived metric of THAT product (lifetime,
   *   thermal margin, …). Product card MUST render before calculation card
   *   because the calculation reads values from the datasheet. Triggers:
   *   "calculate the L10 lifetime of SKF 7207 BECBP at 20 kN / 4000 rpm",
   *   "what's the thermal margin of the EMA-80 at 75% duty".
   * Defaults to "size_then_search" when intent is calculation_search but the
   * mode is missing/invalid (the safer default — sizing queries are far more
   * common and naming a specific product is an unambiguous signal).
   */
  calculation_mode?: 'size_then_search' | 'search_then_size';
}

/**
 * The complete classification result.
 * This is what gets passed to the agent search and summary generator.
 */
export interface ClassifierUsage {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
}

export interface QueryClassification {
  intent: QueryIntent;
  domain: QueryDomain;
  constraints: QueryConstraints;
  strategy: ResponseStrategy;
  enriched_query: string;
  classification_confidence: number;
  /** Populated only when intent === 'follow_up'. Tells the agent what kind of answer to produce. */
  follow_up_answer_type?: FollowUpAnswerType;
  _usage?: ClassifierUsage;
}

// ============================================================================
// DEFAULT — When classification fails or is skipped
// ============================================================================

/**
 * Fallback classification used when the classifier fails or times out.
 * Defaults to a standard product search with no special handling.
 */
export const DEFAULT_CLASSIFICATION: QueryClassification = {
  intent: 'product_search',
  domain: 'general',
  constraints: {
    budget: null,
    preferred_brands: [],
    must_be_compatible: [],
    quantity: '',
    use_case: '',
  },
  strategy: {
    needs_web_search: true,
    needs_product_cards: true,
    expects_detailed_analysis: false,
    is_multi_product_set: false,
    suggested_product_count: 5,
    response_tone: 'technical',
    needs_clarification: false,
    is_standard_part_query: false,
    requested_part_types: [],
    is_brand_enumeration: false,
    calculation_mode: undefined,
  },
  enriched_query: '',
  classification_confidence: 0,
};

// ============================================================================
// CLASSIFIER PROMPT — Instructions for the classification model
// ============================================================================

const CLASSIFIER_SYSTEM_PROMPT = `You are a query classifier for a product search engine. Your job is to analyze a user's message and return structured JSON metadata about what they want.

You MUST return valid JSON matching this exact structure (no extra keys, no missing keys):

{
  "intent": "product_search" | "build" | "calculation_search" | "comparison" | "explanation" | "recommendation" | "follow_up" | "general_chat" | "off_topic",
  "domain": "mechanical" | "electrical" | "electronics" | "software" | "materials" | "energy" | "medical" | "construction" | "consumer_electronics" | "automotive" | "robotics" | "chemical" | "aerospace" | "industrial" | "patents" | "general",
  "constraints": {
    "budget": { "max": <number>, "currency": "<ISO currency code>" } | null,
    "preferred_brands": ["<brand1>", "<brand2>"],
    "must_be_compatible": ["<component1>", "<component2>"],
    "quantity": "<e.g. '1 complete set', '3 units', ''>",
    "use_case": "<brief description of what user needs this for>"
  },
  "strategy": {
    "needs_web_search": true | false,
    "needs_product_cards": true | false,
    "expects_detailed_analysis": true | false,
    "is_multi_product_set": true | false,
    "suggested_product_count": <number 1-10>,
    "response_tone": "technical" | "conversational" | "advisory",
    "needs_clarification": true | false,
    "clarification_reason": "<why you need more info, or empty string>",
    "is_standard_part_query": true | false,
    "requested_part_types": ["<part type 1>", "<part type 2>", ...],
    "is_brand_enumeration": true | false,
    "calculation_mode": "size_then_search" | "search_then_size" | null
  },
  "enriched_query": "<cleaned up, specific version of what to search for>",
  "classification_confidence": <0.0 to 1.0>,
  "follow_up_answer_type": "clarification" | "comparison" | "calculation" | "refined_search" | "new_search" | null
}

CLASSIFICATION RULES:

INTENT:
- "product_search": User wants to find specific products. Keywords: "find", "search", "show me", "I need"
- "build": User wants to BUILD, ASSEMBLE, or CONSTRUCT a system and needs a Bill of Materials (parts list). This is DIFFERENT from product_search — the user wants a complete list of components to build a system, not find a single product.
  Keywords: "build", "assemble", "construct", "what parts do I need", "components needed for", "how to make a", "parts list for", "design a", "put together a", "I want to build", "create a", "set up a", "make a"
  CRITICAL BUILD DETECTION: Classify as "build" when the user describes a SYSTEM or MACHINE they want to create with performance specs. Examples:
    - "I want to build an actuator 10kN at 100mm/sec" → build (user wants to BUILD an actuator system from parts)
    - "build me a conveyor belt system 5m long" → build
    - "I need to assemble a robotic arm with 6 DOF" → build
    - "design a pneumatic press with 50 ton force" → build
    - "create a linear motion system 500mm stroke" → build
    - "what do I need to make a CNC router" → build
    - "put together a pick and place machine" → build
    - "components for a 3-axis gantry system" → build
  DO NOT classify as "build" when the user wants to FIND a single existing product:
    - "find me an actuator 10kN" → product_search (wants to buy ONE actuator)
    - "show me linear actuators" → product_search
    - "I need a servo motor" → product_search
  CRITICAL CONTEXT OVERRIDE — When conversation history exists (established search session) AND the current query does NOT contain any of these build trigger words: ("build", "assemble", "construct", "make a", "create a", "design a", "put together", "parts list", "bill of materials", "bom", "what do I need to", "components for", "what parts") → DO NOT classify as "build". Instead classify as "product_search" or "follow_up". The user is refining their ongoing search, not requesting a BOM.
    - Conversation history shows "find me a linear actuator 30 kN" then user types "stroke 300mm; speed 50mm/sec; 24V" → product_search (providing specs to narrow the search, NOT building from parts)
    - Conversation history shows "search for servo motors" then user types "NEMA 23, 3Nm, 48V" → product_search (refining specs)
    - Conversation history shows "show me pneumatic cylinders" then user types "bore 50mm, stroke 200mm, double acting" → product_search (narrowing down the product)
    - Only classify as "build" mid-conversation if the user EXPLICITLY uses build trigger words, e.g., "actually I want to build one myself"
- "calculation_search": User wants to CALCULATE an engineering value AND then find products matching the derived result. Requires ALL THREE of: (a) physical input values are present in the query (mass, force, speed, flow, pressure, distance, time, voltage, current, torque, power, …), (b) a product/component type to find is mentioned, AND (c) an actual computation must be performed using those inputs. Keywords (calculation side): "calculate", "compute", "determine", "derive", "what force", "what torque", "what power", "what speed", "how much force", "how many amps", "find required", "size", "size the", "what size". Typical patterns: "Calculate the actuator force needed for 300 kg over 0.5 m in 2 s, then find matching actuators", "Size a pump for flow rate 50 L/min at 6 bar and recommend pumps", "Determine the motor power for a 50 kg conveyor at 0.5 m/s and find motors".
  IMPLICIT SIZING PATTERNS (classify as calculation_search even WITHOUT explicit keywords like "calculate" or "size"): When a query contains physical input values WITH units AND a product/component type AND the phrasing clearly implies "what do I need / which one / find me one that handles / recommend one for", the system must FIRST derive the required specs (via engineering calculation) before searching for products. The implicit intent is sizing, not cataloging. Classify these as calculation_search / size_then_search. Trigger phrases: "what X do I need for", "which X for", "what X should I use for", "recommend a X for", "find a X for … at … in", "what motor/pump/actuator/bearing/cable/drive for", "I need a X that can handle", "which motor/pump/actuator for … kg / kW / kN / bar / rpm / m/s".
  IMPLICIT SIZING — POSITIVE EXAMPLES (classify as calculation_search / size_then_search):
    - "what motor do I need for 2000 kg vehicle reaching 50 km/h in 5 s?" → calculation_search (physical inputs: mass + speed + time; component type: motor; implicit sizing intent: what motor)
    - "which pump for 50 L/min at 6 bar?" → calculation_search (physical inputs: flow + pressure; component: pump; implicit: which pump)
    - "find an actuator for 300 kg load over 0.5 m in 2 s" → calculation_search (mass + distance + time; actuator; implicit sizing)
    - "what bearing do I need for 8 kN radial load at 3000 rpm, 5000 h life?" → calculation_search (load + speed + life; bearing; implicit sizing)
    - "which motor for a conveyor 500 kg load at 0.5 m/s?" → calculation_search (mass + speed; motor; implicit sizing)
    - "recommend a cable for 32 A continuous, 230 V, 10 m run" → calculation_search (current + voltage + distance; cable; implicit sizing)
    - "what VFD do I need for a 15 kW motor at 400 V?" → calculation_search (power + voltage; VFD; implicit sizing)
    - "find a gearbox for 500 Nm at 30 rpm output" → calculation_search (torque + speed; gearbox; implicit sizing)
    - "which hydraulic cylinder for 10 tons at 100 mm/s?" → calculation_search (force + speed; cylinder; implicit sizing)
  IMPLICIT SIZING — NEGATIVE EXAMPLES (do NOT classify as calculation_search — these are product_search):
    - "find me a 15 kW motor" → product_search (spec already provided; no computation needed)
    - "show me 6306 bearings" → product_search (standard part designation; no inputs to compute)
    - "I need a 400 V VFD" → product_search (directly stated spec; no calculation needed)
    - "find 50 L/min pumps" → product_search (spec stated; no pressure/flow calculation needed)
    - "search for servo motors 3 Nm, 48 V" → product_search (all specs given directly; user wants catalog options)
  CRITICAL DISTINCTION from product_search: the user does NOT directly state the required product spec — they give physical INPUTS (mass, load scenario, application conditions) that require a computation to derive the search spec. If the required spec is already stated directly (e.g., "15 kW motor"), classify as product_search. CRITICAL DISTINCTION from build: the user is finding a SINGLE product type that satisfies computed specs, not assembling a multi-component system with a BOM.
  CRITICAL DISTINCTION from "explanation": Queries that ask for formula KNOWLEDGE — listing, finding, showing, or explaining equations/formulas/derivations — without providing numeric input values are "explanation", NOT "calculation_search". The user is asking WHAT the formula is, not asking the system to RUN it.
  Negative examples (these are "explanation", NOT "calculation_search"):
    - "find all formulas needed for L10 calculation" → explanation (no numeric inputs, no product to find — user wants formula reference)
    - "list the Hertz contact stress formulas" → explanation (asking for formula knowledge, not a computation)
    - "what equations are used in ISO 281" → explanation (standard reference, no numeric inputs)
    - "show me the beam deflection formula" → explanation (formula lookup, not a computation task)
    - "what is the formula for bearing life" → explanation (asking what the formula is)
  COMPOUND SIZING + SECONDARY REQUEST RULE (CRITICAL — overrides all other intent rules):
  When a query contains ANY sizing/computation keyword ("size", "calculate", "compute", "determine", "derive", "what diameter", "what thickness", "what power", "how much force", "required torque", "required load", "required current", "required flow rate", "pressure drop", "heat dissipation") AND any secondary-request phrase ("propose the material", "recommend a material", "select material", "what material", "suggest a tolerance", "what safety factor", "recommend a finish", "what grade", "what standard", "choose suitable component"), the intent MUST be "calculation_search" with calculation_mode "size_then_search" — NEVER "recommendation", "explanation", or "general_chat". The secondary request (material proposal, safety factor, finish, etc.) is resolved INSIDE the calculation card, not as a separate intent. Examples:
  - "Size a shaft for 300 Nm torque and propose the material" → calculation_search / size_then_search
  - "Determine beam thickness for 5 kN load and recommend material grade" → calculation_search / size_then_search
  - "Calculate motor power for this conveyor and suggest voltage class" → calculation_search / size_then_search
  - "Size a pump for 40 L/min and recommend pipe material" → calculation_search / size_then_search
  - "Calculate cable cross-section for 32 A and recommend insulation type" → calculation_search / size_then_search
- "comparison": User wants to compare 2+ products THEY ALREADY KNOW BY NAME. The query must explicitly name the things being compared (brands, model numbers, or products previously shown in the conversation). Keywords: "compare X vs Y", "difference between X and Y", "which is better, X or Y". Examples that ARE comparison: "compare LINAK LA77 vs Thomson H-Track", "what's the difference between SKF 6306 and FAG 6306", "which is better, NEMA 23 or NEMA 34".
  CRITICAL — DO NOT classify as "comparison" when the user is asking to FIND products first and then compare them. Phrases like "find X and compare two of them", "search for X and compare the top results", "show me X then compare a few", "give me X and compare", or any wording that combines a search verb (find / search / show / give / list / look for / I need) with "compare" indicate INTENT = product_search. The agent's product-search response will produce a comparison view as a side-output. Examples that are product_search (NOT comparison): "find linear actuator 20kN for medical and compare two of them", "search for NEMA 23 servo motors and compare the top three", "show me 4mm bearings and compare them".
- "explanation": User wants to understand a concept, asks a technical question about products already shown, OR asks for formula/equation/derivation knowledge. Keywords: "what is", "how does", "explain", "why", "is this FDA approved", "what temperature", "can this handle", "does this support", "tell me about", "is it compatible", "what formula", "list the formulas", "find formulas", "show formulas", "what equations", "how is X calculated", "what are the equations for", "derivation of". IMPORTANT: When the user asks a technical question about listed products (e.g., "what is the temperature range?", "is PU material food-grade?", "can this motor run at 48V?"), classify as "explanation" — the agent should answer from product data and web search, NOT return new product cards.
  FORMULA QUERIES — always "explanation": Any query asking for formula LISTINGS or formula KNOWLEDGE without providing numeric inputs to compute → explanation. Examples:
    - "find all formulas needed for L10 calculation" → explanation
    - "list the Hertz contact stress equations" → explanation
    - "what is the ISO 281 bearing life formula" → explanation
    - "show me beam deflection formulas" → explanation
    - "how is fatigue life calculated" → explanation
- "recommendation": User wants your expert opinion on what to choose. Keywords: "which should I", "what do you recommend", "suggest", "best for"
- "follow_up": User is continuing a previous conversation. Keywords: "more like", "also", "what about", "and", referencing previous products. Also includes technical questions that reference previously shown products (e.g., "is the first one FDA approved?", "what about the Habasit belt's temperature range?").
  CRITICAL FOLLOW-UP DETECTION: When conversation history exists, short messages that refine, narrow, or adjust a previous answer MUST be classified as "follow_up". Examples:
    - Previous: user asked about tolerances → "list with the h8" → follow_up (refining previous answer to focus on h8)
    - Previous: user searched for shafts → "I can accept tolerance h8" → follow_up (adjusting requirements)
    - Previous: user got product results → "what about the second one" → follow_up
    - Previous: user asked about materials → "show me the 42CrMo4" → follow_up (narrowing down)
    - Previous: user got an explanation → "I mean, find the product shafts with tolerance h8" → product_search (user explicitly says "find" — this is a NEW search with specific parameters)
  When classifying follow_ups, set needs_web_search BASED ON the follow_up_answer_type you choose (see below) — NOT as a blanket default.
  NUMERIC-SPEC OVERRIDE RULE (CRITICAL — evaluated BEFORE any follow_up_answer_type assignment):
  When a follow_up query contains ONE OR MORE numeric values paired with engineering units (kg, g, mm, cm, m, μm, um, rpm, kN, N, bar, MPa, Pa, kPa, V, A, mA, W, kW, Nm, Hz, kHz, MHz, °C, K, L/min, m/s, m/s², %, kΩ, Ω, dB, IP, DOF, DOL, or any other measurement unit) AND a product or component type is identifiable in the query OR the conversation context, then:
    - follow_up_answer_type MUST be "refined_search" or "new_search" — NEVER "clarification"
    - needs_product_cards MUST be true
    - needs_web_search MUST be true
  Rationale: numeric engineering specs are an unambiguous demand for product results matched to those specs — not a question about previously shown products. The presence of a model name (e.g., "UR10e") alongside specs does NOT make this a clarification; it identifies the product category being sought.
  LABELLED EXAMPLES:
    ✗ WRONG: "UR10e cobot, 10 kg payload, ±0.05 mm repeatability" → clarification  (WRONG — contains numeric specs)
    ✓ CORRECT: "UR10e cobot, 10 kg payload, ±0.05 mm repeatability" → refined_search, needs_product_cards=true, needs_web_search=true
    ✗ WRONG: "UR10e cobot, 500 N force, 300 mm stroke" → clarification  (WRONG — contains numeric specs)
    ✓ CORRECT: "UR10e cobot, 500 N force, 300 mm stroke" → refined_search, needs_product_cards=true, needs_web_search=true
    ✓ CORRECT: "is the first one food-grade?" → clarification  (OK — no numeric specs, pure factual question about shown products)
    ✓ CORRECT: "what IP rating does it have?" → clarification  (OK — asking about a previously shown product's attribute, no new specs supplied)
  FOLLOW-UP ANSWER TYPE — for every follow_up intent, also set "follow_up_answer_type" to one of:
    - "clarification": User asks a short factual question about a previously shown product ("can this handle 48V?", "what is the IP rating?", "is the first one food-grade?"). Answer directly from cached product data — do NOT run a new search. Set needs_web_search = false, needs_product_cards = false. IMPORTANT: queries containing numeric values with measurement units are NOT clarifications, even if a product model name appears — apply the NUMERIC-SPEC OVERRIDE RULE above instead.
    - "comparison": User wants to compare two or more previously shown products ("compare the first two", "which of those is better for outdoor use?"). Build a comparison table from already-found specs — do NOT run a new search. Set needs_web_search = false.
    - "calculation": User wants a calculation using specs from a previously shown product ("what is the L10 life of the SKF 6306 at 3000 rpm?", "calculate the power for the Bosch actuator at 120mm/s"). Pull specs from product context and run the calculation. Set needs_web_search = false unless the product specs are unknown.
    - "refined_search": User narrows, adjusts, or filters the PREVIOUS search result ("now show me with 600mm stroke", "same but IP67 rated", "only Festo brand", "I can accept tolerance h8", "UR10e cobot, 10 kg payload, ±0.05 mm repeatability"). Run a focused search using the enriched_query. MUST set needs_web_search = true AND needs_product_cards = true — the user expects product results.
    - "new_search": User pivots to a completely different product or topic ("what about pneumatic cylinders?", "now I need a servo motor instead"). Run a full new search. MUST set needs_web_search = true AND needs_product_cards = true — the user expects product results.
  Rules: set "clarification" when the question is about a specific attribute of a previously shown product AND contains no numeric engineering specs; set "comparison" when comparing items already in the conversation; set "calculation" when computing from previously shown specs; set "refined_search" when adjusting specs/filters from a prior search (including when numeric specs are supplied); set "new_search" when the topic changes. Default to "refined_search" (NOT "clarification") when the query contains numeric values with units and uncertain intent.
- "general_chat": Greetings, thanks, meta-questions. Keywords: "hello", "thanks", "what can you do"
- "off_topic": The query is NOT about any type of product, component, part, or anything that could be purchased/sourced from ANY industry. Examples of off_topic: cooking recipes, medical advice, relationship advice, homework help, sports scores, weather, politics, entertainment. IMPORTANT: Any query about a purchasable product IS on-topic regardless of industry — car parts, consumer electronics, building materials, medical devices, industrial components, and any other physical product are ALL valid. Only classify as off_topic if the subject is truly not a product (e.g., asking for life advice or homework help).

DOMAIN (pick the most specific match):
- "mechanical": Gearboxes, bearings, shafts, couplings, linear guides, pneumatic cylinders, hydraulics, machine components, power transmission
- "electrical": Motors, drives, VFDs, PLCs, relays, switchgear, power supplies, cables, transformers, circuit breakers
- "electronics": Microcontrollers, sensors, PCBs, communication modules, IoT devices, embedded systems, FPGAs, ADCs
- "software": SaaS platforms, APIs, development tools, enterprise software, cloud services, databases
- "materials": Steel grades, polymers, composites, coatings, raw materials, alloys, plastics, ceramics
- "energy": Solar panels, batteries, inverters, wind turbines, generators, energy storage, fuel cells, charging systems
- "medical": Medical devices, surgical instruments, diagnostic equipment, hospital supplies, sterilization, patient monitoring
- "construction": Building materials, structural steel, concrete, HVAC, plumbing, insulation, roofing, foundation systems
- "consumer_electronics": GPUs, CPUs, RAM, SSDs, monitors, keyboards, mice, headphones, phones, laptops, gaming PCs
- "automotive": Engine parts, brakes, suspension, exhaust, tires, transmission, EV components, ADAS
- "robotics": Servo motors, robot arms, grippers, end-effectors, motion controllers, robot chassis, encoders
- "chemical": Pumps, valves, pipes, reactors, filtration, heat exchangers, process instruments, flow meters
- "aerospace": Aircraft components, avionics, space-rated parts, composites, lightweight alloys, drones
- "industrial": General industrial equipment, conveyors, manufacturing tools, factory automation — use when query is broadly industrial but doesn't fit a more specific domain above
- "patents": Patent / intellectual-property research — use when the user asks about patents, prior art, IP filings, patent families, who patented something, patent claims, freedom-to-operate, or any "patent / patents / patented / IP / intellectual property / prior art / filing / patent number / WO/US/EP/CN application" wording. Examples: "find patents on linear actuators", "prior art for vibration damping", "who holds patents on solid-state batteries", "show recent IP filings for ABB", "patents about electric excavator hydraulic replacement"
- "general": Cannot determine or mixed domains — use only when no specific domain fits

STRATEGY RULES:
- "is_multi_product_set" = true when user asks for a COMPLETE BUILD or SET (e.g., "complete gaming PC", "full robot kit") or when intent is "build"
- "expects_detailed_analysis" = true for recommendations, comparisons, build, and when budget is specified
- "needs_product_cards" = false for explanations, general_chat, off_topic, and build (build returns BOM table, not product cards)
- "needs_product_cards" = true for calculation_search (after calculating, the agent returns product cards matching the derived specs)
- "needs_web_search" = true for product_search, recommendation, comparison, build, and calculation_search — these intents MUST use web search to find real product pages and URLs
- "needs_web_search" = false ONLY for general_chat and off_topic
- "needs_web_search" for follow_up: derive from follow_up_answer_type — clarification=false, comparison=false, calculation=false, refined_search=true, new_search=true. NEVER set needs_web_search=true for clarification or comparison; those must be answered from the conversation context already available.
- "needs_web_search" for explanation: ALWAYS set to true. The agent does not cache product pages or datasheets between turns, so it must re-search to answer technical questions accurately. Even if products were shown before, the conversation history only contains a brief summary — not the full datasheet or product page content.
- "suggested_product_count": For build, suggest 0. For multi-product sets, suggest 6-8. For single items, suggest 3-5.
- "response_tone": "advisory" for build and recommendations/multi-sets, "technical" for industrial, "conversational" for general
- "is_standard_part_query": Set to true when the query targets a STANDARDIZED CATALOG DESIGNATION that multiple manufacturers produce identically — a part number or type code from an industry standard (ISO, DIN, IEC, ANSI, JIS, etc.) or a widely-adopted component series. Examples by industry:
  - Mechanical/bearings: "6306", "6204 2RS", "7209 AC", "NU312", "29412 E" — these are ISO bearing designations, not brand names
  - Fasteners: "M8×50 DIN 912", "ISO 4014 M10", "5/16-18 UNC", "DIN 933 M6" — standard thread designations
  - Hydraulics/pneumatics: "DN50 PN16", "DN80 ball valve", "G1/4 BSP", "ISO 6432 bore 20mm"
  - Electronics/semiconductors: "IRFZ44N", "LM317", "SN74HC595", "NE555", "TL072", "ATmega328P", "STM32F103" — component type numbers used by multiple silicon vendors
  - Seals/O-rings: "70 Shore A NBR", "AS568-214", "metric O-ring 50×3"
  - Steel profiles: "HEA 100", "IPE 200", "RHS 100×50×4", "UPN 120", "IPN 160"
  - Sensors: "Pt100 RTD", "Type K thermocouple", "NTC 10K B3950"
  - Valves: "DN50 PN16 gate valve", "DN25 solenoid valve 24VDC"
  Set to FALSE for: brand-specific model queries ("SKF 6306" explicitly names a brand), performance-spec-only queries ("30A servo with EtherCAT"), vague category queries ("find me a bearing"), and build/BOM intents.
  FOLLOW-UP INHERITANCE: If the conversation history contains a prior product_search where is_standard_part_query was true (recognizable because the prior user query contained a catalog number like the examples above), inherit is_standard_part_query = true for the follow_up query even if the current message does not contain the part number (e.g., "list all technical data", "show me more options", "what about the price").

REQUESTED PART TYPES (multi-part product searches):
Detect when the user is asking for SEVERAL DIFFERENT part TYPES in a single product_search query (NOT a build/BOM request — they want catalog options for each type, not assembly instructions).
- Triggers: comma- or "and"-separated lists of distinct part nouns; "+" between parts; "X, Y and Z"; "X plus Y"; "an X and a Y"
- Examples (set requested_part_types):
  - "find me a screw and a nut" → ["screw", "nut"]
  - "shafts, bearings and couplings for a 25mm drive" → ["shaft", "bearing", "coupling"]
  - "linear actuator + servo motor + driver" → ["linear actuator", "servo motor", "driver"]
  - "I need pneumatic cylinders, solenoid valves and fittings" → ["pneumatic cylinder", "solenoid valve", "fitting"]
  - "GPU and CPU and motherboard for a workstation" → ["GPU", "CPU", "motherboard"]
- When requested_part_types has length ≥ 2:
  - Keep intent = "product_search" (do NOT re-classify as "build" — the user wants catalog options, not assembly)
  - Set is_multi_product_set = true
  - Set suggested_product_count to roughly 3 × number of types, capped at 10 (e.g., 2 types → 6, 3 types → 9, 4+ types → 10)
- When the user asks for ONE part type (single noun, or compound modifier of one noun), return requested_part_types = [] (empty array). The UI then renders results as a single flat list with no grouping.
- DO NOT split compound part names that describe a SINGLE product into separate types. Negative examples (return [] — these are ONE part type each):
  - "screw and nut driver" → [] (a screwdriver/nut-driver tool, single product)
  - "push and pull rod" → [] (a single push-pull rod)
  - "hot and cold mixer valve" → [] (a single mixing valve)
  - "nuts and bolts kit" → [] (a single kit, even though it bundles two types)
- Use SHORT, SINGULAR, lowercase noun phrases as part type labels (e.g., "bearing" not "Bearings (deep groove)"). The same labels will be used as the per-type section headers in the UI.

BRAND ENUMERATION (single-brand product listing):
Set "is_brand_enumeration" = true when the user explicitly asks to LIST products from a SINGLE named company / brand and only that company. Triggers require BOTH:
  (a) An explicit listing / enumeration verb or phrase: "list", "list all", "show me all", "show all", "what … does X make", "what does X make", "all products from", "every model of", "every X from", "all X from <brand>", "give me all <type> from <brand>", "what <type> does <brand> offer/produce/manufacture/sell".
  (b) Exactly ONE brand mentioned (it should also appear in "preferred_brands"). If two or more brands are named the user wants comparison/coverage across brands — set false.
Examples that ARE brand enumeration:
  - "list all linear actuators from Schaeffler" → is_brand_enumeration=true, preferred_brands=["Schaeffler"]
  - "show me all servo drives from Siemens in the 5 kW range" → true, preferred_brands=["Siemens"] (the "5 kW range" is a SOFT preference, not a hard filter — see below)
  - "what gearboxes does Nord make" → true, preferred_brands=["Nord"]
  - "every coupling R+W produces" → true, preferred_brands=["R+W"]
  - "show me all bearings from SKF in the 6300 series" → true, preferred_brands=["SKF"]
Examples that are NOT brand enumeration:
  - "find me a 30 kN linear actuator" (no brand) → false
  - "compare Schaeffler and SKF bearings" (two brands) → false
  - "Schaeffler 6306 bearing" (specific model, not a listing request) → false
  - "do you have anything from Siemens?" (vague, no listing verb) → false — set needs_clarification instead
SPEC HANDLING IN ENUMERATION MODE: spec phrases that appear inside a brand-enumeration query (force, stroke, voltage, power, torque, size, etc.) are SOFT PREFERENCES — they should sort the results but MUST NOT filter the brand's catalog down to one model. The agent (downstream) marks them as type="soft" in the requirements table. The classifier just needs to flip is_brand_enumeration=true; the agent handles the soft-vs-hard distinction.
PRODUCT COUNT IN ENUMERATION MODE: when is_brand_enumeration=true, set "suggested_product_count" to 12 (the cap is raised to 20 downstream — pick a number in the 8–15 target range).
INTENT IN ENUMERATION MODE: keep intent="product_search". Do NOT classify as build, comparison, or recommendation just because the listing phrase is present.

CALCULATION MODE (only when intent="calculation_search" — otherwise set to null):
Pick exactly ONE mode for every calculation_search query.

- "size_then_search" — DEFAULT for sizing queries. The user gives PHYSICAL INPUTS (mass, force, speed, flow, pressure, distance, time, voltage demand, life target, ...) and asks the system to derive the required component spec, then recommend products. The user does NOT name a specific product model — a generic component class ("a ball bearing", "a motor", "a shaft", "a pump") is NOT a named product. Examples:
  - "size a traction motor for a 2000 kg vehicle with 20 inch wheels reaching 50 km/h in 5 s" → size_then_search
  - "what pump do I need for 50 L/min at 6 bar" → size_then_search
  - "size an actuator for 300 kg load over 0.5 m stroke in 2 s, then find matching actuators" → size_then_search
  - "calculate the motor power for a 50 kg conveyor at 0.5 m/s and find motors" → size_then_search
  - "compute required force for a press lifting 800 kg and recommend hydraulic cylinders" → size_then_search
  - "calculate radial load rating for a ball bearing at 3000 rpm, L10 = 20 000 h" → size_then_search (generic class + physical inputs)
  - "what dynamic load rating do I need for a bearing at 1500 rpm and 50 000 h service life" → size_then_search
  - "calculate required torque for a shaft at 500 rpm and 10 kW power" → size_then_search
  In this mode the calculation runs FIRST, derives concrete specs (e.g. "≥3 kW continuous", "C ≥ 45 kN"), and the product search uses those derived specs — not the raw physical inputs — to score candidates.

- "search_then_size" — user NAMES A SPECIFIC PRODUCT with a concrete model number or brand+model designation AND asks for a derived metric of THAT product. The calculation requires values from the named product's datasheet (dynamic load rating C, rated thrust, K-factor, …). A generic component class ("a ball bearing", "a motor") is NOT a named product. Examples:
  - "calculate the L10 lifetime of SKF 7207 BECBP at 20 kN radial, 10 kN axial, 4000 rpm" → search_then_size
  - "what's the thermal margin of the EMA-80 actuator at 75% duty" → search_then_size
  - "find FAG 6306 2RS and compute its rating life at 8 kN, 1500 rpm" → search_then_size
  - "compute the bearing lifetime for THK KR46 at the load below" → search_then_size
  In this mode the product is searched FIRST so the agent can pull datasheet values, then the calculation runs using those values.

When in doubt, pick "size_then_search". Only choose search_then_size when ALL THREE conditions hold: (a) a specific brand+model designation is named (not just a generic class), (b) the calculation needs a value from THAT product's datasheet, AND (c) the required datasheet value cannot be reasonably assumed from engineering tables. Any query asking to calculate a REQUIRED VALUE (load rating, power, torque, force, current, ...) for a generic component class at given physical inputs is ALWAYS size_then_search.

For every NON-calculation_search intent, set calculation_mode to null.

CLARIFICATION RULES:
- CONFIRMATION SHORT-CIRCUIT: When the user's message is a short affirmative —
  "yes", "yeah", "yep", "correct", "right", "that's right", "that one", "ok",
  "okay", "sure", "exactly", "uh huh", "mhm" — AND the conversation history
  contains a clarifying question from the ASSISTANT in the last 1-2 turns:
    • Set needs_clarification = false
    • Set intent = "follow_up" and follow_up_answer_type = "refined_search" or
      "clarification" (whichever fits the confirmed interpretation)
    • Pick the MOST CONTEXTUALLY PLAUSIBLE interpretation of what the user confirmed
      and set enriched_query accordingly
    • NEVER set needs_clarification = true for a short affirmative reply to the
      agent's own question

- ALREADY-ASKED RULE: When needs_clarification would be true BUT the conversation
  history shows the agent already asked a clarifying question in a previous turn
  AND received any user reply to it, set needs_clarification = false instead.
  The classifier must NOT keep asking for clarification across multiple turns —
  after one clarifying exchange, always commit to the best interpretation.

- "needs_clarification" = true when the query is TOO VAGUE to produce useful results. The user has not provided enough detail for a meaningful search.
- Set "needs_clarification" = true when:
  - The query is a single generic word with no specs (e.g., "motor", "sensor", "bearing", "valve")
  - The query mentions a category but no application, size, or performance requirements (e.g., "something for my project", "I need a part")
  - The intent is ambiguous between build and product_search and there are no specs given
- Set "needs_clarification" = false when:
  - The query includes ANY specific parameter (force, speed, size, voltage, material, brand, model number, application)
  - The query is clearly a greeting, explanation request, or follow-up
  - The query is specific enough to search (e.g., "NEMA 23 stepper motor" is specific; "motor" alone is not)
- "clarification_reason": Briefly describe what information is missing (e.g., "No application, size, or performance specs provided for motor search", "Query too vague — need force, stroke, speed, or application details")
- When needs_clarification = true, set classification_confidence to a low value (0.3-0.5)

ENRICHED QUERY:
Rewrite the user's query into a clear, searchable form. Fix typos, expand abbreviations.
- "find me some good coputer parts for gamins" → "gaming PC components: GPU, CPU, motherboard, RAM, SSD, PSU, case"
- "gearboxes for mini car" → "miniature gearbox motor for small vehicle / RC car"
IMPORTANT for follow_ups: When the query is a follow-up, the enriched_query must preserve the USER'S SPECIFIC refinement, not re-summarize the entire topic from scratch.
- Previous: user asked about tolerances → "list with the h8" → enriched_query: "h8 tolerance details and specifications" (NOT "list of shaft tolerances available")
- Previous: user searched for shafts → "I can accept tolerance h8" → enriched_query: "shaft 25mm with h8 tolerance 42CrMo4" (merging new constraint with previous context)
- Previous: user got tolerance list → "what about h6?" → enriched_query: "h6 tolerance details compared to h8" (preserving comparison context)

Return ONLY the JSON object, no explanation or markdown.`;

// ============================================================================
// MAIN FUNCTION — classifyQuery
// ============================================================================

let classifierClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!classifierClient) {
    classifierClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return classifierClient;
}

/**
 * Classifies a user query to determine intent, domain, constraints,
 * and the optimal response strategy.
 *
 * This runs BEFORE the main agent search and returns metadata that
 * shapes how the agent responds.
 *
 * @param query - The user's raw message text
 * @param chatHistory - Previous messages for context (optional)
 * @param timeoutMs - Max time to wait for classification (default: 5000ms)
 * @returns QueryClassification with intent, domain, constraints, and strategy
 *
 * @example
 *   const classification = await classifyQuery("find me gearboxes for a robot arm");
 *   // Returns:
 *   // {
 *   //   intent: "product_search",
 *   //   domain: "robotics",
 *   //   constraints: { use_case: "robot arm actuation", ... },
 *   //   strategy: { needs_web_search: true, suggested_product_count: 5, ... },
 *   //   enriched_query: "gearbox motor for robotic arm actuator",
 *   //   ...
 *   // }
 */
export async function classifyQuery(
  query: string,
  chatHistory: { role: string; content: string }[] = [],
  timeoutMs: number = 5000
): Promise<QueryClassification> {
  const classifierModel = 'gpt-4o-mini';
  const classifierStartTime = Date.now();
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ [QueryClassifier] No API key, using default classification');
      const fallback = { ...DEFAULT_CLASSIFICATION, enriched_query: query };
      fallback._usage = { model: classifierModel, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, duration_ms: Date.now() - classifierStartTime };
      return fallback;
    }

    const client = getClient();

    const historyContext = chatHistory.length > 0
      ? `\n\nCONVERSATION HISTORY (last ${Math.min(chatHistory.length, 6)} messages):\n` +
        chatHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')
      : '';

    const userMessage = `Classify this query:
"${query}"${historyContext}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await client.chat.completions.create({
      model: classifierModel,
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    }, { signal: controller.signal });

    clearTimeout(timeout);

    const classifierDuration = Date.now() - classifierStartTime;
    const usage = response.usage;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn('⚠️ [QueryClassifier] Empty response from model');
      const fallback = { ...DEFAULT_CLASSIFICATION, enriched_query: query };
      fallback._usage = { model: classifierModel, prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens, duration_ms: classifierDuration };
      return fallback;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (parseError: any) {
      console.warn('⚠️ [QueryClassifier] JSON parse failed:', parseError?.message);
      const fallback = { ...DEFAULT_CLASSIFICATION, enriched_query: query };
      fallback._usage = { model: classifierModel, prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens, duration_ms: classifierDuration };
      return fallback;
    }

    const classification = validateAndNormalize(parsed, query);

    classification._usage = {
      model: classifierModel,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      duration_ms: classifierDuration,
    };

    console.log(`🏷️ [QueryClassifier] Intent: ${classification.intent}${classification.follow_up_answer_type ? ` (${classification.follow_up_answer_type})` : ''} | Domain: ${classification.domain} | Multi-set: ${classification.strategy.is_multi_product_set} | StdPart: ${classification.strategy.is_standard_part_query} | BrandEnum: ${classification.strategy.is_brand_enumeration}${classification.strategy.is_brand_enumeration ? ` (brands: ${classification.constraints.preferred_brands.join(', ') || 'none'}, count: ${classification.strategy.suggested_product_count})` : ''} | Budget: ${classification.constraints.budget ? classification.constraints.budget.max + ' ' + classification.constraints.budget.currency : 'none'} | Confidence: ${classification.classification_confidence} | Clarification: ${classification.strategy.needs_clarification ? classification.strategy.clarification_reason || 'yes' : 'no'} | Tokens: ${totalTokens} (${classifierDuration}ms)`);

    return classification;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.warn('⚠️ [QueryClassifier] Timed out, using default classification');
    } else {
      console.warn('⚠️ [QueryClassifier] Error:', error?.message || error);
    }
    const fallback = { ...DEFAULT_CLASSIFICATION, enriched_query: query };
    fallback._usage = { model: classifierModel, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, duration_ms: Date.now() - classifierStartTime };
    return fallback;
  }
}

// ============================================================================
// VALIDATION — Ensure classifier output is well-formed
// ============================================================================

/**
 * Validates and normalizes the raw classifier output.
 * Fills in missing fields with sensible defaults so downstream code
 * never has to worry about null/undefined values.
 */
function validateAndNormalize(raw: any, originalQuery: string): QueryClassification {
  const validIntents: QueryIntent[] = ['product_search', 'build', 'calculation_search', 'comparison', 'explanation', 'recommendation', 'follow_up', 'general_chat', 'off_topic'];
  const validDomains: QueryDomain[] = ['mechanical', 'electrical', 'electronics', 'software', 'materials', 'energy', 'medical', 'construction', 'consumer_electronics', 'automotive', 'robotics', 'chemical', 'aerospace', 'industrial', 'patents', 'general'];
  const validTones = ['technical', 'conversational', 'advisory'] as const;

  let intent: QueryIntent = validIntents.includes(raw.intent) ? raw.intent : 'product_search';
  const domain: QueryDomain = validDomains.includes(raw.domain) ? raw.domain : 'general';

  const budget = raw.constraints?.budget && typeof raw.constraints.budget.max === 'number'
    ? { max: raw.constraints.budget.max, currency: raw.constraints.budget.currency || 'USD' }
    : null;

  const constraints: QueryConstraints = {
    budget,
    preferred_brands: Array.isArray(raw.constraints?.preferred_brands) ? raw.constraints.preferred_brands : [],
    must_be_compatible: Array.isArray(raw.constraints?.must_be_compatible) ? raw.constraints.must_be_compatible : [],
    quantity: typeof raw.constraints?.quantity === 'string' ? raw.constraints.quantity : '',
    use_case: typeof raw.constraints?.use_case === 'string' ? raw.constraints.use_case : '',
  };

  const tone = validTones.includes(raw.strategy?.response_tone) ? raw.strategy.response_tone : 'technical';

  const strategy: ResponseStrategy = {
    needs_web_search: raw.strategy?.needs_web_search !== false,
    needs_product_cards: raw.strategy?.needs_product_cards !== false,
    expects_detailed_analysis: raw.strategy?.expects_detailed_analysis === true,
    is_multi_product_set: raw.strategy?.is_multi_product_set === true,
    suggested_product_count: typeof raw.strategy?.suggested_product_count === 'number'
      ? Math.min(Math.max(raw.strategy.suggested_product_count, 1), raw.strategy?.is_brand_enumeration === true ? 20 : 10)
      : 5,
    response_tone: tone,
    needs_clarification: raw.strategy?.needs_clarification === true,
    clarification_reason: typeof raw.strategy?.clarification_reason === 'string' ? raw.strategy.clarification_reason : undefined,
    is_standard_part_query: raw.strategy?.is_standard_part_query === true,
    is_brand_enumeration: raw.strategy?.is_brand_enumeration === true,
    calculation_mode: (() => {
      const m = raw.strategy?.calculation_mode;
      if (m === 'size_then_search' || m === 'search_then_size') return m;
      // Normalize at the source: when the model returned an invalid/missing
      // value but the intent IS calculation_search, default to
      // size_then_search so telemetry, benchmark scoring, and downstream
      // execution all see the same deterministic value.
      if (raw.intent === 'calculation_search') return 'size_then_search';
      return undefined;
    })(),
    requested_part_types: Array.isArray(raw.strategy?.requested_part_types)
      ? (() => {
          const seen = new Set<string>();
          const out: string[] = [];
          for (const t of raw.strategy.requested_part_types as any[]) {
            if (typeof t !== 'string') continue;
            const norm = t.trim().toLowerCase();
            if (!norm || seen.has(norm)) continue;
            seen.add(norm);
            out.push(norm);
            if (out.length >= 8) break;
          }
          return out;
        })()
      : [],
  };

  // Deterministic post-processing: when the model identifies 2+ distinct part
  // types, force the strategy into multi-part product-search mode so downstream
  // grouping/UI behavior cannot drift due to model inconsistency.
  if (strategy.requested_part_types.length >= 2) {
    strategy.is_multi_product_set = true;
    const target = Math.min(10, strategy.requested_part_types.length * 3);
    if (strategy.suggested_product_count < target) {
      strategy.suggested_product_count = target;
    }
  }

  // Deterministic post-processing for brand-enumeration mode: force a higher
  // product count (target 8–15) so the listing is meaningful even if the model
  // suggested a small number, and force intent back to product_search since
  // listing requests must never become build/comparison.
  if (strategy.is_brand_enumeration) {
    if (strategy.requested_part_types.length < 2) {
      strategy.is_multi_product_set = false;
    }
    if (strategy.suggested_product_count < 12) {
      strategy.suggested_product_count = 12;
    }
    if (strategy.suggested_product_count > 20) {
      strategy.suggested_product_count = 20;
    }
    // Brand enumeration is fundamentally a product-listing intent. If the
    // model misclassified it as build/comparison/recommendation/explanation,
    // coerce intent back to product_search so downstream routing (cards,
    // search scope, UI) behaves correctly.
    if (intent !== 'product_search') {
      console.log(`🔧 [QueryClassifier] Brand enumeration detected — coercing intent ${intent} → product_search`);
      intent = 'product_search';
    }
    // Ensure the agent will actually search the web and return cards.
    strategy.needs_web_search = true;
    strategy.needs_product_cards = true;
    // Precedence: brand-enumeration overrides the standard-part
    // multi-manufacturer mandate. If the model flagged both, drop the
    // standard-part flag so the downstream agent does not inject a
    // conflicting "search 3+ manufacturers" instruction.
    if (strategy.is_standard_part_query) {
      console.log('🔧 [QueryClassifier] Brand enumeration overrides is_standard_part_query — clearing standard-part flag to avoid conflicting multi-manufacturer mandate');
      strategy.is_standard_part_query = false;
    }
  }

  const enriched_query = typeof raw.enriched_query === 'string' && raw.enriched_query.length > 0
    ? raw.enriched_query
    : originalQuery;

  const classification_confidence = typeof raw.classification_confidence === 'number'
    ? Math.min(Math.max(raw.classification_confidence, 0), 1)
    : 0.5;

  const validFollowUpTypes: FollowUpAnswerType[] = ['clarification', 'comparison', 'calculation', 'refined_search', 'new_search'];
  const follow_up_answer_type: FollowUpAnswerType | undefined = intent === 'follow_up'
    ? (validFollowUpTypes.includes(raw.follow_up_answer_type) ? raw.follow_up_answer_type as FollowUpAnswerType : 'clarification')
    : undefined;

  // Deterministically coerce needs_web_search from follow_up_answer_type so the
  // engine routing is consistent with classifier intent regardless of what the LLM
  // produced in the strategy field.
  // clarification/comparison: always answer from cached context — hard false.
  // refined_search/new_search: always need a new search — hard true.
  // calculation: leave as the classifier produced it — the classifier knows whether
  //   the required specs are available in context (false) or must be fetched (true).
  if (follow_up_answer_type) {
    const hardNoWebTypes = new Set<FollowUpAnswerType>(['clarification', 'comparison']);
    const hardWebTypes = new Set<FollowUpAnswerType>(['refined_search', 'new_search']);
    if (hardNoWebTypes.has(follow_up_answer_type)) {
      strategy.needs_web_search = false;
    } else if (hardWebTypes.has(follow_up_answer_type)) {
      strategy.needs_web_search = true;
    }
    // calculation: keep LLM-produced value; it is already guided to output false
    // when specs are available and true when they are missing.
  }

  return {
    intent,
    domain,
    constraints,
    strategy,
    enriched_query,
    classification_confidence,
    follow_up_answer_type,
  };
}

// ============================================================================
// UTILITY — Build context string for the main agent
// ============================================================================

/**
 * Converts a QueryClassification into a concise context block that gets
 * injected into the main agent's instructions. This tells the agent
 * exactly how to behave for this specific query.
 *
 * @param classification - The result from classifyQuery()
 * @returns A text block to append to the agent's system instructions
 *
 * @example
 *   const context = buildAgentContext(classification);
 *   // Returns something like:
 *   // "## QUERY CONTEXT
 *   //  Intent: recommendation (build a complete set)
 *   //  Domain: consumer_electronics
 *   //  Budget: max 4000 EUR
 *   //  ..."
 */
export function buildAgentContext(classification: QueryClassification, previousProductNames: string[] = []): string {
  const lines: string[] = [];

  lines.push('## QUERY CONTEXT (from classifier — adapt your behavior accordingly)');
  lines.push('');

  lines.push(`Intent: ${formatIntent(classification.intent)}`);
  lines.push(`Domain: ${formatDomain(classification.domain)}`);

  if (classification.constraints.budget) {
    lines.push(`Budget: max ${classification.constraints.budget.max} ${classification.constraints.budget.currency} — ALWAYS mention prices and stay within this budget`);
  }

  if (classification.constraints.preferred_brands.length > 0) {
    lines.push(`Preferred brands: ${classification.constraints.preferred_brands.join(', ')} — prioritize these manufacturers`);
  }

  if (classification.constraints.must_be_compatible.length > 0) {
    lines.push(`Compatibility requirements: ${classification.constraints.must_be_compatible.join(', ')} — ensure all products work together`);
  }

  if (classification.constraints.use_case) {
    lines.push(`Use case: ${classification.constraints.use_case}`);
  }

  if (classification.constraints.quantity) {
    lines.push(`Quantity: ${classification.constraints.quantity}`);
  }

  lines.push('');

  if (classification.strategy.is_multi_product_set) {
    lines.push('IMPORTANT: User wants a COMPLETE SET of compatible products. Search for EACH component type separately (e.g., for a PC: GPU, CPU, motherboard, RAM, SSD, PSU, case). Make sure all components are compatible with each other. Include approximate prices if available.');
  }

  if (classification.strategy.requested_part_types.length >= 2) {
    const types = classification.strategy.requested_part_types;
    const typesList = types.map(t => `"${t}"`).join(', ');
    lines.push('');
    lines.push('## MULTI-PART PRODUCT SEARCH (CRITICAL)');
    lines.push(`The user asked for ${types.length} DISTINCT part types in a single query: ${typesList}.`);
    lines.push('Follow these rules exactly:');
    lines.push(`- Run a SEPARATE web search for EACH part type (do not merge them into one search).`);
    lines.push(`- Return roughly 3 product cards per part type — aim for ${Math.min(types.length * 3, 10)} cards total, distributed across the types.`);
    lines.push(`- TAG every product card with the "part_type" field in fluid_data, set to ONE of these exact strings: ${typesList}. The UI uses this string to render per-type section headers — do not invent new labels or alter capitalization.`);
    lines.push('- Do NOT return a bom_table or engineering_notes — this is a multi-part PRODUCT SEARCH, not a BUILD/BOM request.');
    lines.push(`- Open decision_summary with a one-sentence intro paragraph that names each part group, e.g. "Here are options for ${types.join(', ')}.", followed by short per-group reasoning if useful.`);
    lines.push('- If you cannot find good results for one of the part types, still return cards for the other types and briefly note the gap in decision_summary.');
  }

  if (classification.strategy.is_brand_enumeration) {
    const targetBrand = classification.constraints.preferred_brands[0] || '<the brand named in the user query>';
    const cap = classification.strategy.suggested_product_count || 12;
    lines.push('');
    lines.push('## BRAND ENUMERATION MODE (CRITICAL — overrides brand-diversity rules)');
    lines.push(`The user has explicitly asked you to LIST products from a single company: **${targetBrand}**. Treat this as a single-brand catalog listing, not a normal multi-brand product search.`);
    lines.push('Follow these rules exactly:');
    lines.push(`- SUSPEND the "ONE PRODUCT PER MANUFACTURER" / brand-diversity rule. Return MANY DISTINCT MODELS from ${targetBrand} — DO NOT cap at 1 per brand and DO NOT pad the list with other manufacturers.`);
    lines.push(`- Target ${cap} products (acceptable range 8–15, hard cap 20). If ${targetBrand}'s catalog has fewer matching products, return all you can find.`);
    lines.push(`- Restrict your web searches to ${targetBrand}'s official domain using "site:<brand-domain>" queries. Search the brand's product index, category pages, and family pages to discover as many distinct model numbers as possible. Issue MULTIPLE site-restricted searches (e.g., category page → family page → individual product page) — one search is rarely enough to enumerate a catalog.`);
    lines.push(`- Treat any spec phrases in the query (force, stroke, voltage, power, torque, size, etc.) as SOFT PREFERENCES that SORT the list (closest matches first) — they MUST NOT filter out other models. In "interpreted_requirements", mark the brand itself as type="hard" and EVERY spec phrase as type="soft". Do NOT drop a model from the list just because it does not match a spec phrase exactly; instead, keep it and lower its fit_score.`);
    lines.push(`- If ${targetBrand}'s catalog for this product type is too large to fully enumerate (e.g., 30+ models), return the TOP 5 most relevant models AND add ONE short sentence to decision_summary.best_fit (or chat_summary if best_fit is unavailable for this query type) explaining the cap and inviting the user to narrow down — for example: "${targetBrand} offers 40+ ${'<product type>'} models — here are the top 5; ask for a specific size class, force range, or mounting style to see more." This explanation is REQUIRED whenever the list is partial.`);
    lines.push(`- Keep the existing "real product page URL only" and link-validation rules: each card MUST link to the specific model page on ${targetBrand}'s own website (not a category page, not a homepage, not a distributor).`);
    lines.push(`- Do NOT substitute models from other manufacturers. If you cannot find ${targetBrand} products for this category, say so explicitly in decision_summary instead of returning a different brand.`);
  }

  if (classification.strategy.expects_detailed_analysis) {
    lines.push('IMPORTANT: User expects DETAILED ANALYSIS. Explain WHY each product is recommended, compare trade-offs, discuss value for money, and give a clear final recommendation.');
  }

  if (classification.intent === 'build') {
    lines.push('CRITICAL: This is a BUILD query. You MUST respond with a Bill of Materials (BOM) using the bom_table format. Do NOT return individual product cards in the data array. The data array MUST be empty []. You MUST include bom_table (array of parts), bom_summary (explaining WHY each part was selected), and engineering_notes (explaining HOW to combine the proposed parts). Follow the PRODUCT BUILD MODE instructions exactly.');
  }

  if (classification.intent === 'calculation_search') {
    const mode = classification.strategy.calculation_mode || 'size_then_search';
    if (mode === 'search_then_size') {
      lines.push('CRITICAL: This is a CALCULATION_SEARCH query in **search_then_size** mode — the user named a specific product and wants a derived metric of THAT product. Follow the SEARCH-THEN-CALCULATE MODE instructions exactly. STEP 1: web-search the named product and put it as the FIRST card in "data" (plus 1–3 close alternatives). STEP 2: pull the spec values you need from its datasheet, then populate "calculation_section". The "data" array MUST be non-empty AND appear before "calculation_section" in the streamed response. MANDATORY OUTPUT RULE: the worked calculation MUST go in "calculation_section" — writing equations or numeric results into "decision_summary" or "chat_summary" prose is FORBIDDEN for calculation queries.');
    } else {
      lines.push('CRITICAL: This is a CALCULATION_SEARCH query in **size_then_search** mode — the user gave physical inputs and wants the system to size a component, then recommend products. Follow the CALCULATE-THEN-SEARCH MODE instructions exactly. STEP 1: perform the engineering calculation from the user inputs and populate "calculation_section" (this is NON-OPTIONAL — do not skip and do not return only product cards). STEP 2: derive concrete product specs into "derived_specs". STEP 3: web-search using the DERIVED SPECS (not the raw user input) and populate "data" with at least 3 products scored against those derived specs. "calculation_section" MUST be present and MUST appear BEFORE "data" in the streamed response. MANDATORY OUTPUT RULE: the worked calculation MUST go in "calculation_section" — writing equations or numeric results into "decision_summary" or "chat_summary" prose is FORBIDDEN. If any required input is missing, assume a conservative typical value, tag it kind="ai", and still produce a full calculation_section.');
    }
  }

  if (classification.intent === 'comparison') {
    lines.push('IMPORTANT: Focus on COMPARING the specific products mentioned. Create a structured comparison with pros/cons for each.');
  }

  if (classification.intent === 'follow_up') {
    const answerType = classification.follow_up_answer_type || 'clarification';

    lines.push('## FOLLOW-UP CONTEXT RULES (MANDATORY — read before responding)');
    lines.push('');
    lines.push('You are continuing an active conversation. The user is building on previous results. Follow ALL six rules below:');
    lines.push('');
    lines.push('1. UNDERSTAND CONTEXT FIRST — read the full conversation history before answering. Identify which products, datasheets, calculations, or documents the user is referring to.');
    lines.push('2. REUSE PREVIOUS DATA — reuse previously found products, datasheets, PDFs, specifications, and calculations whenever they are relevant. Do NOT discard them or pretend they do not exist.');
    lines.push('3. AVOID REDUNDANT SEARCHES — do NOT run a full new product search unless the user explicitly asks for new products or the needed information is genuinely missing from the conversation context.');
    lines.push('4. CITE YOUR SOURCE — whenever your answer is based on a previously found product or document, state it explicitly (e.g., "Based on the [Product Name] shown earlier…" or "From the [Manufacturer] datasheet retrieved in the previous turn…").');
    lines.push('5. CHOOSE THE RIGHT ANSWER TYPE — reason about what the user actually needs and produce the most useful response format: short clarification, direct factual answer, comparison table, calculation, product recommendation, updated search, or technical explanation.');
    lines.push('6. SEARCH ONLY FOR WHAT IS MISSING — if the previous context is insufficient, continue from it and search ONLY for the specific missing information. Do not restart from scratch.');
    lines.push('');

    if (previousProductNames.length > 0) {
      lines.push(`Previously shown products in this session: ${previousProductNames.join(', ')}`);
      lines.push('');
    }

    const answerTypeInstructions: Record<string, string> = {
      clarification: 'ANSWER TYPE: clarification — The user asks a specific factual question about a previously shown product or result. Answer it directly and concisely using the product context already available. Do NOT run a new web search. Use {"interpreted_requirements": [], "decision_summary": "your direct answer here, citing the product by name", "data": []}.',
      comparison: 'ANSWER TYPE: comparison — The user wants to compare two or more previously shown products. Build a structured comparison table from the specs already available in the conversation. Do NOT run a new web search. Use {"interpreted_requirements": [], "decision_summary": "comparison summary", "data": []} with a comparison_table in the response.',
      calculation: 'ANSWER TYPE: calculation — The user wants a calculation using specs from a previously shown product. Pull the relevant spec values from the product context already available, run the calculation, and show your working. Use {"interpreted_requirements": [], "decision_summary": "calculation result and explanation", "data": []}.',
      refined_search: 'ANSWER TYPE: refined search — The user is narrowing or adjusting the previous search (different spec, filter, or constraint). Run a focused new search using the enriched_query and return updated product cards in the data array. Reference what changed from the previous search in decision_summary.',
      new_search: 'ANSWER TYPE: new search — The user has pivoted to a different product or topic. Run a full new search for the new topic and return product cards in the data array.',
    };

    lines.push(answerTypeInstructions[answerType] || answerTypeInstructions.clarification);
    lines.push('CRITICAL FORMAT REQUIREMENT: You MUST return valid JSON at all times. NEVER return plain text or markdown outside of JSON.');
  }

  if (classification.intent === 'explanation') {
    lines.push('IMPORTANT: User wants an EXPLANATION, not product cards. You MUST use web search to find accurate, detailed technical information — do NOT rely on conversation history alone, as it only contains brief summaries. Search for the specific product page, datasheet, or technical documentation to get precise specs and data. If the user asks for "all technical data" or "full specs" about a product, search for "[manufacturer] [model] specifications" or "[manufacturer] [model] datasheet" and extract the detailed information. NEVER say you don\'t have cached data or cannot read a PDF — always re-search to find the information.');
    lines.push('CRITICAL FORMAT REQUIREMENT: You MUST return valid JSON. Use {"interpreted_requirements": [], "decision_summary": "your explanation here", "data": []}. NEVER return plain text or markdown outside of JSON.');
    // Extra instruction for formula/equation knowledge queries
    lines.push('FORMULA QUERIES — when the user is asking for formulas, equations, derivations, or how something is mathematically defined (e.g. "find all formulas for X", "list the equations for Y", "what is the formula for Z"), structure your decision_summary response as follows:\n1. Open with a brief 1-sentence context of what standard or method the formulas come from.\n2. For each key formula, use a bold section heading (e.g. **Basic Life Formula**) followed by a display-math block \\[...\\] for the equation itself.\n3. Below each formula, add a short bullet list defining each symbol using inline math \\(...\\) for the variable and a plain-text description with its unit.\n4. Group related formulas under sub-headings (e.g. **Reliability Adjustment**, **Variable Definitions**).\n5. End with a **References** section listing the applicable standards or sources (e.g. ISO 281:2007, DIN 26281, the original author or publication year) with a URL when one is available from your web search.\nDo NOT embed product cards (data: []) for formula queries — keep data: [].');
  }

  if (classification.intent === 'general_chat') {
    lines.push('TONE — GENERAL CHAT: This is a casual or conversational message. Reply like a knowledgeable friend who genuinely enjoys what they do: warm, direct, and a touch enthusiastic — never corporate or robotic. Keep it short (2–4 sentences). You can mention what you can help with, but weave it in naturally — not as a bullet-point disclaimer list. Match the user\'s energy: casual gets casual, curious gets engaged. Skip hollow openers like "Certainly!", "Of course!", "Sure thing!" — just talk. If they ask something clearly not product-related, give a friendly one-liner and naturally steer toward what you\'re great at. Show some personality.');
  }

  if (classification.strategy.needs_clarification) {
    lines.push('CRITICAL: The user\'s query is TOO VAGUE. You MUST ask a clarifying question before searching. Do NOT search or return products. Instead, respond with a helpful message asking the user to provide more details. Mention specific parameters they should include (e.g., force, speed, size, voltage, application, material, budget). Be friendly and specific about what information would help you find the best results.');
    if (classification.strategy.clarification_reason) {
      lines.push(`Reason for clarification: ${classification.strategy.clarification_reason}`);
    }
  }

  const expertPersona = getExpertPersona(classification.domain);
  if (expertPersona) {
    lines.push('');
    lines.push(expertPersona);
  }

  lines.push('');
  lines.push(`Enriched search query: "${classification.enriched_query}"`);
  lines.push(`Suggested number of products to return: ${classification.strategy.suggested_product_count}`);

  if (classification.strategy.response_tone === 'advisory') {
    lines.push('Tone: Advisory — speak as a knowledgeable consultant giving recommendations');
  } else if (classification.strategy.response_tone === 'conversational') {
    lines.push('Tone: Conversational — be friendly and approachable');
  } else {
    lines.push('Tone: Technical — be precise and specification-focused');
  }

  return lines.join('\n');
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

function formatIntent(intent: QueryIntent): string {
  const descriptions: Record<QueryIntent, string> = {
    product_search: 'Product search — find and return specific products',
    build: 'Build mode — user wants to BUILD something, return a Bill of Materials (BOM) with parts list',
    calculation_search: 'Calculation-first search — perform engineering calculation, then find products matching derived specs',
    comparison: 'Comparison — compare specific products side by side',
    explanation: 'Explanation — explain a concept, no product search needed',
    recommendation: 'Recommendation — advise which products to choose',
    follow_up: 'Follow-up — continuing previous conversation',
    general_chat: 'General chat — greeting or meta-question',
    off_topic: 'Off-topic — not related to products or components',
  };
  return descriptions[intent] || intent;
}

function formatDomain(domain: QueryDomain): string {
  const descriptions: Record<QueryDomain, string> = {
    mechanical: 'Mechanical (gearboxes, bearings, shafts, power transmission)',
    electrical: 'Electrical (motors, drives, PLCs, power systems)',
    electronics: 'Electronics (microcontrollers, sensors, embedded systems)',
    software: 'Software (platforms, APIs, enterprise solutions)',
    materials: 'Materials (metals, polymers, composites, coatings)',
    energy: 'Energy (solar, batteries, inverters, storage)',
    medical: 'Medical (devices, instruments, diagnostics)',
    construction: 'Construction (structural, HVAC, building materials)',
    consumer_electronics: 'Consumer electronics (GPUs, CPUs, monitors, peripherals)',
    automotive: 'Automotive (engine, suspension, brakes, EV components)',
    robotics: 'Robotics (servos, controllers, arms, grippers)',
    chemical: 'Chemical process (pumps, valves, reactors, instrumentation)',
    aerospace: 'Aerospace (avionics, composites, lightweight structures)',
    industrial: 'Industrial (general manufacturing, automation, conveyors)',
    patents: 'Patents (Google Patents, Espacenet, PATENTSCOPE — IP filings, prior art, patent families)',
    general: 'General / mixed domain',
  };
  return descriptions[domain] || domain;
}
