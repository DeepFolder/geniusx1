import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { BaseRetriever } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { RunnablePassthrough, RunnableParallel } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { db } from '../db';
import { testAgentDocumentChunks } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { ChatMessage, ChatRequest, ChatResponse } from './types';

const SYSTEM_PROMPT = `You are a helpful product search assistant. You help users find and learn about industrial products, manufacturing equipment, and related items. Be concise and helpful.

Use the provided context documents to answer user questions. Always cite the source documents when using information from them.`;

/**
 * Custom Retriever that queries PostgreSQL vector database
 * Implements LangChain's BaseRetriever interface for Hybrid RAG pattern
 */
class PostgreSQLVectorRetriever extends BaseRetriever {
  lc_namespace = ['langchain', 'retrievers', 'pgvector'];
  
  private embeddings: OpenAIEmbeddings;
  private companyId: number;
  private topK: number = 3;

  constructor(companyId: number, embeddings: OpenAIEmbeddings) {
    super();
    this.companyId = companyId;
    this.embeddings = embeddings;
    console.log('[PostgreSQLVectorRetriever] Initializing retriever for company:', companyId);
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    console.log('[PostgreSQLVectorRetriever] Retrieving documents for query:', query.substring(0, 50));
    
    try {
      // Fetch all chunks for the company
      console.log('[PostgreSQLVectorRetriever] Querying database for company chunks...');
      const chunks = await db
        .select()
        .from(testAgentDocumentChunks)
        .where(eq(testAgentDocumentChunks.companyId, this.companyId));
      
      if (chunks.length === 0) {
        console.log('[PostgreSQLVectorRetriever] No chunks found for company');
        return [];
      }

      console.log('[PostgreSQLVectorRetriever] Found', chunks.length, 'chunks, computing query embedding...');
      
      // Embed the query using OpenAI embeddings (following LangChain pattern)
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Score chunks using cosine similarity (following LangChain RAG pattern)
      const scoredChunks = chunks.map((chunk) => {
        const embedding = JSON.parse(chunk.embedding) as number[];
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        return { chunk, similarity };
      });

      // Sort by similarity and get top K results
      scoredChunks.sort((a, b) => b.similarity - a.similarity);
      const topResults = scoredChunks.slice(0, this.topK);
      
      console.log('[PostgreSQLVectorRetriever] Retrieved', topResults.length, 'relevant documents');

      // Convert to LangChain Document format
      const documents = topResults.map((result) => 
        new Document({
          pageContent: result.chunk.chunkText,
          metadata: {
            filename: result.chunk.filename,
            similarity: result.similarity,
            source: result.chunk.documentId,
          },
        })
      );

      return documents;
    } catch (error) {
      console.error('[PostgreSQLVectorRetriever] Error retrieving documents:', error);
      return [];
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
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
}

/**
 * ChatService implementing LangChain's Hybrid RAG pattern
 * Combines retrieval + generation in a predictable 2-step flow
 * Reference: https://docs.langchain.com/oss/javascript/langchain/retrieval#hybrid-rag
 */
export class ChatService {
  private model: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;

  constructor() {
    console.log('[ChatService] Initializing chat service with Hybrid RAG pattern...');
    
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
    });
    
    console.log('[ChatService] Chat service initialized with LangChain Hybrid RAG');
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    console.log('[ChatService] Processing chat request:', {
      messageLength: request.message.length,
      historyLength: request.conversationHistory?.length || 0,
      companyId: request.companyId,
    });

    try {
      // Step 1: Retrieve relevant documents if companyId provided
      let retrievedDocs: Document[] = [];
      if (request.companyId) {
        console.log('[ChatService] Creating retriever for company:', request.companyId);
        const retriever = new PostgreSQLVectorRetriever(request.companyId, this.embeddings);
        retrievedDocs = await retriever.invoke(request.message);
        console.log('[ChatService] Retrieved', retrievedDocs.length, 'documents');
      }

      // Step 2: Format context from retrieved documents
      const contextString = retrievedDocs
        .map((doc, i) => `[Document ${i + 1} - ${doc.metadata?.filename}]\n${doc.pageContent}`)
        .join('\n\n');

      // Step 3: Build prompt using LangChain's ChatPromptTemplate
      console.log('[ChatService] Building prompt with LangChain ChatPromptTemplate...');
      const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
        HumanMessagePromptTemplate.fromTemplate(
          contextString 
            ? `Context documents:\n${contextString}\n\nCurrent question: {question}`
            : '{question}'
        ),
      ]);

      // Step 4: Create Hybrid RAG chain combining retrieval + generation
      // Following LangChain pattern: https://docs.langchain.com/oss/javascript/langchain/retrieval#hybrid-rag
      console.log('[ChatService] Building Hybrid RAG chain...');
      const chain = prompt.pipe(this.model).pipe(new StringOutputParser());

      // Step 5: Invoke the chain with the query
      console.log('[ChatService] Invoking Hybrid RAG chain...');
      const startTime = Date.now();
      const response = await chain.invoke({ question: request.message });
      const duration = Date.now() - startTime;

      console.log('[ChatService] Chain execution completed:', {
        durationMs: duration,
        responseLength: response.length,
        docsUsed: retrievedDocs.length,
      });

      return {
        message: response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[ChatService] Error in Hybrid RAG chain:', error);
      throw error;
    }
  }
}

export const chatService = new ChatService();
