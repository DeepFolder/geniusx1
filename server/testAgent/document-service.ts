import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { db } from '../db';
import { testAgentDocumentChunks, testAgentDocumentSummaries } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { DocumentUpload, RAGQuery, RAGResponse, UploadResponse } from './document-types';

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class DocumentService {
  private embeddings: OpenAIEmbeddings;
  private model: ChatOpenAI;
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor() {
    console.log('[DocumentService] Initializing document service...');
    
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
    });
    
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    console.log('[DocumentService] Document service initialized');
  }

  async uploadDocument(upload: DocumentUpload): Promise<UploadResponse> {
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('[DocumentService] Processing document upload:', {
      companyId: upload.companyId,
      filename: upload.filename,
      contentLength: upload.content.length,
    });

    try {
      console.log('[DocumentService] Splitting document into chunks...');
      const chunks = await this.textSplitter.splitText(upload.content);
      console.log('[DocumentService] Created', chunks.length, 'chunks');

      console.log('[DocumentService] Generating embeddings for chunks...');
      const chunkEmbeddings = await this.embeddings.embedDocuments(chunks);
      console.log('[DocumentService] Generated', chunkEmbeddings.length, 'embeddings');

      console.log('[DocumentService] Storing chunks in database...');
      
      for (let i = 0; i < chunks.length; i++) {
        await db.insert(testAgentDocumentChunks).values({
          companyId: upload.companyId,
          documentId,
          filename: upload.filename,
          chunkIndex: i,
          totalChunks: chunks.length,
          chunkText: chunks[i],
          embedding: JSON.stringify(chunkEmbeddings[i]),
        });
        console.log(`[DocumentService] Stored chunk ${i + 1}/${chunks.length}`);
      }

      console.log('[DocumentService] All chunks stored in database successfully');

      // Generate AI summary
      console.log('[DocumentService] Generating AI summary...');
      const summaryResult = await this.generateSummary(upload.content, upload.filename);
      
      // Store summary in database
      console.log('[DocumentService] Storing summary in database...');
      await db.insert(testAgentDocumentSummaries).values({
        companyId: upload.companyId,
        documentId,
        filename: upload.filename,
        summary: summaryResult.summary,
        keyInsights: summaryResult.keyInsights.length > 0 ? summaryResult.keyInsights : [],
        wordCount: upload.content.split(/\s+/).length,
      });
      console.log('[DocumentService] Summary stored successfully');
      
      return {
        success: true,
        documentId,
        chunksCreated: chunks.length,
        message: `Document "${upload.filename}" processed successfully with ${chunks.length} chunks stored in database`,
        summary: summaryResult.summary,
        keyInsights: summaryResult.keyInsights,
      };
    } catch (error) {
      console.error('[DocumentService] Error processing document:', error);
      throw error;
    }
  }

  private async generateSummary(content: string, filename: string): Promise<{ summary: string; keyInsights: string[] }> {
    console.log('[DocumentService] Calling LLM for summary generation...');
    
    // Truncate content if too long (keep first 8000 chars for summary)
    const truncatedContent = content.length > 8000 
      ? content.substring(0, 8000) + '...[content truncated]'
      : content;
    
    const prompt = `Analyze the following document and provide:
1. A concise summary (2-3 paragraphs) explaining what this document is about
2. 3-5 key insights or important points from the document

Document filename: ${filename}

Document content:
${truncatedContent}

Respond in JSON format:
{
  "summary": "Your 2-3 paragraph summary here",
  "keyInsights": ["insight 1", "insight 2", "insight 3"]
}`;

    try {
      const response = await this.model.invoke(prompt);
      const responseText = response.content.toString();
      
      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('[DocumentService] Summary generated successfully');
        return {
          summary: parsed.summary || 'Summary generation failed',
          keyInsights: parsed.keyInsights || [],
        };
      }
      
      // Fallback if JSON parsing fails
      console.log('[DocumentService] JSON parsing failed, using raw response');
      return {
        summary: responseText.substring(0, 500),
        keyInsights: [],
      };
    } catch (error) {
      console.error('[DocumentService] Summary generation error:', error);
      return {
        summary: 'Failed to generate summary',
        keyInsights: [],
      };
    }
  }

  async queryRAG(query: RAGQuery): Promise<RAGResponse> {
    console.log('[DocumentService] Processing RAG query:', {
      companyId: query.companyId,
      question: query.question.substring(0, 100),
    });

    try {
      console.log('[DocumentService] Fetching chunks from database...');
      const companyChunks = await db
        .select()
        .from(testAgentDocumentChunks)
        .where(eq(testAgentDocumentChunks.companyId, query.companyId));
      
      console.log('[DocumentService] Found', companyChunks.length, 'chunks for company:', query.companyId);
      
      if (companyChunks.length === 0) {
        console.log('[DocumentService] No documents found for company:', query.companyId);
        return {
          answer: 'No documents have been uploaded for this company yet. Please upload some documents first.',
          sources: [],
          timestamp: new Date().toISOString(),
        };
      }

      console.log('[DocumentService] Embedding query...');
      const queryEmbedding = await this.embeddings.embedQuery(query.question);

      console.log('[DocumentService] Searching for relevant chunks...');
      const scoredChunks = companyChunks.map((chunk) => {
        const embedding = JSON.parse(chunk.embedding) as number[];
        return {
          chunk,
          score: cosineSimilarity(queryEmbedding, embedding),
        };
      });

      scoredChunks.sort((a, b) => b.score - a.score);
      const topChunks = scoredChunks.slice(0, 4);
      
      console.log('[DocumentService] Found', topChunks.length, 'relevant chunks with scores:', 
        topChunks.map(c => c.score.toFixed(3)));

      const context = topChunks
        .map((item, i: number) => `[Source ${i + 1}]: ${item.chunk.chunkText}`)
        .join('\n\n');

      console.log('[DocumentService] Generating answer with LLM...');
      const prompt = `You are a helpful assistant answering questions based on company documents.
      
Use the following context to answer the question. If you cannot find the answer in the context, say so clearly.

Context:
${context}

Question: ${query.question}

Answer:`;

      const response = await this.model.invoke(prompt);
      const answer = response.content.toString();

      console.log('[DocumentService] RAG query completed successfully');

      return {
        answer,
        sources: topChunks.map((item) => ({
          content: item.chunk.chunkText.substring(0, 200) + '...',
          filename: item.chunk.filename,
        })),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[DocumentService] Error in RAG query:', error);
      throw error;
    }
  }

  async getCompanyDocumentCount(companyId: number): Promise<number> {
    const chunks = await db
      .select()
      .from(testAgentDocumentChunks)
      .where(eq(testAgentDocumentChunks.companyId, companyId));
    return chunks.length;
  }

  // TODO: DELETE THIS METHOD BEFORE PRODUCTION - Admin viewer for test purposes only
  async getAllDocumentsAdmin(): Promise<{
    summaries: Array<{
      id: number;
      companyId: number;
      documentId: string;
      filename: string;
      summary: string;
      keyInsights: string[] | null;
      wordCount: number | null;
      createdAt: Date | null;
    }>;
    chunks: Array<{
      id: number;
      companyId: number;
      documentId: string;
      filename: string;
      chunkIndex: number;
      totalChunks: number;
      chunkText: string;
      createdAt: Date | null;
    }>;
  }> {
    console.log('[DocumentService] Fetching all documents for admin viewer...');
    
    const summaries = await db.select().from(testAgentDocumentSummaries);
    const chunks = await db.select({
      id: testAgentDocumentChunks.id,
      companyId: testAgentDocumentChunks.companyId,
      documentId: testAgentDocumentChunks.documentId,
      filename: testAgentDocumentChunks.filename,
      chunkIndex: testAgentDocumentChunks.chunkIndex,
      totalChunks: testAgentDocumentChunks.totalChunks,
      chunkText: testAgentDocumentChunks.chunkText,
      createdAt: testAgentDocumentChunks.createdAt,
    }).from(testAgentDocumentChunks);
    
    console.log('[DocumentService] Found', summaries.length, 'documents and', chunks.length, 'chunks');
    
    return { summaries, chunks };
  }
}

export const documentService = new DocumentService();
