import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, Download, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import StepTracker from "@/features/dpf/StepTracker";
import AiJsonPreview from "@/features/dpf/AiJsonPreview";

const ACCEPTED = ".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg";
const MAX_MB = 25;

interface ConversionResult {
  dpfId: string;
  title: string;
  filename: string;
  qrPngBase64: string;
  aiData: object;
  blobUrl: string;
}

function getStep(elapsed: number): number {
  if (elapsed < 1000) return 0;
  if (elapsed < 3000) return 1;
  if (elapsed < 6000) return 2;
  if (elapsed < 10000) return 3;
  if (elapsed < 13000) return 4;
  return 5;
}

export default function DpfConverter() {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startTimer = useCallback(() => {
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Date.now() - start), 300);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const mutation = useMutation({
    mutationFn: async (f: File): Promise<ConversionResult> => {
      setElapsed(0);
      startTimer();
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/dpf/convert", { method: "POST", body: form });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Conversion failed" }));
        throw new Error((body as { error?: string }).error ?? "Conversion failed");
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const dpfId = res.headers.get("X-DPF-Id") ?? "";
      const title = decodeURIComponent(res.headers.get("X-DPF-Title") ?? f.name);
      const qrPngBase64 = res.headers.get("X-DPF-QR") ?? "";
      const aiRaw = res.headers.get("X-DPF-AI") ?? "{}";

      let aiData: object = {};
      try { aiData = JSON.parse(decodeURIComponent(aiRaw)); } catch { /* non-fatal */ }

      const safeName = title.replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "-") || "document";
      return { dpfId, title, filename: `${safeName}.pdf`, qrPngBase64, aiData, blobUrl };
    },
    onSuccess: (data) => {
      stopTimer();
      setElapsed(99999);
      setResult(data);
    },
    onError: (err: Error) => {
      stopTimer();
      setError(err.message);
    },
  });

  const validateAndSet = (f: File) => {
    setError(null);
    setResult(null);
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_MB} MB.`);
      return;
    }
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["pdf", "docx", "pptx", "txt", "md", "png", "jpg", "jpeg"];
    if (!allowed.includes(ext)) {
      setError("Unsupported format. Allowed: PDF, DOCX, PPTX, TXT, MD, PNG, JPG");
      return;
    }
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndSet(f);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) validateAndSet(f);
  };

  const currentStep = mutation.isPending ? getStep(elapsed) : result ? 6 : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold tracking-widest uppercase">
            DeepFolder DPF
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            DPF Converter
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium italic">
            Human Readable. AI Understandable.
          </p>
          <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md mx-auto">
            Convert any document into a standard <strong>.pdf</strong> file enriched with the DeepFolder Portable Format — embedded AI intelligence, semantic metadata, and a NanoTag QR code. Opens in any PDF reader.
          </p>
        </header>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors duration-200 ${
            dragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
              : file
              ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
              : "border-gray-300 dark:border-gray-700 hover:border-blue-400 hover:bg-gray-100 dark:hover:bg-gray-900"
          }`}
        >
          <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={onFileChange} />
          <Upload className="w-8 h-8 mx-auto mb-3 text-gray-400" />
          {file ? (
            <div className="space-y-1">
              <p className="font-semibold text-gray-800 dark:text-gray-200 flex items-center justify-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" /> {file.name}
              </p>
              <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <>
              <p className="text-gray-600 dark:text-gray-400 font-medium">Drag & drop or click to upload</p>
              <p className="text-xs text-gray-400 mt-1">PDF, DOCX, PPTX, TXT, MD, PNG, JPG — max {MAX_MB} MB</p>
            </>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={() => file && mutation.mutate(file)}
          disabled={!file || mutation.isPending}
          className="w-full h-11 text-base font-semibold bg-blue-600 hover:bg-blue-700"
        >
          {mutation.isPending ? "Converting…" : "Convert to DPF"}
        </Button>

        {(mutation.isPending || result) && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-5">
            <StepTracker currentStep={currentStep} done={!!result} />

            {result && (
              <>
                <div className="flex items-start gap-4 pt-2">
                  {result.qrPngBase64 && (
                    <div className="flex-shrink-0">
                      <p className="text-[10px] text-gray-500 mb-1 font-medium uppercase tracking-wide">NanoTag QR</p>
                      <img
                        src={`data:image/png;base64,${result.qrPngBase64}`}
                        alt="NanoTag QR code"
                        className="w-16 h-16 border border-gray-200 dark:border-gray-700 rounded"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Document</p>
                    <p className="font-semibold text-gray-900 dark:text-white truncate">{result.title}</p>
                    <p className="text-[10px] text-gray-400 mt-1 font-mono truncate">ID: {result.dpfId}</p>
                  </div>
                </div>

                <a href={result.blobUrl} download={result.filename} className="block">
                  <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 font-semibold">
                    <Download className="w-4 h-4" />
                    Download {result.filename}
                  </Button>
                </a>

                <AiJsonPreview data={result.aiData} />
              </>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          The downloaded <code>.pdf</code> opens in any PDF reader. AI intelligence is embedded as
          hidden file streams readable by AI tooling.
        </p>
      </div>
    </div>
  );
}
