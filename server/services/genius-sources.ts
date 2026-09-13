export type SourceTier = "standard" | "handbook" | "manufacturer" | "academic" | "general" | "unknown";

const TIER_WEIGHTS: Record<SourceTier, number> = {
  standard: 1.0,
  handbook: 0.9,
  academic: 0.85,
  manufacturer: 0.8,
  general: 0.5,
  unknown: 0.2,
};

const STANDARD_DOMAINS = [
  "iso.org", "astm.org", "asme.org", "ieee.org", "nist.gov", "bsigroup.com",
  "din.de", "en-standard.eu", "ansi.org", "iec.ch", "api.org", "asce.org",
  "awwa.org", "ashrae.org", "aia.org", "aisc.org", "aws.org", "sae.org",
  "ul.com", "csagroup.org", "nsf.org", "aatcc.org", "tappi.org",
];

const STANDARD_KEYWORDS = [
  "iso ", "iso-", "astm ", "astm-", "asme ", "ieee ", "nist ", "bsi ",
  "din ", "en ", "ansi ", "iec ", "api std", "asce ", "aws d", "sae j",
  "bs ", "ul std", " standard", "code of practice", "specification",
];

const HANDBOOK_KEYWORDS = [
  "shigley", "machinery's handbook", "machinery handbook", "perry's",
  "perry chemical", "roark", "marks' standard", "marks standard",
  "norton machine design", "engineering fundamentals",
  "timoshenko", "young's", "young's formulae", "oberg", "jones",
  "fundamentals of engineering", "engineering design",
  "steel construction manual", "aisc manual",
];

const MANUFACTURER_DOMAINS = [
  "skf.com", "schaeffler.com", "ina.com", "fag.com",
  "boschrexroth.com", "parker.com", "eaton.com", "smc.eu", "smc.com",
  "ab.com", "rockwellautomation.com", "siemens.com", "bosch.com",
  "nsk.com", "timken.com", "koyo.com", "ntn.com",
  "gates.com", "gates-rubber.com", "optibelt.com", "dunlop.com",
  "misumi.com", "misumiusa.com", "mcmaster.com", "grainger.com",
  "norgren.com", "festo.com", "sew-eurodrive.com",
  "lintech.com", "hiwin.com", "thk.com",
];

const MANUFACTURER_KEYWORDS = [
  "technical guide", "design guide", "application guide", "product catalog",
  "engineering data", "technical data", "selection guide", "bearing catalog",
  "installation manual", "maintenance manual", "technical specification",
];

const ACADEMIC_DOMAINS = [
  "sciencedirect.com", "springer.com", "springerlink.com", "doi.org",
  "researchgate.net", "academia.edu", "jstor.org", "tandfonline.com",
  "wiley.com", "cambridge.org", "oxfordjournals.org", "nature.com",
  "scopus.com", "acs.org", "aip.org", "ascelibrary.org",
  "scholar.google.com", "semanticscholar.org", "pubmed.ncbi.nlm.nih.gov",
];

const GENERAL_DOMAINS = [
  "engineeringtoolbox.com", "efunda.com", "mechanicalc.com",
  "structx.com", "roymech.co.uk", "engineersedge.com",
  "mdapp.co", "matmatch.com", "matweb.com", "amesweb.info",
  "theconstructor.org", "civilengineeringforum.me",
];

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

export function classifySource(url: string, title: string): SourceTier {
  const domain = extractDomain(url);
  const combined = `${title} ${domain}`.toLowerCase();

  if (STANDARD_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return "standard";
  if (STANDARD_KEYWORDS.some((k) => combined.includes(k))) return "standard";

  if (ACADEMIC_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return "academic";

  if (matchesAny(combined, HANDBOOK_KEYWORDS)) return "handbook";

  if (MANUFACTURER_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return "manufacturer";
  if (matchesAny(combined, MANUFACTURER_KEYWORDS)) return "manufacturer";

  if (GENERAL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return "general";

  if (!url || !domain) {
    if (STANDARD_KEYWORDS.some((k) => title.toLowerCase().includes(k))) return "standard";
    if (matchesAny(title, HANDBOOK_KEYWORDS)) return "handbook";
  }

  return "unknown";
}

export function sourceTierWeight(tier: SourceTier): number {
  return TIER_WEIGHTS[tier];
}

/** Given a set of references with sourceType populated, compute a weighted quality score [0,1]. */
export function refQualityScore(
  refs: Array<{ sourceType?: SourceTier | string; url?: string }>,
): number {
  const withUrl = refs.filter((r) => r.url && r.url.startsWith("http"));
  if (withUrl.length === 0) return 0;
  const sum = withUrl.reduce((acc, r) => {
    const tier = (r.sourceType as SourceTier | undefined) ?? "unknown";
    return acc + sourceTierWeight(tier);
  }, 0);
  return sum / withUrl.length;
}

/**
 * Compute a confidence penalty and human-readable note based on reference quality.
 * Returns { penalty: number (0-15), note: string | null }.
 */
export function confidencePenalty(
  refs: Array<{ sourceType?: SourceTier | string; url?: string }>,
  hasWebSearch: boolean,
): { penalty: number; note: string | null } {
  const withUrl = refs.filter((r) => r.url && r.url.startsWith("http"));

  if (!hasWebSearch || withUrl.length === 0) {
    const penalty = 10;
    return {
      penalty,
      note: `No web sources were retrieved for this calculation — score reduced by ${penalty} points. Verify results against applicable codes and standards.`,
    };
  }

  const score = refQualityScore(refs);

  if (score >= 0.75) return { penalty: 0, note: null };

  if (score >= 0.5) {
    const penalty = 5;
    return {
      penalty,
      note: `Only general or manufacturer sources were found — no authoritative standards cited. Score reduced by ${penalty} points. Cross-check key formulas against applicable ISO/ASTM/ASME codes.`,
    };
  }

  const penalty = Math.round((1 - score) * 15);
  return {
    penalty,
    note: `No authoritative standards were found for this topic — score reduced by ${penalty} points. Treat all formulas as approximate and verify against primary engineering codes before use.`,
  };
}
