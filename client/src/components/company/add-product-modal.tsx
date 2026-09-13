import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Upload, X, FileText, Box, Check, ChevronsUpDown, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onProductAdded: () => void;
  editingProduct?: any;
}

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

export default function AddProductModal({
  isOpen,
  onClose,
  companyId,
  onProductAdded,
  editingProduct
}: AddProductModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: editingProduct?.name || '',
    description: editingProduct?.description || '',
    category: editingProduct?.category || '',
    specifications: editingProduct?.specifications || '',
    price: editingProduct?.price || '',
    productWebLink: editingProduct?.productWebLink || '',
  });
  const [files, setFiles] = useState({
    image: null as File | null,
    datasheet: null as File | null,
    model3d: null as File | null,
    documentation: null as File | null,
  });
  const [isGeneratingSpecs, setIsGeneratingSpecs] = useState(false);
  const [aiSpecsPreview, setAiSpecsPreview] = useState<{summary: string; confidence: string} | null>(null);
  const [showSpecsConfirmation, setShowSpecsConfirmation] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (type: keyof typeof files, file: File | null) => {
    if (file) {
      // Add warning for identical file sizes (potential duplicate uploads)
      if (type === 'model3d' && files.model3d && files.model3d.size === file.size) {
        toast({
          title: "Warning",
          description: `This file has the same size as the previously selected file. Make sure you're selecting the correct STEP file.`,
          variant: "destructive",
        });
      }
    }
    setFiles(prev => ({ ...prev, [type]: file }));
  };

  const handleGenerateSpecsFromDatasheet = async () => {
    // Check if we're editing a product with a datasheet
    if (!editingProduct || !editingProduct.catalogPath) {
      toast({
        title: "No Datasheet",
        description: "Please upload and save a product datasheet first before generating specifications.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSpecs(true);

    try {
      const response = await apiRequest(`/api/products/${editingProduct.id}/generate-specs`, {
        method: 'POST',
        body: JSON.stringify({
          productName: formData.name,
          productCategory: formData.category,
          productDescription: formData.description,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate specifications');
      }

      // Show confirmation dialog with the AI-generated specs
      setAiSpecsPreview({
        summary: data.summary,
        confidence: data.confidence,
      });
      setShowSpecsConfirmation(true);

    } catch (error: any) {
      console.error('Error generating specs:', error);
      
      let errorMessage = 'Failed to generate specifications from datasheet';
      
      if (error.message?.includes('no_datasheet')) {
        errorMessage = 'No datasheet uploaded for this product';
      } else if (error.message?.includes('pdf_parse_failed')) {
        errorMessage = 'Failed to read PDF. The file may be corrupted or image-based.';
      } else if (error.message?.includes('ai_unavailable')) {
        errorMessage = 'AI service is temporarily unavailable. Please try again later.';
      }

      toast({
        title: "Generation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSpecs(false);
    }
  };

  const handleAcceptAiSpecs = () => {
    if (aiSpecsPreview) {
      handleInputChange('specifications', aiSpecsPreview.summary);
      setShowSpecsConfirmation(false);
      setAiSpecsPreview(null);
      
      toast({
        title: "Specifications Updated",
        description: "AI-generated specifications have been added to your product.",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Product name is required",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.category) {
      toast({
        title: "Validation Error",
        description: "Please select a category",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.description.trim()) {
      toast({
        title: "Validation Error",
        description: "Product description is required",
        variant: "destructive",
      });
      return;
    }
    
    // Product image is required only when adding a new product
    if (!editingProduct && !files.image) {
      toast({
        title: "Validation Error",
        description: "Product image is required",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);

    try {
      const productData = new FormData();
      productData.append('name', formData.name);
      productData.append('description', formData.description);
      productData.append('category', formData.category);
      productData.append('specifications', formData.specifications);
      productData.append('companyId', companyId);
      
      if (formData.price) {
        productData.append('price', formData.price);
      }
      
      if (formData.productWebLink) {
        productData.append('productWebLink', formData.productWebLink);
      }

      if (files.image) {
        productData.append('image', files.image);
      }
      if (files.datasheet) {
        productData.append('datasheet', files.datasheet);
      }
      if (files.model3d) {
        console.log('📤 Uploading 3D model:', files.model3d.name, 'Size:', files.model3d.size, 'Type:', files.model3d.type);
        productData.append('model3d', files.model3d);
      }
      if (files.documentation) {
        productData.append('documentation', files.documentation);
      }

      const endpoint = editingProduct 
        ? `/api/products/${editingProduct.id}`
        : `/api/companies/${companyId}/products`;
      
      const method = editingProduct ? 'PUT' : 'POST';

      await apiRequest(endpoint, {
        method,
        body: productData,
      });

      toast({
        title: "Success",
        description: `Product ${editingProduct ? 'updated' : 'added'} successfully`,
      });

      onProductAdded();
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        category: '',
        specifications: '',
        price: '',
        productWebLink: '',
      });
      setFiles({
        image: null,
        datasheet: null,
        model3d: null,
        documentation: null,
      });

    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        title: "Error",
        description: `Failed to ${editingProduct ? 'update' : 'add'} product`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const FileUploadButton = ({ 
    type, 
    label, 
    accept, 
    icon: Icon,
    description,
    required = false
  }: { 
    type: keyof typeof files; 
    label: string; 
    accept: string; 
    icon: any;
    description: string;
    required?: boolean;
  }) => (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="file"
          accept={accept}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              console.log(`📁 File selected for ${type}:`, file.name, 'Size:', file.size);
              handleFileChange(type, file);
            }
          }}
          className="hidden"
          id={`file-${type}`}
          key={files[type] ? 'has-file' : 'no-file'}
        />
        
        {files[type] ? (
          <div className="border-2 border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="bg-green-100 dark:bg-green-800/50 p-2 rounded-lg">
                  <Icon className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {label}{required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate" title={files[type]!.name}>
                    {files[type]!.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                    {Math.round(files[type]!.size / 1024)} KB
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleFileChange(type, null)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => document.getElementById(`file-${type}`)?.click()}
            className="w-full h-auto p-4 flex items-start gap-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600"
          >
            <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
              <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900 dark:text-white text-sm">
                {label}{required && <span className="text-red-500 ml-1">*</span>}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
            </div>
            <Upload className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-1" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            {editingProduct ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-900 dark:text-gray-200">Product Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter product name"
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-200">Category *</Label>
              <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryOpen}
                    className="w-full justify-between bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {formData.category
                      ? categories.find((cat) => cat.value === formData.category)?.label
                      : "Select category..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600" align="start">
                  <Command className="bg-white dark:bg-gray-800">
                    <CommandInput 
                      placeholder="Search category..." 
                      className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <CommandList>
                      <CommandEmpty className="text-gray-500 dark:text-gray-400 py-6 text-center text-sm">
                        No category found.
                      </CommandEmpty>
                      <CommandGroup>
                        {categories.map((category) => (
                          <CommandItem
                            key={category.value}
                            value={category.label}
                            onSelect={() => {
                              handleInputChange('category', category.value);
                              setCategoryOpen(false);
                            }}
                            className="text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.category === category.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {category.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-900 dark:text-gray-200">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe your product..."
              rows={3}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="specifications" className="text-gray-900 dark:text-gray-200">Technical Specifications</Label>
              {editingProduct && editingProduct.catalogPath && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSpecsFromDatasheet}
                  disabled={isGeneratingSpecs}
                  className="text-xs bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-900/30 dark:hover:to-blue-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300"
                  data-testid="button-generate-specs"
                >
                  {isGeneratingSpecs ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1" />
                      Generate from Datasheet
                    </>
                  )}
                </Button>
              )}
            </div>
            <Textarea
              id="specifications"
              value={formData.specifications}
              onChange={(e) => handleInputChange('specifications', e.target.value)}
              placeholder="List technical specifications, dimensions, materials, etc."
              rows={4}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            {!editingProduct?.catalogPath && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                💡 Tip: Upload and save a product datasheet first, then you can use AI to automatically extract specifications
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="price" className="text-gray-900 dark:text-gray-200">Price (Optional)</Label>
            <Input
              id="price"
              value={formData.price}
              onChange={(e) => handleInputChange('price', e.target.value)}
              placeholder="e.g. $99.99 or Contact for pricing"
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="productWebLink" className="text-gray-900 dark:text-gray-200">Product Web Link (Optional)</Label>
            <Input
              id="productWebLink"
              type="url"
              value={formData.productWebLink}
              onChange={(e) => handleInputChange('productWebLink', e.target.value)}
              placeholder="https://example.com/product-page"
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Link to this product on your company website (optional)
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Attachments</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FileUploadButton
                type="image"
                label="Product Image"
                description="JPG, PNG or WebP"
                accept="image/*"
                icon={Upload}
                required={!editingProduct}
              />
              
              <FileUploadButton
                type="datasheet"
                label="Product Data Sheet (PDF)"
                description="Technical specifications"
                accept=".pdf"
                icon={FileText}
              />
              
              <FileUploadButton
                type="model3d"
                label="3D Model (STEP)"
                description="STEP, STP, STL, OBJ"
                accept=".step,.stp,.stl,.obj,.fbx"
                icon={Box}
              />
              
              <FileUploadButton
                type="documentation"
                label="Documentation"
                description="Additional documents (PDF)"
                accept=".pdf"
                icon={FileText}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onClose} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white">
              {isLoading 
                ? (editingProduct ? 'Updating...' : 'Adding...') 
                : (editingProduct ? 'Update Product' : 'Add Product')
              }
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* AI Specs Confirmation Dialog */}
      <AlertDialog open={showSpecsConfirmation} onOpenChange={setShowSpecsConfirmation}>
        <AlertDialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              AI-Generated Specifications
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              Review the specifications extracted from your datasheet. You can accept them or continue editing manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {aiSpecsPreview && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Confidence:</span>
                <span className={cn(
                  "text-sm font-semibold px-2 py-0.5 rounded",
                  aiSpecsPreview.confidence === 'high' && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
                  aiSpecsPreview.confidence === 'medium' && "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
                  aiSpecsPreview.confidence === 'low' && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                )}>
                  {aiSpecsPreview.confidence.toUpperCase()}
                </span>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
                <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans leading-relaxed">
                  {aiSpecsPreview.summary}
                </pre>
              </div>
              
              {aiSpecsPreview.confidence === 'low' && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded border border-yellow-200 dark:border-yellow-800">
                  ⚠️ Low confidence: The AI had difficulty extracting specifications. You may want to review and edit them manually.
                </p>
              )}
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAcceptAiSpecs}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              Accept & Use These Specs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}