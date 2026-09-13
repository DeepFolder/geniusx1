import { useState, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, XCircle, AlertTriangle, ChevronRight, Trash2, ArrowRight, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import Papa from "papaparse";

const categories = [
  { value: "aerospace", label: "Aerospace & Defense" },
  { value: "automotive", label: "Automotive & Transportation" },
  { value: "chemicals", label: "Chemicals & Materials" },
  { value: "construction", label: "Construction & Building Materials" },
  { value: "electronics", label: "Electronics & Electrical" },
  { value: "energy", label: "Energy & Power Generation" },
  { value: "fasteners", label: "Fasteners & Hardware" },
  { value: "food-beverage", label: "Food & Beverage Equipment" },
  { value: "hvac", label: "HVAC & Refrigeration" },
  { value: "hydraulics", label: "Hydraulics & Pneumatics" },
  { value: "industrial-automation", label: "Industrial Automation" },
  { value: "machinery", label: "Machinery & Equipment" },
  { value: "marine", label: "Marine & Offshore" },
  { value: "medical", label: "Medical & Laboratory" },
  { value: "metal-fabrication", label: "Metal Fabrication" },
  { value: "mining", label: "Mining & Quarrying" },
  { value: "oil-gas", label: "Oil & Gas" },
  { value: "packaging", label: "Packaging Equipment" },
  { value: "plastics", label: "Plastics & Polymers" },
  { value: "pumps-valves", label: "Pumps & Valves" },
  { value: "robotics", label: "Robotics & Mechatronics" },
  { value: "safety-security", label: "Safety & Security" },
  { value: "sensors-instruments", label: "Sensors & Instruments" },
  { value: "software", label: "Software & IT Solutions" },
  { value: "textile", label: "Textile & Apparel" },
  { value: "tools", label: "Tools & Workshop Equipment" },
  { value: "other", label: "Other" },
];

const categoryValues = categories.map(c => c.value);
const categoryLabels: Record<string, string> = {};
categories.forEach(c => { categoryLabels[c.value] = c.label; });

const OUR_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "description", label: "Description", required: true },
  { key: "category", label: "Category", required: true },
  { key: "productWebLink", label: "Web Link", required: false },
  { key: "imageUrl", label: "Image URL", required: false },
  { key: "datasheetUrl", label: "Datasheet URL", required: false },
  { key: "model3dUrl", label: "3D Model URL", required: false },
];

type Step = "upload" | "map" | "preview" | "import";

interface MappedProduct {
  name: string;
  description: string;
  category: string;
  productWebLink: string;
  imageUrl: string;
  datasheetUrl: string;
  model3dUrl: string;
  rowIndex: number;
  valid: boolean;
  errors: string[];
}

interface ImportResult {
  row: number;
  name: string;
  status: "created" | "failed";
  productId?: number;
  error?: string;
}

function fuzzyMatch(csvHeader: string, fieldKey: string): number {
  const h = csvHeader.toLowerCase().replace(/[^a-z0-9]/g, "");
  const f = fieldKey.toLowerCase().replace(/[^a-z0-9]/g, "");

  const aliases: Record<string, string[]> = {
    name: ["name", "productname", "title", "producttitle", "part", "partname", "artikel", "bezeichnung"],
    description: ["description", "desc", "details", "info", "beschreibung", "produktbeschreibung"],
    category: ["category", "cat", "type", "gruppe", "kategorie", "productcategory"],
    productweblink: ["weblink", "web", "url", "link", "website", "producturl", "productlink", "homepage"],
    imageurl: ["imageurl", "image", "img", "photo", "picture", "bild", "bildurl", "productimage", "thumbnail"],
    datasheeturl: ["datasheeturl", "datasheet", "pdf", "catalog", "catalogue", "datenblatt", "pdfurl", "spec", "specsheet"],
    model3durl: ["model3durl", "3dmodel", "model", "cad", "cadfile", "step", "stl", "3d", "modell", "cadurl"],
  };

  const fieldAliases = aliases[f] || [f];
  if (fieldAliases.includes(h)) return 1;
  for (const alias of fieldAliases) {
    if (h.includes(alias) || alias.includes(h)) return 0.5;
  }
  return 0;
}

