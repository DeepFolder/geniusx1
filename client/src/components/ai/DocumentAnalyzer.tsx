import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { 
  FileText, 
  Upload, 
  Brain, 
  Search, 
  AlertCircle, 
  CheckCircle,
  Clock,
  Download,
  Eye,
  Zap,
  FileCheck,
  FileX,
  Lightbulb,
  TrendingUp,
  Shield,
  Database
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

interface DocumentAnalysis {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadDate: Date;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  analysis: {
    documentType: string;
    keyInsights: string[];
    technicalSpecs: Record<string, any>;
    certifications: string[];
    complianceStatus: {
      standard: string;
      status: 'compliant' | 'non-compliant' | 'partial';
      details: string;
    }[];
    extractedData: {
      metadata: Record<string, any>;
      textContent: string;
      tables: any[];
      images: string[];
    };
    riskAssessment: {
      level: 'low' | 'medium' | 'high';
      factors: string[];
      recommendations: string[];
    };
    marketRelevance: {
      score: number;
      trending: boolean;
      competitorAnalysis: string[];
    };
  };
  actionableItems: {
    id: string;
    type: 'update' | 'compliance' | 'opportunity' | 'risk';
    priority: 'low' | 'medium' | 'high';
    description: string;
    deadline?: Date;
    assignedTo?: string;
  }[];
}

interface DocumentAnalyzerProps {
  companyId: number;
}

export default function DocumentAnalyzer({ companyId }: DocumentAnalyzerProps) {
  const queryClient = useQueryClient();
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'insights' | 'compliance' | 'actions'>('overview');

  // Fetch analyzed documents
  const { data: documents, isLoading } = useQuery<DocumentAnalysis[]>({
    queryKey: ['/api/documents/analyzed', companyId],
    refetchInterval: 5000, // Refresh every 5 seconds for processing updates
  });

  // Upload and analyze document mutation
  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', companyId.toString());
      
      return apiRequest('/api/documents/analyze', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents/analyzed'] });
    },
  });

  // Reanalyze document mutation
  const reanalyzeMutation = useMutation({
    mutationFn: async (documentId: string) => {
      return apiRequest(`/api/documents/${documentId}/reanalyze`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents/analyzed'] });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      analyzeMutation.mutate(file);
    });
  }, [analyzeMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
      'image/*': ['.jpg', '.jpeg', '.png', '.tiff'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const selectedDoc = documents?.find(doc => doc.id === selectedDocument);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <FileX className="w-4 h-4 text-red-500" />;
      default: return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getComplianceIcon = (status: string) => {
    switch (status) {
      case 'compliant': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'non-compliant': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'partial': return <Clock className="w-4 h-4 text-yellow-500" />;
      default: return <FileCheck className="w-4 h-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Document Intelligence</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              AI-powered analysis of technical documents and certifications
            </p>
          </div>
        </div>
        
        <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
          <Database className="w-3 h-3 mr-1" />
          {documents?.length || 0} Analyzed
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Documents</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Upload Area */}
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  isDragActive 
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                    : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                )}
              >
                <input {...getInputProps()} />
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {isDragActive
                    ? "Drop documents here..."
                    : "Drag & drop documents or click to upload"
                  }
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  PDF, DOC, XLS, TXT, Images (max 50MB)
                </p>
              </div>

              {/* Document List */}
              <div className="mt-6 space-y-2">
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    </div>
                  ))
                ) : (
                  documents?.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDocument(doc.id)}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedDocument === doc.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      )}
                    >
                      <div className="flex items-start space-x-3">
                        {getStatusIcon(doc.status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {doc.fileName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {doc.analysis?.documentType || 'Unknown type'}
                          </p>
                          {doc.status === 'processing' && (
                            <Progress value={doc.progress} className="mt-2 h-1" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Analysis Results */}
        <div className="lg:col-span-2">
          {selectedDoc ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <FileCheck className="w-5 h-5" />
                    <span>{selectedDoc.fileName}</span>
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{selectedDoc.analysis.documentType}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reanalyzeMutation.mutate(selectedDoc.id)}
                    >
                      <Zap className="w-4 h-4 mr-1" />
                      Reanalyze
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="insights">Insights</TabsTrigger>
                    <TabsTrigger value="compliance">Compliance</TabsTrigger>
                    <TabsTrigger value="actions">Actions</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          Key Insights
                        </div>
                        <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                          {selectedDoc.analysis.keyInsights.length}
                        </div>
                      </div>
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="text-sm font-medium text-green-700 dark:text-green-300">
                          Certifications
                        </div>
                        <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                          {selectedDoc.analysis.certifications.length}
                        </div>
                      </div>
                      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <div className="text-sm font-medium text-purple-700 dark:text-purple-300">
                          Market Score
                        </div>
                        <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                          {selectedDoc.analysis.marketRelevance.score}%
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Key Insights
                        </h4>
                        <ul className="space-y-1">
                          {selectedDoc.analysis.keyInsights.map((insight, index) => (
                            <li key={index} className="flex items-start">
                              <Lightbulb className="w-4 h-4 text-yellow-500 mr-2 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-700 dark:text-gray-300">{insight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Technical Specifications
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(selectedDoc.analysis.technicalSpecs).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-sm text-gray-600 dark:text-gray-400">{key}:</span>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="insights" className="space-y-4">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                          Risk Assessment
                        </h4>
                        <div className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Risk Level</span>
                            <Badge variant={
                              selectedDoc.analysis.riskAssessment.level === 'high' ? 'destructive' :
                              selectedDoc.analysis.riskAssessment.level === 'medium' ? 'secondary' : 'default'
                            }>
                              {selectedDoc.analysis.riskAssessment.level.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Risk Factors:
                              </h5>
                              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                {selectedDoc.analysis.riskAssessment.factors.map((factor, index) => (
                                  <li key={index} className="flex items-start">
                                    <AlertCircle className="w-3 h-3 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
                                    {factor}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Recommendations:
                              </h5>
                              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                {selectedDoc.analysis.riskAssessment.recommendations.map((rec, index) => (
                                  <li key={index} className="flex items-start">
                                    <CheckCircle className="w-3 h-3 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                                    {rec}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                          Market Relevance
                        </h4>
                        <div className="p-4 border rounded-lg space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Relevance Score</span>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold">
                                {selectedDoc.analysis.marketRelevance.score}%
                              </span>
                              {selectedDoc.analysis.marketRelevance.trending && (
                                <Badge variant="default" className="bg-green-500">
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                  Trending
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Progress value={selectedDoc.analysis.marketRelevance.score} />
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Competitor Analysis:
                            </h5>
                            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                              {selectedDoc.analysis.marketRelevance.competitorAnalysis.map((analysis, index) => (
                                <li key={index}>• {analysis}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="compliance" className="space-y-4">
                    <div className="space-y-3">
                      {selectedDoc.analysis.complianceStatus.map((compliance, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                              {compliance.standard}
                            </h4>
                            <div className="flex items-center space-x-2">
                              {getComplianceIcon(compliance.status)}
                              <Badge variant={
                                compliance.status === 'compliant' ? 'default' :
                                compliance.status === 'non-compliant' ? 'destructive' : 'secondary'
                              }>
                                {compliance.status.replace('-', ' ').toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {compliance.details}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                        Identified Certifications
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedDoc.analysis.certifications.map((cert, index) => (
                          <Badge key={index} variant="outline" className="flex items-center space-x-1">
                            <Shield className="w-3 h-3" />
                            <span>{cert}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="actions" className="space-y-4">
                    <div className="space-y-3">
                      {selectedDoc.actionableItems.map((item) => (
                        <div key={item.id} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge className={getPriorityColor(item.priority)}>
                                  {item.priority.toUpperCase()}
                                </Badge>
                                <Badge variant="outline">{item.type}</Badge>
                              </div>
                              <p className="text-sm text-gray-900 dark:text-white font-medium">
                                {item.description}
                              </p>
                              {item.deadline && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Due: {new Date(item.deadline).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <Button size="sm" variant="outline">
                              Assign
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                  Select a document to analyze
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Choose a document from the list to view its AI-powered analysis
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}