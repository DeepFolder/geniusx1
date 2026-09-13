/**
 * ============================================================================
 * MANUFACTURER DISCOVERY
 * ============================================================================
 *
 * Two-agent search architecture — Step 1:
 *
 * Before the main AI Expert Agent searches for products, this module runs a
 * fast GPT-5.1 call that acts as the "Master Agent". It:
 *
 *   1. Identifies the TOP 5 most reliable and reputable manufacturers for the
 *      product category using deep domain knowledge.
 *   2. Detects explicit user overrides — if the user asks to search a specific
 *      distributor, online shop, or URL, that takes priority over the
 *      manufacturer constraint.
 *
 * The result is passed to executeAgentSearch which injects it as mandatory
 * search constraints: "Search ONLY within site:domain.com for each company."
 *
 * PERFORMANCE:
 * - Uses gpt-5.1 for strong domain knowledge
 * - Runs in parallel with DB search and classifier (no serial latency)
 * - Fast focused call (~1-2s) with a strict timeout
 *
 * FOLDER LOCATION: server/features/hybrid-search/agents/manufacturer-discovery.ts
 * ============================================================================
 */

import OpenAI from 'openai';

const DISCOVERY_MODEL = 'gpt-5.1';
const DISCOVERY_TIMEOUT_MS = 8000;

