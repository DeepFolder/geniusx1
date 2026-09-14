import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { parsePdfBuffer } from "../../server/services/pdf-parser";

describe("PDF upload parsing", () => {
  it.each([true, false])("reads text and preserves uploaded bytes (object streams: %s)", async (useObjectStreams) => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage([420, 300]).drawText("Mass: 10 kg. Acceleration: 2 m/s^2. Calculate force.", { x: 20, y: 200, font, size: 12 });
    const bytes = Buffer.from(await pdf.save({ useObjectStreams }));
    const original = Buffer.from(bytes);
    const result = await parsePdfBuffer(bytes);
    expect(result.text).toContain("Mass: 10 kg");
    expect(result.text).toContain("Calculate force");
    expect(result.numpages).toBe(1);
    expect(bytes).toEqual(original);
  });

  it("counts image-only pages without changing the original PDF", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([420, 300]);
    pdf.addPage([420, 300]);
    const bytes = Buffer.from(await pdf.save());
    const original = Buffer.from(bytes);
    const result = await parsePdfBuffer(bytes, { max: 0 });
    expect(result.numpages).toBe(2);
    expect(result.text.trim()).toBe("");
    expect(bytes).toEqual(original);
  });
});
