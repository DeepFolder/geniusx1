import path from "path";
import fs from "fs";
import pg from "pg";
import { randomUUID } from "crypto";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrateFile(uploadPath: string): Promise<string | null> {
  const diskPath = path.join(process.cwd(), `.${uploadPath}`);
  if (!fs.existsSync(diskPath)) {
    console.warn(`  ⚠️  Not on disk: ${diskPath}`);
    return null;
  }
  const buf = fs.readFileSync(diskPath);
  const ext = path.extname(uploadPath).toLowerCase();
  const mime: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
    ".stl": "model/stl", ".stp": "application/step", ".step": "application/step",
    ".obj": "model/obj",
  };
  const contentType = mime[ext] ?? "application/octet-stream";
  const id = randomUUID();
  await pool.query(
    `INSERT INTO file_storage (id, content_type, data) VALUES ($1, $2, $3)`,
    [id, contentType, buf.toString("base64")]
  );
  console.log(`  ✅ ${path.basename(uploadPath)} (${(buf.length/1024).toFixed(0)}KB) → /api/files/${id}`);
  return `/api/files/${id}`;
}

async function run() {
  // Migrate product files
  const { rows: productRows } = await pool.query(`
    SELECT id, name, catalog_path, image_path, model_path FROM products
    WHERE catalog_path LIKE '/uploads/%' OR image_path LIKE '/uploads/%' OR model_path LIKE '/uploads/%'
  `);
  console.log(`\n📦 Products with /uploads/ paths: ${productRows.length}`);
  for (const row of productRows) {
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const [col] of [["catalog_path"], ["image_path"], ["model_path"]] as const) {
      const val = (row as any)[col];
      if (val && val.startsWith("/uploads/")) {
        const newPath = await migrateFile(val);
        if (newPath) { updates.push(`${col} = $${i++}`); vals.push(newPath); }
      }
    }
    if (updates.length > 0) {
      vals.push(row.id);
      await pool.query(`UPDATE products SET ${updates.join(", ")} WHERE id = $${i}`, vals);
      console.log(`  📝 product #${row.id} (${row.name}): ${updates.length} path(s) updated`);
    }
  }

  // Migrate company logos
  const { rows: companyRows } = await pool.query(`
    SELECT id, name, logo_path FROM companies WHERE logo_path LIKE '/uploads/%'
  `);
  console.log(`\n🏢 Companies with /uploads/ logos: ${companyRows.length}`);
  for (const row of companyRows) {
    const newPath = await migrateFile(row.logo_path);
    if (newPath) {
      await pool.query(`UPDATE companies SET logo_path = $1 WHERE id = $2`, [newPath, row.id]);
      console.log(`  📝 company #${row.id} (${row.name}): logo updated`);
    }
  }

  // Report what still needs spec extraction
  const { rows: noSpecs } = await pool.query(`
    SELECT id, name, catalog_path FROM products
    WHERE catalog_path IS NOT NULL AND specifications IS NULL
  `);
  console.log(`\n🔬 Products needing spec extraction: ${noSpecs.length}`);
  noSpecs.forEach(r => console.log(`  • #${r.id} ${r.name}`));
  console.log(`\n✅ Done. Now go to Admin → Settings → "Extract Missing Specs" to trigger GPT-4o extraction.`);
}

run().catch(console.error).finally(() => pool.end());