// Known distributor / online-shop domains — used only with EXPLICIT intent phrases
const KNOWN_DISTRIBUTOR_PATTERNS: Array<{ name: string; domains: string[] }> = [
  { name: 'DigiKey', domains: ['digikey.com', 'digikey'] },
  { name: 'Mouser', domains: ['mouser.com', 'mouser'] },
  { name: 'RS Components', domains: ['rs-online.com', 'rs-components.com', 'rsonline', 'rscomponents'] },
  { name: 'Farnell', domains: ['farnell.com', 'element14.com', 'farnell', 'element14'] },
  { name: 'Arrow', domains: ['arrow.com'] },
  { name: 'Avnet', domains: ['avnet.com'] },
  { name: 'Amazon', domains: ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon'] },
  { name: 'eBay', domains: ['ebay.com', 'ebay'] },
  { name: 'AliExpress', domains: ['aliexpress.com', 'aliexpress'] },
  { name: 'Alibaba', domains: ['alibaba.com', 'alibaba'] },
  { name: 'McMaster-Carr', domains: ['mcmaster.com', 'mcmaster'] },
  { name: 'Grainger', domains: ['grainger.com', 'grainger'] },
  { name: 'MSC Direct', domains: ['mscdirect.com', 'mscdirect', 'msc direct'] },
  { name: 'Zoro', domains: ['zoro.com', 'zoro'] },
  { name: 'Fastenal', domains: ['fastenal.com', 'fastenal'] },
  { name: 'Reichelt', domains: ['reichelt.de', 'reichelt'] },
  { name: 'TME', domains: ['tme.eu', 'tme.com', ' tme '] },
  { name: 'Distrelec', domains: ['distrelec.com', 'distrelec'] },
  { name: 'Conrad', domains: ['conrad.com', 'conrad.de', 'conrad'] },
  { name: 'SparkFun', domains: ['sparkfun.com', 'sparkfun'] },
  { name: 'Adafruit', domains: ['adafruit.com', 'adafruit'] },
  { name: 'Newark', domains: ['newark.com', 'newark'] },
  { name: 'Newegg', domains: ['newegg.com', 'newegg'] },
  { name: 'Jameco', domains: ['jameco.com', 'jameco'] },
  { name: 'AutomationDirect', domains: ['automationdirect.com', 'automationdirect'] },
  { name: 'ThomasNet', domains: ['thomasnet.com', 'thomasnet'] },
  { name: 'Octopart', domains: ['octopart.com', 'octopart'] },
  { name: 'FindChips', domains: ['findchips.com', 'findchips'] },
];

// ============================================================================
// TYPES
// ============================================================================

export interface DiscoveredManufacturer {
  name: string;
  domain: string;
  tier: 1 | 2 | 3;
  reason: string;
}

export interface DiscoveryUsage {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
}

export interface ManufacturerDiscoveryResult {
  manufacturers: DiscoveredManufacturer[];
  userOverride: boolean;
  overrideSite?: string;
  overrideReason?: string;
  searchScope: 'manufacturers' | 'user_specified';
  domain_used: string;
  _usage?: DiscoveryUsage;
}

// Default fallback used when discovery fails or times out
export const DEFAULT_MANUFACTURER_RESULT: ManufacturerDiscoveryResult = {
  manufacturers: [],
  userOverride: false,
  searchScope: 'manufacturers',
  domain_used: 'general',
};

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const DISCOVERY_SYSTEM_PROMPT = `You are an expert industrial procurement specialist and domain expert. Your task is to analyze a product search query and identify the TOP 5 most reputable, reliable manufacturers for that specific product type.

You MUST return valid JSON matching this exact structure:

{
  "user_override": false,
  "override_site": "",
  "override_reason": "",
  "manufacturers": [
    { "name": "Manufacturer Name", "domain": "manufacturer.com", "tier": 1, "reason": "Why this is the best source" },
    { "name": "Manufacturer Name", "domain": "manufacturer.com", "tier": 1, "reason": "Why this is the best source" },
    { "name": "Manufacturer Name", "domain": "manufacturer.com", "tier": 2, "reason": "Why this is the best source" },
    { "name": "Manufacturer Name", "domain": "manufacturer.com", "tier": 2, "reason": "Why this is the best source" },
    { "name": "Manufacturer Name", "domain": "manufacturer.com", "tier": 3, "reason": "Why this is the best source" }
  ]
}

FIELD DEFINITIONS:
- user_override: true ONLY if the user EXPLICITLY asked to search a specific distributor, online shop, or specific URL (e.g., "find on DigiKey", "search Amazon", "check rs-components.com")
- override_site: the distributor/shop domain the user specified (e.g., "digikey.com"), empty if no override
- override_reason: brief explanation of the override, empty if no override
- manufacturers: array of EXACTLY 5 manufacturers, ordered by relevance and reputation
- name: the manufacturer's official company name (not a distributor)
- domain: the manufacturer's official website domain (e.g., "bosch-rexroth.com"), NOT a distributor
- tier: 1 = best-fit specialist (top source for this specific product — may be a small specialist, not necessarily a large company), 2 = category specialist (strong focus on this exact product type), 3 = reputable source (reliable for this product)
- reason: 1 sentence explaining why this manufacturer is a top choice for this specific product

CRITICAL RULES:
1. Only select MANUFACTURERS — companies that design and build the product. NEVER select distributors (DigiKey, Mouser, Amazon, RS Components, Grainger, etc.)
2. Choose manufacturers based on their ACTUAL PRODUCT PORTFOLIO for the specific type requested. Do not pick companies that don't make that specific product.
3. Tier 1: The BEST source for this specific product — this may be a small specialist company if they are the dominant supplier for this product type. A Tier 1 is determined by specialization and product fit, NOT by company revenue or overall size. A niche specialist (e.g., Seeger-Orbis for circlips, Smalley for wave springs) outranks a large conglomerate that sells the product as a minor catalog item.
4. Tier 2: Specialized manufacturers with strong reputation in this exact product category — again, prefer specialists over generalist industrial giants
5. Tier 3: Reputable specialists or regional leaders for this specific product — still prefer dedicated product-line manufacturers over large companies where this product is peripheral
6. Use the OFFICIAL manufacturer domain — the website where you would find the product page directly
7. Include the full domain including subdomain if needed (e.g., "boschrexroth.com" not "bosch.com")
8. CRITICAL: For commodity or precision components (fasteners, circlips, retaining rings, bearings, seals, springs, washers, pins, bushings, etc.), prefer SPECIALIST manufacturers over large industrial conglomerates. A company like Siemens or ABB does not sell standalone fasteners — choose the actual specialist (e.g., Seeger-Orbis, Smalley, Rotor Clip for retaining rings; SKF, NSK, FAG for bearings; Freudenberg, Parker for seals).
9. CRITICAL: If the query mentions a geographic constraint (e.g., "European companies", "German manufacturers", "from the US"), respect that constraint — return manufacturers from that region.
10. CRITICAL — SPECIFICATION-RANGE VERIFICATION: When the query contains a numerical specification (force, load, power, pressure, flow rate, temperature, voltage, current, torque, accuracy, bore size, speed, or any other measurable parameter), you MUST verify that each manufacturer you select actually produces products that COVER that specification level. Do not select a manufacturer simply because they make the product category — confirm they manufacture at the stated scale. A manufacturer whose entire product line tops out well below the required specification is not a valid source and wastes a search slot.

Examples of what to avoid:
- Query asks for 30 kN force — do not select a manufacturer whose actuator line maxes out at 5-8 kN
- Query asks for 500 kW motor — do not select a manufacturer that only makes fractional-horsepower motors
- Query asks for 400 bar pressure rating — do not select a manufacturer whose products stop at 200 bar
- Query asks for sub-micron positioning accuracy — do not select a manufacturer that only makes standard industrial grade equipment

Apply this verification for all industries and all product types. Use your domain knowledge to assess whether the manufacturer's actual product range reaches the specification level before including them.

## PARAMETRIC RANGE REFERENCE — use this to validate manufacturer selection when the query contains a numerical spec

**Electromechanical linear actuators by peak force:**
- ≤ 5 kN (light duty): TiMOTION, Progressive Automations, Thomson Electrak light, LINAK LA/LA36
- 5–15 kN (medium duty): LINAK HC/HB series, Thomson Electrak HD, Ewellix CAHB, Tolomatic RSA
- 15–50 kN (heavy duty): Ewellix EMA-80, Bosch Rexroth EMC/CKK, Parker ETH, Tolomatic ERD/MXE, Thomson MAX-Series, SKF Helios
- 50+ kN (ultra-heavy): Bosch Rexroth EME, Parker EHS, Tolomatic TRD, Exlar/Curtiss-Wright GSX, Rollon NEO

**Electric motors by continuous shaft power:**
- < 1 kW: Maxon, Faulhaber, Portescap, Oriental Motor, Nanotec
- 1–10 kW: ABB, Siemens, WEG, Nidec, Leroy-Somer, SEW-Eurodrive
- 10–200 kW: ABB, Siemens, WEG, Nidec, Leroy-Somer, SEW-Eurodrive, Toshiba
- 200+ kW: ABB, Siemens, GE Vernova, WEG, Toshiba, Hyundai Electric

**Hydraulic systems (cylinders/valves/pumps) by working pressure:**
- < 100 bar: Bosch Rexroth, Parker, Eaton, SMC, Festo (pneumatic-range)
- 100–350 bar: Parker, Bosch Rexroth, Eaton, Danfoss, Hydac, Moog
- 350–700 bar: Parker, Bosch Rexroth, Eaton, Enerpac, Hawe, Moog
- 700+ bar (ultra-high): Enerpac, Actuant, SPX Flow, Parker ultra-high pressure division

**Pneumatic cylinders / actuators by bore/force:**
- < 32 mm bore (< 2 kN): SMC, Festo, Parker, Norgren, Airtac
- 32–100 mm bore: SMC, Festo, Parker, Norgren, Airtac, Bimba, CKD
- 100–250 mm bore: Festo, Parker, Bosch Rexroth, PHD, Bimba, SMC heavy series
- > 250 mm bore: Parker, Bosch Rexroth, Bimba custom, PHD, Bansbach

**Servo drives / servo motors by peak torque:**
- < 5 Nm: Maxon, Faulhaber, Kollmorgen, Beckhoff, Elmo
- 5–50 Nm: Kollmorgen, Beckhoff, Yaskawa, Mitsubishi, Siemens Simotics, Parker, Bosch Rexroth
- 50–500 Nm: Yaskawa, Fanuc, Beckhoff, Siemens, ABB, Bosch Rexroth, Rockwell
- 500+ Nm: Bosch Rexroth, Siemens, ABB, Fanuc, Kuka (robot joint class)

**Bearings by dynamic load rating (C):**
- < 20 kN: SKF, NSK, FAG/Schaeffler, NTN, INA (standard catalog range — all brands)
- 20–100 kN: SKF, NSK, FAG, NTN, Timken, Koyo, ZKL
- 100+ kN: SKF, FAG, Timken, NTN, Rotek (slewing rings), IMO

**Ball screws / lead screws by dynamic load:**
- < 10 kN: Hiwin, NSK, THK, Bosch Rexroth, PMI, TBI Motion
- 10–100 kN: Hiwin, NSK, THK, Bosch Rexroth, Schaeffler INA, PMI
- 100+ kN: Bosch Rexroth, NSK Mega-T, THK HTF series, Steinmeyer

If the query's spec falls into a range above, select manufacturers from THAT range or higher — never from a lighter-duty range below the requirement.

USER OVERRIDE DETECTION:
Set user_override=true ONLY when the user EXPLICITLY mentions:
- A specific distributor name: "DigiKey", "Mouser", "Amazon", "RS Components", "Farnell", "Grainger", etc.
- A specific URL or website to search
- Phrases like "find it on X", "search X", "check X website", "look on X"
Do NOT set user_override=true just because the user wants a product — they're always searching, but normally through manufacturers.`;

// ============================================================================
// LIGHTWEIGHT DOMAIN DETECTOR (keyword-based, zero API calls)
// Used to pass an initial domain hint to discovery when running parallel
// with the classifier.
// ============================================================================

const DOMAIN_KEYWORDS: Array<{ domain: string; keywords: string[] }> = [
  { domain: 'mechanical', keywords: ['gear', 'gearbox', 'bearing', 'shaft', 'coupling', 'belt', 'chain', 'sprocket', 'pulley', 'screw', 'bolt', 'nut', 'spring', 'cylinder', 'piston', 'hydraulic', 'pneumatic', 'valve', 'pump', 'compressor', 'actuator', 'linear actuator', 'servo motor', 'stepper motor', 'dc motor', 'motor', 'retaining ring', 'circlip', 'snap ring', 'seeger ring', 'seeger', 'e-clip', 'c-clip', 'din 471', 'din 472', 'din471', 'din472', 'washer', 'shim', 'pin', 'dowel', 'dowel pin', 'key', 'keyway', 'spline', 'bushing', 'bush', 'sleeve', 'collet', 'chuck', 'clamp', 'locknut', 'lock nut', 'lockwasher', 'lock washer', 'grub screw', 'set screw', 'o-ring', 'o ring', 'seal', 'gasket', 'thrust washer', 'circlip pliers', 'tolerance ring', 'wave spring', 'disc spring', 'belleville', 'compression spring', 'extension spring', 'torsion spring', 'linear guide', 'rail', 'lead screw', 'ball screw', 'thread', 'flange', 'hub', 'bore', 'keyway', 'hexagonal', 'hex bolt', 'hex nut', 'socket head', 'din 912', 'din 933', 'metric bolt', 'metric screw', 'metric nut'] },
  { domain: 'electrical', keywords: ['relay', 'contactor', 'circuit breaker', 'fuse', 'transformer', 'power supply', 'ups', 'inverter', 'vfd', 'frequency drive', 'plc', 'hmi', 'cable', 'wire', 'connector', 'terminal'] },
  { domain: 'electronics', keywords: ['microcontroller', 'arduino', 'raspberry', 'mcu', 'microprocessor', 'fpga', 'capacitor', 'resistor', 'transistor', 'diode', 'ic', 'pcb', 'sensor', 'imu', 'accelerometer', 'gyroscope', 'lidar', 'camera module'] },
  { domain: 'robotics', keywords: ['robot', 'robotic', 'cobot', 'arm', 'gripper', 'end effector', 'ros', 'autonomous', 'drone', 'uav'] },
  { domain: 'automotive', keywords: ['car', 'vehicle', 'automotive', 'brake', 'suspension', 'exhaust', 'engine', 'transmission', 'axle', 'tire', 'wheel', 'clutch', 'alternator'] },
  { domain: 'aerospace', keywords: ['aerospace', 'aviation', 'aircraft', 'satellite', 'rocket', 'propulsion', 'navigation', 'avionics'] },
  { domain: 'medical', keywords: ['medical', 'surgical', 'diagnostic', 'implant', 'prosthetic', 'ultrasound', 'mri', 'xray', 'infusion', 'ventilator'] },
  { domain: 'construction', keywords: ['construction', 'structural', 'concrete', 'steel', 'beam', 'rebar', 'pipe', 'fitting', 'hvac', 'plumbing'] },
  { domain: 'materials', keywords: ['material', 'alloy', 'aluminum', 'aluminium', 'stainless', 'titanium', 'polymer', 'composite', 'carbon fiber', 'resin', 'adhesive', 'coating'] },
  { domain: 'energy', keywords: ['solar', 'wind', 'battery', 'energy storage', 'fuel cell', 'generator', 'turbine', 'power', 'renewable'] },
  { domain: 'industrial', keywords: ['industrial', 'manufacturing', 'automation', 'conveyor', 'machine', 'press', 'lathe', 'cnc', 'mill', 'welding'] },
];

// Patent intent is unusually easy to detect from a small set of phrases.
// Detecting it without an LLM call lets the parallel manufacturer discovery
// run with the Patents Research Specialist persona prompt immediately,
// instead of waiting for the classifier round-trip to confirm the domain.
// The classifier still runs and can override this for ambiguous queries.
const PATENT_PHRASE_REGEX = /\b(?:patent(?:s|ed|ing)?|prior\s+art|intellectual\s+property|ip\s+filings?|patent\s+numbers?|patent\s+claims?|patent\s+famil(?:y|ies)|freedom[-\s]to[-\s]operate|espacenet|patentscope|google\s+patents|uspto|wipo)\b/i;
// Common patent publication number formats. The two alternatives are tight on
// purpose so that incidental phrases like "US 2024 market" or "in CN 2023"
// (country code + 4-digit year) do not get misread as patent numbers:
//   1. WIPO-style with year + serial separated by `/`:  WO2023/123456,
//      WO 2023/123456, US 2023/0123456, EP 2023/0012345
//   2. Flat publication numbers with at least 6 digits:  US20230123456,
//      EP1234567, CN112345678A, DE102023123456 (kind-code suffix allowed)
const PATENT_NUMBER_REGEX = /\b(?:(?:WO|US|EP|CN|JP|KR|DE|GB)\s?\d{4}\/\d{3,}|(?:WO|US|EP|CN|JP|KR|DE|GB)\s?\d{6,}[A-Z]?\d?)\b/i;

export function detectDomainHeuristic(query: string): import('./query-classifier').QueryDomain {
  const lower = query.toLowerCase();

  // Patents take precedence over keyword scoring because the patent phrases are
  // strong, unambiguous signals and would otherwise tie or lose to incidental
  // overlaps like "battery", "actuator", or "aluminum" mentioned in the query.
  if (PATENT_PHRASE_REGEX.test(query) || PATENT_NUMBER_REGEX.test(query)) {
    return 'patents' as import('./query-classifier').QueryDomain;
  }

  const scores: Record<string, number> = {};
  for (const { domain, keywords } of DOMAIN_KEYWORDS) {
    scores[domain] = keywords.filter(kw => lower.includes(kw)).length;
  }
  const best = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
  const detected = (best && best[1] > 0) ? best[0] : 'general';
  return detected as import('./query-classifier').QueryDomain;
}

// ============================================================================
// USER OVERRIDE DETECTION (quick heuristic before calling the model)
// ============================================================================

function detectUserOverrideHeuristic(query: string): { override: boolean; site: string } {
  // Check for explicit URL in the query — always an override
  const urlMatch = query.match(/https?:\/\/([^/\s]+)/i);
  if (urlMatch) {
    return { override: true, site: urlMatch[1] };
  }

  // Only trigger override on EXPLICIT intent phrases ("find on X", "search on X", etc.)
  // These patterns require a verb of intent followed by the site name
  const explicitIntentPatterns = [
    /\bfind (?:it |this |them )?on ([a-z0-9][a-z0-9.-]*)/i,
    /\bsearch (?:on |through |via )?([a-z0-9][a-z0-9.-]*)/i,
    /\bcheck (?:on )?([a-z0-9][a-z0-9.-]*)/i,
    /\blook (?:on |at )([a-z0-9][a-z0-9.-]*)/i,
    /\bbuy (?:it |this )?(?:on|from|at) ([a-z0-9][a-z0-9.-]*)/i,
    /\bsource (?:it |this )?(?:on|from|at|via) ([a-z0-9][a-z0-9.-]*)/i,
    /\buse ([a-z0-9][a-z0-9.-]*) (?:to find|for this)/i,
    /\bon ([a-z0-9][a-z0-9.-]*\.(?:com|de|co\.uk|eu|net|org))\b/i,
  ];

  for (const pattern of explicitIntentPatterns) {
    const m = query.match(pattern);
    if (m) {
      const candidate = m[1].toLowerCase().trim().replace(/[.,!?]+$/, '');

      // First: check known distributor patterns (exact match)
      for (const dist of KNOWN_DISTRIBUTOR_PATTERNS) {
        if (dist.domains.some(d => candidate === d || candidate.includes(d.replace(/[. ]/g, '')))) {
          const siteHint = dist.domains.find(d => d.includes('.')) || dist.name.toLowerCase().replace(/\s/g, '') + '.com';
          return { override: true, site: siteHint };
        }
      }

      // Fallback: accept any explicit domain directive (e.g., "search on mycompany.com")
      // A domain must contain a dot and a recognizable TLD to be valid
      const domainPattern = /^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2})?$/;
      if (domainPattern.test(candidate)) {
        return { override: true, site: candidate };
      }
    }
  }

  return { override: false, site: '' };
}

