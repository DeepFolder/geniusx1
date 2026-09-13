import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FileText, Download, Trash2, Eye, EyeOff, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Document {
  id: number;
  filename: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  description?: string;
  category?: string;
  tags?: string[];
  isPublic: boolean;
  createdAt: string;
  uploadedBy?: string;
}

interface DocumentListProps {
  companyId: number;
  canManage?: boolean;
}

export default function DocumentList({ companyId, canManage = false }: DocumentListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: [`/api/companies/${companyId}/documents`],
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      await apiRequest(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "The document has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/companies/${companyId}/documents`] });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    return <FileText className="h-5 w-5 text-blue-500" />;
  };

  const getCategoryColor = (category?: string) => {
    const colors: Record<string, string> = {
      'brochure': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'certification': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'manual': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'presentation': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'whitepaper': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      'case-study': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      'specification': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    };
    return colors[category || ''] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <FileText className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No documents available
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-center">
            {canManage ? "Upload your first document to get started." : "This company hasn't shared any documents yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {documents.map((doc: Document) => (
        <Card key={doc.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4 flex-1">
                <div className="flex-shrink-0">
                  {getFileIcon(doc.fileType)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
                      {doc.originalName}
                    </h3>
                    <div className="flex items-center space-x-2 ml-4">
                      {doc.isPublic ? (
                        <Eye className="h-4 w-4 text-green-500" title="Public document" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-400" title="Private document" />
                      )}
                    </div>
                  </div>
                  
                  {doc.description && (
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-2">
                      {doc.description}
                    </p>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {doc.category && (
                      <Badge className={getCategoryColor(doc.category)}>
                        {doc.category}
                      </Badge>
                    )}
                    {doc.tags?.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 space-x-4">
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                    </span>
                    <span>{formatFileSize(doc.fileSize)}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 ml-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/uploads/${doc.filename}`, '_blank')}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}