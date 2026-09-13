export interface DocumentUpload {
  companyId: number;
  filename: string;
  content: string;
}

export interface DocumentChunk {
  id: string;
  companyId: number;
  content: string;
  metadata: {
    filename: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

export interface RAGQuery {
  companyId: number;
  question: string;
}

export interface RAGResponse {
  answer: string;
  sources: Array<{
    content: string;
    filename: string;
  }>;
  timestamp: string;
}

export interface UploadResponse {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  message: string;
  summary?: string;
  keyInsights?: string[];
}