export default function AddProductsCsvPage() {
  const [, params] = useRoute("/company/:id/add-products-csv");
  const companyId = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappedProducts, setMappedProducts] = useState<MappedProduct[]>([]);
  const [removedRows, setRemovedRows] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importSummary, setImportSummary] = useState<{ totalRows: number; created: number; failed: number } | null>(null);
  const [fileName, setFileName] = useState("");

  const { data: company } = useQuery({
    queryKey: ['/api/companies', companyId],
    enabled: !!companyId,
  });

  const handleFileUpload = useCallback((file: File) => {
    setFileName(file.name);
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length < 2) {
          toast({ title: "Invalid CSV", description: "File must have a header row and at least one data row.", variant: "destructive" });
          return;
        }
        const headers = data[0];
        const rows = data.slice(1);
        setCsvHeaders(headers);
        setCsvData(rows);

        const autoMapping: Record<string, string> = {};
        OUR_FIELDS.forEach(field => {
          let bestMatch = "";
          let bestScore = 0;
          headers.forEach(header => {
            const score = fuzzyMatch(header, field.key);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = header;
            }
          });
          if (bestScore >= 0.5) {
            autoMapping[field.key] = bestMatch;
          }
        });
        setMapping(autoMapping);
        setStep("map");
      },
      error: () => {
        toast({ title: "Parse Error", description: "Could not parse the CSV file.", variant: "destructive" });
      }
    });
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
      handleFileUpload(file);
    } else {
      toast({ title: "Invalid file", description: "Please upload a CSV file.", variant: "destructive" });
    }
  }, [handleFileUpload, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const headers = ["Name", "Description", "Category", "Web Link", "Image URL", "Datasheet URL", "3D Model URL"];
    const example = ["Hex Bolt M10x50", "Steel hex bolt for industrial use", "fasteners", "https://example.com/bolt", "https://example.com/bolt.jpg", "https://example.com/bolt.pdf", "https://example.com/bolt.step"];
    const csv = Papa.unparse([headers, example]);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyMapping = () => {
    const required = OUR_FIELDS.filter(f => f.required);
    const missingRequired = required.filter(f => !mapping[f.key]);
    if (missingRequired.length > 0) {
      toast({ title: "Missing mappings", description: `Please map required fields: ${missingRequired.map(f => f.label).join(", ")}`, variant: "destructive" });
      return;
    }

    const products: MappedProduct[] = csvData.map((row, idx) => {
      const getValue = (fieldKey: string) => {
        const csvCol = mapping[fieldKey];
        if (!csvCol) return "";
        const colIdx = csvHeaders.indexOf(csvCol);
        return colIdx >= 0 ? (row[colIdx] || "").trim() : "";
      };

      const name = getValue("name");
      const description = getValue("description");
      const rawCategory = getValue("category");
      const productWebLink = getValue("productWebLink");
      const imageUrl = getValue("imageUrl");
      const datasheetUrl = getValue("datasheetUrl");
      const model3dUrl = getValue("model3dUrl");

      const errors: string[] = [];
      if (!name) errors.push("Missing name");
      if (!description) errors.push("Missing description");

      let category = rawCategory;
      if (!rawCategory) {
        errors.push("Missing category");
      } else {
        const lowerCat = rawCategory.toLowerCase();
        const exactMatch = categoryValues.find(v => v === lowerCat);
        if (exactMatch) {
          category = exactMatch;
        } else {
          const labelMatch = categories.find(c => c.label.toLowerCase() === lowerCat);
          if (labelMatch) {
            category = labelMatch.value;
          } else {
            const partialMatch = categories.find(c =>
              c.label.toLowerCase().includes(lowerCat) || lowerCat.includes(c.value)
            );
            if (partialMatch) {
              category = partialMatch.value;
            } else {
              category = rawCategory.trim();
            }
          }
        }
      }

      return {
        name,
        description,
        category,
        productWebLink,
        imageUrl,
        datasheetUrl,
        model3dUrl,
        rowIndex: idx,
        valid: errors.length === 0,
        errors,
      };
    });

    setMappedProducts(products);
    setRemovedRows(new Set());
    setStep("preview");
  };

  const removeRow = (rowIndex: number) => {
    setRemovedRows(prev => { const next = new Set(Array.from(prev)); next.add(rowIndex); return next; });
  };

  const activeProducts = mappedProducts.filter(p => !removedRows.has(p.rowIndex));
  const validProducts = activeProducts.filter(p => p.valid);
  const invalidProducts = activeProducts.filter(p => !p.valid);

  const startImport = async () => {
    if (validProducts.length === 0) {
      toast({ title: "No valid products", description: "There are no valid products to import.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    try {
      const productsToImport = validProducts.map(p => ({
        name: p.name,
        description: p.description,
        category: p.category,
        productWebLink: p.productWebLink || null,
        imageUrl: p.imageUrl || null,
        datasheetUrl: p.datasheetUrl || null,
        model3dUrl: p.model3dUrl || null,
      }));

      const progressInterval = setInterval(() => {
        setImportProgress(prev => Math.min(prev + 2, 90));
      }, 200);

      const data = await apiRequest(`/api/companies/${companyId}/products/bulk-import`, {
        method: "POST",
        body: JSON.stringify({ products: productsToImport }),
      });

      clearInterval(progressInterval);
      setImportProgress(100);
      setImportResults(data.results);
      setImportSummary({ totalRows: data.totalRows, created: data.created, failed: data.failed });
      setStep("import");
    } catch (error: any) {
      toast({ title: "Import failed", description: error.message || "An error occurred during import.", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const resetAll = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvData([]);
    setMapping({});
    setMappedProducts([]);
    setRemovedRows(new Set());
    setImportResults(null);
    setImportSummary(null);
    setFileName("");
  };

  const stepIndicator = (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[
        { key: "upload", label: "Upload" },
        { key: "map", label: "Map Columns" },
        { key: "preview", label: "Preview" },
        { key: "import", label: "Results" },
      ].map((s, i) => {
        const stepOrder = ["upload", "map", "preview", "import"];
        const currentIdx = stepOrder.indexOf(step);
        const thisIdx = stepOrder.indexOf(s.key);
        const isActive = thisIdx === currentIdx;
        const isDone = thisIdx < currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              isActive ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-600' :
              isDone ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700' :
              'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700'
            }`}>
              {isDone && <CheckCircle2 className="w-3 h-3" />}
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-purple-950/20 py-6">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation(`/company/${companyId}`)}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Import Products</h1>
              {(company as any)?.name && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{(company as any).name}</p>
              )}
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={downloadTemplate} className="text-xs">
                  <Download className="w-3 h-3 mr-1" />
                  CSV Template
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Download a sample CSV with the correct column headers</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {stepIndicator}

        {step === "upload" && (
          <div className="max-w-2xl mx-auto">
            <div
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center hover:border-purple-400 dark:hover:border-purple-500 transition-colors cursor-pointer bg-white dark:bg-gray-800/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                <FileSpreadsheet className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Upload your CSV file
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Drag and drop or click to browse
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Any CSV format — you'll map columns in the next step
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        {step === "map" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Map Your Columns</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {fileName} — {csvData.length} rows detected
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 rounded-full border border-purple-200 dark:border-purple-700">
                  {Object.keys(mapping).length}/{OUR_FIELDS.length} mapped
                </span>
              </div>

              <div className="space-y-3">
                {OUR_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-36 flex-shrink-0">
                      <span className={`text-xs font-medium ${field.required ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {field.label}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    <Select
                      value={mapping[field.key] || "__none__"}
                      onValueChange={(val) => {
                        setMapping(prev => {
                          const next = { ...prev };
                          if (val === "__none__") {
                            delete next[field.key];
                          } else {
                            next[field.key] = val;
                          }
                          return next;
                        });
                      }}
                    >
                      <SelectTrigger className={`flex-1 h-8 text-xs ${
                        mapping[field.key]
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-300 dark:border-green-700 text-green-700 dark:text-green-400'
                          : field.required
                            ? 'bg-red-50 dark:bg-red-900/10 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'
                            : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                      }`}>
                        <SelectValue placeholder="— Not mapped —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Not mapped —</SelectItem>
                        {csvHeaders.map(header => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {csvData.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Preview (first row)</p>
                  <div className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
                    {OUR_FIELDS.filter(f => mapping[f.key]).map(field => {
                      const colIdx = csvHeaders.indexOf(mapping[field.key]);
                      const val = colIdx >= 0 ? csvData[0]?.[colIdx] : "";
                      return (
                        <div key={field.key} className="flex gap-2">
                          <span className="font-medium text-gray-500 w-24 flex-shrink-0">{field.label}:</span>
                          <span className="truncate">{val || "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-6">
                <Button variant="ghost" size="sm" onClick={() => setStep("upload")} className="text-xs">
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  Back
                </Button>
                <Button size="sm" onClick={applyMapping} className="text-xs bg-purple-600 hover:bg-purple-700 text-white">
                  Preview Products
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {activeProducts.length} products
                </span>
                {validProducts.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full border border-green-200 dark:border-green-700">
                    {validProducts.length} valid
                  </span>
                )}
                {invalidProducts.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full border border-red-200 dark:border-red-700">
                    {invalidProducts.length} errors
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("map")} className="text-xs">
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={startImport}
                  disabled={isImporting || validProducts.length === 0}
                  className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3 h-3 mr-1" />
                      Import {validProducts.length} Products
                    </>
                  )}
                </Button>
              </div>
            </div>

            {isImporting && (
              <div className="mb-4">
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 text-center">
                  Importing products and downloading files...
                </p>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 w-8">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Status</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Description</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Category</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Files</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProducts.map((product, idx) => (
                      <tr
                        key={product.rowIndex}
                        className={`border-b border-gray-100 dark:border-gray-700/50 ${
                          product.valid
                            ? 'bg-white dark:bg-gray-800 hover:bg-green-50/50 dark:hover:bg-green-900/10'
                            : 'bg-red-50/50 dark:bg-red-900/10'
                        }`}
                      >
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {product.valid ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  <div className="text-xs space-y-0.5">
                                    {product.errors.map((e, i) => <p key={i}>{e}</p>)}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white max-w-[180px] truncate">
                          {product.name || <span className="text-red-400 italic">Missing</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                          {product.description || <span className="text-red-400 italic">Missing</span>}
                        </td>
                        <td className="px-3 py-2">
                          {product.category && categoryLabels[product.category] ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-medium">
                              {categoryLabels[product.category]}
                            </span>
                          ) : product.category ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded font-medium">
                              {product.category}
                            </span>
                          ) : (
                            <span className="text-red-400 italic text-[10px]">Missing</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {product.imageUrl && (
                              <span className="text-[10px] px-1 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded">IMG</span>
                            )}
                            {product.datasheetUrl && (
                              <span className="text-[10px] px-1 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded">PDF</span>
                            )}
                            {product.model3dUrl && (
                              <span className="text-[10px] px-1 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded">3D</span>
                            )}
                            {product.productWebLink && (
                              <span className="text-[10px] px-1 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded">Web</span>
                            )}
                            {!product.imageUrl && !product.datasheetUrl && !product.model3dUrl && !product.productWebLink && (
                              <span className="text-[10px] text-gray-400">None</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeRow(product.rowIndex)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {step === "import" && importSummary && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-4">
              <div className="text-center mb-6">
                {importSummary.created > 0 ? (
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                ) : (
                  <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-3" />
                )}
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Import Complete
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {importSummary.created} of {importSummary.totalRows} products created successfully
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="text-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{importSummary.totalRows}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total</p>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importSummary.created}</p>
                  <p className="text-[10px] text-green-600 dark:text-green-400 uppercase tracking-wider">Created</p>
                </div>
                <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importSummary.failed}</p>
                  <p className="text-[10px] text-red-600 dark:text-red-400 uppercase tracking-wider">Failed</p>
                </div>
              </div>

              {importResults && importResults.length > 0 && (
                <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/50">
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Product</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResults.map((result, idx) => (
                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="px-3 py-1.5 text-gray-400">{result.row}</td>
                          <td className="px-3 py-1.5 text-gray-900 dark:text-white font-medium">{result.name}</td>
                          <td className="px-3 py-1.5">
                            {result.status === "created" ? (
                              <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Created
                              </span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                <XCircle className="w-3 h-3" /> {result.error}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between mt-6">
                <Button variant="ghost" size="sm" onClick={resetAll} className="text-xs">
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Import More
                </Button>
                <Button
                  size="sm"
                  onClick={() => setLocation(`/company/${companyId}`)}
                  className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
                >
                  View Products
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
