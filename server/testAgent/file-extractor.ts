import fs from 'fs';

export interface ExtractionResult {
  content: string;
  filename: string;
  mimeType: string;
  pageCount?: number;
}

export async function extractTextFromFile(
  filePath: string,
  originalFilename: string,
  mimeType: string
): Promise<ExtractionResult> {
  console.log('[FileExtractor] Starting extraction:', {
    filePath,
    originalFilename,
    mimeType,
  });

  const fileBuffer = fs.readFileSync(filePath);
  let content = '';
  let pageCount: number | undefined;

  if (mimeType === 'application/pdf') {
    console.log('[FileExtractor] Extracting text from PDF...');
    // Dynamic import to avoid pdf-parse startup issue with test files
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(fileBuffer);
    content = pdfData.text;
    pageCount = pdfData.numpages;
    console.log('[FileExtractor] PDF extraction complete:', {
      pages: pageCount,
      textLength: content.length,
    });
  } else if (mimeType === 'text/plain' || originalFilename.endsWith('.txt')) {
    console.log('[FileExtractor] Reading plain text file...');
    content = fileBuffer.toString('utf-8');
    console.log('[FileExtractor] Text file read complete:', {
      textLength: content.length,
    });
  } else {
    console.log('[FileExtractor] Unsupported file type, attempting as text...');
    content = fileBuffer.toString('utf-8');
  }

  if (!content || content.trim().length === 0) {
    throw new Error('No text content could be extracted from the file');
  }

  console.log('[FileExtractor] Extraction successful:', {
    filename: originalFilename,
    contentLength: content.length,
    pageCount,
  });

  return {
    content: content.trim(),
    filename: originalFilename,
    mimeType,
    pageCount,
  };
}

export function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[FileExtractor] Cleaned up temp file:', filePath);
    }
  } catch (error) {
    console.error('[FileExtractor] Failed to cleanup temp file:', error);
  }
}
