import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { AiData } from "./ai-layer.js";

export interface DpfResult {
  bytes: Uint8Array;
  title: string;
  dpfId: string;
  qrPngBase64: string;
  aiData: AiData;
}

export async function buildDpf(
  sourcePath: string,
  sourceText: string,
  mimeType: string,
  originalName: string,
  aiData: AiData
): Promise<DpfResult> {
  const dpfId = crypto.randomUUID();
  const textHash = crypto.createHash("sha256").update(sourceText).digest("hex").slice(0, 16);

  const qrPayload = JSON.stringify({ dpf_id: dpfId, version: "1.0", hash: textHash });
  const qrPngBuffer = await QRCode.toBuffer(qrPayload, { type: "png", width: 80, margin: 1 });
  const qrPngBase64 = qrPngBuffer.toString("base64");

  const ext = path.extname(originalName).toLowerCase();
  let pdfDoc: PDFDocument;

  if (mimeType === "application/pdf" || ext === ".pdf") {
    const pdfBytes = await fs.readFile(sourcePath);
    try {
      pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    } catch {
      pdfDoc = await buildTextPdf(aiData.title, sourceText);
    }
  } else {
    pdfDoc = await buildTextPdf(aiData.title, sourceText);
  }

  const dpfMetadata = {
    dpf_id: dpfId,
    version: "DPF-1.0",
    created_at: new Date().toISOString(),
    hash: textHash,
    title: aiData.title,
  };

  const aiJson = JSON.stringify(aiData, null, 2);
  const metaJson = JSON.stringify(dpfMetadata, null, 2);

  await pdfDoc.attach(
    new TextEncoder().encode(aiJson),
    "ai_intelligence.json",
    { mimeType: "application/json", description: "DPF AI Intelligence Layer" }
  );
  await pdfDoc.attach(
    new TextEncoder().encode(metaJson),
    "dpf_metadata.json",
    { mimeType: "application/json", description: "DPF Metadata" }
  );

  pdfDoc.setSubject("DPF-1.0");
  pdfDoc.setKeywords([`dpf`, `ai-layer`, dpfId]);

  const qrImage = await pdfDoc.embedPng(qrPngBuffer);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width } = page.getSize();
    const qrSize = 48;
    page.drawImage(qrImage, {
      x: width - qrSize - 12,
      y: 8,
      width: qrSize,
      height: qrSize,
    });
    page.drawText("DPF-1.0", {
      x: width - qrSize - 12,
      y: 6,
      size: 5,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const bytes = await pdfDoc.save();

  return { bytes, title: aiData.title, dpfId, qrPngBase64, aiData };
}

async function buildTextPdf(title: string, text: string): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  const lineHeight = 14;
  const maxWidth = pageWidth - margin * 2;

  function wrapText(t: string, maxChars: number): string[] {
    const words = t.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > maxChars) {
        if (current) lines.push(current.trim());
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(current.trim());
    return lines;
  }

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  page.drawText(title.slice(0, 80), {
    x: margin,
    y,
    size: 18,
    font: boldFont,
    color: rgb(0.05, 0.05, 0.15),
  });
  y -= 30;

  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 20;

  const charsPerLine = Math.floor(maxWidth / 7);
  const paragraphs = text.split(/\n{2,}/);

  for (const para of paragraphs) {
    const lines = wrapText(para.replace(/\n/g, " "), charsPerLine);
    for (const line of lines) {
      if (y < margin + 60) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineHeight;
    }
    y -= 8;
  }

  return doc;
}
