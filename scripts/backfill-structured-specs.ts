/**
 * One-off backfill script: extract STRUCTURED key/value specs from each
 * product's datasheet PDF and persist them to products.specifications.
 * Targets products that currently have a datasheet but no specifications.
 *
 * Run: npx tsx scripts/backfill-structured-specs.ts [id1 id2 ...]
 * If no ids are passed, backfills all products with catalogPath != null
 * AND specifications IS NULL.
 */
import path from 'path';
import { storage } from '../server/storage';
import { generateStructuredSpecsFromDatasheet } from '../server/services/datasheet-summarizer';

async function main() {
  const argIds = process.argv.slice(2).map((s) => parseInt(s)).filter((n) => Number.isFinite(n));

  let targetIds: number[];
  if (argIds.length > 0) {
    targetIds = argIds;
  } else {
    const all = await storage.getAllProducts();
    targetIds = all.filter((p: any) => p.catalogPath && !p.specifications).map((p: any) => p.id);
  }

  console.log(`🔬 Backfilling structured specs for ${targetIds.length} product(s): ${targetIds.join(', ')}`);

  for (const id of targetIds) {
    const p = await storage.getProduct(id);
    if (!p) { console.log(`❌ id=${id}: not found`); continue; }
    if (!p.catalogPath) { console.log(`⏭️  id=${id} (${p.name}): no datasheet`); continue; }
    if (p.specifications && argIds.length === 0) { console.log(`⏭️  id=${id} (${p.name}): already has specs`); continue; }

    const fullPath = path.join(process.cwd(), `.${p.catalogPath}`);
    console.log(`\n--- id=${id}: ${p.name} ---`);
    try {
      const specs = await generateStructuredSpecsFromDatasheet(fullPath, {
        name: p.name,
        category: p.category || '',
        description: p.description || undefined,
      });
      const count = Object.keys(specs).length;
      if (count === 0) {
        console.log(`⚠️  no specs extracted`);
        continue;
      }
      await storage.updateProduct(id, { specifications: specs as any });
      console.log(`✅ persisted ${count} specs:`);
      console.log(JSON.stringify(specs, null, 2));
    } catch (err: any) {
      console.log(`❌ ${err?.message || err}`);
    }
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
