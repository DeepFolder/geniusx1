import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import JSZip from "jszip";
import pdf from "pdf-parse";

export async function extractText(
  filePath: string,
  mimeType: string,
  originalName: string
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();

  if (mimeType === "application/pdf" || ext === ".pdf") {
    return extractPdf(filePath);
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    return extractDocx(filePath);
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === ".pptx"
  ) {
    return extractPptx(filePath);
  }
  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    ext === ".txt" ||
    ext === ".md"
  ) {
    return fs.readFile(filePath, "utf-8");
  }
  if (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    ext === ".png" ||
    ext === ".jpg" ||
    ext === ".jpeg"
  ) {
    return extractOcr(filePath);
  }
  throw new Error(`Unsupported file type: ${mimeType} (${ext})`);
}

async function extractPdf(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const data = await pdf(buffer);
  return data.text || "";
}

async function extractDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || "";
}

async function extractPptx(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const slideTexts: string[] = [];

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();

  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async("string");
    const text = xml
      .replace(/<a:t>/g, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) slideTexts.push(text);
  }

  return slideTexts.join("\n\n");
}

async function extractOcr(_filePath: string): Promise<string> {
  return "[Image content detected. OCR processing not yet enabled — plug in tesseract.js or a cloud OCR service here to extract text from images.]";
}
