import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, X, FileText, Box, Check, ChevronsUpDown, Loader2, ArrowLeft, Package, ChevronDown, BadgeCheck, Camera, Plus, Globe, File, Settings2, Trash2, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

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

const productGradients = [
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-pink-500",
  "from-orange-500 to-red-500",
  "from-green-500 to-teal-500",
  "from-indigo-500 to-purple-500",
  "from-pink-500 to-rose-500",
  "from-teal-500 to-emerald-500",
  "from-amber-500 to-orange-500",
];

export default function AddProductPage() {
  const [, addParams] = useRoute("/company/:id/add-product");
  const [, editParams] = useRoute("/company/:id/edit-product/:productId");
  const params = editParams || addParams;
  const companyId = params?.id;
  const productId = editParams?.productId;
  const isEditMode = !!productId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [formLoaded, setFormLoaded] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    productWebLink: '',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [datasheetFile, setDatasheetFile] = useState<File | null>(null);
  const [datasheetPreviewUrl, setDatasheetPreviewUrl] = useState<string | null>(null);
  const [model3dFile, setModel3dFile] = useState<File | null>(null);
  const [model3dPreviewUrl, setModel3dPreviewUrl] = useState<string | null>(null);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [documentPreviewUrls, setDocumentPreviewUrls] = useState<string[]>([]);

  const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
  const [existingDatasheetPath, setExistingDatasheetPath] = useState<string | null>(null);
  const [existingModel3dPath, setExistingModel3dPath] = useState<string | null>(null);
  const [existingDocumentPaths, setExistingDocumentPaths] = useState<string[]>([]);

  interface LocalConfig {
    id?: number;
    name: string;
    datasheetFile: File | null;
    modelFile: File | null;
    existingDatasheetPath?: string | null;
    existingModelPath?: string | null;
    webLink?: string;
  }
  const [configurations, setConfigurations] = useState<LocalConfig[]>([]);
  const [showConfigTable, setShowConfigTable] = useState(false);
  const [selectedConfigIndex, setSelectedConfigIndex] = useState<number | null>(null);
  const [savingConfigs, setSavingConfigs] = useState(false);

  const docInputRef = useRef<HTMLInputElement>(null);
  const configDatasheetRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const configModelRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data: company } = useQuery<any>({
    queryKey: [`/api/companies/${companyId}`],
    enabled: !!companyId,
  });

  const { data: existingProduct, isLoading: isProductLoading } = useQuery<any>({
    queryKey: ['/api/products', productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) throw new Error('Failed to fetch product');
      return res.json();
    },
    enabled: isEditMode && !!productId,
  });

  const { data: existingConfigs } = useQuery<any[]>({
    queryKey: ['/api/products', productId, 'configurations'],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/configurations`);
      if (!res.ok) throw new Error('Failed to fetch configurations');
      return res.json();
    },
    enabled: isEditMode && !!productId,
  });

  useEffect(() => {
    if (existingProduct && !formLoaded) {
      const cat = existingProduct.category || '';
      const isPreset = categories.some(c => c.value === cat);
      if (cat && !isPreset) {
        setCustomCategory(cat);
      }
      setFormData({
        name: existingProduct.name || '',
        description: existingProduct.description || '',
        category: cat,
        productWebLink: existingProduct.productWebLink || '',
      });
      if (existingProduct.imagePath) {
        setExistingImagePath(existingProduct.imagePath);
        setImagePreview(existingProduct.imagePath);
      }
      if (existingProduct.catalogPath) {
        setExistingDatasheetPath(existingProduct.catalogPath);
        setDatasheetPreviewUrl(existingProduct.catalogPath);
      }
      if (existingProduct.modelPath) {
        setExistingModel3dPath(existingProduct.modelPath);
        setModel3dPreviewUrl(existingProduct.modelPath);
      }
      if (existingProduct.documentPaths && existingProduct.documentPaths.length > 0) {
        setExistingDocumentPaths(existingProduct.documentPaths);
      }
      setFormLoaded(true);
    }
  }, [existingProduct, formLoaded]);

  useEffect(() => {
    if (existingConfigs && existingConfigs.length > 0 && configurations.length === 0) {
      setConfigurations(existingConfigs.map((c: any) => ({
        id: c.id,
        name: c.name || '',
        datasheetFile: null,
        modelFile: null,
        existingDatasheetPath: c.datasheetPath || null,
        existingModelPath: c.modelPath || null,
        webLink: c.webLink || '',
      })));
      setShowConfigTable(true);
    }
  }, [existingConfigs]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (value.trim()) {
      setValidationErrors(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleImageChange = (file: File | null) => {
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      setValidationErrors(prev => ({ ...prev, image: false }));
    } else {
      setImagePreview(null);
    }
  };

  const handleDatasheetChange = (file: File | null) => {
    setDatasheetFile(file);
    if (file) {
      setDatasheetPreviewUrl(URL.createObjectURL(file));
      setValidationErrors(prev => ({ ...prev, datasheet: false }));
    } else {
      setDatasheetPreviewUrl(null);
    }
  };

  const handleModel3dChange = (file: File | null) => {
    setModel3dFile(file);
    if (file) {
      setModel3dPreviewUrl(URL.createObjectURL(file));
    } else {
      setModel3dPreviewUrl(null);
    }
  };

  const addDocumentFile = (file: File) => {
    setDocumentFiles(prev => [...prev, file]);
    setDocumentPreviewUrls(prev => [...prev, URL.createObjectURL(file)]);
  };

  const removeDocumentFile = (index: number) => {
    setDocumentFiles(prev => prev.filter((_, i) => i !== index));
    setDocumentPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const addConfiguration = () => {
    setConfigurations(prev => [...prev, { name: '', datasheetFile: null, modelFile: null, webLink: '' }]);
    setShowConfigTable(true);
  };

  const updateConfigName = (index: number, name: string) => {
    setConfigurations(prev => prev.map((c, i) => i === index ? { ...c, name } : c));
  };

  const updateConfigDatasheet = (index: number, file: File | null) => {
    setConfigurations(prev => prev.map((c, i) => i === index ? { ...c, datasheetFile: file, existingDatasheetPath: file ? null : c.existingDatasheetPath } : c));
  };

  const updateConfigModel = (index: number, file: File | null) => {
    setConfigurations(prev => prev.map((c, i) => i === index ? { ...c, modelFile: file, existingModelPath: file ? null : c.existingModelPath } : c));
  };

  const updateConfigWebLink = (index: number, webLink: string) => {
    setConfigurations(prev => prev.map((c, i) => i === index ? { ...c, webLink } : c));
  };

  const removeConfiguration = async (index: number) => {
    const config = configurations[index];
    if (config.id && isEditMode) {
      try {
        await apiRequest(`/api/configurations/${config.id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete configuration:', e);
      }
    }
    setConfigurations(prev => prev.filter((_, i) => i !== index));
    if (selectedConfigIndex === index) setSelectedConfigIndex(null);
    else if (selectedConfigIndex !== null && selectedConfigIndex > index) setSelectedConfigIndex(selectedConfigIndex - 1);
  };

  const saveConfigurations = async (targetProductId: string | number) => {
    for (const config of configurations) {
      if (!config.name.trim()) continue;
      const configFormData = new FormData();
      configFormData.append('name', config.name);
      if (config.webLink) configFormData.append('webLink', config.webLink);
      if (config.datasheetFile) configFormData.append('datasheet', config.datasheetFile);
      if (config.modelFile) configFormData.append('model3d', config.modelFile);

      if (config.id) {
        await apiRequest(`/api/configurations/${config.id}`, { method: 'PUT', body: configFormData });
      } else {
        await apiRequest(`/api/products/${targetProductId}/configurations`, { method: 'POST', body: configFormData });
      }
    }
  };

  const handleSubmit = async () => {
    const errors: Record<string, boolean> = {};
    if (!formData.name.trim()) errors.name = true;
    if (!formData.category) errors.category = true;
    if (!formData.description.trim()) errors.description = true;
    if (!formData.productWebLink.trim()) errors.productWebLink = true;
    if (!imageFile && !existingImagePath) errors.image = true;
    if (!datasheetFile && !existingDatasheetPath) errors.datasheet = true;

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      const missingFields = [];
      if (errors.name) missingFields.push("Product Name");
      if (errors.category) missingFields.push("Category");
      if (errors.description) missingFields.push("Description");
      if (errors.productWebLink) missingFields.push("Web Product Page");
      if (errors.image) missingFields.push("Product Image");
      if (errors.datasheet) missingFields.push("DataSheet");
      toast({ title: "Required fields missing", description: missingFields.join(", "), variant: "destructive" });
      return;
    }
    setValidationErrors({});

    setIsLoading(true);
    try {
      const productData = new FormData();
      productData.append('name', formData.name);
      productData.append('description', formData.description);
      productData.append('category', formData.category);
      productData.append('companyId', companyId!);
      productData.append('productWebLink', formData.productWebLink);
      if (imageFile) productData.append('image', imageFile);
      if (datasheetFile) productData.append('datasheet', datasheetFile);
      if (model3dFile) productData.append('model3d', model3dFile);
      documentFiles.forEach(doc => {
        productData.append('documentation', doc);
      });

      if (isEditMode) {
        productData.append('existingDocumentPaths', JSON.stringify(existingDocumentPaths));
      }

      let savedProductId: string | number;
      if (isEditMode && productId) {
        await apiRequest(`/api/products/${productId}`, {
          method: 'PUT',
          body: productData,
        });
        savedProductId = productId;
      } else {
        const newProduct = await apiRequest(`/api/companies/${companyId}/products`, {
          method: 'POST',
          body: productData,
        });
        savedProductId = newProduct.id;
      }

      if (configurations.length > 0) {
        await saveConfigurations(savedProductId);
      }

      toast({ title: "Success", description: isEditMode ? "Product updated successfully" : "Product added successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/products?companyId=${companyId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/products', productId] });
      queryClient.invalidateQueries({ queryKey: ['/api/products', savedProductId, 'configurations'] });
      setLocation(`/company/${companyId}`);
    } catch (error) {
      console.error('Error saving product:', error);
      toast({ title: "Error", description: isEditMode ? "Failed to update product" : "Failed to add product", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const categoryLabel = categories.find(c => c.value === formData.category)?.label || (formData.category ? formData.category : '');
  const gradientIndex = Math.floor(Math.random() * productGradients.length);
  const hasDatasheet = !!datasheetFile || !!existingDatasheetPath;
  const hasModel3d = !!model3dFile || !!existingModel3dPath;
  const hasDocuments = documentFiles.length > 0 || existingDocumentPaths.length > 0;
  const hasDownloads = hasDocuments || hasModel3d;

  if (isEditMode && isProductLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
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
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{isEditMode ? 'Edit Product' : 'Add New Product'}</h1>
              {company?.name && (
                <p className="text-sm text-gray-500 dark:text-gray-400">for {company.name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation(`/company/${companyId}`)}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                isEditMode ? 'Update Product' : 'Save Product'
              )}
            </Button>
          </div>
        </div>

        {/* Hidden file inputs */}
        <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageChange(f); e.target.value = ''; }} className="hidden" id="file-image" />
        <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDatasheetChange(f); e.target.value = ''; }} className="hidden" id="file-datasheet" />
        <input type="file" accept=".step,.stp,.stl,.obj,.fbx" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleModel3dChange(f); e.target.value = ''; }} className="hidden" id="file-model3d" />
        <input type="file" accept=".pdf,.doc,.docx" multiple ref={docInputRef} onChange={(e) => { const fileList = e.target.files; if (fileList) { Array.from(fileList).forEach(f => addDocumentFile(f)); } e.target.value = ''; }} className="hidden" id="file-documents" />

        {/* ===== THE PRODUCT CARD - Exact same list-view layout from company-profile.tsx ===== */}
        <div className="max-w-3xl mx-auto">
          <div className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all duration-200 relative">
            {/* Top Right: Verified Badge + Add Configuration */}
            <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={addConfiguration}
                      className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700/50 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                    >
                      <Settings2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      <span className="text-[9px] font-semibold text-blue-700 dark:text-blue-400">Add Configuration</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Add product variants (e.g. different sizes)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-md cursor-help">
                      <BadgeCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">Verified</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="text-xs">Product will be verified by DeepFolder after submission</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Card Content - image left, info right */}
            <div className="flex items-start p-3 gap-3">
              {/* Product Image - w-24 h-24 */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`w-24 h-24 rounded-lg flex-shrink-0 relative overflow-hidden ${validationErrors.image ? 'ring-2 ring-red-500 ring-offset-1' : ''}`}>
                      {imagePreview ? (
                        <>
                          <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                          <label
                            htmlFor="file-image"
                            className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 transition-opacity bg-black/40 flex items-center justify-center"
                          >
                            <Camera className="w-5 h-5 text-white" />
                          </label>
                          <button
                            type="button"
                            onClick={() => { handleImageChange(null); setExistingImagePath(null); }}
                            className="absolute top-0.5 right-0.5 bg-white/90 dark:bg-gray-800/90 text-red-600 p-0.5 rounded-full shadow-sm hover:shadow-md transition-all opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <label
                          htmlFor="file-image"
                          className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-r ${productGradients[gradientIndex]} cursor-pointer hover:opacity-90 transition-opacity`}
                        >
                          <Upload className="w-5 h-5 text-white/80 mb-0.5" />
                          <span className="text-[10px] text-white/80 font-medium">Upload</span>
                        </label>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Recommended: 800 × 800px (square, min 400px)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {/* Product Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h5 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1 flex-1">
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Product Name *"
                      className={`w-full bg-transparent border rounded outline-none p-0 font-semibold text-sm text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-colors ${validationErrors.name ? 'border-red-500 placeholder:text-red-400' : 'border-transparent focus:border-blue-400 dark:focus:border-blue-500'}`}
                    />
                  </h5>
                </div>
                
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-2">
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Product description *"
                    className={`w-full bg-transparent border rounded outline-none p-0 text-xs text-gray-600 dark:text-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-colors ${validationErrors.description ? 'border-red-500 placeholder:text-red-400' : 'border-transparent focus:border-blue-400 dark:focus:border-blue-500'}`}
                  />
                </p>
                
                {/* Category Badge */}
                <div className="flex items-center gap-2 mb-2">
                  <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                    <PopoverTrigger asChild>
                      <button className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer flex items-center gap-1 ${validationErrors.category ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 ring-1 ring-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        {categoryLabel || "Select category *"}
                        <ChevronsUpDown className="w-2.5 h-2.5 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[250px] p-0 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" align="start" side="bottom">
                      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-1.5">
                          <Input
                            placeholder="Type custom category..."
                            value={customCategory}
                            onChange={(e) => setCustomCategory(e.target.value)}
                            className="h-7 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customCategory.trim()) {
                                handleInputChange('category', customCategory.trim());
                                setCategoryOpen(false);
                                setValidationErrors(prev => ({ ...prev, category: false }));
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={!customCategory.trim()}
                            onClick={() => {
                              handleInputChange('category', customCategory.trim());
                              setCategoryOpen(false);
                              setValidationErrors(prev => ({ ...prev, category: false }));
                            }}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Or select from the list below</p>
                      </div>
                      <Command className="bg-white dark:bg-gray-800">
                        <CommandInput placeholder="Search category..." className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                        <CommandList>
                          <CommandEmpty className="text-gray-500 py-4 text-center text-sm">No category found.</CommandEmpty>
                          <CommandGroup>
                            {categories.map((cat) => (
                              <CommandItem
                                key={cat.value}
                                value={cat.label}
                                onSelect={() => { handleInputChange('category', cat.value); setCategoryOpen(false); setCustomCategory(''); setValidationErrors(prev => ({ ...prev, category: false })); }}
                                className="text-gray-900 dark:text-white cursor-pointer text-xs"
                              >
                                <Check className={cn("mr-2 h-3 w-3", formData.category === cat.value ? "opacity-100" : "opacity-0")} />
                                {cat.label}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* Download Links Row - LIVE links that highlight when data is added */}
                <div className="flex items-center gap-3">
                  {/* Web - highlights when link is set, clickable to verify */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            if (formData.productWebLink) {
                              let url = formData.productWebLink;
                              if (!url.startsWith('http://') && !url.startsWith('https://')) {
                                url = 'https://' + url;
                              }
                              window.open(url, '_blank');
                            }
                          }}
                          className={`text-xs font-medium transition-colors ${
                            formData.productWebLink
                              ? 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer underline decoration-dotted underline-offset-2'
                              : 'text-gray-400 dark:text-gray-500 cursor-default'
                          }`}
                          disabled={!formData.productWebLink}
                        >
                          Web
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">{formData.productWebLink ? `Click to verify: ${formData.productWebLink}` : "Add web link in Product Data below"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {/* DataSheet - highlights when uploaded, clickable to preview */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            if (datasheetPreviewUrl) {
                              window.open(datasheetPreviewUrl, '_blank');
                            }
                          }}
                          className={`text-xs font-medium transition-colors ${
                            hasDatasheet
                              ? 'text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 cursor-pointer underline decoration-dotted underline-offset-2'
                              : 'text-gray-400 dark:text-gray-500 cursor-default'
                          }`}
                          disabled={!hasDatasheet}
                        >
                          DataSheet
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{hasDatasheet ? `Click to preview: ${datasheetFile?.name || 'Existing datasheet'}` : "Upload datasheet in Product Data below"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {/* Downloads - highlights when files are added */}
                  {hasDownloads ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer underline decoration-dotted underline-offset-2"
                        >
                          Downloads
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56 z-[100]" sideOffset={5}>
                        {(model3dFile || existingModel3dPath) && (
                          <DropdownMenuItem
                            onSelect={() => {
                              if (model3dPreviewUrl) window.open(model3dPreviewUrl, '_blank');
                            }}
                            className="cursor-pointer"
                          >
                            <Box className="w-4 h-4 mr-2 text-blue-500" />
                            <span className="truncate">{model3dFile?.name || existingModel3dPath?.split('/').pop() || '3D Model'}</span>
                          </DropdownMenuItem>
                        )}
                        {documentFiles.map((doc, idx) => (
                          <DropdownMenuItem
                            key={`new-${idx}`}
                            onSelect={() => {
                              if (documentPreviewUrls[idx]) window.open(documentPreviewUrls[idx], '_blank');
                            }}
                            className="cursor-pointer"
                          >
                            <FileText className="w-4 h-4 mr-2 text-green-500" />
                            <span className="truncate">{doc.name}</span>
                          </DropdownMenuItem>
                        ))}
                        {existingDocumentPaths.map((docPath, idx) => (
                          <DropdownMenuItem
                            key={`existing-${idx}`}
                            onSelect={() => window.open(docPath, '_blank')}
                            className="cursor-pointer"
                          >
                            <FileText className="w-4 h-4 mr-2 text-green-500" />
                            <span className="truncate">{docPath.split('/').pop() || 'Document'}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500 cursor-default">
                      Downloads
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== CONFIGURATION TABLE ===== */}
        {showConfigTable && configurations.length > 0 && (
          <div className="max-w-3xl mx-auto mt-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-700/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4 text-purple-500" />
                  Configurations
                </h3>
                <button
                  type="button"
                  onClick={addConfiguration}
                  className="flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Variant
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-2 font-semibold text-gray-600 dark:text-gray-400 w-[25%]">Variant Name</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-600 dark:text-gray-400 w-[25%]">Web Link</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-600 dark:text-gray-400 w-[20%]">DataSheet</th>
                      <th className="text-left py-2 px-2 font-semibold text-gray-600 dark:text-gray-400 w-[20%]">3D Model</th>
                      <th className="py-2 px-2 w-[10%]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {configurations.map((config, idx) => (
                      <tr key={idx} className={`border-b border-gray-100 dark:border-gray-700/50 ${selectedConfigIndex === idx ? 'bg-purple-50/50 dark:bg-purple-900/10' : ''}`}>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={config.name}
                            onChange={(e) => updateConfigName(idx, e.target.value)}
                            placeholder="e.g. M10x20"
                            className="w-full bg-transparent border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-purple-400 dark:focus:border-purple-500 outline-none transition-colors"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <Link2 className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <input
                              type="url"
                              value={config.webLink || ''}
                              onChange={(e) => updateConfigWebLink(idx, e.target.value)}
                              placeholder="https://..."
                              className="w-full bg-transparent border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-purple-400 dark:focus:border-purple-500 outline-none transition-colors"
                            />
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="file"
                            accept=".pdf"
                            ref={(el) => { configDatasheetRefs.current[idx] = el; }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) updateConfigDatasheet(idx, f); e.target.value = ''; }}
                            className="hidden"
                          />
                          {config.datasheetFile ? (
                            <div className="flex items-center gap-1">
                              <FileText className="w-3 h-3 text-orange-500 flex-shrink-0" />
                              <span className="truncate text-gray-700 dark:text-gray-300 max-w-[100px]">{config.datasheetFile.name}</span>
                              <button type="button" onClick={() => updateConfigDatasheet(idx, null)} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                            </div>
                          ) : config.existingDatasheetPath ? (
                            <div className="flex items-center gap-1">
                              <FileText className="w-3 h-3 text-orange-500 flex-shrink-0" />
                              <span className="truncate text-gray-700 dark:text-gray-300 max-w-[100px]">{config.existingDatasheetPath.split('/').pop()}</span>
                              <button type="button" onClick={() => configDatasheetRefs.current[idx]?.click()} className="text-xs text-blue-500 hover:underline">Replace</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => configDatasheetRefs.current[idx]?.click()}
                              className="flex items-center gap-1 text-gray-400 hover:text-orange-500 transition-colors"
                            >
                              <Upload className="w-3 h-3" />
                              <span>Upload PDF</span>
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <input
                            type="file"
                            accept=".step,.stp,.stl,.obj"
                            ref={(el) => { configModelRefs.current[idx] = el; }}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) updateConfigModel(idx, f); e.target.value = ''; }}
                            className="hidden"
                          />
                          {config.modelFile ? (
                            <div className="flex items-center gap-1">
                              <Box className="w-3 h-3 text-purple-500 flex-shrink-0" />
                              <span className="truncate text-gray-700 dark:text-gray-300 max-w-[100px]">{config.modelFile.name}</span>
                              <button type="button" onClick={() => updateConfigModel(idx, null)} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                            </div>
                          ) : config.existingModelPath ? (
                            <div className="flex items-center gap-1">
                              <Box className="w-3 h-3 text-purple-500 flex-shrink-0" />
                              <span className="truncate text-gray-700 dark:text-gray-300 max-w-[100px]">{config.existingModelPath.split('/').pop()}</span>
                              <button type="button" onClick={() => configModelRefs.current[idx]?.click()} className="text-xs text-blue-500 hover:underline">Replace</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => configModelRefs.current[idx]?.click()}
                              className="flex items-center gap-1 text-gray-400 hover:text-purple-500 transition-colors"
                            >
                              <Upload className="w-3 h-3" />
                              <span>Upload STEP</span>
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeConfiguration(idx)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Each configuration can have its own web link, datasheet, and 3D model. If no datasheet or 3D model is uploaded for a variant, the base product files will be used automatically.
              </p>
            </div>
          </div>
        )}

        {/* ===== PRODUCT DATA Section ===== */}
        <div className="max-w-3xl mx-auto mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">Product Data</h3>

            {/* Web */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                Web page <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">(Product link to the company page)</span> <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.productWebLink}
                onChange={(e) => handleInputChange('productWebLink', e.target.value)}
                placeholder="https://example.com/product-page"
                className={`bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm ${validationErrors.productWebLink ? 'border-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
              />
              {validationErrors.productWebLink && (
                <p className="text-[11px] text-red-500">Web product page link is required</p>
              )}
              {formData.productWebLink && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  Link is active on the card above - click "Web" to verify it works
                </p>
              )}
            </div>

            {/* DataSheet */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-orange-500" />
                DataSheet <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">(Product data sheet / Technical data sheet)</span> <span className="text-red-500">*</span>
              </Label>
              {datasheetFile ? (
                <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30 rounded-lg">
                  <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{datasheetFile.name}</span>
                  <button
                    type="button"
                    onClick={() => datasheetPreviewUrl && window.open(datasheetPreviewUrl, '_blank')}
                    className="text-xs text-orange-600 dark:text-orange-400 hover:underline flex-shrink-0"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDatasheetChange(null)}
                    className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : existingDatasheetPath ? (
                <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/30 rounded-lg">
                  <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{existingDatasheetPath.split('/').pop()}</span>
                  <button
                    type="button"
                    onClick={() => window.open(existingDatasheetPath!, '_blank')}
                    className="text-xs text-orange-600 dark:text-orange-400 hover:underline flex-shrink-0"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => document.getElementById('file-datasheet')?.click()}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { document.getElementById('file-datasheet')?.click(); setValidationErrors(prev => ({ ...prev, datasheet: false })); }}
                    className={`w-full flex items-center gap-2 p-2.5 border border-dashed rounded-lg text-sm transition-colors cursor-pointer ${validationErrors.datasheet ? 'border-red-500 text-red-500 dark:border-red-500 dark:text-red-400' : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-400 hover:text-orange-500 dark:hover:border-orange-500 dark:hover:text-orange-400'}`}
                  >
                    <Upload className="w-4 h-4" />
                    Upload DataSheet (PDF)
                  </button>
                  {validationErrors.datasheet && (
                    <p className="text-[11px] text-red-500">DataSheet is required</p>
                  )}
                </>
              )}
              {hasDatasheet && (
                <p className="text-[11px] text-orange-600 dark:text-orange-400">
                  DataSheet is active on the card above - click "DataSheet" to preview
                </p>
              )}
            </div>

            {/* Downloads Section */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
                Downloads <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">(Any documents related to the product)</span>
              </Label>

              {/* Additional Product Documents */}
              <div className="pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Additional product documents</span>
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
                
                {(documentFiles.length > 0 || existingDocumentPaths.length > 0) ? (
                  <div className="space-y-1.5">
                    {existingDocumentPaths.map((docPath, idx) => (
                      <div key={`existing-${idx}`} className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-lg">
                        <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{docPath.split('/').pop()}</span>
                        <button
                          type="button"
                          onClick={() => window.open(docPath, '_blank')}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => setExistingDocumentPaths(prev => prev.filter((_, i) => i !== idx))}
                          className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {documentFiles.map((doc, idx) => (
                      <div key={`new-${idx}`} className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-lg">
                        <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{doc.name}</span>
                        <button
                          type="button"
                          onClick={() => documentPreviewUrls[idx] && window.open(documentPreviewUrls[idx], '_blank')}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDocumentFile(idx)}
                          className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="w-full flex items-center gap-2 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload documents (PDF, DOC)
                  </button>
                )}
              </div>

              {/* 3D Models */}
              <div className="pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-2">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">3D Models <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">(STEP format (CAD))</span></span>
                
                {model3dFile ? (
                  <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/30 rounded-lg">
                    <Box className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{model3dFile.name}</span>
                    <button
                      type="button"
                      onClick={() => handleModel3dChange(null)}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : existingModel3dPath ? (
                  <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800/30 rounded-lg">
                    <Box className="w-4 h-4 text-purple-500 flex-shrink-0" />
                    <span className="text-sm text-gray-900 dark:text-white truncate flex-1">{existingModel3dPath.split('/').pop()}</span>
                    <button
                      type="button"
                      onClick={() => document.getElementById('file-model3d')?.click()}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                    >
                      Replace
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => document.getElementById('file-model3d')?.click()}
                    className="w-full flex items-center gap-2 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-400 dark:text-gray-500 hover:border-purple-400 hover:text-purple-500 dark:hover:border-purple-500 dark:hover:text-purple-400 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload 3D CAD model (STEP, STP, STL, OBJ)
                  </button>
                )}
              </div>

              {hasDownloads && (
                <p className="text-[11px] text-blue-600 dark:text-blue-400 pl-4">
                  Downloads are active on the card above - click "Downloads" to verify files
                </p>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}