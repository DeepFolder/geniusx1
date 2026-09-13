/**
 * One-shot script: extract structured specs for products that have a
 * datasheet but no specs yet. Runs inside the project so all modules resolve.
 */
import path from "path";
import fs from "fs";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const { rows } = await pool.query(`
    SELECT id, name, category, description, catalog_path
    FROM products
    WHERE catalog_path IS NOT NULL AND specifications IS NULL
  `);

  if (rows.length === 0) {
    console.log("✅ All products with datasheets already have specs.");
    return;
  }

  console.log(`🔬 Extracting specs for ${rows.length} product(s)…\n`);

  const { extractStructuredSpecs, extractPdfTextFromBuffer, extractPdfText } =
    await import("../server/services/datasheet-summarizer.js");

  for (const row of rows) {
    console.log(`→ #${row.id} ${row.name} (${row.catalog_path})`);
    try {
      let pdfText: string;
      const cp: string = row.catalog_path;

      if (cp.startsWith("/api/files/")) {
        const fileId = cp.replace("/api/files/", "");
        const { rows: fileRows } = await pool.query(
          `SELECT data, content_type FROM file_storage WHERE id = $1`,
          [fileId]
        );
        if (!fileRows.length) { console.warn("  ⚠️  File not in DB"); continue; }
        const buf = Buffer.from(fileRows[0].data, "base64");
        pdfText = await extractPdfTextFromBuffer(buf);
      } else if (cp.startsWith("/uploads/")) {
        const fullPath = path.join(process.cwd(), `.${cp}`);
        if (!fs.existsSync(fullPath)) { console.warn("  ⚠️  Not on disk"); continue; }
        pdfText = await extractPdfText(fullPath);
      } else {
        console.warn("  ⚠️  Unknown path scheme"); continue;
      }

      const specs = await extractStructuredSpecs(pdfText, {
        name: row.name,
        category: row.category || "",
        description: row.description || undefined,
      });

      if (!specs || Object.keys(specs).length === 0) {
        console.log("  ℹ️  No specs extracted");
        continue;
      }

      await pool.query(
        `UPDATE products SET specifications = $1 WHERE id = $2`,
        [JSON.stringify(specs), row.id]
      );
      console.log(`  ✅ ${Object.keys(specs).length} specs saved`);
    } catch (e: any) {
      console.error(`  ❌ Failed: ${e?.message || e}`);
    }
  }

  console.log("\n✅ Spec extraction complete.");
}

run().catch(console.error).finally(() => pool.end());
