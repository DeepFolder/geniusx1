import type { Company, Product, HybridProduct, ProductAttribute } from "../types";

/**
 * Derives a stable canonical string key for an external product used for
 * server-side uniqueness checks. Prefers the product URL (stripped of
 * protocol/trailing slash) as the identity anchor because URLs are unique per
 * product page. Falls back to name::company when no URL is available.
 *
 * NOTE: this key is stored in externalData.canonicalKey and used by the server
 * for collision-safe add/remove. It is NOT the same as the integer favoriteId —
 * keep them decoupled so that existing saved favorites (pre-canonicalKey) can
 * still be deleted via the integer ID fallback path.
 */
export function externalProductCanonicalKey(hp: { reference_link?: string | null; product_name?: string | null; company?: { name?: string | null } | null }): string {
  if (hp.reference_link) {
    return hp.reference_link.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
  return `${(hp.product_name || '').toLowerCase().trim()}::${(hp.company?.name || '').toLowerCase().trim()}`;
}

/**
 * Derives a stable integer ID for an external product.
 * Uses the same canonical key as `externalProductCanonicalKey` so the integer
 * and the string key are always derived from the same source (URL when available).
 */
export function stableProductId(hp: HybridProduct): number {
  const key = externalProductCanonicalKey(hp);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 2_000_000_000) + 200000;
}

export function normalizeSpecStatus(mr: boolean | 'meets' | 'oversized' | 'undersized' | undefined): 'meets' | 'oversized' | 'undersized' | undefined {
  if (mr === undefined || mr === null) return undefined;
  if (mr === true || mr === 'meets') return 'meets';
  if (mr === false || mr === 'undersized') return 'undersized';
  if (mr === 'oversized') return 'oversized';
  return undefined;
}

export function adaptHybridProduct(hp: HybridProduct, companiesMap: Map<number, Company>): Product {
  const isExternal = hp.source === 'web' || hp.verification_status === 'web';

  let numericId = 0;
  let dbProductId: number | undefined;
  const dbIdMatch = hp.product_profile_url?.match(/\/products?\/(\d+)/);
  if (dbIdMatch) {
    numericId = parseInt(dbIdMatch[1], 10);
    dbProductId = numericId;
  }
  if (!numericId) {
    numericId = stableProductId(hp);
  }

  let companyId = 0;
  const dbCompanyMatch = hp.company_profile_url?.match(/\/company\/(\d+)/);
  if (dbCompanyMatch) {
    companyId = parseInt(dbCompanyMatch[1], 10);
  }
  if (!companyId && hp.company?.name) {
    for (const [id, c] of companiesMap) {
      if (c.name.toLowerCase() === hp.company.name.toLowerCase()) {
        companyId = id;
        break;
      }
    }
  }

  const description = hp.ai_summary || hp.description || '';
  const category = hp.brand || hp.attributes?.find(a => a.label.toLowerCase() === 'category')?.value || 'Product';

  return {
    id: numericId,
    name: hp.product_name || 'Unknown Product',
    category,
    description,
    companyId,
    imagePath: hp.image_url || undefined,
    modelPath: hp.model_url || undefined,
    documentPaths: hp.document_urls,
    catalogPath: hp.datasheet_url || undefined,
    productWebLink: hp.reference_link || undefined,
    companyWebsite: hp.company?.website || undefined,
    fitScore: hp.fit_score,
    fitReason: hp.attributes?.map(a => `${a.label}: ${a.value}${a.unit ? ' ' + a.unit : ''}`).join(', '),
    scoreReason: hp.score_reason,
    isExternal,
    attributes: hp.attributes?.map(a => ({ label: a.label, value: a.value, unit: a.unit, meets_requirement: a.meets_requirement, note: a.note })),
    companyName: hp.company?.name || '',
    linkStatus: hp.link_status,
    partType: typeof hp.part_type === 'string' && hp.part_type.trim().length > 0 ? hp.part_type.trim() : undefined,
    datasheetVerified: hp.datasheet_verified,
    dbProductId,
  };
}

/**
 * Groups a product list by `partType`, preserving original ordering both
 * within each group and across groups. When fewer than 2 distinct part_types
 * are present (or none are set), returns a single anonymous group.
 */
export function groupProductsByPartType(products: Product[]): { partType: string | null; products: Product[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, { label: string; items: Product[] }>();
  for (const p of products) {
    const raw = (p.partType || '').trim();
    const key = raw.toLowerCase();
    if (!buckets.has(key)) {
      buckets.set(key, { label: raw, items: [] });
      order.push(key);
    }
    buckets.get(key)!.items.push(p);
  }
  const distinctNamed = order.filter(k => k.length > 0);
  if (distinctNamed.length < 2) {
    return [{ partType: null, products }];
  }
  return order.map(k => {
    const b = buckets.get(k)!;
    return { partType: k.length > 0 ? b.label : null, products: b.items };
  });
}
