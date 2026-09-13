import { Router } from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import { extractText } from "../features/dpf/extractor.js";
import { generateAiLayer } from "../features/dpf/ai-layer.js";
import { buildDpf } from "../features/dpf/builder.js";

const router = Router();

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".pptx", ".txt", ".md", ".png", ".jpg", ".jpeg",
]);

const upload = multer({
  dest: "uploads/dpf-tmp/",
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME_TYPES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Allowed: PDF, DOCX, PPTX, TXT, MD, PNG, JPG`));
    }
  },
});

router.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "dpf-converter" });
});

router.post("/convert", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const originalName = file.originalname;
    const text = await extractText(file.path, file.mimetype, originalName);
    const aiData = await generateAiLayer(text, originalName);
    const result = await buildDpf(file.path, text, file.mimetype, originalName, aiData);

    const safeName = aiData.title
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "document";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);
    res.setHeader("X-DPF-Id", result.dpfId);
    res.setHeader("X-DPF-Title", encodeURIComponent(result.title));
    res.setHeader("X-DPF-QR", result.qrPngBase64);
    res.setHeader("X-DPF-AI", encodeURIComponent(JSON.stringify(result.aiData)));
    res.setHeader("Access-Control-Expose-Headers", "X-DPF-Id, X-DPF-Title, X-DPF-QR, X-DPF-AI");

    res.send(Buffer.from(result.bytes));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Conversion failed";
    console.error("[DPF] Conversion error:", err);
    res.status(500).json({ error: message });
  } finally {
    if (file) {
      await fs.unlink(file.path).catch(() => {});
    }
  }
});

export default router;
