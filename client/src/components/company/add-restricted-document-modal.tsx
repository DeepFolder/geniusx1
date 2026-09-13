import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AddRestrictedDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onDocumentAdded: () => void;
}

export default function AddRestrictedDocumentModal({
  isOpen,
  onClose,
  companyId,
  onDocumentAdded
}: AddRestrictedDocumentModalProps) {
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
    
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Document name is required",
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
      const documentData = new FormData();
      documentData.append('name', formData.name);
      if (formData.description) {
        documentData.append('description', formData.description);
      }
      documentData.append('pdf', pdfFile);
      documentData.append('companyId', companyId);

      await apiRequest(`/api/companies/${companyId}/restricted-documents`, {
        method: 'POST',
        body: documentData,
      });

      toast({
        title: "Success",
        description: "Restricted document added successfully",
      });

      onDocumentAdded();
      onClose();
      
      setFormData({
        name: '',
        description: '',
      });
      setPdfFile(null);

    } catch (error) {
      console.error('Error saving restricted document:', error);
      toast({
        title: "Error",
        description: "Failed to add restricted document",
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
            Add Restricted Document (AI Training Only)
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            These documents are used exclusively for AI training and are not downloadable by users.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-900 dark:text-gray-200">
              Document Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter document name"
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
                id="pdf-upload-restricted"
                key={pdfFile ? 'has-file' : 'no-file'}
              />
              
              {pdfFile ? (
                <div className="border-2 border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="bg-blue-100 dark:bg-blue-800/50 p-2 rounded-lg">
                        <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">Restricted PDF</p>
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
                  onClick={() => document.getElementById('pdf-upload-restricted')?.click()}
                  className="w-full h-auto p-4 flex items-start gap-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600"
                >
                  <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
                    <Lock className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">Restricted PDF Document</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Click to upload PDF file (AI training only)</p>
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
              {isLoading ? 'Adding...' : 'Add Document'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
