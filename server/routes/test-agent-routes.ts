import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { chatService, documentService, extractTextFromFile, cleanupTempFile } from '../testAgent';
 
const router = Router();
 
router.post('/search', async (req, res) => {
  const { hybridSearchService } = await import('../testAgent/agentic-search.ts');
 
  console.log('[TestAgentRoute] Received Hybrid Search request');
  try {
    const { query } = req.body;
 
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
 
    console.log(`[TestAgentRoute] Running hybrid search for: "${query}"`);
    const result = await hybridSearchService.search(query);
    console.log(`[TestAgentRoute] Hybrid search complete. Found ${result.products?.length || 0} products.`);
    res.json(result);
  } catch (error: any) {
    console.error('[TestAgentRoute] Hybrid Search error:', error);
    res.status(500).json({
      error: 'Failed to perform hybrid search',
      details: error.message,
    });
  }
});
 
router.post('/search/stream', async (req, res) => {
  const { hybridSearchService } = await import('../testAgent/agentic-search.ts');
 
  console.log('[TestAgentRoute] Received STREAMING Hybrid Search request');
 
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
 
  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
 
  try {
    const { query } = req.body;
 
    if (!query) {
      sendEvent({ type: 'error', message: 'Query is required' });
      res.end();
      return;
    }
 
    console.log(`[TestAgentRoute] Running STREAMING hybrid search for: "${query}"`);
 
    const result = await hybridSearchService.search(query, (event) => {
      sendEvent(event);
    });
 
    sendEvent({ type: 'result', data: result });
    sendEvent({ type: 'done' });
    res.end();
  } catch (error: any) {
    console.error('[TestAgentRoute] Streaming Hybrid Search error:', error);
    sendEvent({ type: 'error', message: error.message });
    res.end();
  }
});
 
router.post('/chat', async (req, res) => {
  console.log('[TestAgentRoute] Received chat request');
 
  try {
    const { message, conversationHistory, companyId } = req.body;
 
    if (!message || typeof message !== 'string') {
      console.log('[TestAgentRoute] Invalid request: missing message');
      return res.status(400).json({ error: 'Message is required' });
    }
 
    console.log('[TestAgentRoute] Processing message:', {
      messageLength: message.length,
      hasHistory: !!conversationHistory,
      companyId,
    });
 
    const response = await chatService.chat({
      message,
      conversationHistory: conversationHistory || [],
      companyId: companyId ? Number(companyId) : undefined,
    });
 
    console.log('[TestAgentRoute] Response generated successfully');
    res.json(response);
  } catch (error: any) {
    console.error('[TestAgentRoute] Error:', error.message);
    res.status(500).json({
      error: 'Failed to process chat message',
      details: error.message,
    });
  }
});
 
const testAgentUploadDir = path.join(process.cwd(), 'uploads', 'test-agent-docs');
if (!fs.existsSync(testAgentUploadDir)) {
  fs.mkdirSync(testAgentUploadDir, { recursive: true });
}
 
const testAgentDocUpload = multer({
  storage: multer.diskStorage({
    destination: testAgentUploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/plain'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and TXT files are allowed'));
    }
  },
});
 
router.post('/document/upload', testAgentDocUpload.single('file'), async (req, res) => {
  console.log('[TestAgentRoute] Received document file upload request');
 
  try {
    const file = req.file;
    const companyId = req.body.companyId;
 
    if (!file) {
      console.log('[TestAgentRoute] Invalid request: no file uploaded');
      return res.status(400).json({ error: 'A file is required' });
    }
 
    if (!companyId) {
      console.log('[TestAgentRoute] Invalid request: missing companyId');
      cleanupTempFile(file.path);
      return res.status(400).json({ error: 'companyId is required' });
    }
 
    console.log('[TestAgentRoute] Processing file upload:', {
      companyId,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
 
    console.log('[TestAgentRoute] Extracting text from file...');
    const extractionResult = await extractTextFromFile(file.path, file.originalname, file.mimetype);
 
    console.log('[TestAgentRoute] Text extraction complete:', {
      contentLength: extractionResult.content.length,
      pageCount: extractionResult.pageCount,
    });
 
    const response = await documentService.uploadDocument({
      companyId: Number(companyId),
      filename: file.originalname,
      content: extractionResult.content,
    });
 
    cleanupTempFile(file.path);
 
    console.log('[TestAgentRoute] Document upload completed successfully');
    res.json({
      ...response,
      pageCount: extractionResult.pageCount,
      originalSize: file.size,
    });
  } catch (error: any) {
    console.error('[TestAgentRoute] Document upload error:', error.message);
    if (req.file) {
      cleanupTempFile(req.file.path);
    }
    res.status(500).json({
      error: 'Failed to upload document',
      details: error.message,
    });
  }
});
 
router.post('/document/query', async (req, res) => {
  console.log('[TestAgentRoute] Received RAG query request');
 
  try {
    const { companyId, question } = req.body;
 
    if (!companyId || !question) {
      console.log('[TestAgentRoute] Invalid request: missing required fields');
      return res.status(400).json({ error: 'companyId and question are required' });
    }
 
    console.log('[TestAgentRoute] Processing RAG query:', {
      companyId,
      questionLength: question.length,
    });
 
    const response = await documentService.queryRAG({
      companyId: Number(companyId),
      question,
    });
 
    console.log('[TestAgentRoute] RAG query completed successfully');
    res.json(response);
  } catch (error: any) {
    console.error('[TestAgentRoute] RAG query error:', error.message);
    res.status(500).json({
      error: 'Failed to process RAG query',
      details: error.message,
    });
  }
});
 
router.get('/admin/documents', async (req, res) => {
  console.log('[TestAgentRoute] Fetching all documents for admin viewer');
 
  try {
    const data = await documentService.getAllDocumentsAdmin();
    console.log('[TestAgentRoute] Admin viewer data fetched successfully');
    res.json(data);
  } catch (error: any) {
    console.error('[TestAgentRoute] Admin viewer error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch admin data',
      details: error.message,
    });
  }
});
 
export default router;
