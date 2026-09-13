#!/usr/bin/env tsx

/**
 * Background Worker: Process Existing Documents for RAG System
 * 
 * This script processes all unprocessed PDF documents in the database:
 * 1. Finds documents with isProcessed = false and documentType = 'pdf'
 * 2. Chunks each document using DocumentChunkingService
 * 3. Generates embeddings using DocumentEmbeddingService
 * 4. Updates document processing status
 * 
 * Run with: npx tsx server/workers/process-documents.ts
 */

import { db } from "../db";
import { documentIndex } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { DocumentEmbeddingService } from "../services/document-embedding";
import * as fs from "fs";
import * as path from "path";

const documentEmbedding = new DocumentEmbeddingService();

interface ProcessingStats {
  total: number;
  processed: number;
  failed: number;
  skipped: number;
}

async function processDocument(doc: any): Promise<boolean> {
  console.log(`\n📄 Processing: ${doc.documentName} (ID: ${doc.id})`);
  console.log(`   Company ID: ${doc.companyId}, Product ID: ${doc.productId || 'N/A'}`);
  console.log(`   Path: ${doc.documentPath}`);

  try {
    // Check if file exists
    const filePath = path.join(process.cwd(), doc.documentPath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    console.log(`   ✓ File found, starting processing...`);

    // Process the document: chunk + embed + store
    // DocumentEmbeddingService.processDocument handles everything internally
    const result = await documentEmbedding.processDocument(doc.id, filePath);

    if (result.status === 'completed') {
      console.log(`   ✅ Document processed successfully!`);
      console.log(`      Total chunks: ${result.totalChunks}`);
      console.log(`      Processed chunks: ${result.processedChunks}`);
      return true;
    } else {
      console.log(`   ⚠️  Document processing incomplete: ${result.status}`);
      console.log(`      Total chunks: ${result.totalChunks}, Processed: ${result.processedChunks}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
      return false;
    }

  } catch (error) {
    console.error(`   ❌ Failed to process document:`, error);

    // Update status to failed (if not already updated)
    try {
      await db.update(documentIndex)
        .set({ 
          processingStatus: 'failed',
          metadata: { 
            error: error instanceof Error ? error.message : 'Unknown error',
            failedAt: new Date().toISOString()
          },
          updatedAt: new Date()
        })
        .where(eq(documentIndex.id, doc.id));
    } catch (updateError) {
      console.error(`   ⚠️  Failed to update error status:`, updateError);
    }

    return false;
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🚀 RAG Document Processing Worker Started');
  console.log('═══════════════════════════════════════════════════════════\n');

  const stats: ProcessingStats = {
    total: 0,
    processed: 0,
    failed: 0,
    skipped: 0
  };

  try {
    // Find all unprocessed PDF documents
    const unprocessedDocs = await db.select()
      .from(documentIndex)
      .where(
        and(
          eq(documentIndex.isProcessed, false),
          eq(documentIndex.documentType, 'pdf')
        )
      );

    stats.total = unprocessedDocs.length;

    console.log(`📊 Found ${stats.total} unprocessed PDF documents\n`);

    if (stats.total === 0) {
      console.log('✨ No documents to process. Exiting.\n');
      return;
    }

    // Process each document sequentially (to avoid overwhelming the system)
    for (const doc of unprocessedDocs) {
      const success = await processDocument(doc);
      
      if (success) {
        stats.processed++;
      } else {
        stats.failed++;
      }

      // Add a small delay between documents to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Print final statistics
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 Processing Complete - Final Statistics');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total documents found:    ${stats.total}`);
    console.log(`✅ Successfully processed: ${stats.processed}`);
    console.log(`❌ Failed:                 ${stats.failed}`);
    console.log(`⏭️  Skipped:                ${stats.skipped}`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Worker failed with error:', error);
    process.exit(1);
  }
}

// Run the worker
main()
  .then(() => {
    console.log('✅ Worker completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Worker failed:', error);
    process.exit(1);
  });
