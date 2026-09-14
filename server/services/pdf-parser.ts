import type { Options, Result } from "pdf-parse";

export async function parsePdfBuffer(buffer: Buffer, options?: Options): Promise<Result> {
  const pdfParse = (await import("pdf-parse")).default;
  // The bundled PDF.js expects plain Uint8Array semantics. Node Buffer slices
  // share memory and can corrupt parsing of compressed objects. Copy the bytes
  // so parsing also cannot alter the original attachment stored afterward.
  // The upstream type declaration is narrower than its supported binary input.
  return pdfParse(Uint8Array.from(buffer) as Buffer, options);
}
