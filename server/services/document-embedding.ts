import { db } from "../db.js";
import { 
  documentIndex, 
  documentChunks,
  type InsertDocumentIndex,
  type InsertDocumentChunk,
  type DocumentIndex as DocumentIndexType,
  type DocumentChunk as DocumentChunkType
} from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { documentChunking, type DocumentChunk } from "./document-chunking.js";
import OpenAI from 'openai';
import { createLazyOpenAI } from "./openai-client.js";

const openai = createLazyOpenAI();

async function generateMultiProviderEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

function getActiveProviderInfo() {
  return { provider: 'openai', model: 'text-embedding-3-small', isConfigured: !!process.env.OPENAI_API_KEY };
}

const EMBEDDING_BATCH_SIZE = 100;

export interface DocumentEmbeddingResult {
  documentIndexId: number;
  totalChunks: number;
  processedChunks: number;
  status: "completed" | "partial" | "failed";
  error?: string;
  provider?: string;
}

export class DocumentEmbeddingService {

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await generateMultiProviderEmbedding(text);
    } catch (error) {
      console.error('❌ Embedding generation error:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    try {
      const batches: string[][] = [];
      for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
        batches.push(texts.slice(i, i + EMBEDDING_BATCH_SIZE));
      }

      const allEmbeddings: number[][] = [];

      for (const batch of batches) {
        const batchEmbeddings = await Promise.all(
          batch.map(text => generateMultiProviderEmbedding(text))
        );
        allEmbeddings.push(...batchEmbeddings);
      }

      return allEmbeddings;
    } catch (error) {
      console.error('❌ Batch embedding generation error:', error);
      throw new Error(`Failed to generate batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createDocumentIndex(
    sourceType: "catalogue" | "restricted_document" | "company_document" | "product_datasheet",
    sourceId: number,
    companyId: number,
    productId: number | null,
    documentName: string,
    documentPath: string,
    documentType: "pdf" | "step" | "stl" | "image" | "other"
  ): Promise<DocumentIndexType> {
    const existing = await db.select()
      .from(documentIndex)
      .where(
        and(
          eq(documentIndex.sourceType, sourceType),
          eq(documentIndex.sourceId, sourceId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(documentIndex)
        .set({
          documentName,
          documentPath,
          processingStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(documentIndex.id, existing[0].id))
        .returning();

      return updated;
    }

    const newDoc: InsertDocumentIndex = {
      sourceType,
      sourceId,
      companyId,
      productId: productId || null,
      documentName,
      documentPath,
      documentType,
      isProcessed: false,
      processingStatus: "pending",
      totalChunks: 0,
      metadata: null,
    };

    const [created] = await db.insert(documentIndex)
      .values(newDoc)
      .returning();

    return created;
  }

  async processDocument(
    documentIndexId: number,
    filePath: string
  ): Promise<DocumentEmbeddingResult> {
    try {
      const providerInfo = getActiveProviderInfo();
      console.log(`📄 Processing document ${documentIndexId} using ${providerInfo.provider} embeddings...`);

      await db.update(documentIndex)
        .set({ processingStatus: "processing" })
        .where(eq(documentIndex.id, documentIndexId));

      const [docInfo] = await db.select()
        .from(documentIndex)
        .where(eq(documentIndex.id, documentIndexId))
        .limit(1);

      if (!docInfo) {
        throw new Error('Document not found in index');
      }

      await db.delete(documentChunks)
        .where(eq(documentChunks.documentIndexId, documentIndexId));

      console.log(`✂️  Chunking document...`);
      const chunks = await documentChunking.chunkPdfDocument(filePath, {
        maxTokens: 800,
        overlapTokens: 160,
        respectSections: true,
      });

      console.log(`📊 Created ${chunks.length} chunks`);

      console.log(`🤖 Generating embeddings with ${providerInfo.provider}...`);
      const chunkTexts = chunks.map(c => c.text);
      const embeddings = await this.generateEmbeddingsBatch(chunkTexts);

      console.log(`💾 Storing chunks and embeddings...`);
      const chunksToInsert: InsertDocumentChunk[] = chunks.map((chunk, index) => ({
        documentIndexId,
        companyId: docInfo.companyId,
        productId: docInfo.productId || null,
        chunkText: chunk.text,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber || null,
        sectionHeading: chunk.sectionHeading || null,
        tokenCount: chunk.tokenCount,
        embedding: JSON.stringify(embeddings[index]),
        metadata: chunk.metadata || null,
      }));

      const BATCH_SIZE = 50;
      for (let i = 0; i < chunksToInsert.length; i += BATCH_SIZE) {
        const batch = chunksToInsert.slice(i, i + BATCH_SIZE);
        await db.insert(documentChunks).values(batch);
      }

      await db.update(documentIndex)
        .set({
          isProcessed: true,
          processingStatus: "completed",
          totalChunks: chunks.length,
          updatedAt: new Date(),
          metadata: {
            ...(docInfo.metadata as any || {}),
            embeddingProvider: providerInfo.provider,
            embeddingModel: providerInfo.model,
          },
        })
        .where(eq(documentIndex.id, documentIndexId));

      console.log(`✅ Document processing complete: ${chunks.length} chunks stored using ${providerInfo.provider}`);

      return {
        documentIndexId,
        totalChunks: chunks.length,
        processedChunks: chunks.length,
        status: "completed",
        provider: providerInfo.provider,
      };

    } catch (error) {
      console.error('❌ Document processing error:', error);

      await db.update(documentIndex)
        .set({ processingStatus: "failed" })
        .where(eq(documentIndex.id, documentIndexId));

      return {
        documentIndexId,
        totalChunks: 0,
        processedChunks: 0,
        status: "failed",
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async indexAndProcessDocument(
    sourceType: "catalogue" | "restricted_document" | "company_document" | "product_datasheet",
    sourceId: number,
    companyId: number,
    productId: number | null,
    documentName: string,
    documentPath: string,
    documentType: "pdf" | "step" | "stl" | "image" | "other"
  ): Promise<DocumentEmbeddingResult> {
    const docIndex = await this.createDocumentIndex(
      sourceType,
      sourceId,
      companyId,
      productId,
      documentName,
      documentPath,
      documentType
    );

    if (documentType === "pdf") {
      return await this.processDocument(docIndex.id, documentPath);
    }

    return {
      documentIndexId: docIndex.id,
      totalChunks: 0,
      processedChunks: 0,
      status: "completed",
    };
  }

  async getDocumentChunks(documentIndexId: number): Promise<DocumentChunkType[]> {
    return await db.select()
      .from(documentChunks)
      .where(eq(documentChunks.documentIndexId, documentIndexId))
      .orderBy(documentChunks.chunkIndex);
  }

  async deleteDocument(documentIndexId: number): Promise<void> {
    await db.delete(documentIndex)
      .where(eq(documentIndex.id, documentIndexId));
  }
  
  getActiveProvider(): { provider: string; model: string } {
    return getActiveProviderInfo();
  }
}

export const documentEmbedding = new DocumentEmbeddingService();
