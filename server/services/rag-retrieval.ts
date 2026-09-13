import OpenAI from "openai";
import { createLazyOpenAI } from "./openai-client.js";
import { db } from "../db.js";
import { documentChunks, documentIndex, companies, products } from "../../shared/schema.js";
import { eq, and, or, sql, inArray } from "drizzle-orm";
import { documentEmbedding } from "./document-embedding.js";

const openai = createLazyOpenAI();

export interface RetrievedChunk {
  chunkId: number;
  documentId: number;
  documentName: string;
  companyId: number;
  companyName: string;
  productId?: number;
  productName?: string;
  chunkText: string;
  pageNumber?: number;
  sectionHeading?: string;
  similarityScore: number;
  relevanceScore: number; // Combined BM25 + vector score
  citation: string;
}

export interface RAGRetrievalOptions {
  topK?: number; // Number of chunks to retrieve (default: 5)
  companyIds?: number[]; // Filter by company IDs (for access control)
  productIds?: number[]; // Filter by product IDs
  minSimilarityScore?: number; // Minimum similarity threshold (default: 0.5)
  hybridAlpha?: number; // Balance between BM25 (0) and vector (1) search (default: 0.4 = 60% keyword, 40% semantic)
}

/**
 * RAG Retrieval Service
 * Hybrid search (BM25 + embeddings) for document chunks
 */
export class RAGRetrievalService {
  private readonly DEFAULT_TOP_K = 5;
  private readonly DEFAULT_MIN_SIMILARITY = 0.5;
  private readonly DEFAULT_HYBRID_ALPHA = 0.4; // 60% BM25, 40% vector

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Simple BM25-like scoring for text search
   * Returns a normalized score between 0 and 1
   */
  private calculateTextScore(query: string, text: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const textLower = text.toLowerCase();

    if (queryTerms.length === 0) {
      return 0;
    }

    // Count term matches
    let matches = 0;
    let totalTermFrequency = 0;

    for (const term of queryTerms) {
      const regex = new RegExp(`\\b${term}\\w*`, 'g');
      const termMatches = (textLower.match(regex) || []).length;

      if (termMatches > 0) {
        matches++;
        // BM25-like term frequency saturation
        totalTermFrequency += termMatches / (termMatches + 1.2);
      }
    }

    // Normalize score
    const coverageScore = matches / queryTerms.length; // What % of query terms found
    const frequencyScore = totalTermFrequency / queryTerms.length; // Average term frequency

    return (coverageScore * 0.7 + frequencyScore * 0.3); // Weighted combination
  }

  /**
   * Retrieve relevant document chunks using hybrid search
   */
  async retrieveChunks(
    query: string,
    options: RAGRetrievalOptions = {}
  ): Promise<RetrievedChunk[]> {
    const topK = options.topK || this.DEFAULT_TOP_K;
    const minSimilarity = options.minSimilarityScore || this.DEFAULT_MIN_SIMILARITY;
    const hybridAlpha = options.hybridAlpha !== undefined ? options.hybridAlpha : this.DEFAULT_HYBRID_ALPHA;

    console.log(`🔍 RAG retrieval for query: "${query.substring(0, 50)}..."`);
    console.log(`📊 Parameters: topK=${topK}, minSimilarity=${minSimilarity}, hybridAlpha=${hybridAlpha}`);

    // Generate query embedding
    const queryEmbedding = await documentEmbedding.generateEmbedding(query);

    // Build where conditions
    const whereConditions = [eq(documentIndex.isProcessed, true)];

    // CRITICAL: Apply company filter for access control
    if (options.companyIds !== undefined) {
      if (options.companyIds.length === 0) {
        // Empty array means NO access - deny all results
        // Add an impossible condition to return zero results
        whereConditions.push(sql`1 = 0`);
        console.log('🔒 Access denied: No company access granted (companyIds is empty)');
      } else {
        // Non-empty array means filter by these company IDs
        whereConditions.push(inArray(documentChunks.companyId, options.companyIds));
      }
    }

    // Apply product filter
    if (options.productIds !== undefined) {
      if (options.productIds.length === 0) {
        // Empty array means NO access - deny all results
        whereConditions.push(sql`1 = 0`);
        console.log('🔒 Access denied: No product access granted (productIds is empty)');
      } else if (options.productIds.length > 0) {
        whereConditions.push(
          and(
            sql`${documentChunks.productId} IS NOT NULL`,
            inArray(documentChunks.productId, options.productIds)
          )!
        );
      }
    }

    // Build and execute query
    const chunks = await db.select({
      chunkId: documentChunks.id,
      documentId: documentChunks.documentIndexId,
      companyId: documentChunks.companyId,
      productId: documentChunks.productId,
      chunkText: documentChunks.chunkText,
      pageNumber: documentChunks.pageNumber,
      sectionHeading: documentChunks.sectionHeading,
      embedding: documentChunks.embedding,
      documentName: documentIndex.documentName,
      documentPath: documentIndex.documentPath,
    })
    .from(documentChunks)
    .innerJoin(documentIndex, eq(documentChunks.documentIndexId, documentIndex.id))
    .where(and(...whereConditions))
    .limit(1000); // Retrieve more for scoring, then filter

    console.log(`📦 Retrieved ${chunks.length} candidate chunks`);

    if (chunks.length === 0) {
      return [];
    }

    // Calculate scores for each chunk
    const scoredChunks = chunks.map(chunk => {
      // Parse embedding
      const chunkEmbedding: number[] = JSON.parse(chunk.embedding);

      // Vector similarity score (0-1)
      const vectorScore = this.cosineSimilarity(queryEmbedding, chunkEmbedding);

      // Text (BM25-like) score (0-1)
      const textScore = this.calculateTextScore(query, chunk.chunkText);

      // Hybrid score: weighted combination
      const relevanceScore = (1 - hybridAlpha) * textScore + hybridAlpha * vectorScore;

      return {
        ...chunk,
        vectorScore,
        textScore,
        relevanceScore,
      };
    });

    // Filter by minimum similarity and sort by relevance
    const filteredChunks = scoredChunks
      .filter(c => c.vectorScore >= minSimilarity)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, topK);

