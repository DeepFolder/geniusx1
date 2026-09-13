import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AddCatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onCatalogueAdded: () => void;
}

export default function AddCatalogueModal({
  isOpen,
  onClose,
  companyId,
  onCatalogueAdded
}: AddCatalogueModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Catalogue name is required",
        variant: "destructive",
      });
      return;
    }
    
    if (!pdfFile) {
      toast({
        title: "Validation Error",
        description: "PDF attachment is required",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);

    try {
      const catalogueData = new FormData();
      catalogueData.append('name', formData.name);
      if (formData.description) {
        catalogueData.append('description', formData.description);
      }
      catalogueData.append('pdf', pdfFile);
      catalogueData.append('companyId', companyId);

      await apiRequest(`/api/companies/${companyId}/catalogues`, {
        method: 'POST',
        body: catalogueData,
      });

      toast({
        title: "Success",
        description: "Catalogue added successfully",
      });

      onCatalogueAdded();
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
      });
      setPdfFile(null);

    } catch (error) {
      console.error('Error saving catalogue:', error);
      toast({
        title: "Error",
        description: "Failed to add catalogue",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            Add New Catalogue
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-900 dark:text-gray-200">
              Catalogue Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter catalogue name"
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-900 dark:text-gray-200">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Add a description (optional)"
              rows={3}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900 dark:text-gray-200">
              PDF Attachment <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPdfFile(file);
                  }
                }}
                className="hidden"
                id="pdf-upload"
                key={pdfFile ? 'has-file' : 'no-file'}
              />
              
              {pdfFile ? (
                <div className="border-2 border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="bg-green-100 dark:bg-green-800/50 p-2 rounded-lg">
                        <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">PDF Document</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate" title={pdfFile.name}>
                          {pdfFile.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                          {Math.round(pdfFile.size / 1024)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPdfFile(null)}
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
                  onClick={() => document.getElementById('pdf-upload')?.click()}
                  className="w-full h-auto p-4 flex items-start gap-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600"
                >
                  <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
                    <FileText className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">PDF Document</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Click to upload PDF file</p>
                  </div>
                  <Upload className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-1" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onClose} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white">
              {isLoading ? 'Adding...' : 'Add Catalogue'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
