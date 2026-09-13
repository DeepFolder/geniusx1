import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, X } from "lucide-react";

interface DocumentUploadProps {
  companyId: number;
}

export default function DocumentUpload({ companyId }: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    description: "",
    category: "",
    tags: "",
    isPublic: false
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: { file: File; formData: typeof formData }) => {
      const formDataObj = new FormData();
      formDataObj.append('document', data.file);
      formDataObj.append('description', data.formData.description);
      formDataObj.append('category', data.formData.category);
      formDataObj.append('tags', data.formData.tags);
      formDataObj.append('isPublic', data.formData.isPublic.toString());

      const response = await fetch(`/api/companies/${companyId}/documents`, {
        method: 'POST',
        credentials: 'include',
        body: formDataObj,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document uploaded successfully",
        description: "Your document has been uploaded and is available in the company profile.",
      });
      
      // Reset form
      setFile(null);
      setFormData({
        description: "",
        category: "",
        tags: "",
        isPublic: false
      });

      // Refresh documents list
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/documents`] });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    mutation.mutate({ file, formData });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];
      
      if (!allowedTypes.includes(selectedFile.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF, DOC, DOCX, or TXT file",
          variant: "destructive",
        });
        return;
      }

      // Check file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }

      setFile(selectedFile);
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Upload Company Document</CardTitle>
        <CardDescription>
          Upload brochures, certifications, manuals, and other company documents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document">Document File *</Label>
            <div className="flex items-center gap-4">
              <Input
                id="document"
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.txt"
                className="flex-1"
              />
              {file && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={removeFile}
                    className="h-auto p-1"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Supported formats: PDF, DOC, DOCX, TXT. Max size: 10MB
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={formData.category} onValueChange={(value) => handleChange("category", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select document category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                <SelectItem value="brochure">Product Brochure</SelectItem>
                <SelectItem value="certification">Certification</SelectItem>
                <SelectItem value="manual">Technical Manual</SelectItem>
                <SelectItem value="presentation">Company Presentation</SelectItem>
                <SelectItem value="whitepaper">White Paper</SelectItem>
                <SelectItem value="case-study">Case Study</SelectItem>
                <SelectItem value="specification">Technical Specification</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Brief description of the document content..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={formData.tags}
              onChange={(e) => handleChange("tags", e.target.value)}
              placeholder="engineering, manufacturing, ISO9001 (comma separated)"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="isPublic"
              checked={formData.isPublic}
              onCheckedChange={(checked) => handleChange("isPublic", checked)}
            />
            <Label htmlFor="isPublic">Make this document publicly visible</Label>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={mutation.isPending || !file}
          >
            <Upload className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Uploading..." : "Upload Document"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}