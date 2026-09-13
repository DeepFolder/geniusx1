import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  Upload, 
  FileText, 
  Trash2, 
  RefreshCw, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Clock,
  Eye,
  Database,
  AlertCircle
} from 'lucide-react';

interface Document {
  id: number;
  filename: string;
  path: string;
  type: string;
  status: string;
  isProcessed: boolean;
  totalChunks: number;
  companyId: number | null;
  productId: number | null;
  metadata: Record<string, any>;
  createdAt: string;
}

interface DocumentStats {
  total: number;
  byStatus: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  totalChunks: number;
  processed: number;
}

export function DocumentManager() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  const { data: documents, isLoading: isLoadingDocs, refetch: refetchDocs } = useQuery<{ documents: Document[] }>({
    queryKey: ['/api/documents'],
    refetchInterval: 5000,
  });

  const { data: stats, refetch: refetchStats } = useQuery<DocumentStats>({
    queryKey: ['/api/documents/stats/summary'],
    refetchInterval: 5000,
  });

  const { data: docDetails, refetch: refetchDetails } = useQuery<{ document: Document; chunks: any[] }>({
    queryKey: ['/api/documents', selectedDocId],
    enabled: !!selectedDocId,
  });

  const selectedDoc = documents?.documents?.find(d => d.id === selectedDocId) || null;

  useEffect(() => {
    if (selectedDocId) {
      refetchDetails();
    }
  }, [selectedDocId, refetchDetails]);

  const refreshAll = () => {
    refetchDocs();
    refetchStats();
    if (selectedDocId) {
      refetchDetails();
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('processEmbeddings', 'true');
      
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Document uploaded successfully' });
      refreshAll();
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Upload failed', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/documents/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      toast({ title: 'Document deleted' });
      setSelectedDocId(null);
      refreshAll();
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Delete failed', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/documents/${id}/reprocess`, { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: 'Reprocessing started' });
      refreshAll();
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Reprocess failed', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      await uploadMutation.mutateAsync(file);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500" data-testid="status-completed"><CheckCircle className="h-3 w-3 mr-1" />Processed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500" data-testid="status-processing"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive" data-testid="status-failed"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline" data-testid="status-pending"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6" data-testid="document-manager">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card data-testid="stat-total">
          <CardHeader className="py-3 px-4">
            <CardDescription>Total Documents</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-stat-total">{stats?.total || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card data-testid="stat-completed">
          <CardHeader className="py-3 px-4">
            <CardDescription>Processed</CardDescription>
            <CardTitle className="text-2xl text-green-600" data-testid="text-stat-completed">{stats?.byStatus.completed || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card data-testid="stat-processing">
          <CardHeader className="py-3 px-4">
            <CardDescription>Processing</CardDescription>
            <CardTitle className="text-2xl text-blue-600" data-testid="text-stat-processing">{stats?.byStatus.processing || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card data-testid="stat-chunks">
          <CardHeader className="py-3 px-4">
            <CardDescription>Total Chunks</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-stat-chunks">{stats?.totalChunks || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Failed Documents Alert */}
      {stats?.byStatus.failed && stats.byStatus.failed > 0 && (
        <Card className="border-destructive" data-testid="alert-failed">
          <CardContent className="py-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm">{stats.byStatus.failed} document(s) failed processing. Select to view details or reprocess.</span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document List */}
        <Card className="lg:col-span-2" data-testid="card-document-list">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Document Library</CardTitle>
                <CardDescription>Manage uploaded documents for RAG processing</CardDescription>
              </div>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.json"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-doc-file"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={refreshAll}
                  data-testid="button-refresh-docs"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="button-upload-doc"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload Document
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {isLoadingDocs ? (
                <div className="flex items-center justify-center py-8" data-testid="loading-docs">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : documents?.documents && documents.documents.length > 0 ? (
                <Table data-testid="table-documents">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Chunks</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.documents.map(doc => (
                      <TableRow 
                        key={doc.id} 
                        className={selectedDocId === doc.id ? 'bg-muted' : ''}
                        data-testid={`row-doc-${doc.id}`}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate max-w-[200px]" data-testid={`text-filename-${doc.id}`}>{doc.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`badge-type-${doc.id}`}>{doc.type}</Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Database className="h-3 w-3 text-muted-foreground" />
                            <span data-testid={`text-chunks-${doc.id}`}>{doc.totalChunks}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedDocId(doc.id)}
                              data-testid={`button-view-${doc.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => reprocessMutation.mutate(doc.id)}
                              disabled={reprocessMutation.isPending || doc.type !== 'pdf'}
                              data-testid={`button-reprocess-${doc.id}`}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => deleteMutation.mutate(doc.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-${doc.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="empty-docs">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No documents uploaded yet</p>
                  <p className="text-sm text-muted-foreground">Upload PDF files to add them to the knowledge base</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Document Details */}
        <Card data-testid="card-document-details">
          <CardHeader>
            <CardTitle className="text-lg">Document Details</CardTitle>
            <CardDescription>
              {selectedDoc ? 'View document information and chunks' : 'Select a document to view details'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedDoc && docDetails ? (
              <div className="space-y-4" data-testid="doc-details-content">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Filename:</span>
                    <span className="font-medium truncate max-w-[150px]" data-testid="detail-filename">{docDetails.document.filename}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Type:</span>
                    <span data-testid="detail-type">{docDetails.document.type}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <span data-testid="detail-status">{getStatusBadge(docDetails.document.status)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Chunks:</span>
                    <span data-testid="detail-chunks">{docDetails.document.totalChunks}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Created:</span>
                    <span data-testid="detail-created">{new Date(docDetails.document.createdAt).toLocaleDateString()}</span>
                  </div>
                  {docDetails.document.status === 'failed' && docDetails.document.metadata?.error && (
                    <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive" data-testid="detail-error">
                      <strong>Error:</strong> {docDetails.document.metadata.error}
                    </div>
                  )}
                </div>

                {docDetails.chunks && docDetails.chunks.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Chunks Preview</h4>
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2" data-testid="chunks-list">
                        {docDetails.chunks.slice(0, 5).map(chunk => (
                          <div key={chunk.id} className="p-2 bg-muted rounded text-xs" data-testid={`chunk-${chunk.id}`}>
                            <div className="flex justify-between mb-1">
                              <Badge variant="outline" className="text-xs">#{chunk.chunkIndex}</Badge>
                              {chunk.hasEmbedding && (
                                <Badge className="bg-green-100 text-green-800 text-xs">Embedded</Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground line-clamp-3">{chunk.contentPreview}</p>
                          </div>
                        ))}
                        {docDetails.chunks.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center py-2" data-testid="more-chunks">
                            +{docDetails.chunks.length - 5} more chunks
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="no-doc-selected">
                <Eye className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Select a document to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
