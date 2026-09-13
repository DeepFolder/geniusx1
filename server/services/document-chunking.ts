import fs from "fs";
import path from "path";

export interface DocumentChunk {
  text: string;
  chunkIndex: number;
  pageNumber?: number;
  sectionHeading?: string;
  tokenCount: number;
  metadata?: Record<string, any>;
}

export interface ChunkingOptions {
  maxTokens?: number; // Target chunk size in tokens (default: 800)
  overlapTokens?: number; // Overlap between chunks (default: 160 = 20%)
  respectSections?: boolean; // Try to keep sections intact (default: true)
}

/**
 * Document Chunking Service
 * Breaks documents into semantic chunks for embeddings and RAG
 */
export class DocumentChunkingService {
  private readonly CHARS_PER_TOKEN = 4; // Approximate: 1 token ~= 4 characters
  private readonly DEFAULT_MAX_TOKENS = 800;
  private readonly DEFAULT_OVERLAP_TOKENS = 160; // 20% overlap

  /**
   * Extract text from PDF file
   */
  async extractPdfText(filePath: string): Promise<{ text: string; pages: number }> {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);

      if (!pdfData.text || pdfData.text.trim().length === 0) {
        throw new Error('PDF contains no extractable text');
      }

      return {
        text: pdfData.text,
        pages: pdfData.numpages || 0,
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Estimate token count from text
   */
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Extract section headings from text
   * Detects common heading patterns
   */
  private extractSections(text: string): Array<{ heading: string; startIndex: number }> {
    const sections: Array<{ heading: string; startIndex: number }> = [];
    const lines = text.split('\n');
    let currentIndex = 0;

    // Patterns for section headings
    const headingPatterns = [
      /^#+\s+(.+)$/,  // Markdown headings
      /^(\d+\.?\s+[A-Z][^.!?]*?)$/,  // Numbered sections (e.g., "1. Introduction")
      /^([A-Z][A-Z\s]{3,}?)$/,  // ALL CAPS HEADINGS
      /^([A-Z][^.!?]{2,50}?)$/,  // Title Case Headings (short lines)
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Check if line matches any heading pattern
      for (const pattern of headingPatterns) {
        const match = trimmedLine.match(pattern);
        if (match && trimmedLine.length > 3 && trimmedLine.length < 100) {
          sections.push({
            heading: match[1] || trimmedLine,
            startIndex: currentIndex,
          });
          break;
        }
      }

      currentIndex += line.length + 1; // +1 for newline
    }

    return sections;
  }

  /**
   * Find the section heading for a given text position
   */
  private findSectionHeading(
    textPosition: number,
    sections: Array<{ heading: string; startIndex: number }>
  ): string | undefined {
    let currentSection: string | undefined;

    for (const section of sections) {
      if (section.startIndex <= textPosition) {
        currentSection = section.heading;
      } else {
        break;
      }
    }

    return currentSection;
  }

  /**
   * Split text into chunks with overlap
   */
  chunkText(
    text: string,
    options: ChunkingOptions = {}
  ): DocumentChunk[] {
    const maxTokens = options.maxTokens || this.DEFAULT_MAX_TOKENS;
    const overlapTokens = options.overlapTokens || this.DEFAULT_OVERLAP_TOKENS;
    const respectSections = options.respectSections !== false;

    const maxChars = maxTokens * this.CHARS_PER_TOKEN;
    const overlapChars = overlapTokens * this.CHARS_PER_TOKEN;

    const chunks: DocumentChunk[] = [];
    const sections = respectSections ? this.extractSections(text) : [];

    let position = 0;
    let chunkIndex = 0;

    while (position < text.length) {
      // Determine chunk end position
      let chunkEnd = Math.min(position + maxChars, text.length);

      // Try to break at sentence boundary (. ! ?) if not at end of text
      if (chunkEnd < text.length) {
        const searchStart = Math.max(position, chunkEnd - 200);
        const searchText = text.substring(searchStart, chunkEnd + 200);
        const sentenceEnd = searchText.match(/[.!?]\s/);

        if (sentenceEnd && sentenceEnd.index !== undefined) {
          chunkEnd = searchStart + sentenceEnd.index + 1;
        }
      }

      // Extract chunk text
      const chunkText = text.substring(position, chunkEnd).trim();

      if (chunkText.length > 0) {
        const tokenCount = this.estimateTokenCount(chunkText);
        const sectionHeading = this.findSectionHeading(position, sections);

        chunks.push({
          text: chunkText,
          chunkIndex,
          sectionHeading,
          tokenCount,
          metadata: {
            startChar: position,
            endChar: chunkEnd,
          },
        });

        chunkIndex++;
      }

      // Move position forward with overlap
      position = chunkEnd - overlapChars;

      // Ensure we make progress
      if (position <= chunks[chunks.length - 1]?.metadata?.startChar) {
        position = chunkEnd;
      }
    }

    return chunks;
  }

  /**
   * Process a PDF document into chunks
   */
  async chunkPdfDocument(
    filePath: string,
    options: ChunkingOptions = {}
  ): Promise<DocumentChunk[]> {
    const { text, pages } = await this.extractPdfText(filePath);
    const chunks = this.chunkText(text, options);

    // Estimate page numbers based on text position
    const charsPerPage = text.length / pages;

    return chunks.map(chunk => ({
      ...chunk,
      pageNumber: chunk.metadata?.startChar 
        ? Math.floor(chunk.metadata.startChar / charsPerPage) + 1
        : undefined,
    }));
  }

  /**
   * Get chunking statistics
   */
  getChunkingStats(chunks: DocumentChunk[]): {
    totalChunks: number;
    avgTokensPerChunk: number;
    minTokens: number;
    maxTokens: number;
    totalTokens: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        avgTokensPerChunk: 0,
        minTokens: 0,
        maxTokens: 0,
        totalTokens: 0,
      };
    }

    const tokenCounts = chunks.map(c => c.tokenCount);
    const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

    return {
      totalChunks: chunks.length,
      avgTokensPerChunk: Math.round(totalTokens / chunks.length),
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts),
      totalTokens,
    };
  }
}

// Export singleton instance
export const documentChunking = new DocumentChunkingService();