    console.log(`✅ Selected top ${filteredChunks.length} chunks`);

    // Fetch company and product names for citations
    const companyIds = Array.from(new Set(filteredChunks.map(c => c.companyId)));
    const productIds = Array.from(new Set(filteredChunks.filter(c => c.productId).map(c => c.productId!)));

    const companyMap = new Map<number, string>();
    const productMap = new Map<number, string>();

    if (companyIds.length > 0) {
      const companiesData = await db.select({
        id: companies.id,
        name: companies.name,
      })
      .from(companies)
      .where(inArray(companies.id, companyIds));

      companiesData.forEach(c => companyMap.set(c.id, c.name));
    }

    if (productIds.length > 0) {
      const productsData = await db.select({
        id: products.id,
        name: products.name,
      })
      .from(products)
      .where(inArray(products.id, productIds));

      productsData.forEach(p => productMap.set(p.id, p.name));
    }

    // Build result with citations
    const results: RetrievedChunk[] = filteredChunks.map(chunk => {
      const companyName = companyMap.get(chunk.companyId) || 'Unknown Company';
      const productName = chunk.productId ? productMap.get(chunk.productId) : undefined;

      // Build citation
      let citation = `${chunk.documentName} - ${companyName}`;
      if (productName) {
        citation += ` (${productName})`;
      }
      if (chunk.pageNumber) {
        citation += `, page ${chunk.pageNumber}`;
      }
      if (chunk.sectionHeading) {
        citation += ` - ${chunk.sectionHeading}`;
      }

      return {
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        companyId: chunk.companyId,
        companyName,
        productId: chunk.productId || undefined,
        productName,
        chunkText: chunk.chunkText,
        pageNumber: chunk.pageNumber || undefined,
        sectionHeading: chunk.sectionHeading || undefined,
        similarityScore: chunk.vectorScore,
        relevanceScore: chunk.relevanceScore,
        citation,
      };
    });

    return results;
  }

  /**
   * Generate AI response with RAG context
   */
  async generateResponseWithContext(
    userQuery: string,
    retrievalOptions: RAGRetrievalOptions = {},
    systemPrompt?: string
  ): Promise<{
    response: string;
    citations: string[];
    relevantChunks: RetrievedChunk[];
  }> {
    // Retrieve relevant chunks
    const relevantChunks = await this.retrieveChunks(userQuery, retrievalOptions);

    if (relevantChunks.length === 0) {
      return {
        response: "I don't have enough information in the available documents to answer that question.",
        citations: [],
        relevantChunks: [],
      };
    }

    // Build context from chunks
    const context = relevantChunks
      .map((chunk, idx) => `[${idx + 1}] ${chunk.chunkText}\n(Source: ${chunk.citation})`)
      .join('\n\n');

    // Generate AI response
    const prompt = `Based on the following document excerpts, please answer the user's question. Include citations using [1], [2], etc. when referencing specific information.

Context:
${context}

User Question: ${userQuery}

Please provide a comprehensive answer based on the provided context. If the context doesn't contain enough information, say so clearly.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt || "You are a helpful AI assistant that answers questions based on provided document excerpts. Always cite your sources using the reference numbers provided."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 800,
    });

    const aiResponse = response.choices[0].message.content || "I couldn't generate a response.";
    const citations = relevantChunks.map(c => c.citation);

    return {
      response: aiResponse,
      citations,
      relevantChunks,
    };
  }
}

// Export singleton instance
export const ragRetrieval = new RAGRetrievalService();
