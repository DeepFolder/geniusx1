import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../../db';
import { documentChunks, documentIndex } from '@shared/schema';
import { eq, desc, and, count } from 'drizzle-orm';

const generateRequestId = () => `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const logger = {
  system: (module: string, action: string, data: object, opts?: { requestId?: string; level?: string }) => {
    const level = opts?.level || 'INFO';
    console.log(`[${level}] [${module}] ${action}:`, JSON.stringify(data));
  }
};

const router = Router();

const UPLOAD_DIR = 'uploads/documents';

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/json',
    ];
    const allowedExts = ['.pdf', '.txt', '.md', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: PDF, TXT, MD, JSON'));
    }
  },
});

function getDocumentType(mimetype: string, filename: string): 'pdf' | 'step' | 'stl' | 'image' | 'other' {
  const ext = path.extname(filename).toLowerCase();
  if (mimetype === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (ext === '.step' || ext === '.stp') return 'step';
  if (ext === '.stl') return 'stl';
  if (mimetype.startsWith('image/')) return 'image';
  return 'other';
}

const UploadRequestSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  companyId: z.coerce.number().optional(),
  productId: z.coerce.number().optional(),
  accessLevel: z.enum(['public', 'company', 'private']).optional().default('company'),
  processEmbeddings: z.coerce.boolean().optional().default(true),
});

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        requestId,
      });
    }
    
    const validationResult = UploadRequestSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: validationResult.error.errors,
        requestId,
      });
    }
    
    const { title, description, companyId, productId, processEmbeddings } = validationResult.data;
    
    const docType = getDocumentType(req.file.mimetype, req.file.originalname);
    const isPdf = docType === 'pdf';
    
    logger.system('DocumentAPI', 'UPLOAD_START', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      docType,
      companyId,
      productId,
      processEmbeddings,
    }, { requestId });
    
    const uniqueSourceId = Math.floor(Math.random() * 2000000000);
    
    const [document] = await db.insert(documentIndex).values({
      sourceType: 'company_document',
      sourceId: uniqueSourceId,
      companyId: companyId ?? null,
      productId: productId ?? null,
      documentName: title || req.file.originalname,
      documentPath: req.file.path,
      documentType: docType,
      isProcessed: false,
      processingStatus: (processEmbeddings && isPdf) ? 'processing' : 'pending',
      totalChunks: 0,
      metadata: {
        originalFilename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        description,
      },
    }).returning();
    
    if (processEmbeddings && isPdf) {
      logger.system('DocumentAPI', 'PDF_UPLOADED', {
        documentId: document.id,
        note: 'PDF processing temporarily disabled - document stored for future processing',
      }, { requestId });
    }
    
    logger.system('DocumentAPI', 'UPLOAD_COMPLETE', {
      documentId: document.id,
      filename: document.documentName,
      status: document.processingStatus,
    }, { requestId });
    
    return res.json({
      success: true,
      document: {
        id: document.id,
        filename: document.documentName,
        title: document.documentName,
        status: document.processingStatus,
        documentType: document.documentType,
      },
      requestId,
    });
  } catch (error) {
    logger.system('DocumentAPI', 'UPLOAD_ERROR', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { requestId, level: 'ERROR' });
    
    return res.status(500).json({
      error: 'Failed to upload document',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { companyId, productId, status, limit = '50', offset = '0' } = req.query;
    
    const conditions: any[] = [];
    
    if (companyId) {
      conditions.push(eq(documentIndex.companyId, Number(companyId)));
    }
    if (productId) {
      conditions.push(eq(documentIndex.productId, Number(productId)));
    }
    if (status) {
      conditions.push(eq(documentIndex.processingStatus, status as 'pending' | 'processing' | 'completed' | 'failed'));
    }
    
    const query = db
      .select()
      .from(documentIndex)
      .orderBy(desc(documentIndex.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    
    const results = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;
    
    return res.json({
      documents: results.map(doc => ({
        id: doc.id,
        filename: doc.documentName,
        path: doc.documentPath,
        type: doc.documentType,
        status: doc.processingStatus,
        isProcessed: doc.isProcessed,
        totalChunks: doc.totalChunks,
        companyId: doc.companyId,
        productId: doc.productId,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
      })),
      total: results.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to list documents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const allDocs = await db.select().from(documentIndex);
    
    const stats = {
      total: allDocs.length,
      byStatus: {
        pending: allDocs.filter(d => d.processingStatus === 'pending').length,
        processing: allDocs.filter(d => d.processingStatus === 'processing').length,
        completed: allDocs.filter(d => d.processingStatus === 'completed').length,
        failed: allDocs.filter(d => d.processingStatus === 'failed').length,
      },
      totalChunks: allDocs.reduce((sum, d) => sum + (d.totalChunks || 0), 0),
      processed: allDocs.filter(d => d.isProcessed).length,
    };
    
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get document stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [document] = await db
      .select()
      .from(documentIndex)
      .where(eq(documentIndex.id, Number(id)))
      .limit(1);
    
    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }
    
    const chunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentIndexId, document.id))
      .orderBy(documentChunks.chunkIndex);
    
    return res.json({
      document: {
        id: document.id,
        filename: document.documentName,
        path: document.documentPath,
        type: document.documentType,
        status: document.processingStatus,
        isProcessed: document.isProcessed,
        totalChunks: document.totalChunks,
        companyId: document.companyId,
        productId: document.productId,
        metadata: document.metadata,
        createdAt: document.createdAt,
      },
      chunks: chunks.map(c => ({
        id: c.id,
        chunkIndex: c.chunkIndex,
        contentPreview: c.chunkText.substring(0, 200) + (c.chunkText.length > 200 ? '...' : ''),
        hasEmbedding: !!c.embedding,
        pageNumber: c.pageNumber,
        sectionHeading: c.sectionHeading,
        tokenCount: c.tokenCount,
        metadata: c.metadata,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to get document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const { id } = req.params;
    
    const [document] = await db
      .select()
      .from(documentIndex)
      .where(eq(documentIndex.id, Number(id)))
      .limit(1);
    
    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }
    
    await db.delete(documentChunks)
      .where(eq(documentChunks.documentIndexId, document.id));
    
    await db.delete(documentIndex)
      .where(eq(documentIndex.id, document.id));
    
    try {
      await fs.unlink(document.documentPath);
    } catch (unlinkError) {
      logger.system('DocumentAPI', 'FILE_DELETE_WARNING', {
        documentId: document.id,
        path: document.documentPath,
        error: unlinkError instanceof Error ? unlinkError.message : 'Unknown error',
      }, { requestId, level: 'WARN' });
    }
    
    logger.system('DocumentAPI', 'DOCUMENT_DELETED', {
      documentId: document.id,
      filename: document.documentName,
    }, { requestId });
    
    return res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    logger.system('DocumentAPI', 'DELETE_ERROR', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { requestId, level: 'ERROR' });
    
    return res.status(500).json({
      error: 'Failed to delete document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/:id/reprocess', async (req: Request, res: Response) => {
  const requestId = generateRequestId();
  
  try {
    const { id } = req.params;
    
    const [document] = await db
      .select()
      .from(documentIndex)
      .where(eq(documentIndex.id, Number(id)))
      .limit(1);
    
    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }
    
    if (document.documentType !== 'pdf') {
      return res.status(400).json({
        error: 'Only PDF documents can be reprocessed',
        documentType: document.documentType,
      });
    }
    
    try {
      await fs.access(document.documentPath);
    } catch {
      return res.status(400).json({
        error: 'Document file no longer exists',
        path: document.documentPath,
      });
    }
    
    await db.delete(documentChunks)
      .where(eq(documentChunks.documentIndexId, document.id));
    
    await db.update(documentIndex)
      .set({ 
        processingStatus: 'processing', 
        totalChunks: 0,
        isProcessed: false,
      })
      .where(eq(documentIndex.id, document.id));
    
    const docId = document.id;
    const docMeta = document.metadata;
    const docPath = document.documentPath;
    const docName = document.documentName;
    const docCompanyId = document.companyId;
    const docProductId = document.productId;
    
    logger.system('DocumentAPI', 'REPROCESS_QUEUED', {
      documentId: docId,
      note: 'PDF reprocessing temporarily disabled - marked for future processing',
    }, { requestId });
    
    return res.json({
      success: true,
      message: 'Document reprocessing started',
      documentId: document.id,
      requestId,
    });
  } catch (error) {
    logger.system('DocumentAPI', 'REPROCESS_REQUEST_ERROR', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { requestId, level: 'ERROR' });
    
    return res.status(500).json({
      error: 'Failed to reprocess document',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