// ============================================================================
// MAIN DISCOVERY FUNCTION
// ============================================================================

export async function discoverManufacturers(
  query: string,
  domain: string,
  enrichedQuery?: string,
  expertPersonaName?: string,
  recentHistory?: Array<{ role: string; content: string }>
): Promise<ManufacturerDiscoveryResult> {
  // Fast heuristic check first — avoids LLM call if obviously a user override
  const heuristic = detectUserOverrideHeuristic(query);
  if (heuristic.override) {
    console.log(`🔀 [ManufacturerDiscovery] User override detected (heuristic): ${heuristic.site}`);
    return {
      manufacturers: [],
      userOverride: true,
      overrideSite: heuristic.site,
      overrideReason: 'User explicitly requested this source',
      searchScope: 'user_specified',
      domain_used: domain,
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ [ManufacturerDiscovery] No API key — returning empty manufacturer list');
    return { ...DEFAULT_MANUFACTURER_RESULT, domain_used: domain };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const startTime = Date.now();

  const personaLine = expertPersonaName ? `\nExpert domain persona: ${expertPersonaName}` : '';

  // Build history context from the last 2 user messages (not the current query)
  // This is critical for follow-up queries like "search companies from Europe only"
  // where the current query alone has no product context.
  let historyLine = '';
  if (recentHistory && recentHistory.length > 0) {
    const prevUserMessages = recentHistory
      .filter(m => m.role === 'user')
      .slice(-2)
      .map(m => m.content.trim())
      .filter(c => c.length > 0);
    if (prevUserMessages.length > 0) {
      historyLine = `\nPrevious user queries (for context): ${prevUserMessages.map(q => `"${q}"`).join(' → ')}`;
    }
  }

  // ── Parametric spec-floor extraction ──────────────────────────────────────
  // Detect any hard numerical spec in the query so it can be surfaced prominently
  // in the user message. This prevents the LLM from picking light-duty brands when
  // the user specifies a high-spec requirement (e.g. "30 kN force actuator").
  const specFloorLine = (() => {
    const q = `${query} ${enrichedQuery || ''}`.toLowerCase();
    // Patterns: "<number> <unit>" covering the most common primary dimensional specs
    const patterns: Array<{ re: RegExp; label: string }> = [
      { re: /(\d+(?:[.,]\d+)?)\s*kn\b/,        label: 'kN force/load' },
      { re: /(\d+(?:[.,]\d+)?)\s*n\b(?!m)/,    label: 'N force/load' },
      { re: /(\d+(?:[.,]\d+)?)\s*kw\b/,        label: 'kW power' },
      { re: /(\d+(?:[.,]\d+)?)\s*mw\b/,        label: 'MW power' },
      { re: /(\d+(?:[.,]\d+)?)\s*nm\b/,        label: 'Nm torque' },
      { re: /(\d+(?:[.,]\d+)?)\s*knm\b/,       label: 'kNm torque' },
      { re: /(\d+(?:[.,]\d+)?)\s*bar\b/,       label: 'bar pressure' },
      { re: /(\d+(?:[.,]\d+)?)\s*psi\b/,       label: 'psi pressure' },
      { re: /(\d+(?:[.,]\d+)?)\s*mpa\b/,       label: 'MPa pressure' },
      { re: /(\d+(?:[.,]\d+)?)\s*rpm\b/,       label: 'RPM speed' },
      { re: /(\d+(?:[.,]\d+)?)\s*(?:l\/min|lpm|liters?\/min)/,  label: 'L/min flow' },
      { re: /(\d+(?:[.,]\d+)?)\s*(?:m3\/h|m³\/h|m3h)/,         label: 'm³/h flow' },
      { re: /(\d+(?:[.,]\d+)?)\s*a\b(?!.*voltage)/,             label: 'A current' },
      { re: /(\d+(?:[.,]\d+)?)\s*ka\b/,        label: 'kA current' },
      { re: /(\d+(?:[.,]\d+)?)\s*kv\b/,        label: 'kV voltage' },
    ];
    const hits: string[] = [];
    for (const { re, label } of patterns) {
      const m = q.match(re);
      if (m) hits.push(`${m[1]} ${label}`);
    }
    if (hits.length === 0) return '';
    return `\n\n⚠️ PARAMETRIC SPEC FLOOR DETECTED: ${hits.join(', ')}. BEFORE selecting any manufacturer, verify that their product catalog ACTUALLY REACHES this specification. Check the PARAMETRIC RANGE REFERENCE in your instructions and select manufacturers whose products cover this level. Manufacturers whose maximum rated output falls below this requirement MUST be excluded.`;
  })();

  const userMessage = `Product domain: ${domain}${personaLine}${historyLine}
Current query: "${query}"${enrichedQuery && enrichedQuery !== query ? `\nEnriched/full search query: "${enrichedQuery}"` : ''}${specFloorLine}

Identify the top 5 manufacturers for this product type and check if the user is requesting a specific distributor or site.
IMPORTANT: Use ALL context above (current query + previous queries) to determine the actual product being searched. If the current query is a refinement or follow-up (e.g., "from Europe only"), use the previous queries to determine the product type.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

    const response = await client.chat.completions.create({
      model: DISCOVERY_MODEL,
      messages: [
        { role: 'system', content: DISCOVERY_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_completion_tokens: 800,
      response_format: { type: 'json_object' },
    }, { signal: controller.signal });

    clearTimeout(timeout);

    const duration = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.warn('⚠️ [ManufacturerDiscovery] Empty response — using no constraints');
      return { ...DEFAULT_MANUFACTURER_RESULT, domain_used: domain };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn('⚠️ [ManufacturerDiscovery] JSON parse failed — using no constraints');
      return { ...DEFAULT_MANUFACTURER_RESULT, domain_used: domain };
    }

    const userOverride = Boolean(parsed.user_override);
    const overrideSite = parsed.override_site || '';
    const overrideReason = parsed.override_reason || '';

    const usageInfo = {
      model: DISCOVERY_MODEL,
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
      duration_ms: duration,
    };

    if (userOverride && overrideSite) {
      console.log(`🔀 [ManufacturerDiscovery] User override (LLM): searching ${overrideSite} (${duration}ms)`);
      return {
        manufacturers: [],
        userOverride: true,
        overrideSite,
        overrideReason,
        searchScope: 'user_specified',
        domain_used: domain,
        _usage: usageInfo,
      };
    }

    const manufacturers: DiscoveredManufacturer[] = (parsed.manufacturers || [])
      .filter((m: any) => m.name && m.domain)
      .slice(0, 5)
      .map((m: any) => ({
        name: m.name,
        domain: m.domain.replace(/^https?:\/\//, '').replace(/\/.*/, '').trim(),
        tier: [1, 2, 3].includes(m.tier) ? m.tier : 2,
        reason: m.reason || '',
      }));

    const names = manufacturers.map(m => m.name).join(', ');
    console.log(`🏭 [ManufacturerDiscovery] Top manufacturers for "${domain}" query: [${names}] (${duration}ms, ${DISCOVERY_MODEL})`);

    return {
      manufacturers,
      userOverride: false,
      searchScope: 'manufacturers',
      domain_used: domain,
      _usage: usageInfo,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn(`⚠️ [ManufacturerDiscovery] Timed out after ${DISCOVERY_TIMEOUT_MS}ms — proceeding without manufacturer constraints`);
    } else {
      console.warn(`⚠️ [ManufacturerDiscovery] Error: ${err?.message} — proceeding without manufacturer constraints`);
    }
    return { ...DEFAULT_MANUFACTURER_RESULT, domain_used: domain };
  }
}
